import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { WazapiClient } from '../dist/index.js'

// Structural cut of the OpenAPI contract, without descriptions or examples.
const contract = JSON.parse(readFileSync(new URL('./fixtures/contract-1.63.0.json', import.meta.url), 'utf8'))

// SDK names that differ from the contract's operationId, kept for existing consumers.
const methodNames: Record<string, string> = {
  upsertExternalContact: 'upsertContactByExternalId',
  listConversationMessages: 'listMessages',
  saveStoreCoupon: 'createStoreCoupon',
  updateGroupWaitAlert: 'updateGroup',
  getAgentEntries: 'getAiAgentEntries',
  updateAgentEntries: 'updateAiAgentEntries',
  upsertCrmOpportunity: 'upsertCrmOpportunityByExternalId',
  patchAiAgentGuardRule: 'updateAiAgentGuardRule',
}

for (const operation of contract.operations) {
  test(`contract: ${operation.method} ${operation.path}`, async () => {
    const calls: { url: string; method?: string }[] = []
    const client = new WazapiClient({
      token: 'synthetic-token',
      baseUrl: 'https://example.test/api/v1',
      idempotencyKeyFactory: () => 'synthetic-operation',
      fetch: async (input, init) => {
        calls.push({ url: new URL(String(input)).pathname, method: init?.method })
        return new Response(JSON.stringify({
          data: { uuid: 'synthetic-operation', type: 'message.send', status: 'queued' },
        }), { status: 202, headers: { 'Content-Type': 'application/json' } })
      },
    })
    const name = methodNames[operation.operationId] ?? operation.operationId
    const method = (client as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name]
    assert.equal(typeof method, 'function', `missing method: ${name}`)
    const pathParameters = operation.path.match(/\{[^}]+\}/g) ?? []
    await method.call(client, ...pathParameters.map(() => 'synthetic/value'))
    const expectedPath = operation.path.replace(/\{[^}]+\}/g, encodeURIComponent('synthetic/value'))
    assert.deepEqual(calls, [{ url: `/api/v1${expectedPath}`, method: operation.method }])
  })
}

type Schema = {
  type?: string | string[]
  enum?: unknown[]
  $ref?: string
  oneOf?: Schema[]
  allOf?: Schema[]
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  additionalProperties?: boolean | Schema
}

// Converts the shape only. Business limits stay in the API.
function typeOf(schema: Schema): string {
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop()!
    if (name === 'FieldOptions') return 'SDK.FieldOption[]'
    return contract.schemas[name] ? typeOf(contract.schemas[name]) : `SDK.${name}`
  }
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ')
  if (schema.oneOf) return schema.oneOf.map(typeOf).join(' | ')
  if (schema.allOf) return schema.allOf.map((value) => `(${typeOf(value)})`).join(' & ')
  if (Array.isArray(schema.type)) {
    return schema.type.map((type) => `(${typeOf({ ...schema, type })})`).join(' | ')
  }
  if (schema.type === 'null') return 'null'
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'boolean' || schema.type === 'string') return schema.type
  if (schema.type === 'array') return `Array<${typeOf(schema.items ?? {})}>`
  if (schema.type === 'object' || schema.properties) {
    const properties = Object.entries(schema.properties ?? {}).map(([key, value]) =>
      `${JSON.stringify(key)}${schema.required?.includes(key) ? '' : '?'}: ${typeOf(value)}`)
    if (schema.additionalProperties === true) properties.push('[key: string]: unknown')
    return `{ ${properties.join('; ')} }`
  }
  return 'unknown'
}

