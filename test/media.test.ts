import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WazapiClient } from '../dist/index.js'
test('media wrapper preserves caption, quote and idempotency without changing text/template sends', async()=>{
 const bodies:unknown[]=[];const keys:string[]=[]
 const client=new WazapiClient({token:'waz_api_fake',baseUrl:'https://example.test/api/v1',fetch:(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));keys.push(new Headers(init?.headers).get('Idempotency-Key')!);return new Response(JSON.stringify({data:{uuid:'fake-operation',type:'message.send',status:'queued'}}),{status:202,headers:{'content-type':'application/json'}})}) as typeof fetch})
 await client.sendMedia(null,'+5511999998888',{media_uuid:'fake-file',caption:'Caption'},'media-key','fake-quote')
 await client.sendText(null,'+5511999998888','Text','text-key')
 await client.sendTemplate(null,'+5511999998888',{name:'fake_template'},'template-key')
 assert.deepEqual(bodies,[{recipient:{phone:'+5511999998888'},type:'media',content:{media_uuid:'fake-file',caption:'Caption'},replyToMessageUuid:'fake-quote'},{recipient:{phone:'+5511999998888'},type:'text',content:{text:'Text'}},{recipient:{phone:'+5511999998888'},type:'template',content:{name:'fake_template'}}]);assert.deepEqual(keys,['media-key','text-key','template-key'])
})
