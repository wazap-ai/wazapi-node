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

test('AI usage performs GET with scoped filters and preserves unknown cache counters', async () => {
  const data={currency:'USD',cost_basis:'catalog_estimate',timezone:'America/Sao_Paulo',days:7,since:'2026-10-01T00:00:00-03:00',until:'2026-10-02T19:00:00-03:00',daily:[{date:'2026-10-01',agent_uuid:'agent',agent_name:'AI',turns:1,prompt_tokens:100,output_tokens:5,input_tokens:null,cache_write_tokens:null,cache_write_1h_tokens:null,cache_read_tokens:null,classified_turns:0,unclassified_turns:1,cost_cents:0.025,classified_cost_cents:0,unclassified_cost_cents:0.025}]}
  const client=new WazapiClient({token:'waz_api_test',baseUrl:'https://example.test/api/v1',fetch:stubFetch((url,init)=>{
    const u=new URL(url);assert.equal(u.pathname,'/api/v1/ai-agents/usage');assert.equal(u.searchParams.get('days'),'7');assert.equal(u.searchParams.get('agent_uuid'),'agent');assert.equal(init.method,'GET');return json({data})
  })})
  const result=await client.getAiAgentUsage({days:7,agent_uuid:'agent'});assert.deepEqual(result,data);assert.equal(result.daily[0].cache_read_tokens,null)
})

test('team reply settings and explicit dry run preserve the API envelope and request', async () => {
  const calls: { url: string; method: string; body: unknown }[] = []
  const expected = { dryRun: true, scanned: 0, changed: 0, waiting: 0, unknown: 0, nextCursor: null, changes: [] }
  const client = new WazapiClient({ token: 'waz_api_test', baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      calls.push({url, method: init.method!, body: init.body ? JSON.parse(String(init.body)) : null})
      return json({data: url.endsWith('/recalculate') ? expected : {unansweredMode:'team_reply'}})
    })
  })
  assert.deepEqual(await client.getInboxResponseSettings(), {unansweredMode:'team_reply'})
  assert.deepEqual(await client.updateInboxResponseSettings({unansweredMode:'team_reply'}), {unansweredMode:'team_reply'})
  assert.deepEqual(await client.recalculateTeamReply({dryRun:true,limit:25}), expected)
  assert.deepEqual(calls.map(c=>c.method), ['GET','PUT','POST'])
  assert.deepEqual(calls[2].body, {dryRun:true,limit:25})
  assert.equal(calls[2].url, 'https://example.test/api/v1/inbox-response-settings/recalculate')
})

test('summary settings and costs use scoped paths and preserve disabled patches', async () => {
  const seen: Array<[string,string,unknown]> = []
  const client = new WazapiClient({token:'test',baseUrl:'https://example.test/api/v1',fetch:stubFetch((url,init)=>{
    seen.push([url,init.method??'GET',init.body?JSON.parse(String(init.body)):null])
    return json({data:url.endsWith('/costs')?{days:[],calls:[],budgetAlertDay:null}:{enabled:false,dailyBudgetUsd:2}})
  })})
  assert.equal((await client.getAiSummarySettings()).enabled,false)
  assert.equal((await client.updateAiSummarySettings({enabled:false,dailyBudgetUsd:2})).dailyBudgetUsd,2)
  assert.deepEqual((await client.getAiSummaryCosts()).calls,[])
  assert.deepEqual(seen,[
    ['https://example.test/api/v1/settings/ai-summaries','GET',null],
    ['https://example.test/api/v1/settings/ai-summaries','PATCH',{enabled:false,dailyBudgetUsd:2}],
    ['https://example.test/api/v1/ai-summaries/costs','GET',null],
  ])
})

