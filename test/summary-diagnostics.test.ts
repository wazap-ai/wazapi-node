import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WazapiClient } from '../dist/index.js'
import type { AiSummaryPreviewResult } from '../src/types.js'

test('uncertain preview retains its unknown-cost flag and reservation without a second paid request', async () => {
  let requests = 0
  const expected: AiSummaryPreviewResult = {
    previewUuid: '11111111-1111-4111-8111-111111111111', status: 'uncertain',
    reason: 'provider_outcome_unknown', lines: [], model: 'claude-haiku-4-5', usage: null,
    costUsdMicros: 0, costUsd: 0, costKnown: false,
    zeroCostReason: 'provider_outcome_unknown', reservedUsdMicros: 9000,
    input: { messages: [], afterMessageId: '0', throughMessageId: '3', now: '2026-10-04T12:00:00Z', timezone: 'America/Sao_Paulo' },
  }
  const client = new WazapiClient({ token: 'waz_api_fake', fetch: (async () => {
    requests++
    return Response.json({ data: expected })
  }) as typeof fetch })
  const result = await client.previewAiSummary({ conversationUuid: '22222222-2222-4222-8222-222222222222' })
  assert.equal(result.status, 'uncertain')
  assert.equal(result.costKnown, false)
  assert.equal(result.zeroCostReason, 'provider_outcome_unknown')
  assert.equal(result.reservedUsdMicros, 9000)
  assert.equal(requests, 1)
})
