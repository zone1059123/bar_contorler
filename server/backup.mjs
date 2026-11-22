import {FLOORS,INGREDIENTS,dateKey,midnight,DAY,ordered} from './model.mjs'

export const BACKUP_FORMAT = 'barkeep-backup'
export const BACKUP_VERSION = 1
export const BACKUP_LIMIT = 16_000_000

export function backupDocument(state, now=Date.now()) {
  return {
    format:BACKUP_FORMAT,version:BACKUP_VERSION,exportedAt:new Date(now).toISOString(),
    items:state.items,events:state.events,sales:state.sales,drafts:state.drafts??[]
  }
}

const invalid = (label) => {throw new Error('備份資料有誤：'+label)}
const text = (value,max) => typeof value==='string' && value.length>0 && value.length<=max && value.trim()===value
const number = (value,max=1e9) => Number.isFinite(value) && value>=0 && value<=max
const optional = (value,max) => value===null || number(value,max)
const integer = (value,min,max) => Number.isSafeInteger(value) && value>=min && value<=max
const qty = (value) => integer(value,1,1e6)
const floor = (value) => FLOORS.includes(value)
const validDay = (value) => typeof value==='string' && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(midnight(value)) && dateKey(midnight(value))===value
const record = (input) => input && typeof input==='object' && !Array.isArray(input)
const copy = (row, keys) => Object.fromEntries(keys.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]))

// Replays stock in recorded order and checks older counts against subsequent transfers.
export function firstInvalidTransfer(events, items) {
  const byItem = new Map()
  for (const entry of ordered(events)) {
    if ((items && !items.has(entry.item)) || !['count','receipt','transfer'].includes(entry.type)) continue
    if (!byItem.has(entry.item)) byItem.set(entry.item,{'1F':null,'3F':null})
    const stock = byItem.get(entry.item)
    if (entry.type==='count') stock[entry.floor]=entry.whole
    if (entry.type==='receipt' && stock[entry.floor]!==null) stock[entry.floor]+=entry.qty
    if (entry.type==='transfer') {
      if (stock[entry.floor]===null || stock[entry.to]===null || stock[entry.floor]<entry.qty) return entry
      stock[entry.floor]-=entry.qty
      stock[entry.to]+=entry.qty
    }
  }
  return null
}

export function validateBackup(value) {
  if (!record(value) || value.format!==BACKUP_FORMAT || value.version!==BACKUP_VERSION) invalid('請選擇 BARKEEP 支援版本的完整備份。')
  if (typeof value.exportedAt!=='string'||!Number.isFinite(Date.parse(value.exportedAt))) invalid('缺少備份時間。')
  if (!['items','events','sales','drafts'].every(key=>Array.isArray(value[key]))) invalid('備份缺少必要的工作區資料。')
  const itemIds=new Set(), names=new Set()
  const items=value.items.map((i,index)=>{
    const name=typeof i?.name==='string'?i.name.normalize('NFKC').toLowerCase().replace(/\s+/g,' '):null
    if (!record(i) || !text(i.id,120) || itemIds.has(i.id) || !text(i.name,120) || names.has(name)
      || !text(i.category,80) || !optional(i.price,1e9)
      || !(i.ml===null || number(i.ml,100000) && i.ml>=1)
      || !(i.ingredient===''||Object.hasOwn(INGREDIENTS,i.ingredient))) invalid('品項第 '+(index+1)+' 筆。')
    itemIds.add(i.id)
    names.add(name)
    return copy(i,['id','name','category','price','ml','ingredient'])
  })
  const eventIds=new Set()
  const events=value.events.map((e,index)=>{
    const check=() => invalid('庫存或成本紀錄第 '+(index+1)+' 筆。')
    if (!record(e) || !text(e.id,120) || eventIds.has(e.id) || !itemIds.has(e.item) || !integer(e.at,-8.64e15,8.64e15)) check()
    eventIds.add(e.id)
    const base=copy(e,['id','type','item','at'])
    switch(e.type) {
      case 'count':
        if (!floor(e.floor)||!integer(e.whole,0,1e6)||!number(e.open,1)) check()
        return {...base,...copy(e,['floor','whole','open'])}
      case 'transfer':
        if (!floor(e.floor)||!floor(e.to)||e.floor===e.to||!qty(e.qty)) check()
        return {...base,...copy(e,['floor','to','qty'])}
      case 'receipt':
        if (!floor(e.floor)||!qty(e.qty)||!number(e.price)||(e.orderId!=null&&!text(e.orderId,120))
          || (e.imported!==undefined&&typeof e.imported!=='boolean')) check()
        return {...base,...copy(e,['floor','qty','price','orderId','imported'])}
      case 'order':
        if (!qty(e.qty)||!integer(e.received,0,e.qty)||typeof e.closed!=='boolean'||
          (e.received===e.qty&&!e.closed)||!optional(e.balance,Number.MAX_SAFE_INTEGER)||!optional(e.price,1e9)||!text(e.batch,120)) check()
        return {...base,...copy(e,['qty','received','closed','balance','batch','price'])}
      case 'calibration':
        if (!Number.isSafeInteger(e.start)||!Number.isSafeInteger(e.end)||e.end<=e.start||(e.end-e.start)%DAY!==0||!number(e.qty)) check()
        return {...base,...copy(e,['start','end','qty'])}
      case 'cogs':
        if (!number(e.amount)) check()
        return {...base,amount:e.amount}
      default: return check()
    }
  })
  const orders=new Map(events.filter(e=>e.type==='order').map(e=>[e.id,e]))
  const received=new Map()
  for (const e of events) if (e.type==='receipt' && e.orderId) {
    const order=orders.get(e.orderId)
    if (!order||order.item!==e.item||order.at>e.at) invalid('到貨紀錄引用了不存在或較晚的叫貨單。')
    received.set(order.id,(received.get(order.id)??0)+e.qty)
  }
  for (const order of orders.values()) if ((received.get(order.id)??0)!==order.received) invalid('叫貨與到貨數量不一致。')
  if (firstInvalidTransfer(events)) invalid('歷史調撥的庫位或未開瓶數不足。')
  const days=new Set()
  const sales=value.sales.map((s,index)=>{
    if (!record(s)||!validDay(s.date)||days.has(s.date)||!optional(s.beverage,1e9)||!optional(s.overall,1e9)
        ||!optional(s.extra,1e9)||(s.overall!==null&&s.beverage!==null&&s.overall<s.beverage)) invalid('營收第 '+(index+1)+' 筆。')
    days.add(s.date)
    return copy(s,['date','beverage','overall','extra'])
  })
  const queued=new Set()
  const drafts=value.drafts.map((d,index)=>{
    if (!record(d)||!itemIds.has(d.item)||queued.has(d.item)||!qty(d.qty)) invalid('叫貨草稿第 '+(index+1)+' 筆。')
    queued.add(d.item)
    return copy(d,['item','qty'])
  })
  return {items,events,sales,drafts,applied:[]}
}
