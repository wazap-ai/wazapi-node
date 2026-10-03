import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WazapiClient } from '../dist/index.js'
import type { AiDutySettings, PublicApiScope } from '../src/types.js'
const settings: AiDutySettings = { mode: 'sombra', agentUuid: 'ficticio', channels: ['whatsapp'], dailyLimit: 60 }
const scope: PublicApiScope = 'ai_agents:write'
test('AI duty reads the token company settings without a write or an AI call', async () => {
  const client = new WazapiClient({ token: 'waz_api_test', fetch: (async (url, init) => {
    assert.equal(String(url), 'https://wazapi.io/api/v1/settings/ai-duty'); assert.equal(init?.method,'GET'); assert.equal(init?.body, undefined)
    return Response.json({ data: settings })
  }) as typeof fetch })
  assert.deepEqual(await client.getAiDutySettings(), settings)
})
test('AI duty replaces exactly the four settings and exposes its explicit write scope', async () => {
  const client = new WazapiClient({ token: 'waz_api_test', fetch: (async (url, init) => {
    assert.equal(String(url), 'https://wazapi.io/api/v1/settings/ai-duty'); assert.equal(init?.method,'PUT'); assert.deepEqual(JSON.parse(String(init?.body)), settings)
    return Response.json({ data: settings })
  }) as typeof fetch })
  assert.equal(scope,'ai_agents:write'); assert.deepEqual(await client.updateAiDutySettings(settings), settings)
})
