import {FLOORS, INGREDIENTS, stock, total, sum, dateKey, midnight, round} from './model.mjs'
export const empty = () => ({items:[],events:[],sales:[],applied:[]})
const fail = message => {throw new Error(message)}
const str = (v, label, max = 120) => typeof v==='string' && v.trim() && v.trim().length<=max ? v.trim() : fail(label+'格式錯誤')
function num(v,label,{min=0,max=1000000000,integer=false,nullable=false}={}) {
  if (v===null && nullable) return null
  if (typeof v!=='number' || !Number.isFinite(v) || v<min || v>max || (integer && !Number.isInteger(v))) fail(label+'格式錯誤')
  return round(v)
}
const floor = f => FLOORS.includes(f) ? f : fail('庫位只能是 1F 或 3F')
const whole = q => num(q,'整瓶數',{min:1,max:1000000,integer:true})
function date(key) {
  if (typeof key!=='string' || !/^\d{4}-\d\d-\d\d$/.test(key) || !Number.isFinite(midnight(key)) || dateKey(midnight(key))!==key) fail('日期格式錯誤')
  return key
}
function slot(value) {
  return {whole:num(value?.whole,'未開瓶數',{max:1000000,integer:true}),open:num(value?.open,'開瓶比例',{max:1})}
}
const itemKey = v => v.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ')
const lookup = (s,id) => s.items.find(i=>i.id===id)??fail('找不到品項')
function params(p) {
  const ingredient = p.ingredient || ''
  if (ingredient && !Object.hasOwn(INGREDIENTS,ingredient)) fail('材料分類不存在')
  return {name:str(p.name,'品項名稱'),category:p.category?str(p.category,'分類',80):'未分類',
    price:num(p.price,'瓶價',{nullable:true}),ml:num(p.ml,'容量',{min:1,max:100000,nullable:true}),ingredient}
}

