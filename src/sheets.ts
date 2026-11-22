import * as XLSX from '@e965/xlsx'

export type Cell = string|number|boolean|null
export type Sheet = {name:string;rows:Cell[][]}
export function readBook(data:ArrayBuffer):Sheet[] {
  const book=XLSX.read(data,{type:'array',sheetRows:5002})
  return book.SheetNames.map(name=>{
    const sheet=book.Sheets[name]
    if(!sheet['!ref'])return {name,rows:[]}
    const range=XLSX.utils.decode_range(sheet['!ref'])
    const endRow=Math.min(5001,range.e.r),endColumn=Math.min(127,range.e.c)
    const rows=Array.from({length:endRow+1},(_,r)=>Array.from({length:endColumn+1},(_,c)=>{
      const cell=sheet[XLSX.utils.encode_cell({r,c})]
      return cell?.t==='e' ? cell.w??'#ERROR!' : cell?.v??null
    })) as Cell[][]
    return {name,rows}
  })
}
export function sheetDate(value:Cell) {
  if(typeof value==='number') {
    const d=XLSX.SSF.parse_date_code(value)
    return d?String(d.y).padStart(4,'0')+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0'):''
  }
  const m=String(value??'').trim().match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})日?$/)
  return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):''
}
export async function download(name:string,sheets:{name:string;rows:Cell[][]}[],format:'xlsx'|'csv') {
  const workbook=XLSX.utils.book_new()
  for(const sheet of sheets) {
    const rows=format==='csv'?sheet.rows.map(row=>row.map(value=>typeof value==='string'&&/^[\s\uFEFF]*[=+\-@\t\r\n＝＋－＠]/.test(value)?"'"+value:value)):sheet.rows
    if(format==='csv') {
      const csv=XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows))
      const href=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}))
      const a=document.createElement('a')
      a.href=href;a.download=name+(sheets.length>1?'-'+sheet.name:'')+'.csv';a.click()
      setTimeout(()=>URL.revokeObjectURL(href),3000)
    } else {
      const ws=XLSX.utils.aoa_to_sheet(rows)
      ws['!cols']=rows[0]?.map((_,idx)=>({wch:Math.min(44,Math.max(14,...rows.slice(0,150).map(row=>String(row[idx]??'').length+5)))}))
      XLSX.utils.book_append_sheet(workbook,ws,sheet.name)
    }
  }
  if(format==='xlsx') XLSX.writeFile(workbook,name+'.xlsx')
}
