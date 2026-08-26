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
