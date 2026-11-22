import {useState,type FormEvent} from 'react'
import {Check, CircleHelp, ExternalLink, Globe, Martini, PackageSearch, Search, Sparkles} from 'lucide-react'
import {demand,stock,total} from '../server/model.mjs'
import {floors,ingredientLabel,recipes,short} from './data'
import type {Floor,State} from './types'
import {Empty,Heading,SearchBox} from './ui'

type FloorView=Floor|'all'
function availability(state:State,key:string,selected:FloorView) {
  const matched=state.items.filter(i=>i.ingredient===key)
  const view=selected==='all'?floors:[selected]
  const values=matched.flatMap(i=>view.map(f=>total(stock(state.events,i.id)[f])))
  const qty=values.reduce<number>((a,v)=>a+(v??0),0)
  return {qty,status:qty>0?'有庫存':values.some(v=>v===null)?'待盤點':'缺料',matched}
}
const floorName=(f:FloorView)=>f==='all'?'全館':f
export function Recipes({state}:{state:State}) {
  const [search,setSearch]=useState(''),[floor,setFloor]=useState<FloorView>('all'),[compare,setCompare]=useState(false)
  const [onlyReady,setOnlyReady]=useState(false)
  const filtered=recipes.filter(r=>(r.name+' '+r.zh+' '+r.ingredients.map(([k])=>ingredientLabel(k)).join(' ')).toLowerCase().includes(search.toLowerCase()))
  const shown=(onlyReady&&compare?filtered.filter(r=>r.ingredients.every(([k])=>availability(state,k,floor).qty>0)):filtered)
  return <>
    <Heading title="經典酒單" description="搜尋經典調酒配方，依樓層查看材料是否備齊。"><button className="btn primary" onClick={()=>setCompare(!compare)}><PackageSearch size={17}/>{compare?'隱藏庫存對照':'一鍵對照庫存'}</button></Heading>
    <div className="panel table-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="搜尋調酒或材料…"/><div className="segmented">{(['all',...floors] as const).map(f=><button key={f} className={floor===f?'active':''} onClick={()=>{setFloor(f);setCompare(true)}}>{floorName(f)}</button>)}</div>{compare&&<label className="checkbox"><input type="checkbox" checked={onlyReady} onChange={e=>setOnlyReady(e.target.checked)}/>只看材料齊全</label>}</div>
    {shown.length?<div className="recipe-grid">{shown.map(r=>{
      const missing=r.ingredients.filter(([key])=>availability(state,key,floor).qty<=0).length
      return <article key={r.name} className="panel recipe-card"><header><span className="metric-icon gold"><Martini size={19}/></span><span className={'badge '+(compare?(missing?'amber':'green'):'neutral')}>{compare?(missing?'待確認 '+missing+' 項':'材料齊全'):r.group}</span></header>
        <h2>{r.name}</h2><p className="muted recipe-zh">{r.zh}</p>
        <ul>{r.ingredients.map(([k,q])=>{const a=availability(state,k,floor);return <li key={k}><span>{ingredientLabel(k)}</span><b>{q}</b>{compare&&<small className={'badge '+(a.qty>0?'green':a.status==='待盤點'?'neutral':'red')}>{a.qty>0?short(a.qty)+' 支':a.status}</small>}</li>})}</ul>
        <p>{r.method}</p></article>
    })}</div>:<div className="panel"><Empty title="找不到符合條件的酒譜"/></div>}
    {compare&&<div className="notice"><CircleHelp size={17}/>庫存對照依品項的材料分類與是否有剩餘量判斷。新鮮食材也可新增品項列入核對。</div>}
  </>
}
const references:Record<string,string>={gin:'London Dry 琴酒',bitters:'Angostura 芳香苦精',dry:'Dolin Dry Vermouth',sweet:'Dolin Rouge Vermouth',campari:'Campari',triple:'Cointreau',tequila:'Blanco 龍舌蘭',rum:'白蘭姆酒',whiskey:'波本威士忌',sparkling:'Prosecco',coffee:'咖啡利口酒'}
type Result={title:string;url:string;description:string}
const strip=(s:string)=>s?.replace(/<[^>]*>/g,'')??''
export function Recommend({state}:{state:State}) {
  const [q,setQ]=useState(''),[results,setResults]=useState<Result[]>([]),[source,setSource]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false)
  const proposed=state.items.map(i=>({i,d:demand(state.events,i.id)})).filter(({d})=>(d.proposed??0)>0).sort((a,b)=>(a.d.days??Infinity)-(b.d.days??Infinity)).slice(0,4)
  const gaps=Object.entries(references).map(([key,example])=>({key,example,recipes:recipes.filter(r=>r.ingredients.some(([k])=>k===key)),status:availability(state,key,'all').status}))
    .filter(g=>g.recipes.length&&g.status!=='有庫存').sort((a,b)=>b.recipes.length-a.recipes.length)
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
    <Heading title="推薦進酒" description="檢視經典酒單缺口與近期耗用，查詢值得評估的品項。"/>
    <section className="panel">
      <div className="section-head"><div><h2><Sparkles size={19}/> 庫存與酒單建議</h2><p>推薦依據來自目前工作區，範例酒款取自內建參考。</p></div></div>
      <div className="recommend-grid">{[...proposed.map(({i,d})=>({key:i.id,title:i.name,reason:'近七天趨勢約 '+short(d.daily,3)+' 支／日，現有 '+short(d.balance)+' 支，建議補 '+d.proposed+' 支。',tag:'近期消耗'})),
        ...gaps.map(g=>({key:g.key,title:g.example,reason:ingredientLabel(g.key)+'目前'+g.status+'，會影響 '+g.recipes.map(r=>r.name).join('、')+'。',tag:'經典酒單缺口'}))].map(r=><article className="recommend-card" key={r.key}><span className="badge amber">{r.tag}</span><h3>{r.title}</h3><p>{r.reason}</p><button className="btn" disabled={busy} onClick={()=>void search(r.title)}><Globe size={15}/>連網查詢</button></article>)}</div>
      {!proposed.length&&!gaps.length&&<Empty title="目前沒有進酒建議"/>}
    </section>
    <section className="panel search-panel">
      <div className="section-head"><div><h2><Globe size={19}/> 外部資料查詢</h2><p>連線時查詢維基百科，部署者也可接入 Brave Search。</p></div></div>
      <div className="import-fields"><form className="split-line" onSubmit={(e:FormEvent)=>{e.preventDefault();void search(q)}}><SearchBox value={q} onChange={setQ} placeholder="搜尋酒款、品牌或替代品…"/><button className="btn primary" disabled={busy||!q.trim()}><Search size={17}/>{busy?'查詢中…':'搜尋'}</button></form>
      {status&&<div className="notice" role="status">{status}</div>}{source&&<p className="muted">來源：{source}</p>}
      {results.length>0&&<ul className="result-list">{results.map((r,i)=><li key={r.url+i}><a href={r.url} target="_blank" rel="noreferrer">{strip(r.title)} <ExternalLink size={14}/></a><p>{strip(r.description)}</p></li>)}</ul>}</div>
    </section>
  </>
}
