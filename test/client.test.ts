import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WazapiClient, WazapiError } from '../dist/index.js'

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

function stubFetch(handler: Handler): typeof fetch {
  return (async (input: any, init: any) => handler(String(input), init ?? {})) as typeof fetch
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

test('lists templates with query params', async () => {
  let seenUrl = ''
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url) => {
      seenUrl = url
      return json({ data: [{ name: 'order_confirmed' }], meta: { next_cursor: null } })
    }),
  })
  const page = await client.listTemplates({ status: 'APPROVED', limit: 10 })
  assert.equal(page.data[0].name, 'order_confirmed')
  assert.match(seenUrl, /\/templates\?/)
  assert.match(seenUrl, /status=APPROVED/)
  assert.match(seenUrl, /limit=10/)
})

test('sends a template and auto-generates an idempotency key', async () => {
  let idem: string | null = null
  let authHeader: string | null = null
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((_url, init) => {
      const headers = new Headers(init.headers)
      idem = headers.get('Idempotency-Key')
      authHeader = headers.get('Authorization')
      return json({ data: { uuid: 'op-1', type: 'message.send', status: 'queued' } }, { status: 202 })
    }),
  })
  const result = await client.sendTemplate('chan-uuid', '+5511999998888', {
    name: 'order_confirmed',
    parameters: ['Maria', '1847'],
  })
  assert.equal(result.operation.uuid, 'op-1')
  assert.equal(result.replayed, false)
  assert.equal(authHeader, 'Bearer waz_api_test')
  assert.ok(idem && idem.length > 0)
})

test('honors a caller-provided idempotency key and detects replays', async () => {
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((_url, init) => {
      const headers = new Headers(init.headers)
      assert.equal(headers.get('Idempotency-Key'), 'order-42')
      return json(
        { data: { uuid: 'op-1', type: 'message.send', status: 'queued' } },
        { status: 202, headers: { 'Idempotent-Replayed': 'true' } }
      )
    }),
  })
  const result = await client.sendText('chan', '+5511999998888', 'hi', 'order-42')
  assert.equal(result.replayed, true)
})

test('omits channel_uuid when null so the API resolves the channel', async () => {
  const bodies: Array<Record<string, unknown>> = []
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((_url, init) => {
      bodies.push(JSON.parse(String(init.body)))
      return json({ data: { uuid: 'op-1', type: 'message.send', status: 'queued' } }, { status: 202 })
    }),
  })
  await client.sendText(null, '+5511999998888', 'hi')
  await client.sendTemplate('chan', '+5511999998888', { name: 'order_confirmed' })
  assert.equal('channel_uuid' in bodies[0], false)
  assert.equal(bodies[1].channel_uuid, 'chan')
})

test('throws a typed WazapiError on the stable error envelope', async () => {
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch(() =>
      json(
        {
          error: {
            code: 'template_parameter_count_mismatch',
            message: 'expects 2 got 1',
            request_id: 'req-9',
          },
        },
        { status: 422 }
      )
    ),
  })
  await assert.rejects(
    () =>
      client.sendTemplate('chan', '+5511999998888', { name: 'order_confirmed', parameters: ['x'] }),
    (err: unknown) => {
      assert.ok(err instanceof WazapiError)
      assert.equal(err.status, 422)
      assert.equal(err.code, 'template_parameter_count_mismatch')
      assert.equal(err.requestId, 'req-9')
      return true
    }
  )
})

test('surfaces Retry-After on 429', async () => {
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch(() =>
      json(
        { error: { code: 'rate_limited', message: 'slow down', request_id: 'r' } },
        { status: 429, headers: { 'Retry-After': '30' } }
      )
    ),
  })
  await assert.rejects(
    () => client.listChannels(),
    (err: unknown) => {
      assert.ok(err instanceof WazapiError)
      assert.equal(err.isRateLimited, true)
      assert.equal(err.retryAfter, 30)
      return true
    }
  )
})

test('waitForOperation polls until terminal', async () => {
  const statuses = ['queued', 'processing', 'succeeded']
  let call = 0
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch(() =>
      json({ data: { uuid: 'op-1', type: 'message.send', status: statuses[call++] } })
    ),
  })
  const operation = await client.waitForOperation('op-1', { intervalMs: 1, timeoutMs: 1000 })
  assert.equal(operation.status, 'succeeded')
  assert.equal(call, 3)
})

test('treats the per-user marketing limit as a compliance block (API 1.4)', () => {
  const err = new WazapiError({
    status: 422,
    code: 'recipient_marketing_limit_reached',
    message: 'Recipient reached the Meta per-user marketing limit.',
    details: { retry_after_seconds: 86_000 },
  })
  assert.equal(err.isComplianceBlocked, true)
})

test('deletes a store product and lists categories (API 1.6)', async () => {
  const calls: string[] = []
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      calls.push(`${init.method} ${url}`)
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      return json({ data: [{ uuid: 'c1', name: 'Canecas', position: 0 }] })
    }),
  })
  assert.equal(await client.deleteStoreProduct('p1'), undefined)
  const categories = await client.listStoreCategories()
  assert.equal(categories[0].name, 'Canecas')
  assert.deepEqual(calls, [
    'DELETE https://example.test/api/v1/store/products/p1',
    'GET https://example.test/api/v1/store/categories',
  ])
})

test('sends template components as given (API 1.9)', async () => {
  let sent: any
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((_url, init) => {
      sent = JSON.parse(String(init.body))
      return json({ data: { uuid: 'op-1', type: 'message.send', status: 'queued' } }, { status: 202 })
    }),
  })
  const components = {
    header: { type: 'image' as const, link: 'https://store.example.com/p.jpg' },
    body: ['Maria', '1847'],
    buttons: [
      { index: 0, url_suffix: 'tracking/1847' },
      { index: 1, coupon_code: 'COMEBACK10' },
    ],
  }
  await client.sendTemplate(null, '+5511999998888', { name: 'order_shipped', components })
  assert.deepEqual(sent.content, { name: 'order_shipped', components })
  assert.equal(sent.type, 'template')
})

test('sends library media and quick reply payload as given (API 1.10)', async () => {
  let sent: any
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((_url, init) => {
      sent = JSON.parse(String(init.body))
      return json({ data: { uuid: 'op-1', type: 'message.send', status: 'queued' } }, { status: 202 })
    }),
  })
  const components = {
    header: { type: 'document' as const, media_uuid: '5f0c2b1e-8d7a-4c3e-9b6f-2a1d4e7c9f30' },
    buttons: [{ index: 0, payload: 'confirm_1847' }],
  }
  await client.sendTemplate(null, '+5511999998888', { name: 'invoice', components })
  assert.deepEqual(sent.content.components, components)
})
