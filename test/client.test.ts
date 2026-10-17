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

test('treats an undeliverable number (Meta 131026) as a compliance block (API 1.40)', () => {
  const err = new WazapiError({
    status: 422,
    code: 'recipient_undeliverable',
    message: 'Meta could not deliver to this number (error 131026).',
    details: { retry_after_seconds: 2_500_000 },
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

test('sends lead tracking on createContact and reads it back (API 1.18)', async () => {
  let sent: any = null
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((_url, init) => {
      sent = JSON.parse(String(init.body))
      return json({ data: { uuid: 'c-1', tracking: sent.tracking, custom_fields: sent.tracking } })
    }),
  })
  const contact = await client.createContact({
    phone: '+5511999998888',
    tracking: { utm_source: 'google', utm_campaign: 'black-friday', gclid: 'g-1' },
  })
  assert.deepEqual(sent.tracking, { utm_source: 'google', utm_campaign: 'black-friday', gclid: 'g-1' })
  assert.equal(contact.tracking.utm_source, 'google')
})

test('blocks and unblocks a contact on the block sub-resource', async () => {
  const seen: string[] = []
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      seen.push(`${init.method} ${url}`)
      const blocked = init.method === 'POST'
      return json({
        data: { uuid: 'c-1', blocked_at: blocked ? '2026-09-23T12:00:00Z' : null, meta_blocked: false },
      })
    }),
  })
  const blocked = await client.blockContact('c-1')
  assert.equal(blocked.blocked_at, '2026-09-23T12:00:00Z')
  const unblocked = await client.unblockContact('c-1')
  assert.equal(unblocked.blocked_at, null)
  assert.deepEqual(seen, [
    'POST https://example.test/api/v1/contacts/c-1/block',
    'DELETE https://example.test/api/v1/contacts/c-1/block',
  ])
})

test('coupon and policy methods preserve explicit financial input and optimistic version', async () => {
  const seen: { url: string; method: string; body: any }[] = []
  const client = new WazapiClient({ token: 'waz_api_test', baseUrl: 'https://example.test/api/v1', fetch: stubFetch((url, init) => {
    seen.push({ url, method: init.method || '', body: init.body ? JSON.parse(String(init.body)) : null })
    return json({ uuid: 'id', version: 2 })
  }) })
  const rules = { kind: 'percent' as const, value: 500, maxDiscountCents: 1000 }
  await client.updateStoreCoupon('coupon/id', { code: 'SAVE5', name: 'Save', status: 'active', version: 1, rules })
  await client.saveAgentDiscountPolicy('agent/id', { version: 0, enabled: true, allowCoupons: true, minimumValue: 100, rules })
  assert.match(seen[0].url, /coupons\/coupon%2Fid$/)
  assert.equal(seen[0].body.version, 1)
  assert.equal(seen[0].body.rules.value, 500)
  assert.equal(seen[1].method, 'PUT')
  assert.equal(seen[1].body.version, 0)
})

test('creates a store order with the idempotency key and reports replays (API 1.19)', async () => {
  const seen: { url: string; method?: string; key: string | null; body: unknown }[] = []
  let calls = 0
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      const headers = new Headers(init.headers)
      seen.push({
        url,
        method: init.method,
        key: headers.get('Idempotency-Key'),
        body: init.body ? JSON.parse(String(init.body)) : null,
      })
      if (url.endsWith('/store/shipping-options'))
        return json({ data: [{ uuid: 'ship-1', name: 'Motoboy', price_cents: 1000, requires_address: true, position: 0 }], meta: { free_shipping_from_cents: 20000 } })
      if (url.includes('/store/orders?'))
        return json({ data: [], meta: { next_cursor: null } })
      calls += 1
      return json(
        { data: { uuid: 'order-1', source: 'api', status: 'pago', currency: 'BRL', allowed_transitions: ['entregue', 'cancelado'] } },
        { status: 201, headers: { 'content-type': 'application/json', ...(calls > 1 ? { 'Idempotent-Replayed': 'true' } : {}) } }
      )
    }),
  })

  const options = await client.listStoreShippingOptions()
  assert.equal(options.data[0].requires_address, true)
  assert.equal(options.meta.free_shipping_from_cents, 20000)

  const input = {
    customer_name: 'Maria',
    customer_phone: '+5511999990000',
    items: [{ product_uuid: 'prod-1', quantity: 2 }],
    payment_method: 'pix' as const,
    mark_paid: true,
  }
  const first = await client.createStoreOrder(input, 'erp-1847')
  const again = await client.createStoreOrder(input, 'erp-1847')
  assert.equal(first.order.source, 'api')
  assert.deepEqual(first.order.allowed_transitions, ['entregue', 'cancelado'])
  assert.equal(first.replayed, false)
  assert.equal(again.replayed, true)
  const post = seen.find((s) => s.method === 'POST')!
  assert.match(post.url, /\/store\/orders$/)
  assert.equal(post.key, 'erp-1847')
  assert.deepEqual(post.body, input)

  await client.listStoreOrders({ source: 'api', updated_after: '2026-09-29T12:00:00Z' })
  const list = seen.at(-1)!.url
  assert.match(list, /source=api/)
  assert.match(list, /updated_after=2026-09-29T12%3A00%3A00Z/)
})

