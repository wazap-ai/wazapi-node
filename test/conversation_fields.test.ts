import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConversationFieldActor, WazapiWebhookEvent } from '../dist/index.js'

test('conversation fields discriminate human email without requiring it on older events', () => {
  const actors: ConversationFieldActor[] = [
    { type: 'user', email: 'agent@example.test', user: { uuid: 'user', name: null }, integration_uuid: null },
    { type: 'user', user: null, integration_uuid: null },
    { type: 'api', user: { uuid: 'user', name: null }, integration_uuid: 'integration' },
    { type: 'flow', user: null, integration_uuid: null },
  ]
  assert.equal(actors[0].email, 'agent@example.test')
  assert.equal(actors[2].email, undefined)
  const event: WazapiWebhookEvent = {
    id: 'event', type: 'conversation.fields_changed', api_version: 'v1', occurred_at: '2026-10-15T18:00:00Z',
    data: { conversation: { uuid: 'conversation', status: 'open', channel: null },
      contact: { uuid: 'contact', external_id: null },
      changes: [{ key: 'etapa', type: 'select', before: { value: '1' }, after: { value: '14' } }], actor: actors[0] },
  }
  assert.equal(event.data.actor.email, 'agent@example.test')
  // @ts-expect-error An API integration must not be typed as an authenticated human email.
  const invalid: ConversationFieldActor = { type: 'api', email: 'agent@example.test', user: null, integration_uuid: null }
  assert.equal(invalid.type, 'api')
})
