export const DAY = 86_400_000
export const FLOORS = ['1F', '3F']
export const round = n => Math.round(n * 1e6) / 1e6
export const sum = (xs, fn) => round(xs.reduce((a, x) => a + fn(x), 0))
export const total = entry => entry ? round(entry.whole + entry.open) : null
export const dateKey = (at = Date.now()) => new Date(at + 8 * 3600000).toISOString().slice(0, 10)
export const midnight = key => Date.parse(key + 'T00:00:00+08:00')
export const ordered = events => [...events].sort((a,b) => a.at-b.at)

export function stock(events, item, cutoff = Infinity) {
  const result = {'1F':null,'3F':null}
  for (const e of ordered(events)) {
    if (e.item !== item || e.at > cutoff) continue
    if (e.type === 'count') result[e.floor] = {whole:e.whole,open:e.open,at:e.at}
    if (e.type === 'receipt' && result[e.floor]) result[e.floor].whole += e.qty
    if (e.type === 'transfer') {
      if (result[e.floor]) result[e.floor].whole -= e.qty
      if (result[e.to]) result[e.to].whole += e.qty
    }
  }
  return result
}

export function intervals(events, item, floor) {
  let count = null
  let movement = 0
  const result = []
  for (const e of ordered(events)) {
    if (e.item !== item) continue
    if (e.type === 'receipt' && e.floor === floor) movement += e.qty
    if (e.type === 'transfer') movement += (e.to === floor ? e.qty : 0) - (e.floor === floor ? e.qty : 0)
    if (e.type === 'count' && e.floor === floor) {
      if (count && e.at > count.at) {
        const consumed = round(total(count)+movement-total(e))
        result.push({start:count.at,end:e.at,used:Math.max(0,consumed),valid:consumed>=0})
      }
      count = e
      movement = 0
    }
  }
  return result
}

export function usage(events, item, start, end) {
  const readings = FLOORS.map(floor => {
    const overlapping = intervals(events,item,floor).filter(i => i.end > start && i.start < end)
    const valid = overlapping.filter(i=>i.valid)
    const overlap = i => Math.min(end,i.end) - Math.max(start,i.start)
    return {
      days:sum(valid, i=>overlap(i))/DAY,
      used:sum(valid, i=>i.used*overlap(i)/(i.end-i.start)),
      anomaly:overlapping.some(i=>!i.valid),
      latest:valid.at(-1)?.end??null,
    }
  })
  const known = readings.every(r=>r.days>0)
  return {
    used:known ? sum(readings, r=>r.used) : null,
    days:Math.min(...readings.map(r=>r.days)),
    daily:known ? sum(readings, r=>r.used/r.days) : null,
    anomaly:readings.some(r=>r.anomaly),
    latest:known ? Math.min(...readings.map(r=>r.latest)) : null
  }
}

export function demand(events, item, now = Date.now(), lead = 3, buffer = 5) {
  const s = stock(events,item,now)
  const balance = FLOORS.every(f=>s[f]) ? sum(FLOORS,f=>total(s[f])) : null
  const history = usage(events,item,now-7*DAY,now)
  const daily = history.days>=1 && !history.anomaly ? history.daily : null
  const days = balance!==null && daily>0 ? round(balance/daily) : null
  const inbound = events.filter(e=>e.type==='order' && e.item===item && !e.closed && e.at<=now)
  const pending = sum(inbound,e=>e.qty-e.received)
  const proposed = balance===null || daily===null ? null : Math.max(0,Math.ceil(round(daily*(lead+buffer)-balance-pending)))
  const last = ordered(events).findLast(e=>e.type==='order' && e.item===item && e.at<=now)
  return {balance,...history,coverage:history.days,daily,days,pending,proposed,last,weekly:daily===null?null:round(daily*7),urgent:days!==null && days<=lead}
}