test('lists, creates and updates CRM stages with external_id (API 1.20)', async () => {
  const calls: Array<{ call: string; body?: unknown }> = []
  const stage = {
    uuid: 's1',
    name: 'Demo',
    kind: 'open',
    color: '#64748b',
    external_id: 'stg-10',
    group: { uuid: 'g1', name: 'Comercial' },
  }
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      calls.push({
        call: `${init.method} ${url}`,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (init.method === 'GET') return json({ data: [stage] })
      return json({ data: stage }, { status: init.method === 'POST' ? 201 : 200 })
    }),
  })
  const [found] = await client.listCrmStages({ external_id: 'stg-10' })
  assert.equal(found.external_id, 'stg-10')
  await client.createCrmStage({ group_uuid: 'g1', name: 'Demo', external_id: 'stg-10' })
  await client.updateCrmStage('s1', { external_id: null })
  assert.deepEqual(calls, [
    { call: 'GET https://example.test/api/v1/crm/stages?external_id=stg-10', body: undefined },
    {
      call: 'POST https://example.test/api/v1/crm/stages',
      body: { group_uuid: 'g1', name: 'Demo', external_id: 'stg-10' },
    },
    { call: 'PATCH https://example.test/api/v1/crm/stages/s1', body: { external_id: null } },
  ])
})

test('deletes and reorders CRM stages, and writes opportunities (API 1.21)', async () => {
  const calls: Array<{ call: string; body?: unknown }> = []
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      calls.push({
        call: `${init.method} ${url}`,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      if (url.endsWith('/crm/stage-order')) return json({ data: [] })
      if (init.method === 'GET' && url.includes('?'))
        return json({ data: [{ uuid: 'o1' }], meta: { next_cursor: null } })
      return json({ data: { uuid: 'o1', external_id: 'deal-7' } })
    }),
  })
  await client.deleteCrmStage('s1', 's2')
  await client.reorderCrmStages('g1', ['s2', 's3', 'won', 'lost'])
  const page = await client.listCrmOpportunities({
    external_id: 'deal-7',
    updated_after: '2026-09-30T12:00:00Z',
    include_archived: true,
  })
  assert.equal(page.data[0].uuid, 'o1')
  const created = await client.createCrmOpportunity({
    group_uuid: 'g1',
    contact_external_id: 'cli-42',
    title: 'Plano anual',
    external_id: 'deal-7',
    assigned_user_external_id: 'rep-9',
  })
  assert.equal(created.external_id, 'deal-7')
  await client.updateCrmOpportunity('o1', { stage_external_id: 'won', version: 2 })
  await client.archiveCrmOpportunity('o1')
  assert.deepEqual(
    calls.map((c) => c.call),
    [
      'DELETE https://example.test/api/v1/crm/stages/s1?replacement_stage_uuid=s2',
      'PUT https://example.test/api/v1/crm/stage-order',
      'GET https://example.test/api/v1/crm/opportunities?external_id=deal-7&updated_after=2026-09-30T12%3A00%3A00Z&include_archived=true',
      'POST https://example.test/api/v1/crm/opportunities',
      'PATCH https://example.test/api/v1/crm/opportunities/o1',
      'DELETE https://example.test/api/v1/crm/opportunities/o1',
    ]
  )
  assert.deepEqual(calls[1].body, { group_uuid: 'g1', stage_uuids: ['s2', 's3', 'won', 'lost'] })
  assert.deepEqual(calls[4].body, { stage_external_id: 'won', version: 2 })
})

