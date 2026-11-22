import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {build} from 'esbuild'
import * as XLSX from '@e965/xlsx'
import worker from '../server/worker.mjs'
import {session} from '../server/auth.mjs'
import {dateKey,mondayKey,parseTaipeiTime,stock,total} from '../server/model.mjs'

const base='https://barkeep.test'
const product={name:'測試琴酒',category:'基酒',price:700,ml:700,ingredient:'gin'}
const confirmRestore='還原正式庫存'
const confirmReset='清空正式庫存'

test('Worker and local Cloudflare D1', async t=>{
  const scratch=await mkdtemp(join(tmpdir(),'barkeep-cloud-test-'))
  process.env.CLOUDFLARE_DEV_REGISTRY_PATH=join(scratch,'registry')
  process.env.WRANGLER_LOG_PATH=join(scratch,'wrangler.log')
  const {getPlatformProxy}=await import('wrangler')
  const runtime=await getPlatformProxy({configPath:'wrangler.toml',persist:false})
  t.after(async()=>{
    await runtime.dispose()
    await rm(scratch,{recursive:true,force:true})
  })
  const {DB}=runtime.env
  const migrations=new URL('../migrations/',import.meta.url)
  for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) {
    const sql=await readFile(new URL(name,migrations),'utf8')
    await DB.batch(sql.split('--> statement-breakpoint').filter(s=>s.trim()).map(s=>DB.prepare(s.trim())))
  }

  const env={DB,BAR_PASSWORD:'test-bar-password',SESSION_SECRET:'test-only-secret',REQUIRE_BAR_PASSWORD:'true'}
  function request(path,{body,cookie,method=body===undefined?'GET':'POST',ip='198.51.100.1',origin=base,bindings=env}={}) {
    const req=new Request(base+path,{method,headers:{
      ...(body!==undefined?{'Content-Type':'application/json'}:{}),
      ...(method==='POST'?{Origin:origin}:{}),
      'CF-Connecting-IP':ip,
      ...(cookie?{Cookie:cookie}:{})
    },body:body===undefined?undefined:JSON.stringify(body)})
    return worker.fetch(req,bindings)
  }
  let cookie, revision=0
  const read=async (path='/api/state')=>{
    const response=await request(path,{cookie})
    assert.equal(response.status,200)
    return response.json()
  }
  const post=async (kind,body,status=200,expected=revision,id=crypto.randomUUID())=>{
    const response=await request('/api/state',{cookie,body:{id,kind,body,revision:expected}})
    const data=await response.json()
    assert.equal(response.status,status,JSON.stringify(data).slice(0,350))
    if(status===200||status===409)revision=data.revision
    return data
  }

  await t.test('requires authentication, uses secure persistent cookies, and revokes sessions',async()=>{
    const setup=await request('/api/state',{bindings:{DB,REQUIRE_BAR_PASSWORD:'true'}})
    assert.equal(setup.status,503)
    assert.equal((await request('/api/state')).status,401)
    assert.equal((await request('/api/backup')).status,401)
    assert.equal((await request('/api/state',{body:{id:'x',revision:0}})).status,401)
    const info=await (await request('/api/session')).json()
    assert.deepEqual(info,{mode:'password',authenticated:false,storage:'cloud'})
    for(let attempt=0;attempt<10;attempt++) {
      assert.equal((await request('/api/login',{body:{password:'wrong'},ip:'198.51.100.2'})).status,401)
    }
    assert.equal((await request('/api/login',{body:{password:env.BAR_PASSWORD},ip:'198.51.100.2'})).status,429)
    async function signIn() {
      const signed=await request('/api/login',{body:{password:env.BAR_PASSWORD}})
      assert.equal(signed.status,200)
      const header=signed.headers.get('Set-Cookie')
      for(const attr of ['HttpOnly','Secure','SameSite=Strict','Max-Age=2592000','Path=/'])assert.ok(header.includes(attr),attr)
      return header.split(';')[0]
    }
    cookie=await signIn()
    const tampered=cookie.slice(0,-1)+(cookie.endsWith('A')?'B':'A')
    assert.equal((await request('/api/state',{cookie:tampered})).status,401)
    assert.equal((await request('/api/state',{cookie,bindings:{...env,BAR_PASSWORD:'different'}})).status,401)
    assert.equal((await session(new Request(base,{headers:{Cookie:cookie}}),env,Date.now()+31*86400000)).authenticated,false)
    assert.equal((await read()).revision,0)
    assert.equal((await request('/api/state?since=0',{cookie})).status,204)
    assert.equal((await request('/api/state',{cookie,origin:'https://example.net',body:{}})).status,403)
    const cleared=await request('/api/logout',{method:'POST',cookie})
    assert.match(cleared.headers.get('Set-Cookie'),/Max-Age=0/)
    assert.equal((await request('/api/backup',{cookie})).status,401)
    cookie=await signIn()
  })

  await t.test('supports floor baselines, backfill, anomaly confirmation, and revision-safe undo',async()=>{
    const {state}=await post('import',{baseline:'2026-01-03T03:30',rows:[{
      ...product,date:'2026-01-03',previous:{},receiptQty:null,
      counts:{'1F':{whole:2,open:.2},'3F':{whole:0,open:0}}
    }]})
    assert.equal(state.events[0].at,parseTaipeiTime('2026-01-03T03:30'))
    const item=state.items[0].id
    const earlier={time:'2026-01-01T03:30',rows:[{item,floor:'1F',whole:4,open:.3}]}
    assert.equal((await post('count',earlier,400)).code,'confirmBackfill')
    await post('count',{...earlier,confirmBackfill:true})
    assert.equal(total(stock((await read()).state.events,item)['1F']),2.2)

    const jump={rows:[{item,floor:'1F',whole:7,open:.3}]}
    assert.equal((await post('count',jump,400)).code,'confirmJump')
    await post('count',{...jump,confirmJump:true})
    const old=revision
    assert.equal((await post('transfer',{item,floor:'1F',to:'3F',qty:1},200)).undo,'transfer')
    await post('undo',{},409,old)
    const reverted=await post('undo',{})
    assert.equal(total(stock(reverted.state.events,item)['3F']),0)
    assert.equal(reverted.undo,null)
    await post('undo',{},400)
    await post('transfer',{item,floor:'3F',to:'1F',qty:1},400)
    await post('order',{rows:[{item,qty:3}]})
    const order=(await read()).state.events.find(e=>e.type==='order')
    await post('receipt',{item,orderId:order.id,qty:1,price:680,floor:'3F'})
    const prior=await read()
    assert.equal(prior.state.events.find(e=>e.id===order.id).received,1)
    await post('undo',{})
    assert.equal((await read()).state.events.find(e=>e.id===order.id).received,0)
    await post('receipt',{item,orderId:order.id,qty:1,price:685,floor:'3F'})
    await post('queueOrder',{item,qty:2})
    await post('sales',{date:'2026-01-03',beverage:12000,overall:15000,extra:750})
    await post('calibration',{item,start:'2026-01-01',end:'2026-01-07',qty:2.8})
    await post('cogs',{item,date:'2026-01-03',amount:1900})
  })

  await t.test('round-trips JSON and restoration Excel; invalid or stale changes leave data intact',async()=>{
    const original=await read('/api/backup')
    const {outputFiles}=await build({
      entryPoints:['src/backup-file.ts'],bundle:true,platform:'node',format:'esm',write:false
    })
    const code=Buffer.from(outputFiles[0].contents).toString('base64')
    const {xlsxBackup,decodeBackupFile}=await import('data:text/javascript;base64,'+code)
    const xlsx=XLSX.write(xlsxBackup(original),{type:'array',bookType:'xlsx'})
    const restored=decodeBackupFile(xlsx,'backup.xlsx')
    assert.deepEqual(restored,original)
    const json=Uint8Array.from(Buffer.from(JSON.stringify(original))).buffer
    assert.deepEqual(decodeBackupFile(json,'backup.json'),original)
    const before=await read()
    await post('restore',{confirm:confirmRestore,backup:{...original,events:[{...original.events[0],item:'missing'}]}},400)
    await post('reset',{confirm:'wrong'},400)
    assert.deepEqual(await read(),before)
    await post('restore',{confirm:confirmRestore,backup:original},409,revision-1)
    const resetId='unique-reset'
    const startingRevision=revision
    assert.deepEqual((await post('reset',{confirm:confirmReset},200,revision,resetId)).state.items,[])
    const retry=await post('reset',{confirm:confirmReset},200,startingRevision,resetId)
    assert.equal(retry.revision,startingRevision+1)
    assert.equal(retry.undo,null)
    await post('restore',{confirm:confirmRestore,backup:restored})
    const live=await read('/api/backup')
    const {exportedAt:old, ...data}=original
    const {exportedAt:newTime, ...newData}=live
    assert.deepEqual(newData,data)
    assert.ok(!Object.keys(live).some(key=>/secret|session|password/i.test(key)))
  })
})

test('Taipei week starts at Monday 00:00 and timestamps use UTC+8',()=>{
  const sunday=Date.parse('2026-11-22T15:59:59Z')
  assert.equal(dateKey(sunday),'2026-11-22')
  assert.equal(mondayKey(sunday),'2026-11-16')
  assert.equal(mondayKey(sunday+1000),'2026-11-23')
  assert.equal(parseTaipeiTime('2026-11-23T00:00'),sunday+1000)
  assert.ok(Number.isNaN(parseTaipeiTime('2026-02-31T12:00')))
})
