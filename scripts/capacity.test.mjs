import assert from 'node:assert/strict'
import {test} from 'node:test'
import {lookupCapacity} from '../server/capacity.mjs'
import {api} from '../server/handler.mjs'

const match={code:'8000040001106',product_name:'Campari',brands:['Campari']}
const pack=(quantity,extras={})=>({...match,quantity,...extras})
const food=(hits)=>Response.json({hits})

test('normalizes packaging to ml and excludes packs and unrelated products',async()=>{
  const payload=await lookupCapacity('Campari 金巴利',null,async url=>{
    assert.equal(url.searchParams.get('q'),'campari')
    return food([pack('6×330 ml'),pack('0.7 L'),pack('70 cL',{code:'8000040001004'}),pack('1 L',{code:'8000040001205'}),pack('750 ml',{product_name:'Aperol'})])
  })
  assert.deepEqual(payload.suggestions.map(s=>s.ml),[700,1000])
  assert.equal(payload.suggestions[0].url,'https://world.openfoodfacts.org/product/8000040001106')
  const ranked=await lookupCapacity('Campari',null,async()=>food([
    pack('200ml',{code:'8000040001052'}),pack('700ml')
  ]))
  assert.equal(ranked.suggestions[0].ml,700)
  const explicit=await lookupCapacity('金巴利 750ml',null,async()=>food([pack('700ml'),pack('750ml')]))
  assert.deepEqual(explicit.suggestions.map(s=>s.ml),[750])
})

test('uses Brave only as a fallback and rejects conflicting sizes and unsafe source URLs',async()=>{
  const results=await lookupCapacity('Cointreau', 'test-key',async (url,options)=>{
    if(url.hostname==='search.openfoodfacts.org')return food([])
    assert.equal(options.headers['X-Subscription-Token'],'test-key')
    return Response.json({web:{results:[
      {title:'Cointreau 700 ml / 1 L',url:'https://example.test/conflicting'},
      {title:'Cointreau 700 ml',url:'javascript:alert(1)'},
      {title:'Cointreau 75 cl',url:'https://example.test/cointreau'}
    ]}})
  })
  assert.deepEqual(results.suggestions.map(s=>[s.ml,s.source]),[[750,'Brave Search']])
})

test('handles missing items and timeouts without supplying a default capacity',async()=>{
  assert.deepEqual(await lookupCapacity('威士忌',null,async()=>{assert.fail('Generic type must not be queried')}),{suggestions:[]})
  assert.deepEqual(await lookupCapacity('不存在的品牌',null,async()=>food([])),{suggestions:[]})
  await assert.rejects(lookupCapacity('Campari',null,async()=>{throw new DOMException('Timeout','TimeoutError')}),/手動輸入/)
})

test('capacity endpoint requires a workspace session',async()=>{
  const response=await api(new Request('https://barkeep.test/api/item-capacity?name=Campari'),{BAR_PASSWORD:'test-only'})
  assert.equal(response.status,401)
  assert.equal((await response.json()).code,'login')
})
