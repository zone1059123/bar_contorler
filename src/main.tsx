import {useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {BarChart3, Boxes, CalendarDays, ChevronRight, CircleCheck, ClipboardList, FlaskConical, House, Layers, Martini, Menu, ShoppingCart, Sparkles, Upload, Wine, X} from 'lucide-react'
import {empty,mutate} from '../server/commands.mjs'
import {Dashboard} from './dashboard'
import {Inventory,InventoryDialog} from './inventory'
import {Orders} from './orders'
import {Costs,CostDialog} from './costs'
import {ImportScreen} from './import-screen'
import {Recipes,Recommend} from './recipes'
import {sample} from './data'
import type {Screen, State} from './types'
import type {DialogState} from './workspace'
import './styles.css'

const pages=[
  {id:'overview',label:'營運總覽',icon:House,group:'營運管理'},
  {id:'inventory',label:'庫存管理',icon:Boxes,group:'營運管理'},
  {id:'orders',label:'智慧叫貨',icon:ShoppingCart,group:'營運管理'},
  {id:'costs',label:'成本分析',icon:BarChart3,group:'營運管理'},
  {id:'import',label:'試算表匯入',icon:Upload,group:'資料與酒單'},
  {id:'recipes',label:'經典酒單',icon:Martini,group:'資料與酒單'},
  {id:'recommend',label:'推薦進酒',icon:Sparkles,group:'資料與酒單'}
] as const
function initialScreen(){
  const key=location.hash.slice(1)
  return pages.find(p=>p.id===key)?.id??'overview'
}
type ServerData={revision:number;state:State}
function App(){
  const [screen,setScreen]=useState<Screen>(initialScreen)
  const [dialog,setDialog]=useState<DialogState|null>(null)
  const [open,setOpen]=useState(false),[toast,setToast]=useState('')
  const [mode,setMode]=useState<'demo'|'real'>(()=>localStorage.getItem('barkeep-mode')==='real'?'real':'demo')
  const [demo,setDemo]=useState<State>(()=>sample())
  const [real,setReal]=useState<ServerData>({revision:0,state:empty()})
  const [loading,setLoading]=useState(false),[failure,setFailure]=useState('')
  const state=mode==='real'?real.state:demo
  const title=pages.find(p=>p.id===screen)!.label
  const go=(s:Screen)=>{location.hash=s;setScreen(s);setOpen(false);window.scrollTo(0,0)}
  useEffect(()=>{const listener=()=>{setScreen(initialScreen());setOpen(false)};window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener)},[])
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3700);return()=>clearTimeout(t)},[toast])
  async function load(){
    setLoading(true);setFailure('')
    try{const r=await fetch('/api/state');if(!r.ok)throw new Error();setReal(await r.json())}catch{setFailure('無法載入正式庫存，請檢查連線後重試。')}finally{setLoading(false)}
  }
  useEffect(()=>{if(mode==='real')void load()},[mode])
  function changeMode(m:'demo'|'real'){if(m===mode)return;setDialog(null);setMode(m);localStorage.setItem('barkeep-mode',m)}
  async function save(kind:string,body:unknown){
    const id=globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2)
    if(mode==='demo'){
      setDemo(mutate(demo,{kind,body,id},Date.now(),()=>globalThis.crypto?.randomUUID?.()??Math.random().toString(36).slice(2)))
    }else{
      if(loading||failure)throw new Error('請先重新載入正式庫存')
      const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,body,id,revision:real.revision})}
      let response
      try{response=await fetch('/api/state',options)}catch{response=await fetch('/api/state',options)}
      const data=await response.json()
      if(data.state)setReal({state:data.state,revision:data.revision})
      if(!response.ok)throw new Error(data.message??'操作失敗')
    }
    setToast(kind==='import'||kind==='importSales'?'匯入完成':kind==='order'?'已建立叫貨批次':'已儲存')
  }
  const date=new Intl.DateTimeFormat('zh-TW',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Taipei'}).format(new Date())
  return <div className="app">
    {open&&<button className="scrim" aria-label="關閉導覽" onClick={()=>setOpen(false)}/>}
    <aside className={'sidebar'+(open?' open':'')}>
      <button className="brand" onClick={()=>go('overview')}><span className="brand-icon"><Wine size={25} strokeWidth={1.8}/></span><span><b>BARKEEP</b><small>酒吧營運管理</small></span></button>
      <button className="mobile-close icon-button" onClick={()=>setOpen(false)} aria-label="關閉導覽"><X size={22}/></button>
      <nav>{(['營運管理','資料與酒單'] as const).map(group=><div className="nav-group" key={group}><p>{group}</p>
        {pages.filter(p=>p.group===group).map(p=><button className={'nav-link'+(screen===p.id?' current':'')} key={p.id} aria-current={screen===p.id?'page':undefined} onClick={()=>go(p.id)}><p.icon size={19}/><span>{p.label}</span>{screen===p.id&&<ChevronRight size={15} className="current-indicator"/>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-venue"><span><Layers size={18}/></span><div><strong>雙樓層庫位</strong><small>1F / 3F</small></div></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="開啟導覽" onClick={()=>setOpen(true)}><Menu size={23}/></button><span className="crumb-parent">工作區</span><ChevronRight size={15} className="crumb-chevron"/><strong>{title}</strong></div>
      <div className="top-meta"><span className="today"><CalendarDays size={16}/> {date}</span><label className="mode"><span className={mode==='real'?'mode-dot real':'mode-dot'}/><select aria-label="工作區模式" value={mode} onChange={e=>changeMode(e.target.value as 'demo'|'real')}><option value="demo">範例預覽</option><option value="real">正式庫存</option></select></label></div></header>
      <main className="content">
        {mode==='real'&&(loading||failure)&&<div className={'notice'+(failure?' danger':'')}>{failure||'載入正式庫存中…'}{failure&&<button className="btn" onClick={()=>void load()}>重試</button>}</div>}
        {(!(mode==='real'&&(loading||failure))||screen==='import')&&<>
          {screen==='overview'&&<Dashboard state={state} go={go} dialog={setDialog}/>}
          {screen==='inventory'&&<Inventory state={state} onDialog={setDialog} onImport={()=>go('import')}/>}
          {screen==='orders'&&<Orders key={mode} state={state} save={save} onDialog={setDialog}/>}
          {screen==='costs'&&<Costs state={state} onDialog={setDialog}/>}
          {screen==='import'&&<ImportScreen save={save} complete={m=>go(m==='sales'?'costs':'inventory')} realMode={mode==='real'} onReal={()=>changeMode('real')}/>}
          {screen==='recipes'&&<Recipes state={state}/>}
          {screen==='recommend'&&<Recommend state={state}/>}
        </>}
      </main>
      <nav className="mobile-nav" aria-label="快捷功能">{[{key:'overview',icon:House,label:'總覽'},{key:'inventory',icon:Boxes,label:'庫存'},{key:'orders',icon:ShoppingCart,label:'叫貨'},{key:'costs',icon:BarChart3,label:'成本'}].map(x=><button key={x.key} className={screen===x.key?'active':''} onClick={()=>go(x.key as Screen)}><x.icon size={20}/>{x.label}</button>)}<button onClick={()=>setOpen(true)}><Menu size={20}/>更多</button></nav>
    </div>
    {dialog&&(['sale','calibration','cogs'].includes(dialog.kind)?<CostDialog dialog={dialog} state={state} save={save} close={()=>setDialog(null)}/>:<InventoryDialog dialog={dialog} state={state} save={save} close={()=>setDialog(null)}/>)}
    {toast&&<div className="toast" role="status"><CircleCheck size={20}/>{toast}</div>}
  </div>
}
createRoot(document.getElementById('root')!).render(<App/>)