test('reads buyer, payment and agent on the order and keeps them nullable (API 1.42)', async () => {
  const paid = {
    uuid: 'order-paid',
    status: 'pago',
    source: 'ai_agent',
    customer_email: 'joana@escola.com',
    customer_document: '12345678909',
    payment_status: 'paid',
    payment_provider: 'vindi',
    paid_at: '2026-10-15T12:00:00.000Z',
    payment: { method: 'credit_card', provider_bill_id: 'bill-77', installments: 3 },
    agent: { uuid: 'agent-1', name: 'Ana' },
  }
  const manual = {
    uuid: 'order-manual',
    status: 'novo',
    source: 'api',
    customer_email: null,
    customer_document: null,
    payment_status: null,
    payment_provider: null,
    paid_at: null,
    payment: null,
    agent: null,
  }
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url) =>
      url.endsWith('/store/orders/order-paid') ? json({ data: paid }) : json({ data: manual })
    ),
  })

  const order = await client.getStoreOrder('order-paid')
  assert.equal(order.customer_document, '12345678909')
  assert.equal(order.paid_at, '2026-10-15T12:00:00.000Z')
  assert.equal(order.payment?.method, 'credit_card')
  assert.equal(order.payment?.installments, 3)
  assert.equal(order.agent?.name, 'Ana')

  const other = await client.getStoreOrder('order-manual')
  assert.equal(other.customer_email, null)
  assert.equal(other.paid_at, null)
  assert.equal(other.payment, null)
  assert.equal(other.agent, null)
})

test('manages the integration webhooks (API 1.46)', async () => {
  const calls: Array<{ method: string; url: string; body: unknown }> = []
  const endpoint = {
    uuid: 'wh-1',
    url: 'https://erp.example/wazapi',
    events: ['message.send.failed', 'webhook.test'],
    active: true,
    secret_hint: 'whsec_••••abcd',
    previous_secret_expires_at: null,
    created_at: null,
    updated_at: null,
  }
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : null })
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      if (url.endsWith('/test')) return json({ data: { event: 'webhook.test', queued: true } }, { status: 202 })
      if (init.method === 'GET') return json({ data: [endpoint] })
      return json({ data: { ...endpoint, secret: 'whsec_new' } }, { status: init.method === 'POST' && url.endsWith('/webhooks') ? 201 : 200 })
    }),
  })
  const input = { url: endpoint.url, events: ['message.send.failed' as const] }
  assert.equal((await client.createWebhook(input)).secret, 'whsec_new')
  assert.equal((await client.listWebhooks())[0].uuid, 'wh-1')
  await client.updateWebhook('wh-1', input)
  assert.equal((await client.rotateWebhookSecret('wh-1')).secret, 'whsec_new')
  await client.testWebhook('wh-1')
  await client.deleteWebhook('wh-1')
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url.replace('https://example.test/api/v1', '')}`),
    [
      'POST /webhooks',
      'GET /webhooks',
      'PUT /webhooks/wh-1',
      'POST /webhooks/wh-1/rotate-secret',
      'POST /webhooks/wh-1/test',
      'DELETE /webhooks/wh-1',
    ]
  )
  assert.deepEqual(calls[0].body, input)
})

test('upserts CRM opportunities by external id with an idempotency key (API 1.27)', async () => {
  const seen: { method?: string; url: string; key: string | null; body: unknown }[] = []
  const opportunity = { uuid: 'opp-1', external_id: 'deal-9' }
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      const headers = new Headers(init.headers)
      seen.push({ method: init.method, url, key: headers.get('Idempotency-Key'), body: JSON.parse(String(init.body)) })
      if (url.endsWith('/upsert-batch'))
        return json({
          data: [
            { index: 0, external_id: 'deal-9', result: 'unchanged', opportunity, warnings: [] },
            { index: 1, external_id: 'deal-10', error: { status: 422, code: 'invalid_stage', message: 'Unknown stage.' } },
          ],
        })
      return json(
        { data: { result: 'moved_group', opportunity, warnings: ['invalid_assignee'] } },
        { headers: { 'content-type': 'application/json', 'Idempotent-Replayed': 'true' } }
      )
    }),
  })
  const input = { group_uuid: 'g-1', title: 'Plano anual', contact_phone: '+5511999990000', stage_external_id: 'proposal' }
  const one = await client.upsertCrmOpportunityByExternalId('deal-9', input, 'sync-1')
  assert.equal(one.result, 'moved_group')
  assert.deepEqual(one.warnings, ['invalid_assignee'])
  assert.equal(one.replayed, true)
  assert.equal(seen[0].method, 'PUT')
  assert.match(seen[0].url, /\/crm\/opportunities\/by-external-id\/deal-9$/)
  assert.equal(seen[0].key, 'sync-1')
  assert.deepEqual(seen[0].body, input)

  const batch = await client.upsertCrmOpportunitiesBatch([{ ...input, external_id: 'deal-9' }])
  assert.equal(batch.replayed, false)
  assert.equal(batch.results.length, 2)
  const failed = batch.results[1]
  assert.ok('error' in failed && failed.error.code === 'invalid_stage')
  assert.ok(seen[1].key && seen[1].key.length > 0)
  assert.deepEqual(seen[1].body, { items: [{ ...input, external_id: 'deal-9' }] })
})

test('reads groups and channel events, and patches conversation fields', async () => {
  const calls: Array<{ method: string; url: string; body: unknown }> = []
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : null })
      if (url.includes('/events'))
        return json({ items: [{ uuid: 'ev-1', kind: 'status_changed', actor: { type: 'Meta', uuid: null } }], nextCursor: null, retentionDays: 30 })
      if (url.includes('/retirement'))
        return json({ channelUuid: 'ch-1', isRetired: true, retiredAt: '2026-10-17T12:00:00Z', retiredBy: null })
      if (url.includes('/fields'))
        return json({ data: { uuid: 'conv-1', custom_fields: { plano: 'anual' } } })
      if (url.includes('/groups?'))
        return json({ data: [{ uuid: 'g-1', name: 'Vendas' }], meta: { next_cursor: null } })
      return json({ data: { uuid: 'g-1', name: 'Vendas', distribution_strategy: 'balanced_daily' } })
    }),
  })
  const page = await client.listChannelEvents('ch-1', { kind: 'status_changed', limit: 20 })
  assert.equal(page.items[0].actor.type, 'Meta')
  assert.equal(page.retentionDays, 30)
  assert.equal((await client.setChannelRetired('ch-1', true)).isRetired, true)
  assert.equal((await client.listGroups({ limit: 5 })).data[0].name, 'Vendas')
  const group = await client.updateGroup('g-1', { distribution_strategy: 'balanced_daily', queue_max_per_agent: null })
  assert.equal(group.distribution_strategy, 'balanced_daily')
  const fields = await client.updateConversationFields('conv-1', { plano: 'anual', motivo: null })
  assert.equal(fields.custom_fields.plano, 'anual')
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url.replace('https://example.test/api/v1', '')}`),
    [
      'GET /channels/ch-1/events?kind=status_changed&limit=20',
      'PUT /channels/ch-1/retirement',
      'GET /groups?limit=5',
      'PATCH /groups/g-1',
      'PATCH /conversations/conv-1/fields',
    ]
  )
  assert.deepEqual(calls[1].body, { retired: true })
  assert.deepEqual(calls[3].body, { distribution_strategy: 'balanced_daily', queue_max_per_agent: null })
  assert.deepEqual(calls[4].body, { custom_fields: { plano: 'anual', motivo: null } })
})