test('types match the pinned contract, on read and on write', () => {
  const schemas = contract.schemas
  const assertions: string[] = []
  const compare = (actual: string, schema: Schema, optional = false) => {
    assertions.push(`type Check${assertions.length} = Assert<Equivalent<${actual}, ${typeOf(schema)}${optional ? ' | undefined' : ''}>>`)
  }
  const property = (name: string, key: string, actual = `SDK.${name}['${key}']`) => {
    compare(actual, schemas[name].properties[key], !schemas[name].required?.includes(key))
  }

  property('Message', 'send_route')
  compare("Extract<SDK.SendMessageInput, { type: 'template' }>['marketingMessages']", schemas.MessageRequest.oneOf[1].properties!.marketingMessages, true)
  for (const name of ['CustomFieldDefinition', 'CustomFieldCreate', 'CustomFieldPatch']) {
    for (const key of ['type', 'mirror']) property(name, key)
  }
  property('ConversationFieldOptions', 'mirror')
  for (const key of ['origin', 'origin_integration_uuid']) property('ConversationFieldsChangedData', key)

  // API 1.58 and 1.59: products and company queries.
  for (const key of ['installments_max', 'min_installment_cents', 'listed']) {
    for (const name of ['StoreProduct', 'StoreProductWrite']) property(name, key)
    compare(`SDK.StoreProductPatch['${key}']`, schemas.StoreProductPatch.properties[key], true)
  }
  property('CompanyQueryParameter', 'source')
  property('CompanyQuery', 'method')
  property('CompanyQueryCreate', 'method')
  compare("SDK.CompanyQueryPatch['method']", schemas.CompanyQueryPatch.properties.method, true)
  compare("SDK.CompanyQueryTestOptions['contactUuid']", schemas.CompanyQueryTestInput.properties.contactUuid, true)

  // API 1.60 to 1.63: queue policy, plantão, bulk dismissal and keyword clicks.
  compare('SDK.QueuePolicy', schemas.QueuePolicy)
  compare('SDK.QueuePolicyPatch', schemas.QueuePolicyPatch)
  compare("SDK.SupportGroup['queue_policy']", schemas.QueuePolicy)
  compare("SDK.SupportGroupPatch['queue_policy']", schemas.QueuePolicyPatch, true)
  for (const name of ['AiDutyPlantao', 'AiDutySettings', 'DismissAiSuggestionsInput', 'DismissAiSuggestionsResult']) {
    compare(`SDK.${name}`, schemas[name])
  }
  // The server always returns `plantao` on GET, so the SDK is stricter than the contract here.
  compare('SDK.AiDutySettingsRead', { ...schemas.AiDutySettingsRead, required: [...schemas.AiDutySettingsRead.required, 'plantao'] })
  compare('SDK.KeywordEntryTargets', contract.paths['/keywords/{uuid}/entries'].get.response.properties.data)
  compare('SDK.FieldOptionDiff', contract.paths['/conversation-fields/{key}/options'].put.response.properties.diff)
  compare('SDK.WebhookEventType', schemas.WebhookEventType)
  compare("SDK.WazapiWebhookEvent['type']", schemas.WebhookEventType)

  assertions.push("type NoCountersInPut = Assert<'dailyCounters' extends keyof Parameters<SDK.WazapiClient['updateAiDutySettings']>[0] ? false : true>")
  assertions.push("type GetCounters = Assert<Equivalent<Awaited<ReturnType<SDK.WazapiClient['getAiDutySettings']>>, SDK.AiDutySettingsRead>>")
  assertions.push("type PutSettings = Assert<Equivalent<Awaited<ReturnType<SDK.WazapiClient['updateAiDutySettings']>>, SDK.AiDutySettings>>")
  assertions.push("type TemplateOnly = Assert<'marketingMessages' extends keyof Extract<SDK.SendMessageInput, { type: 'text' | 'media' }> ? false : true>")

  // Virtual source: the compiler writes no file or cache.
  const filename = resolve('test/__contract_check__.ts')
  const source = `import type * as SDK from '../dist/index.js'
    type Assert<T extends true> = T
    type Equivalent<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
    ${assertions.join('\n')}`
  const options: ts.CompilerOptions = {
    noEmit: true, strict: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  }
  const host = ts.createCompilerHost(options)
  const originalGetSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (file, ...args) => resolve(file) === filename
    ? ts.createSourceFile(file, source, options.target!)
    : originalGetSourceFile(file, ...args)
  const program = ts.createProgram([filename], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }))
})