test('company response settings read and PUT preserve omission and explicit null', async () => {
  const requests: { method: string; body?: any }[] = []
  const client = new WazapiClient({
    token: 'waz_api_test', baseUrl: 'https://example.test/api/v1',
    fetch: stubFetch((url, init) => {
      assert.equal(url, 'https://example.test/api/v1/inbox-response-settings')
      requests.push({ method: init.method!, body: init.body ? JSON.parse(String(init.body)) : undefined })
      return json({ data: { unansweredMode: 'team_reply', overdueMinutes: 15 } })
    }),
  })
  assert.deepEqual(await client.getInboxResponseSettings(), { unansweredMode: 'team_reply', overdueMinutes: 15 })
  await client.updateInboxResponseSettings({ unansweredMode: 'team_reply', overdueMinutes: 15 })
  await client.updateInboxResponseSettings({ unansweredMode: 'human_reply' })
  await client.updateInboxResponseSettings({ unansweredMode: 'last_message', overdueMinutes: null })
  assert.deepEqual(requests, [
    { method: 'GET', body: undefined },
    { method: 'PUT', body: { unansweredMode: 'team_reply', overdueMinutes: 15 } },
    { method: 'PUT', body: { unansweredMode: 'human_reply' } },
    { method: 'PUT', body: { unansweredMode: 'last_message', overdueMinutes: null } },
  ])
})

test('ownerless fallback mirrors GET/PATCH contracts and preserves nullable override',async()=>{
 const seen: {url:string;method:string;body:unknown}[]=[]
 const config={defaultGroupUuid:'00000000-0000-4000-8000-000000000001',channels:{whatsapp:null,instagram:null,messenger:null},groups:[],warnings:[]}
 const client=new WazapiClient({token:'waz_api_test',baseUrl:'https://example.test/api/v1',fetch:stubFetch((url,init)=>{seen.push({url,method:init.method!,body:init.body?JSON.parse(String(init.body)):undefined});return json({data:config})})})
 assert.deepEqual(await client.getOwnerlessFallback(),config)
 await client.updateOwnerlessFallback({channels:{whatsapp:null}})
 assert.equal(seen[0].method,'GET');assert.equal(seen[0].url,'https://example.test/api/v1/settings/ownerless-fallback')
 assert.equal(seen[1].method,'PATCH');assert.deepEqual(seen[1].body,{channels:{whatsapp:null}})
})
test('ownerless application sends true by default and applies only explicit false',async()=>{
 const seen:unknown[]=[]
 const client=new WazapiClient({token:'waz_api_test',baseUrl:'https://example.test/api/v1',fetch:stubFetch((url,init)=>{assert.equal(url,'https://example.test/api/v1/settings/ownerless-fallback/apply');assert.equal(init.method,'POST');const input=JSON.parse(String(init.body));seen.push(input);return json({data:{dryRun:input.dryRun,total:1,applicable:1,applied:input.dryRun?0:1,skipped:0,items:[]}})})})
 assert.equal((await client.applyOwnerlessFallback()).applied,0)
 assert.equal((await client.applyOwnerlessFallback({dryRun:false})).applied,1)
 assert.deepEqual(seen,[{dryRun:true},{dryRun:false}])
})

test('reacts synchronously and preserves empty removal and refusal', async()=>{
  const calls:Array<{url:string;emoji:unknown}>=[]
  const client=new WazapiClient({token:'waz_api_test',baseUrl:'https://example.test/api/v1',fetch:stubFetch((url,init)=>{
    const emoji=JSON.parse(String(init.body)).emoji;calls.push({url,emoji})
    return json({data:{ok:emoji!=='😢',error:emoji==='😢'?'provider_refused':null,conversation_uuid:'conv',message_uuid:'msg',reactions:[]}})
  })})
  assert.equal((await client.reactToMessage('conv','msg','👍')).ok,true)
  await client.reactToMessage('conv','msg','')
  await client.reactToMessage('conv','msg',null)
  assert.equal((await client.reactToMessage('conv','msg','😢')).ok,false)
  assert.deepEqual(calls.map(x=>x.emoji),['👍','',null,'😢'])
  assert.ok(calls.every(x=>x.url==='https://example.test/api/v1/conversations/conv/messages/msg/reaction'))
})
