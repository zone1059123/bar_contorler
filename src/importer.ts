import {dateKey, INGREDIENTS, floors} from './data'
import {suggestIngredient} from '../server/model.mjs'
import {sheetDate,type Cell} from './sheets'
import type {Floor,Slot,Sale} from './types'
export type ImportMode='wide'|'long'|'sales'
export type Mapping=Record<string,number>
export type ItemImport={name:string;category:string;price:number|null;ml:number|null;ingredient:string;date:string;counts:Partial<Record<Floor,Slot>>;previous:Partial<Record<Floor,Slot>>;previousDate:string;receiptQty:number|null;receiptFloor:Floor}
export type Preview<T>={line:number;data:T;issues:string[];warnings:string[]}
export const common=[
  ['name','品項名稱','品項|品名|酒品|酒款|商品名稱|名稱|item|name|product|sku name'],
  ['category','分類','分類|類別|品類|category'],
  ['price','每瓶進價','瓶價|進價|採購單價|每瓶進價|單價|purchase price|price'],
  ['ml','容量','容量|容量ml|容量(ml)|容量（ml）|瓶裝容量|volume|ml|capacity'],
  ['ingredient','酒譜材料','酒譜材料|材料|ingredient'],
  ['date','盤點日期','盤點日期|日期|date|count date'],
  ['receipt','進貨數','進|進貨量|進貨數|進貨數量|receipt|received'],
  ['receiptFloor','進貨庫位','進貨庫位|到貨庫位|receipt floor'],
]
const wide=[
  ['first','1F 合計','1F|一樓|1樓|1F庫存|1F合計'],
  ['third','3F 合計','3F|三樓|3樓|3F庫存|3F合計'],
  ['oldFirst','前次 1F 合計','昨-1F|前次1F|昨1F|前次 1F 合計'],
  ['oldThird','前次 3F 合計','昨-3F|前次3F|昨3F|前次 3F 合計'],
  ['oneWhole','1F 未開瓶數','1F未開瓶|1F整瓶|1F 未開瓶數'],
  ['oneOpen','1F 開瓶比例','1F開瓶|1F剩餘|1F 開瓶比例'],
  ['threeWhole','3F 未開瓶數','3F未開瓶|3F整瓶|3F 未開瓶數'],
  ['threeOpen','3F 開瓶比例','3F開瓶|3F剩餘|3F 開瓶比例'],
]
const long=[
  ['floor','庫位','庫位|樓層|floor|location'],
  ['total','合計瓶數','合計瓶數|總瓶數|庫存|庫存量|total|quantity|balance'],
  ['whole','未開瓶數','未開瓶數|未開瓶|整瓶|整瓶數|whole|sealed'],
  ['open','開瓶比例','開瓶比例|開瓶剩餘|剩餘比例|open|fraction'],
]
const sales=[
  ['date','日期','日期|銷售日期|營收日期|date'],
  ['beverage','酒水銷售額','酒水銷售額|酒水營收|beverage sales|beverage'],
  ['overall','總銷售額','總銷售額|總營收|本日營收|營收|total sales|revenue'],
  ['extra','其他成本','其他成本|非酒水成本|extra costs|extra'],
]
export const fields=(mode:ImportMode)=>mode==='sales'?sales:[...common,...(mode==='wide'?wide:long)]
const normalize=(v:Cell)=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s_\-()]/g,'')
export function mappingFor(headers:Cell[],mode:ImportMode) {
  return Object.fromEntries(fields(mode).map(([key,label,aliases])=>{
    const options=[label,...aliases.split('|')].map(normalize)
    const match=headers.findIndex(h=>options.includes(normalize(h)))
    const legacy=key==='category'&&match===-1&&mode==='wide'&&headers[0]==null&&normalize(headers[1])==='品項'
    return [key,legacy?0:match]
  }))
}
const clean=(v:Cell)=>String(v??'').normalize('NFKC').trim()
function number(v:Cell) {
  if(typeof v==='number') return Number.isFinite(v)?v:NaN
  const raw=clean(v).replace(/^(NT\$|\$)/i,'').replaceAll(',','').trim()
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)?Number(raw):NaN
}
function capacity(v:Cell) {
  const m=clean(v).toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(ml|毫升|l|公升)?$/)
  return m?Number(m[1])*(['l','公升'].includes(m[2])?1000:1):NaN
}
const cellFloor=(v:Cell)=>({ '1F':'1F','1':'1F','一樓':'1F','1樓':'1F','3F':'3F','3':'3F','三樓':'3F','3樓':'3F' } as Record<string,Floor>)[clean(v).toUpperCase().replace(/\s/g,'')]
const six=(n:number)=>+n.toFixed(6)
const checkDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value