test('returns unwrapped bodies for company queries and guard rules (API 1.36–1.37)', async () => {
  const calls: string[] = []
  const client = new WazapiClient({
    token: 'waz_api_test',
    baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      calls.push(`${init.method ?? 'GET'} ${url.replace('https://example.test/api/v1', '')}`)
      if (url.endsWith('/company-queries')) return json({ queries: [{ uuid: 'q-1', name: 'Estoque' }] })
      if (url.endsWith('/test')) return json({ queryUuid: 'q-1', httpStatus: 200, durationMs: 80, responseChars: 12, errorCode: null, text: '{"ok":true}' })
      if (url.includes('/guard-hits')) return json({ agentUuid: 'a-1', page: 1, limit: 20, hasMore: false, items: [] })
      if (url.endsWith('/settings/ai-duty')) return json({ data: { mode: 'nota', agentUuid: 'a-1', channels: ['whatsapp'], dailyLimit: 60 } })
      return json({ agentUuid: 'a-1', rule: { uuid: 'r-1', mode: 'ensaio' } }, { status: 201 })
    }),
  })
  assert.equal((await client.listCompanyQueries()).queries[0].uuid, 'q-1')
  assert.equal((await client.testCompanyQuery('q-1', { sku: '42' })).httpStatus, 200)
  const saved = await client.createAiAgentGuardRule('a-1', {
    name: 'Sem datas passadas',
    kind: 'past_date',
    patterns: ['dia {integer}'],
    correction: 'Ofereça só datas futuras.',
    finalAction: { type: 'handoff' },
  })
  assert.equal(saved.rule.mode, 'ensaio')
  assert.equal((await client.listAiAgentGuardHits('a-1', { since: '2026-10-01' })).hasMore, false)
  assert.equal((await client.getAiDutySettings()).mode, 'nota')
  assert.deepEqual(calls, [
    'GET /company-queries',
    'POST /company-queries/q-1/test',
    'POST /ai-agents/a-1/guard-rules',
    'GET /ai-agents/a-1/guard-hits?since=2026-10-01',
    'GET /settings/ai-duty',
  ])
})