export function mutate(current, command, now=Date.now(), makeId=()=>crypto.randomUUID()) {
  const s=structuredClone(current)
  const {kind,body,id}=command
  str(id,'操作識別碼',80)
  if (s.applied.includes(id)) return current
  const at = now
  const event = (type,item,fields,timestamp=at) => s.events.push({id:makeId(),type,item,at:timestamp,...fields})
  const upsert = (p,id) => {
    const values=params(p)
    const existing=id ? lookup(s,id) : s.items.find(i=>itemKey(i.name)===itemKey(values.name))
    if (s.items.some(i=>i.id!==existing?.id && itemKey(i.name)===itemKey(values.name))) fail('已有同名品項')
    if (existing) Object.assign(existing,values)
    else s.items.push({id:makeId(),...values})
    return existing??s.items.at(-1)
  }
  const addCount = (i,f,value,ts=at) => {
    const movement=s.events.some(e=>e.item===i && (e.floor===f || e.to===f) && e.at>ts)
    if (movement) fail('該樓層已有比此日期更新的紀錄，請確認盤點時間')
    event('count',i,{floor:f,...slot(value)},ts)
  }
  const addReceipt = (i,f,qty,price,orderId,ts=at) => {
    if (orderId) {
      const order=s.events.find(e=>e.id===orderId && e.type==='order' && e.item===i && !e.closed)
      if (!order || qty>order.qty-order.received) fail('到貨數超出此叫貨單未到貨數量')
      order.received+=qty
      if (order.received===order.qty) order.closed=true
    }
    event('receipt',i,{floor:f,qty,price,orderId:orderId||null},ts)
  }
  const writeSale = p => {
    const key=date(p.date)
    if (key>dateKey(at)) fail('營收日期不能是未來日期')
    const row={date:key,beverage:num(p.beverage,'酒水銷售額',{nullable:true}),overall:num(p.overall,'總銷售額',{nullable:true}),extra:num(p.extra,'其他成本',{nullable:true})}
    if (row.beverage!==null && row.overall!==null && row.beverage>row.overall) fail('酒水銷售額不能高於總銷售額')
    s.sales=s.sales.filter(x=>x.date!==key)
    s.sales.push(row)
  }
  const batch = rows => {
    if (!Array.isArray(rows) || !rows.length || rows.length>1500) fail('請提供 1 至 1,500 筆資料')
    return rows
  }
  switch(kind) {
    case 'item': {
      if (!body.id && s.items.some(i=>itemKey(i.name)===itemKey(body.name||''))) fail('已有同名品項，請從品項清單編輯')
      upsert(body,body.id)
      break
    }
    case 'count':
      for (const row of batch(body.rows)) {
        lookup(s,row.item)
        addCount(row.item,floor(row.floor),row)
      }
      break
    case 'transfer': {
      const i=lookup(s,body.item)
      const from=floor(body.floor), to=floor(body.to), qty=whole(body.qty)
      const counts=stock(s.events,i.id,at)
      if (from===to || !counts[to] || !counts[from] || counts[from].whole<qty) fail('請先盤點兩樓層，並確認來源有足夠未開瓶庫存')
      event('transfer',i.id,{floor:from,to,qty})
      break
    }
    case 'receipt': {
      const i=lookup(s,body.item)
      addReceipt(i.id,floor(body.floor),whole(body.qty),num(body.price,'本次單價'),body.orderId)
      break
    }
    case 'order': {
      for (const row of batch(body.rows)) {
        const i=lookup(s,row.item)
        const counts=stock(s.events,i.id,at)
        const balance=FLOORS.every(f=>counts[f])?sum(FLOORS,f=>total(counts[f])):null
        event('order',i.id,{qty:whole(row.qty),received:0,closed:false,balance,batch:id,price:i.price})
      }
      break
    }
    case 'closeOrder': {
      const order=s.events.find(e=>e.type==='order' && e.id===body.id)
      if (!order || order.closed) fail('此叫貨項目已結束')
      order.closed=true
      break
    }
    case 'sales':
      writeSale(body)
      break
    case 'calibration': {
      const i=lookup(s,body.item)
      const start=midnight(date(body.start)),end=midnight(date(body.end))+86400000
      if (end<=start || dateKey(end-1)>dateKey(at)) fail('用量校準日期不正確')
      event('calibration',i.id,{start,end,qty:num(body.qty,'使用瓶數')})
      break
    }
    case 'cogs': {
      const i=lookup(s,body.item)
      const key=date(body.date)
      if (key>dateKey(at)) fail('核銷日期不能是未來日期')
      const ts=midnight(key)
      s.events=s.events.filter(e=>!(e.type==='cogs' && e.item===i.id && e.at===ts))
      event('cogs',i.id,{amount:num(body.amount,'核銷成本')},ts)
      break
    }
    case 'import': {
      const rows=batch(body.rows)
      const seen=new Set()
      for (const row of rows) {
        const existing=s.items.find(i=>itemKey(i.name)===itemKey(row.name))
        const i=upsert({...row,price:row.price??existing?.price??null,ml:row.ml??existing?.ml??null,
          ingredient:row.ingredient||existing?.ingredient||'',category:row.category||existing?.category||''})
        const currentKey=date(row.date)
        if (currentKey>dateKey(at)) fail('盤點日期不能是未來日期')
        const currentTs=currentKey===dateKey(at)?at:midnight(currentKey)+43200000
        for (const f of FLOORS) {
          if (row.counts?.[f]) {
            const key=i.id+'|'+currentKey+'|'+f
            if (seen.has(key)) fail(i.name+' 有相同日期與庫位的重複列')
            seen.add(key)
          }
        }
        if (row.previous && Object.values(row.previous).some(Boolean)) {
          const prev=date(row.previousDate)
          if (prev>=currentKey) fail('前次盤點日期須早於本次盤點')
          for (const f of FLOORS) if (row.previous[f]) addCount(i.id,f,row.previous[f],midnight(prev)+43200000)
        }
        if (row.receiptQty!==null && row.receiptQty>0) {
          if (i.price===null) fail(i.name+' 缺少進貨單價')
          const f=floor(row.receiptFloor),qty=whole(row.receiptQty)
          const duplicate=s.events.some(e=>e.type==='receipt'&&e.imported&&e.item===i.id&&e.floor===f&&e.qty===qty&&dateKey(e.at)===currentKey)
          if (!duplicate) event('receipt',i.id,{floor:f,qty,price:i.price,orderId:null,imported:true},currentTs)
        }
        for (const f of FLOORS) if (row.counts?.[f]) addCount(i.id,f,row.counts[f],currentTs)
      }
      break
    }
    case 'importSales':
      for (const row of batch(body.rows)) writeSale(row)
      break
    default: fail('未知操作')
  }
  s.applied.push(id)
  return s
}
