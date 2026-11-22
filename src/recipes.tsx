import {useState,type FormEvent} from 'react'
import {CircleHelp, ExternalLink, Globe, Martini, PackageSearch, Search, ShoppingCart, Sparkles} from 'lucide-react'
import {demand,stock,total} from '../server/model.mjs'
import {floors,ingredientLabel,recipes,short} from './data'
import type {Floor,Save,State} from './types'
import {Empty,Heading,SearchBox} from './ui'
import {readSupply} from './supply'

type FloorView=Floor|'all'
function availability(state:State,key:string,selected:FloorView,measure='') {
  const matched=state.items.filter(i=>i.ingredient===key)
  const view=selected==='all'?floors:[selected]
  const portions = matched.flatMap(i=>{
    const current=stock(state.events,i.id)
    return view.map(f=>({qty:total(current[f]),ml:i.ml}))
  })
  const qty=portions.reduce((sum,p)=>sum+(p.qty??0),0)
  const knownMl=portions.reduce((sum,p)=>sum+(p.qty??0)*(p.ml??0),0)
  const required=Number(measure.match(/^(\d+(?:\.\d+)?) ml$/)?.[1]??0)
  const unknownStock=portions.some(p=>p.qty===null)
  const unknownVolume=portions.some(p=>(p.qty??0)>0&&p.ml===null)
  const stateOf=required>0&&knownMl>=required||!required&&qty>0?'enough':
    unknownStock?'uncounted':required&&unknownVolume?'capacity':'missing'
  return {qty,stateOf,matched}
}
const floorName=(f:FloorView)=>f==='all'?'1F ＋ 3F':f
export function Recipes({state}:{state:State}) {
  const [search,setSearch]=useState(''),[floor,setFloor]=useState<FloorView>('all')
  const [onlyReady,setOnlyReady]=useState(false)
  const shown=recipes
    .filter(r=>(r.name+' '+r.zh+' '+r.ingredients.map(([k])=>ingredientLabel(k)).join(' ')).toLowerCase().includes(search.toLowerCase()))
    .map(r=>({...r,matched:r.ingredients.map(([key,measure])=>({key,measure,...availability(state,key,floor,measure)}))}))
    .filter(r=>!onlyReady||r.matched.every(m=>m.stateOf==='enough'))
  return <>
    <Heading title="經典酒單" description="搜尋調酒配方，自動核對 1F 與 3F 是否備齊材料。"/>
    <div className="panel table-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="搜尋調酒或材料…"/><div className="segmented" aria-label="檢查庫位">{(['all',...floors] as const).map(f=><button key={f} className={floor===f?'active':''} onClick={()=>setFloor(f)}>{floorName(f)}</button>)}</div><label className="checkbox"><input type="checkbox" checked={onlyReady} onChange={e=>setOnlyReady(e.target.checked)}/>只看庫存充足</label></div>
    {shown.length?<div className="recipe-grid">{shown.map(r=>{
      const missing=r.matched.filter(m=>m.stateOf==='missing')
      const waiting=r.matched.some(m=>m.stateOf!=='enough')
      return <article key={r.name} className="panel recipe-card"><header><span className="metric-icon gold"><Martini size={19}/></span><span className={'badge '+(missing.length?'red':waiting?'amber':'green')}>{missing.length?'缺料 '+missing.length+' 項':waiting?'庫存待確認':'庫存充足'}</span></header>
        <h2>{r.name}</h2><p className="muted recipe-zh">{r.zh} · {r.group}</p>
        <ul>{r.matched.map(({key,measure,stateOf,qty})=><li key={key}><span>{ingredientLabel(key)}</span><b>{measure}</b><small className={'badge '+(stateOf==='enough'?'green':stateOf==='missing'?'red':'neutral')}>{stateOf==='enough'?short(qty)+' 支':stateOf==='missing'?(qty>0?'餘量不足':'缺少'):stateOf==='capacity'?'容量待補':'待盤點'}</small></li>)}</ul>
        {missing.length>0&&<p className="invalid">缺少或不足：{missing.map(m=>ingredientLabel(m.key)).join('、')}</p>}
        <p>{r.method}</p></article>
    })}</div>:<div className="panel"><Empty title="找不到符合條件的酒譜"/></div>}
    <div className="notice"><CircleHelp size={17}/>毫升配方按已知容量換算可用酒量；其他材料依盤點餘量核對。</div>
  </>
}
const references:Record<string,string>={gin:'London Dry 琴酒',bitters:'Angostura 芳香苦精',dry:'Dolin Dry Vermouth',sweet:'Dolin Rouge Vermouth',campari:'Campari',triple:'Cointreau',tequila:'Blanco 龍舌蘭',rum:'白蘭姆酒',whiskey:'波本威士忌',sparkling:'Prosecco',coffee:'咖啡利口酒'}
type Result={title:string;url:string;description:string}
const strip=(s:string)=>s?.replace(/<[^>]*>/g,'')??''
export function Recommend({state,save,onOrders}:{state:State;save:Save;onOrders:()=>void}) {
  const [q,setQ]=useState(''),[results,setResults]=useState<Result[]>([]),[source,setSource]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false)
  const [adding,setAdding]=useState(''),[addError,setAddError]=useState('')
  const {lead,buffer}=readSupply()
  const proposed=state.items.map(i=>({i,d:demand(state.events,i.id,Date.now(),lead,buffer)}))
    .filter(({d})=>(d.proposed??0)>0).sort((a,b)=>(a.d.days??Infinity)-(b.d.days??Infinity)).slice(0,4)
  const gaps=Object.entries(references).map(([key,example])=>({
    key,example,recipes:recipes.filter(r=>r.ingredients.some(([k])=>k===key)),stock:availability(state,key,'all')
  })).filter(g=>g.recipes.length&&g.stock.stateOf!=='enough'&&!proposed.some(({i})=>i.ingredient===g.key)).sort((a,b)=>b.recipes.length-a.recipes.length)
  const rows=[
    ...proposed.map(({i,d})=>({key:i.id,title:i.name,item:i.id,candidate:undefined,qty:d.proposed??1,
      reason:'近七天日均消耗 '+short(d.daily,3)+' 支，現有 '+short(d.balance)+' 支，建議補 '+d.proposed+' 支。',tag:'近期消耗'})),
    ...gaps.map(g=>{
      const i=g.stock.matched[0]
      return {key:g.key,title:i?.name??g.example,item:i?.id,candidate:i?undefined:{name:g.example,ingredient:g.key},qty:1,
        reason:ingredientLabel(g.key)+(g.stock.stateOf==='uncounted'?'庫存待確認':'目前缺貨')+'，會影響 '+g.recipes.map(r=>r.name).join('、')+'。',tag:'酒單缺口'}
    })
  ]
  function queued(row:typeof rows[number]) {
    const id=row.item??state.items.find(i=>i.name===row.candidate?.name)?.id
    return state.drafts.some(d=>d.item===id)
  }
  async function add(row:typeof rows[number]) {
    setAdding(row.key);setAddError('')
    try {await save('queueOrder',{item:row.item,candidate:row.candidate,qty:row.qty})}
    catch(error) {setAddError((error as Error).message)}
    finally {setAdding('')}
  }
  async function search(value:string) {
    if(!value.trim()||busy)return
    setBusy(true);setQ(value);setResults([]);setSource('');setStatus('')
    try {
      const r=await fetch('/api/search?q='+encodeURIComponent(value))
      const response=await r.json()
      if(!r.ok)throw new Error(response.message)
      setSource(response.source);setResults(response.results.filter((r:Result)=>/^https:\/\//i.test(r.url)))
      if(!response.results.length)setStatus('沒有查到相符結果，可改用更短的品項名稱。')
    } catch(e) {setStatus(e instanceof Error&&e.message.includes('外部搜尋')?e.message:'外部搜尋目前無法連線，仍可使用內建推薦。')} finally {setBusy(false)}
  }
  return <>
    <Heading title="推薦進酒" description="查看庫存與酒單缺口，把想補的酒加入叫貨清單。"><button className="btn" onClick={onOrders}><ShoppingCart size={17}/>查看叫貨清單</button></Heading>
    {addError&&<div className="notice danger" role="alert">{addError}</div>}
    <section className="panel">
      <div className="section-head"><div><h2><Sparkles size={19}/> 庫存與酒單建議</h2><p>缺少品項時，加入叫貨清單會一併建立品項，供到貨時補登容量和瓶價。</p></div></div>
      <div className="recommend-grid">{rows.map(row=><article className="recommend-card" key={row.key}>
        <span className="badge amber">{row.tag}</span><h3>{row.title}</h3><p>{row.reason}</p>
        <div className="actions"><button className="btn" disabled={busy} onClick={()=>void search(row.title)}><Globe size={15}/>連網查詢</button>
        {queued(row)?<button className="btn" onClick={onOrders}><ShoppingCart size={15}/>已加入草稿</button>:
          <button className="btn primary" disabled={Boolean(adding)} onClick={()=>void add(row)}><ShoppingCart size={15}/>{adding===row.key?'加入中…':'加入叫貨清單'}</button>}</div></article>)}</div>
      {!rows.length&&<Empty title="目前沒有進酒建議"/>}
    </section>
    <section className="panel search-panel">
      <div className="section-head"><div><h2><Globe size={19}/> 外部資料查詢</h2><p>連線時查詢維基百科，部署者也可接入 Brave Search。</p></div></div>
      <div className="import-fields"><form className="split-line" onSubmit={(e:FormEvent)=>{e.preventDefault();void search(q)}}><SearchBox value={q} onChange={setQ} placeholder="搜尋酒款、品牌或替代品…"/><button className="btn primary" disabled={busy||!q.trim()}><Search size={17}/>{busy?'查詢中…':'搜尋'}</button></form>
      {status&&<div className="notice" role="status">{status}</div>}{source&&<p className="muted">來源：{source}</p>}
      {results.length>0&&<ul className="result-list">{results.map((r,i)=><li key={r.url+i}><a href={r.url} target="_blank" rel="noreferrer">{strip(r.title)} <ExternalLink size={14}/></a><p>{strip(r.description)}</p></li>)}</ul>}</div>
    </section>
  </>
}
