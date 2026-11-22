import {useMemo,useRef,useState} from 'react'
import {Check, FileSpreadsheet, UploadCloud, Download, FileDown} from 'lucide-react'
import {dateKey,short} from './data'
import {readBook,type Sheet} from './sheets'
import {buildPreview,fields,mappingFor,type ImportMode,type ItemImport,type Mapping} from './importer'
import type {Floor,Save} from './types'
import {Empty,Field,Heading} from './ui'
import {FloorSelect} from './inventory'

export function ImportScreen({save,complete,realMode,onReal}:{save:Save;complete:(mode:ImportMode)=>void;realMode:boolean;onReal:()=>void}) {
  const input=useRef<HTMLInputElement>(null)
  const [book,setBook]=useState<Sheet[]>([]),[file,setFile]=useState(''),[idx,setIdx]=useState(0),[header,setHeader]=useState(0)
  const [mode,setMode]=useState<ImportMode>('wide'),[mapping,setMapping]=useState<Mapping>({})
  const [date,setDate]=useState(dateKey()),[previous,setPrevious]=useState(''),[floor,setFloor]=useState<Floor>('1F')
  const [error,setError]=useState(''),[drag,setDrag]=useState(false),[busy,setBusy]=useState(false)
  const [overrides,setOverrides]=useState<Record<number,{ml?:number|null;price?:number|null}>>({})
  const [skips,setSkips]=useState<number[]>([])
  const sheet=book[idx]
  const headers:ReadonlyArray<unknown>=sheet?.rows[header]??[]
  const preview=useMemo(()=>sheet?buildPreview(sheet.rows,header,mode,mapping,{date,previous,floor}):[],[sheet,header,mode,mapping,date,previous,floor])
  const selected=preview.filter(row=>!skips.includes(row.line))
  const validation=(r:typeof selected[number])=>r.issues.filter(issue=>{
    const edit=overrides[r.line]
    if(issue==='容量格式錯誤'&&edit?.ml!=null&&edit.ml>=1&&edit.ml<=100000)return false
    if(issue==='瓶價格式錯誤'&&edit?.price!=null&&edit.price>=0&&edit.price<=1e9)return false
    return true
  })
  const errors=selected.filter(row=>validation(row).length||Object.entries(overrides[row.line]??{}).some(([k,v])=>v!==null&&(v<(k==='ml'?1:0)||v>(k==='ml'?100000:1e9))))
  const ready=selected.length>0&&selected.length<=1500&&!errors.length
  const resetEdits=()=>{setOverrides({});setSkips([]);setError('')}
  function choose(b:Sheet[],s:number,h:number,m:ImportMode) {
    setBook(b);setIdx(s);setHeader(h);setMode(m);setMapping(mappingFor(b[s]?.rows[h]??[],m));resetEdits()
  }
  async function open(f:File|undefined) {
    if(!f)return
    setError('')
    if(!/\.(xlsx|xls|csv)$/i.test(f.name)||f.size>10_000_000){setError('請選擇 10 MB 以內的 .xlsx、.xls 或 .csv');return}
    try {
      const b=readBook(await f.arrayBuffer())
      if(!b.length)throw new Error()
      const h=Math.max(0,b[0].rows.findIndex(row=>row.some(c=>c!==null&&String(c).trim())))
      const hs=b[0].rows[h]??[]
      const m=/營收|銷售/.test(b[0].name)?'sales':hs.some(c=>['floor','location','庫位','樓層'].includes(String(c??'').toLowerCase().trim()))?'long':'wide'
      choose(b,0,h,m);setFile(f.name)
    } catch {setError('無法讀取檔案，請確認檔案格式，或另存為 UTF-8 CSV')}
  }
  async function submit() {
    if(!ready||busy)return
    setBusy(true);setError('')
    try {
      const rows=selected.map(r=>({...r.data,...overrides[r.line]}))
      await save(mode==='sales'?'importSales':'import',{rows})
      complete(mode)
    } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  return <>
    <Heading title="試算表匯入" description="上傳工作簿、對應欄位，再確認正式寫入的資料。">
      <a className="btn" href="/sample-inventory.xlsx" download><FileDown size={16}/>範例工作簿</a><a className="btn" href="/sample-inventory.csv" download><Download size={16}/>範例 CSV</a>
    </Heading>
    {!realMode&&<div className="notice"><span>目前在範例預覽，這次匯入只會寫入範例工作區。</span><button className="btn" onClick={onReal}>切換正式庫存</button></div>}
    <section className="panel upload-panel">
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e=>{void open(e.target.files?.[0]);e.target.value=''}}/>
      <div className={'drop-zone'+(drag?' dragging':'')} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void open(e.dataTransfer.files[0])}}>
        <div className="upload-icon">{file?<FileSpreadsheet size={26}/>:<UploadCloud size={26}/>}</div><strong>{file||'拖放 Excel 或 CSV 檔案'}</strong><p>.xlsx、.xls 或 UTF-8 .csv · 上限 10 MB</p><button className="btn primary" onClick={()=>input.current?.click()}>{file?'更換檔案':'選擇檔案'}</button>
      </div>
    </section>
    {error&&<div className="notice danger" role="alert">{error}</div>}
    {sheet&&<>
      <section className="panel">
        <div className="section-head"><div><h2>工作表與欄位對應</h2><p>自動比對常用欄名，可手動指定任何欄。</p></div></div>
        <div className="import-fields">
          <div className="field-grid"><Field label="工作表"><select value={idx} onChange={e=>{const s=Number(e.target.value);const h=Math.max(0,book[s].rows.findIndex(r=>r.some(c=>c!=null&&String(c).trim())));const m=/營收|銷售/.test(book[s].name)?'sales':(book[s].rows[h]??[]).some(c=>['floor','location','庫位','樓層'].includes(String(c??'').toLowerCase().trim()))?'long':'wide';choose(book,s,h,m)}}>{book.map((s,i)=><option key={i} value={i}>{s.name}</option>)}</select></Field>
          <Field label="欄名所在列"><input type="number" min="1" max={Math.max(1,sheet.rows.length)} value={header+1} onChange={e=>choose(book,idx,Math.max(0,Math.min(sheet.rows.length-1,Number(e.target.value)-1)),mode)}/></Field>
          <Field label="匯入類型"><select value={mode} onChange={e=>choose(book,idx,header,e.target.value as ImportMode)}><option value="wide">盤點 · 1F / 3F 分欄</option><option value="long">盤點 · 每列一個庫位</option><option value="sales">每日營收與其他成本</option></select></Field></div>
          <div className="field-grid"><Field label={mode==='sales'?'未填日期時使用':'本次預設盤點日'}><input type="date" value={date} max={dateKey()} onChange={e=>setDate(e.target.value)}/></Field>
          {mode==='wide'&&<><Field label="前次盤點日（選填）"><input type="date" value={previous} max={dateKey()} onChange={e=>setPrevious(e.target.value)}/></Field><Field label="預設到貨樓層"><FloorSelect initial={floor} onChange={setFloor}/></Field></>}</div>
          <div className="mapping-grid">{fields(mode).map(([key,label])=><Field key={key} label={label}><select value={mapping[key]??-1} onChange={e=>{setMapping({...mapping,[key]:Number(e.target.value)});resetEdits()}}><option value={-1}>略過此欄</option>{headers.map((h,k)=><option value={k} key={k}>{k+1}. {String(h??'（空白欄名）')}</option>)}</select></Field>)}</div>
          <div className="hint">{mode==='sales'?'同一日期重匯會更新該日。留白保持為未知。':'合計瓶數 1.4 會拆成 1 整瓶＋0.4 開瓶。容量支援 700ml 或 0.7L。若要採用「昨-1F／昨-3F」，請填前次盤點日。容量空白可稍後補填。'}</div>
        </div>
      </section>
      <section className="panel">
        <div className="section-head"><div><h2>匯入預覽</h2><p>已選 {selected.length} 筆 · {errors.length} 筆需修正 · {selected.filter(r=>r.warnings.length).length} 筆有提醒</p></div><button className="btn primary" disabled={!ready||busy} onClick={()=>void submit()}><Check size={16}/>{busy?'匯入中…':'確認匯入'}</button></div>
        {selected.length>1500&&<div className="notice danger">一次最多匯入 1,500 筆，請分批。</div>}
        {preview.length?<div className="scroll-table preview-table"><table><thead><tr><th>匯入</th><th>原始列</th>{mode==='sales'?<><th>日期</th><th>酒水銷售額</th><th>總銷售額</th><th>其他成本</th></>:<><th>品項</th><th>分類</th><th>容量（ml）</th><th>瓶價</th><th>1F 整瓶＋開瓶</th><th>3F 整瓶＋開瓶</th></>}<th>檢查</th></tr></thead><tbody>
        {preview.map(r=>{
          const row=r.data
          const i=row as ItemImport
          const edit=(key:'ml'|'price',value:string)=>setOverrides(o=>({...o,[r.line]:{...o[r.line],[key]:value===''?null:Number(value)}}))
          return <tr key={r.line}><td><input type="checkbox" aria-label={'匯入第 '+r.line+' 列'} checked={!skips.includes(r.line)} onChange={e=>setSkips(s=>e.target.checked?s.filter(v=>v!==r.line):[...s,r.line])}/></td><td>{r.line}</td>
            {'name' in row?<><td><strong>{i.name}</strong><small className="block">{i.date}</small></td><td>{i.category||'—'}</td>
              <td><input className="cell-input" aria-label={i.name+'容量'} type="number" min="1" max="100000" step="any" placeholder="待填" value={(overrides[r.line]&&'ml' in overrides[r.line]?overrides[r.line].ml:i.ml)??''} onChange={e=>edit('ml',e.target.value)}/></td>
              <td><input className="cell-input" aria-label={i.name+'瓶價'} type="number" min="0" max="1000000000" step="any" placeholder="待填" value={(overrides[r.line]&&'price' in overrides[r.line]?overrides[r.line].price:i.price)??''} onChange={e=>edit('price',e.target.value)}/></td>
              {(['1F','3F'] as const).map(f=><td key={f}>{i.counts[f]?i.counts[f]?.whole+' ＋ '+short(i.counts[f]?.open,6):'—'}{i.previous[f]&&<small className="block">前次 {i.previous[f]?.whole} ＋ {short(i.previous[f]?.open,6)}</small>}</td>)}
            </>:<><td>{row.date}</td><td>{short(row.beverage)}</td><td>{short(row.overall)}</td><td>{short(row.extra)}</td></>}
            <td>{validation(r).map(s=><small className="block invalid" key={s}>{s}</small>)}{r.warnings.filter(s=>!(s==='未填容量'&&overrides[r.line]?.ml!=null)&&!(s==='未填瓶價'&&overrides[r.line]?.price!=null)).map(s=><small className="block" key={s}>{s}</small>)}{!validation(r).length&&!r.warnings.length&&<span className="badge green">可匯入</span>}</td></tr>
        })}</tbody></table></div>:<Empty title="沒有可預覽的資料">請確認工作表、欄名列及必要欄位對應。</Empty>}
      </section>
    </>}
    <div className="notice">預覽只採用已對應的欄位。像「差1F」、「差3F」或其他成本公式欄可保留在原檔，系統會用實際盤點與進貨重新計算。</div>
  </>
}
