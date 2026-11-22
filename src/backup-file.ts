import * as XLSX from '@e965/xlsx'
import type {State} from './types'
import {dateKey,taipeiTime} from './data'

export type Backup = Pick<State,'items'|'events'|'sales'|'drafts'> & {
  format:'barkeep-backup'
  version:1
  exportedAt:string
}

const SHEET='BARKEEP 還原資料'
const chunkSize=12000

export function xlsxBackup(backup:Backup) {
  const workbook=XLSX.utils.book_new()
  const append=(name:string,rows:(string|number|boolean|null)[][])=>
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),name)
  const labels=new Map(backup.items.map(i=>[i.id,i.name]))
  append('品項',[
    ['識別碼','品項名稱','分類','容量（ml）','每瓶進價','酒譜材料'],
    ...backup.items.map(i=>[i.id,i.name,i.category,i.ml,i.price,i.ingredient])
  ])
  append('庫存與成本紀錄',[
    ['識別碼','台北時間','品項','紀錄類型','庫位','目的庫位','數量','未開瓶','開瓶比例','單價','明細（JSON）'],
    ...backup.events.map(e=>[e.id,taipeiTime(e.at).replace('T',' '),labels.get(e.item)??e.item,e.type,e.floor??null,e.to??null,e.qty??null,e.whole??null,e.open??null,e.price??null,JSON.stringify(e)])
  ])
  append('營收與其他成本',[
    ['日期','酒水銷售額','總銷售額','其他成本'],
    ...backup.sales.map(s=>[s.date,s.beverage,s.overall,s.extra])
  ])
  append('叫貨草稿',[['品項','預計叫貨支數'],...backup.drafts.map(d=>[labels.get(d.item)??d.item,d.qty])])
  const json=JSON.stringify(backup)
  const pieces:string[]=[]
  let start=0
  while(start<json.length) {
    let end=Math.min(start+chunkSize,json.length)
    const last=json.charCodeAt(end-1)
    if (last>=0xd800&&last<=0xdbff) end--
    pieces.push(json.slice(start,end))
    start=end
  }
  append(SHEET,[['barkeep-backup',1,pieces.length],...pieces.map((part,i)=>[i+1,part])])
  return workbook
}

export function decodeBackupFile(buffer:ArrayBuffer,name:string):unknown {
  if (/\.json$/i.test(name)) return JSON.parse(new TextDecoder().decode(buffer).replace(/^\uFEFF/,''))
  if (!/\.xlsx$/i.test(name)) throw new Error('請選擇 BARKEEP 下載的 JSON 或 Excel 備份。')
  const book=XLSX.read(buffer,{type:'array',sheets:[SHEET],sheetRows:1500})
  const sheet=book.Sheets[SHEET]
  if (!sheet) throw new Error('找不到 BARKEEP 還原工作表。請使用完整備份檔。')
  const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true})
  if (rows[0]?.[0]!=='barkeep-backup'||rows[0]?.[1]!==1||rows[0]?.[2]!==rows.length-1||
      rows.slice(1).some(([n,data],idx)=>n!==idx+1||typeof data!=='string')) throw new Error('Excel 備份的還原資料不完整。')
  return JSON.parse(rows.slice(1).map(row=>row[1]).join(''))
}

export function downloadBackup(backup:Backup, format:'json'|'xlsx') {
  const filename='BARKEEP-完整備份-'+dateKey(Date.parse(backup.exportedAt))
  if (format==='xlsx') {
    XLSX.writeFile(xlsxBackup(backup),filename+'.xlsx',{compression:true})
    return
  }
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}))
  const link=document.createElement('a')
  link.href=url
  link.download=filename+'.json'
  link.click()
  setTimeout(()=>URL.revokeObjectURL(url),3000)
}
