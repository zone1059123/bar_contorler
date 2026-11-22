import {test} from 'node:test'
import assert from 'node:assert/strict'
import {empty,mutate} from '../server/commands.mjs'
import {DAY,midnight,stock,total,demand,costReport} from '../server/model.mjs'

const product={name:'測試琴酒',category:'基酒',price:700,ml:700,ingredient:'gin'}
function scenario() {
  let s=empty(), serial=0
  const next=()=>String(++serial)
  const start=midnight('2026-10-12')
  const act=(kind,body,at=start+DAY*7)=>{
    s=mutate(s,{id:'op'+next(),kind,body},at,next)
    return s
  }
  act('item',product,start)
  const item=s.items[0].id
  return {item,start,act,current:()=>s}
}
test('whole/open inventory, movement, forecasting and pending purchase',()=>{
  const {item,start,act,current}=scenario()
  act('count',{rows:[{item,floor:'1F',whole:3,open:.7},{item,floor:'3F',whole:1,open:0}]},start)
  act('receipt',{item,floor:'3F',qty:1,price:600},start+DAY)
  act('transfer',{item,floor:'3F',to:'1F',qty:1},start+DAY*2)
  assert.equal(total(stock(current().events,item)['1F']),4.7)
  assert.equal(total(stock(current().events,item)['3F']),1)
  act('count',{rows:[{item,floor:'1F',whole:0,open:.5},{item,floor:'3F',whole:1,open:0}]})
  const d=demand(current().events,item,start+7*DAY)
  assert.equal(d.used,4.2)
  assert.equal(d.daily,.6)
  assert.equal(d.days,2.5)
  assert.equal(d.proposed,4)
  act('order',{rows:[{item,qty:3}]})
  assert.equal(demand(current().events,item,start+7*DAY).proposed,1)
  const order=current().events.at(-1)
  act('receipt',{item,floor:'3F',qty:1,price:600,orderId:order.id})
  assert.equal(demand(current().events,item,start+7*DAY).pending,2)
})
test('costs, exact-date calibration and independent COGS with revenue',()=>{
  const {item,start,act,current}=scenario()
  act('count',{rows:[{item,floor:'1F',whole:4,open:0},{item,floor:'3F',whole:0,open:0}]},start)
  act('receipt',{item,floor:'1F',qty:1,price:600},start+DAY)
  act('count',{rows:[{item,floor:'1F',whole:3,open:.5},{item,floor:'3F',whole:0,open:0}]})
  act('sales',{date:'2026-10-12',beverage:4500,overall:5000,extra:250})
  act('cogs',{date:'2026-10-13',item,amount:850})
  const auto=costReport(current(),start,start+8*DAY)
  assert.equal(auto.use,1050)
  assert.equal(auto.purchases,600)
  assert.equal(auto.revenue,4500)
  assert.equal(auto.totalCost,1300)
  const cleared=costReport(current(),start,start+8*DAY,'cleared','overall')
  assert.equal(cleared.cogs,850)
  assert.equal(cleared.totalCost,1100)
  assert.equal(cleared.revenue,5000)
  act('calibration',{item,start:'2026-10-12',end:'2026-10-19',qty:2.2})
  assert.equal(costReport(current(),start,start+8*DAY).use,1540)
})
test('unknown floor and unexplained additions block recommendations',()=>{
  const {item,start,act,current}=scenario()
  act('count',{rows:[{item,floor:'1F',whole:2,open:0}]},start)
  assert.equal(demand(current().events,item,start+7*DAY).proposed,null)
  act('count',{rows:[{item,floor:'3F',whole:1,open:0}]},start)
  act('count',{rows:[{item,floor:'1F',whole:3,open:0},{item,floor:'3F',whole:0,open:0}]})
  const d=demand(current().events,item,start+7*DAY)
  assert.equal(d.anomaly,true)
  assert.equal(d.proposed,null)
})