export function costReport(state,start,end,basis='usage',revenueType='beverage') {
  const inRange = e => e.at>=start && e.at<end
  const dayInRange = row => midnight(row.date)>=start && midnight(row.date)<end
  const revenueRows = state.sales.filter(r=>dayInRange(r) && r[revenueType]!==null)
  const revenue = revenueRows.length ? sum(revenueRows,r=>r[revenueType]) : null
  const rows = state.items.map(item=>{
    const relevant = state.events.filter(e=>e.item===item.id && inRange(e))
    const h = usage(state.events,item.id,start,end)
    const receiving = sum(relevant.filter(e=>e.type==='receipt'),e=>e.qty*e.price)
    const calibration = state.events.findLast(e=>e.type==='calibration' && e.item===item.id && e.start===start && e.end===end)
    const used = calibration?.qty ?? h.used
    const usageCost = used===0 ? 0 : used===null || item.price===null ? null : round(used*item.price)
    const saleEvents = relevant.filter(e=>e.type==='cogs')
    const cleared = saleEvents.length ? sum(saleEvents,e=>e.amount) : null
    const cogs = basis==='cleared' ? cleared : usageCost
    const ml = used===null || item.ml===null ? null : round(used*item.ml)
    return {item,receiving,used,usageCost,cogs,cleared,ml,h,calibrated:!!calibration}
  })
  const purchases=sum(rows,r=>r.receiving)
  const partial = key => rows.some(r=>r[key]!==null) ? sum(rows,r=>r[key]??0) : null
  const use=partial('usageCost'), cogs=partial('cogs')
  const extraRows=state.sales.filter(r=>dayInRange(r) && r.extra!==null)
  const extra=sum(extraRows,r=>r.extra)
  const totalCost=cogs===null?null:round(cogs+extra)
  return {rows,purchases,use,cogs,extra,totalCost,revenue,revenueDays:revenueRows.length,
    expectedDays:Math.ceil((end-start)/DAY),missingUse:rows.filter(r=>r.usageCost===null).length,missingCogs:rows.filter(r=>r.cogs===null).length}
}

export const INGREDIENTS = {
  gin:'琴酒', whiskey:'威士忌', tequila:'龍舌蘭', rum:'白蘭姆酒', bitters:'芳香苦精',
  campari:'金巴利苦酒', sweet:'甜香艾酒', dry:'不甜香艾酒', triple:'橙味利口酒',
  lime:'萊姆汁', lemon:'檸檬汁', sugar:'糖漿', mint:'薄荷', soda:'蘇打水', tonic:'通寧水',
  espresso:'濃縮咖啡', vodka:'伏特加', coffee:'咖啡利口酒', sparkling:'氣泡酒', aperol:'Aperol'
}
const aliases = {
  gin:/琴酒|\bgin\b/i, whiskey:/威士忌|威士斯|whisk[ey]+|bourbon|rye/i,
  tequila:/龍舌蘭|tequila/i, rum:/白蘭姆|蘭姆|朗姆|\brum\b/i, bitters:/芳香苦精|angostura/i,
  campari:/campari|金巴利/i, sweet:/甜香艾|紅香艾|多林紅|sweet vermouth/i,
  dry:/不甜香艾|乾香艾|多林綠|dry vermouth/i, triple:/君度|白柑橘|橙味利口酒|cointreau|triple sec/i,
  lime:/萊姆|lime/i, lemon:/檸檬|lemon/i, sugar:/^(單糖漿|糖漿|simple syrup)$/i, mint:/薄荷|mint/i,
  soda:/蘇打水|soda water/i, tonic:/通寧水|tonic/i, vodka:/伏特加|vodka/i,
  coffee:/咖啡利口酒|卡魯瓦|kahl[uú]a/i, sparkling:/氣泡酒|prosecco/i, espresso:/濃縮咖啡|espresso/i, aperol:/aperol/i
}
export const suggestIngredient = name => Object.keys(aliases).find(k=>aliases[k].test(name))??''
