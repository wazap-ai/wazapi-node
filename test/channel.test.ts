import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WazapiClient } from '../dist/client.js'
import type { Channel, ChannelStatusChangedEvent, ChannelAccountStatusChangedEvent } from '../src/types.js'

const channel: Channel = {
  uuid: 'fake-channel', provider: 'instagram', display_name: 'Fixture', phone_number: null,
  status: 'disconnected', capabilities: { send_text: false, send_template: false, start_flow: false },
  statusChangedAt: null, statusReason: null, statusChangedBy: null, downSince: null, healthStatus: 'unknown', accountRejection: null,
}

test('channel list preserves nullable unknown history and social providers', async () => {
  const client = new WazapiClient({ token: 'fake', baseUrl: 'https://example.test/api/v1', fetch: async (url, init) => {
    assert.equal(String(url), 'https://example.test/api/v1/channels'); assert.equal(init?.method, 'GET')
    return new Response(JSON.stringify({ data: [channel] }), { status: 200, headers: {'Content-Type':'application/json'} })
  } })
  assert.deepEqual(await client.listChannels(), [channel])
})

test('channel event pagination preserves raw page, filters, cursor and escaped channel', async () => {
  const page = {items:[],nextCursor:'123',retentionDays:30}
  const client = new WazapiClient({ token: 'fake', baseUrl: 'https://example.test/api/v1', fetch: async (url, init) => {
    const parsed = new URL(String(url)); assert.equal(parsed.pathname, '/api/v1/channels/a%2Fb/events')
    assert.equal(parsed.searchParams.get('after'),'100');assert.equal(parsed.searchParams.get('limit'),'25')
    assert.equal(parsed.searchParams.get('kind'),'account_rejected');assert.equal(init?.method,'GET')
    return new Response(JSON.stringify(page), {status:200,headers:{'Content-Type':'application/json'}})
  } })
  assert.deepEqual(await client.listChannelEvents('a/b',{after:'100',limit:25,kind:'account_rejected'}),page)
})

test('status and account webhook types preserve distinct actors and nullable recovery code', () => {
  const envelope={id:'event',api_version:'v1' as const,occurred_at:'2026-10-02T00:00:00Z'}
  const status: ChannelStatusChangedEvent={...envelope,type:'channel.status_changed',data:{channel_uuid:'channel',provider:'messenger',status:'disconnected',previous_status:'connected',status_changed_at:envelope.occurred_at,status_reason:null,status_changed_by:{type:'person',uuid:'person'}}}
  const recovered: ChannelAccountStatusChangedEvent={...envelope,type:'channel.account_status_changed',data:{channel_uuid:'channel',provider:'whatsapp',status:'account_recovered',code:null,reason:'template_accepted',occurred_at:envelope.occurred_at,actor:{type:'system',uuid:null},expires_at:null}}
  assert.equal(status.data.status_changed_by.type,'person');assert.equal(recovered.data.code,null)
})