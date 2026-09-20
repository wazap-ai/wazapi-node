import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verifyWebhookSignature } from '../dist/index.js'
const timestamp = '1700000000'
const raw = '{"id":"event"}'
const sign = (secret: string) => `v1=${createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')}`
const headers = { 'Wazapi-Timestamp': timestamp, 'Wazapi-Signature': `${sign('new')},${sign('old')}` }
const now = Number(timestamp)
test('accepts current and previous secrets during overlap', () => {
  assert.equal(verifyWebhookSignature(raw, headers, 'new', { now }), true)
  assert.equal(verifyWebhookSignature(raw, headers, 'old', { now }), true)
})
test('supports single signatures and exact binary request bodies', () => {
  assert.equal(verifyWebhookSignature(Buffer.from(raw), { ...headers, 'Wazapi-Signature': sign('new') }, 'new', { now }), true)
})
test('rejects tampering, wrong secrets, malformed digests and stale/future requests', () => {
  assert.equal(verifyWebhookSignature(raw + ' ', headers, 'new', { now }), false)
  assert.equal(verifyWebhookSignature(raw, headers, 'wrong', { now }), false)
  assert.equal(verifyWebhookSignature(raw, { ...headers, 'Wazapi-Signature': 'v1=zz' }, 'new', { now }), false)
  assert.equal(verifyWebhookSignature(raw, headers, 'new', { now: now + 301 }), false)
  assert.equal(verifyWebhookSignature(raw, headers, 'new', { now: now - 301 }), false)
})
