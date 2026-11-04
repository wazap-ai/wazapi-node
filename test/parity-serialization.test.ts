import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WazapiClient, WazapiError } from '../dist/index.js'
import type { AiDutySettings, CustomFieldCreate, RateLimitDetails, StoreProductPatch, SupportGroupPatch } from '../dist/index.js'

function clientWithResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: { url: string; method?: string; body: unknown }[] = []
  const client = new WazapiClient({
    token: 'synthetic-token',
    baseUrl: 'https://example.test/api/v1',
    idempotencyKeyFactory: () => 'synthetic-operation',
    fetch: async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method,
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      })
      return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })
    },
  })
  return { client, calls }
}

test('product filter and write keep listed and installments, including null and zero', async () => {
  const product = { uuid: 'synthetic', listed: false, installments_max: null, min_installment_cents: 0 }
  const { client, calls } = clientWithResponse({ data: product })
  const patch: StoreProductPatch = { listed: false, installments_max: null, min_installment_cents: 0 }
  assert.deepEqual(await client.updateStoreProduct('synthetic', patch), product)
  assert.deepEqual(calls[0].body, patch)

  const list = clientWithResponse({ data: [], meta: { next_cursor: null } })
  await list.client.listStoreProducts({ listed: false })
  assert.ok(list.calls[0].url.endsWith('/store/products?listed=false'))
})

test('group patch sends a partial queue policy and leaves the rest out', async () => {
  const { client, calls } = clientWithResponse({ data: {} })
  const patch: SupportGroupPatch = { queue_policy: { doseSize: 3, historyStartDate: null } }
  await client.updateGroup('synthetic', patch)
  assert.deepEqual(calls[0].body, patch)
})

test('keyword entries send run_when_assigned only when given and read it back', async () => {
  const data = { uuid: 'synthetic', supported_entries: [], run_when_assigned: true }
  const { client, calls } = clientWithResponse({ data })
  assert.deepEqual(await client.updateKeywordEntries('synthetic', [], { run_when_assigned: true }), data)
  await client.updateKeywordEntries('synthetic', [])
  await client.updateKeywordEntries('synthetic', [], { run_when_assigned: false })
  assert.deepEqual(calls.map((call) => call.body), [
    { supported_entries: [], run_when_assigned: true },
    { supported_entries: [] },
    { supported_entries: [], run_when_assigned: false },
  ])
  assert.equal((await client.getKeywordEntries('synthetic')).run_when_assigned, true)
})

test('company query test sends the contact only when given', async () => {
  const { client, calls } = clientWithResponse({ queryUuid: 'synthetic' })
  await client.testCompanyQuery('synthetic', { code: '1' }, { contactUuid: 'synthetic-contact' })
  await client.testCompanyQuery('synthetic')
  assert.deepEqual(calls.map((call) => call.body), [
    { args: { code: '1' }, contactUuid: 'synthetic-contact' },
    { args: {} },
  ])
})

test('bulk dismissal returns the unwrapped result and sends only what was given', async () => {
  const result = { dismissed: 2, bySeller: [{ sellerUuid: 'synthetic', name: 'Synthetic', count: 2 }] }
  const { client, calls } = clientWithResponse(result)
  assert.deepEqual(await client.dismissAiSuggestions(), result)
  await client.dismissAiSuggestions({ dryRun: false, createdBefore: '2026-11-01T00:00:00Z' })
  assert.deepEqual(calls.map((call) => [call.method, call.body]), [
    ['POST', {}],
    ['POST', { dryRun: false, createdBefore: '2026-11-01T00:00:00Z' }],
  ])
  assert.ok(calls[0].url.endsWith('/ai-suggestions/dismiss'))
})

test('field options keep the diff of the envelope and work without one', async () => {
  const options = [{ value: 'synthetic', label: 'Synthetic' }]
  const data = { key: 'synthetic', type: 'select', options }
  const diff = { added: options, removed: [], renamed: [] }
  const withDiff = clientWithResponse({ data, diff })
  assert.deepEqual(await withDiff.client.replaceConversationFieldOptions('synthetic', options), { ...data, diff })
  const withoutDiff = clientWithResponse({ data })
  assert.deepEqual(await withoutDiff.client.replaceConversationFieldOptions('synthetic', options), data)
})

test('custom field write takes a mirror with only the alias, or null', async () => {
  const { client, calls } = clientWithResponse({ data: {} })
  const input: CustomFieldCreate = { key: 'synthetic', label: 'Synthetic', type: 'select', mirror: { idAlias: 'synthetic' } }
  await client.createCustomField(input)
  await client.updateCustomField('synthetic', { mirror: null })
  assert.deepEqual(calls.map((call) => call.body), [input, { mirror: null }])
})

test('plantão PUT keeps the new switches, false values and an omitted block', async () => {
  const settings: AiDutySettings = {
    mode: 'plantao',
    agentUuid: 'synthetic-agent',
    channels: ['whatsapp'],
    dailyLimit: 60,
    summaryNotesEnabled: false,
    suggestionsEnabled: true,
    plantao: {
      groups: [],
      retomadaContextual: false,
      leituraContexto: false,
      leituraModelo: 'synthetic-model',
      umaVozPorConversa: false,
    },
  }
  const { client, calls } = clientWithResponse({ data: settings })
  assert.deepEqual(await client.updateAiDutySettings(settings), settings)
  assert.deepEqual(calls[0].body, settings)
  const { plantao: _plantao, ...withoutPlantao } = settings
  await client.updateAiDutySettings(withoutPlantao)
  assert.deepEqual(calls[1].body, withoutPlantao)
})

test('429 keeps Retry-After and the read or write budget, with no automatic retry', async () => {
  for (const budget of ['read', 'write'] as const) {
    const details: RateLimitDetails = { budget, limit: 300, remaining: 0, reset_seconds: 12 }
    const { client, calls } = clientWithResponse(
      { error: { code: 'rate_limit_exceeded', message: 'Synthetic limit', details } },
      429,
      { 'Retry-After': '12' }
    )
    await assert.rejects(client.listChannels(), (error: unknown) => {
      assert.ok(error instanceof WazapiError)
      assert.equal(error.isRateLimited, true)
      assert.equal(error.retryAfter, 12)
      assert.deepEqual(error.details, details)
      return true
    })
    assert.equal(calls.length, 1)
  }
})