export function buildPreview(rows:Cell[][],header:number,mode:ImportMode,mapping:Mapping,defaults:{date:string;previous:string;floor:Floor}) {
  let lastCategory=''
  const data:Preview<ItemImport|Sale>[]=[]
  rows.slice(header+1).forEach((row,idx)=>{
    const get=(key:string)=>row[mapping[key]]??null
    const issues:string[]=[],warnings:string[]=[]
    const line=header+idx+2
    const parse=(key:string,label:string,max=1e9,integer=false)=>{
      const v=get(key)
      if(clean(v)==='')return null
      const n=number(v)
      if(!Number.isFinite(n)||n<0||n>max||(integer&&!Number.isInteger(n))) {issues.push(label+'格式錯誤');return null}
      return n
    }
    const d=clean(get('date'))?sheetDate(get('date')):defaults.date
    if(mode==='sales') {
      if(!['date','beverage','overall','extra'].some(k=>clean(get(k)))) return
      if(!checkDate(d)||d>dateKey())issues.push('日期無效或為未來日期')
      const beverage=parse('beverage','酒水銷售額'),overall=parse('overall','總銷售額'),extra=parse('extra','其他成本')
      if(beverage!==null && overall!==null && beverage>overall)issues.push('酒水銷售額高於總銷售額')
      data.push({line,issues,warnings,data:{date:d,beverage,overall,extra}})
      return
    }
    const category=clean(get('category'))
    if(category)lastCategory=category
    const name=clean(get('name'))
    if(!name) return
    if(!checkDate(d)||d>dateKey())issues.push('盤點日期無效或為未來日期')
    const counts:ItemImport['counts']={},previous:ItemImport['previous']={}
    const split=(key:string,label:string)=>{
      const value=parse(key,label,1000000)
      if(value===null)return undefined
      const whole=Math.floor(value)
      const open=six(value-whole)
      return {whole,open}
    }
    const separate=(w:string,o:string,label:string)=>{
      if(!clean(get(w))&&!clean(get(o)))return undefined
      const whole=parse(w,label+'未開瓶數',1000000,true)??0
      const value=get(o),raw=clean(value)
      const open=raw.endsWith('%')?number(raw.slice(0,-1))/100:raw?number(value):0
      if(!Number.isFinite(open)||open<0||open>1)issues.push(label+'開瓶比例需為 0–1 或 0%–100%')
      return {whole,open:Number.isFinite(open)?six(open):0}
    }
    if(mode==='wide') {
      counts['1F']=separate('oneWhole','oneOpen','1F')??split('first','1F 合計')
      counts['3F']=separate('threeWhole','threeOpen','3F')??split('third','3F 合計')
      if(defaults.previous) {
        previous['1F']=split('oldFirst','前次 1F 合計')
        previous['3F']=split('oldThird','前次 3F 合計')
        if(Object.values(previous).some(Boolean)&&(!checkDate(defaults.previous)||defaults.previous>=d)) issues.push('前次盤點日期須早於本次盤點')
      }
    } else {
      const floor=cellFloor(get('floor'))
      if(!floor)issues.push('庫位須為 1F 或 3F')
      else counts[floor]=separate('whole','open',floor)??split('total',floor+' 合計')
    }
    const price=parse('price','瓶價')
    const volume=clean(get('ml'))?capacity(get('ml')):null
    const ml=volume!==null && volume>=1 && volume<=100000?volume:null
    if(volume!==null&&ml===null)issues.push('容量格式錯誤')
    if(price===null)warnings.push('未填瓶價')
    if(ml===null)warnings.push('未填容量')
    if(!floors.some(f=>counts[f]))warnings.push('無庫存數值，只匯入品項')
    const rawIngredient=clean(get('ingredient'))
    const ingredient=Object.hasOwn(INGREDIENTS,rawIngredient)?rawIngredient:Object.entries(INGREDIENTS).find(([,label])=>label===rawIngredient)?.[0]??suggestIngredient(name)
    const receiptQty=parse('receipt','進貨數',1000000,true)
    const receiptFloor=clean(get('receiptFloor'))?cellFloor(get('receiptFloor')):mode==='long'?cellFloor(get('floor')):defaults.floor
    if(receiptQty && (price===null || !receiptFloor)) issues.push('有進貨數的列須有瓶價與合法的進貨庫位')
    data.push({line,issues,warnings,data:{name,category:lastCategory,price,ml,ingredient,date:d,counts,previous,previousDate:defaults.previous,receiptQty,receiptFloor:receiptFloor??defaults.floor}})
  })
  return data
}
