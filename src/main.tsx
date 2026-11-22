import {useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {ArrowLeftRight,BarChart3,Boxes,CalendarDays,ChevronRight,CircleCheck,ClipboardList,House,Layers,Martini,Menu,Settings as SettingsIcon,ShoppingCart,Sparkles,Undo2,Upload,Wine,X} from 'lucide-react'
import {empty,mutate} from '../server/commands.mjs'
import {Dashboard} from './dashboard'
import {Inventory,InventoryDialog} from './inventory'
import {Orders} from './orders'
import {Costs,CostDialog} from './costs'
import {ImportScreen} from './import-screen'
import {Recipes,Recommend} from './recipes'
import {Login} from './login'
import {Settings} from './settings'
import {ApiError,responseData} from './client'
import {Form,Modal} from './ui'
import {sample} from './data'
import type {Screen,State} from './types'
import type {DialogState} from './workspace'
import './styles.css'

const pages=[
  {id:'overview',label:'營運總覽',icon:House,group:'營運管理'},
  {id:'inventory',label:'庫存總覽',icon:Boxes,group:'營運管理'},
  {id:'orders',label:'智慧叫貨',icon:ShoppingCart,group:'營運管理'},
  {id:'costs',label:'成本分析',icon:BarChart3,group:'營運管理'},
  {id:'import',label:'試算表匯入',icon:Upload,group:'資料與酒單'},
  {id:'recipes',label:'經典酒單',icon:Martini,group:'資料與酒單'},
  {id:'recommend',label:'推薦進酒',icon:Sparkles,group:'資料與酒單'},
  {id:'settings',label:'系統設定',icon:SettingsIcon,group:'資料與酒單'}
] as const
const actions:Record<string,string>={
  count:'盤點',transfer:'調撥',receipt:'到貨驗收',item:'編輯品項',queueOrder:'更新叫貨草稿',order:'建立叫貨批次',closeOrder:'結案',
  sales:'登記營收',cogs:'登記核銷',calibration:'用量校準',import:'匯入盤點',importSales:'匯入營收',
  undo:'撤銷',reset:'清空正式庫存',restore:'還原正式庫存'
}
function initialScreen() {
  return pages.find(p=>p.id===location.hash.slice(1))?.id??'overview'
}
type ServerData={revision:number;state:State;undo:string|null}
type Access={mode:'password'|'managed'|'unconfigured';authenticated:boolean;storage:'cloud'|'local'}

function App() {
  const [screen,setScreen]=useState<Screen>(initialScreen)
  const [dialog,setDialog]=useState<DialogState|null>(null)
  const [open,setOpen]=useState(false),[toast,setToast]=useState('')
  const [mode,setMode]=useState<'demo'|'real'>(()=>localStorage.getItem('barkeep-mode')==='real'?'real':'demo')
  const [demo,setDemo]=useState<State>(()=>sample())
  const [demoUndo,setDemoUndo]=useState<{state:State;kind:string}|null>(null)
  const [real,setReal]=useState<ServerData|null>(null)
  const [access,setAccess]=useState<Access|null>(null)
  const [failure,setFailure]=useState('')
  const [undo,setUndo]=useState<{kind:string;revision?:number}|null>(null)
  const generation=useRef(0)
  const writing=useRef(false)
  const holdRefresh=useRef(false)
  holdRefresh.current=Boolean(dialog||undo)
  const revision=useRef<number|null>(null)
  const state=mode==='real'?real?.state??empty():demo
  const latest=mode==='real'?real?.undo:demoUndo?.kind
  const title=pages.find(p=>p.id===screen)!.label

  function go(next:Screen) {
    location.hash=next
    setScreen(next);setOpen(false)
    window.scrollTo(0,0)
  }
  useEffect(()=>{
    const listener=()=>{setScreen(initialScreen());setOpen(false)}
    window.addEventListener('hashchange',listener)
    return()=>window.removeEventListener('hashchange',listener)
  },[])
  useEffect(()=>{
    if(!toast)return
    const timer=setTimeout(()=>setToast(''),3700)
    return()=>clearTimeout(timer)
  },[toast])

  function receive(data:ServerData) {
    if(revision.current!==null&&data.revision<revision.current)return
    revision.current=data.revision
    setReal(data)
    setFailure('')
  }
  function clearReal() {
    generation.current++
    revision.current=null
    setReal(null)
  }
  function changeMode(next:'demo'|'real') {
    if(next===mode)return
    clearReal()
    setAccess(null)
    setFailure('')
    setDialog(null)
    setUndo(null)
    setMode(next)
    localStorage.setItem('barkeep-mode',next)
  }
  async function load(quiet=false) {
    const version=generation.current
    if(!quiet)setFailure('')
    try {
      if(!quiet||revision.current===null) {
        const info:Access=await responseData(await fetch('/api/session'))
        if(version!==generation.current)return
        setAccess(info)
        if(!info.authenticated) return
      }
      const since=quiet&&revision.current!==null?'?since='+revision.current:''
      const r=await fetch('/api/state'+since)
      if(version!==generation.current||r.status===204)return
      const data=await responseData(r)
      if(version===generation.current&&(!quiet||!holdRefresh.current))receive(data)
    } catch(error) {
      if(version!==generation.current)return
      if(error instanceof ApiError && error.code==='login') {
        clearReal()
        setAccess(info=>({mode:'password',authenticated:false,storage:info?.storage??'cloud'}))
        setDialog(null);setUndo(null)
      } else if(!quiet||revision.current===null) setFailure((error as Error).message||'無法載入正式庫存，請檢查連線後重試。')
    }
  }
  useEffect(()=>{
    if(mode!=='real') return
    void load()
    const refresh=()=>{if(document.visibilityState==='visible'&&revision.current!==null&&!writing.current&&!holdRefresh.current)void load(true)}
    const timer=setInterval(refresh,20000)
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refresh)
    return()=>{
      generation.current++
      clearInterval(timer)
      window.removeEventListener('focus',refresh)
      document.removeEventListener('visibilitychange',refresh)
    }
  },[mode])

  async function logout() {
    await responseData(await fetch('/api/logout',{method:'POST'}))
    clearReal()
    setAccess(info=>({mode:'password',authenticated:false,storage:info?.storage??'cloud'}))
    setDialog(null);setUndo(null);setToast('已登出正式庫存')
  }

  async function save(kind:string,body:unknown,expected?:number) {
    const id=globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2)
    if(mode==='demo') {
      if(kind==='undo') {
        if(!demoUndo)throw new Error('目前沒有可撤銷的操作。')
        setDemo(demoUndo.state)
        setDemoUndo(null)
      } else {
        const next=mutate(demo,{kind,body,id},Date.now(),()=>globalThis.crypto?.randomUUID?.()??Math.random().toString(36).slice(2))
        setDemoUndo({state:demo,kind})
        setDemo(next)
      }
    } else {
      if(revision.current===null||!access?.authenticated||failure)throw new Error('請先重新載入正式庫存。')
      if(writing.current)throw new Error('上一筆操作正在儲存，請稍後再試。')
      const version=generation.current
      writing.current=true
      try {
        const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,body,id,revision:expected??revision.current})}
        let response
        try{response=await fetch('/api/state',options)}catch{response=await fetch('/api/state',options)}
        if(response.status===409) {
          const conflict=await response.json()
          if(version===generation.current)receive(conflict)
          throw new ApiError(expected===undefined?conflict.message:'另一個裝置已更新。請關閉確認視窗，核對最新資料後重新操作。','conflict')
        }
        const data=await responseData(response)
        if(version===generation.current)receive(data)
      } catch(error) {
        if(error instanceof ApiError&&error.code==='login'&&version===generation.current) {
          clearReal()
          setAccess(info=>({mode:'password',authenticated:false,storage:info?.storage??'cloud'}))
          setDialog(null);setUndo(null)
        }
        throw error
      } finally {writing.current=false}
    }
    setToast(kind==='queueOrder'?'已更新叫貨草稿':(actions[kind]??'變更')+'完成')
  }

  const date=new Intl.DateTimeFormat('zh-TW',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Taipei'}).format(new Date())
  const locked=mode==='real'&&access?.mode==='password'&&!access.authenticated
  const unconfigured=mode==='real'&&access?.mode==='unconfigured'
  const ready=mode==='demo'||Boolean(real)
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
      <header className="topbar">
        <div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="開啟導覽" onClick={()=>setOpen(true)}><Menu size={23}/></button><span className="crumb-parent">工作區</span><ChevronRight size={15} className="crumb-chevron"/><strong>{title}</strong></div>
        <div className="top-meta">
          <span className="today"><CalendarDays size={16}/>{date}</span>
          {ready&&latest&&<button className="btn undo-button" aria-label="撤銷上一筆操作" title="撤銷上一筆操作" onClick={()=>setUndo({kind:latest,revision:real?.revision})}><Undo2 size={17}/><span>撤銷</span></button>}
          <label className="mode"><span className={mode==='real'?'mode-dot real':'mode-dot'}/><select aria-label="工作區模式" value={mode} onChange={e=>changeMode(e.target.value as 'demo'|'real')}><option value="demo">範例預覽</option><option value="real">正式庫存</option></select></label>
        </div>
      </header>
      <main className="content">
        {locked?<Login onLogin={()=>void load()} onDemo={()=>changeMode('demo')}/>:unconfigured?
          <div className="notice danger">部署尚未設定工作區密碼，正式庫存暫不開放。<button className="btn" onClick={()=>changeMode('demo')}>返回範例預覽</button></div>
        :<>
          {!ready&&<div className={'notice'+(failure?' danger':'')} role="status">{failure||'正在載入正式庫存…'}{failure&&<button className="btn" onClick={()=>void load()}>重試</button>}</div>}
          {(ready||(screen==='import'&&access?.authenticated))&&<>
            {(screen==='orders'||screen==='costs')&&<div className="segmented finance-nav" aria-label="叫貨與成本"><button className={screen==='orders'?'active':''} onClick={()=>go('orders')}>智慧叫貨</button><button className={screen==='costs'?'active':''} onClick={()=>go('costs')}>成本分析</button></div>}
            {screen==='overview'&&<Dashboard state={state} go={go} dialog={setDialog}/>}
            {screen==='inventory'&&<Inventory state={state} onDialog={setDialog} onImport={()=>go('import')}/>}
            {screen==='orders'&&<Orders key={mode} state={state} save={save} onDialog={setDialog}/>}
            {screen==='costs'&&<Costs state={state} onDialog={setDialog}/>}
            {screen==='recipes'&&<Recipes state={state}/>}
            {screen==='recommend'&&<Recommend state={state} save={save} onOrders={()=>go('orders')}/>}
            {screen==='settings'&&<Settings revision={real?.revision} real={mode==='real'} storage={access?.storage??'cloud'} password={access?.mode==='password'} onReal={()=>changeMode('real')} onLogout={logout} save={save}/>}
          </>}
        </>}
        {screen==='import'&&<div className="import-screen" hidden={!ready}><ImportScreen save={save} complete={m=>go(m==='sales'?'costs':'inventory')} realMode={mode==='real'} onReal={()=>changeMode('real')} ready={ready}/></div>}
      </main>
      <nav className="mobile-nav" aria-label="吧台快捷功能">
        <button className={screen==='inventory'&&!dialog?'active':''} onClick={()=>go('inventory')}><Boxes size={22}/>庫存總覽</button>
        <button className={dialog?.kind==='count'?'active':''} onClick={()=>{go('inventory');setDialog({kind:'count',floor:'1F'})}}><ClipboardList size={22}/>快速盤點</button>
        <button className={dialog?.kind==='transfer'?'active':''} onClick={()=>{go('inventory');setDialog({kind:'transfer',floor:'1F'})}}><ArrowLeftRight size={22}/>1F↔3F 調撥</button>
        <button className={screen==='orders'||screen==='costs'?'active':''} onClick={()=>go(screen==='costs'?'costs':'orders')}><ShoppingCart size={22}/>叫貨與成本</button>
      </nav>
    </div>
    {ready&&dialog&&(['sale','calibration','cogs'].includes(dialog.kind)?<CostDialog dialog={dialog} state={state} save={save} close={()=>setDialog(null)}/>:<InventoryDialog dialog={dialog} state={state} save={save} close={()=>setDialog(null)}/>)}
    {ready&&undo&&<Modal title="撤銷上一筆操作" onClose={()=>setUndo(null)}><Form label="確認撤銷" onDone={()=>setUndo(null)} onSubmit={()=>save('undo',{},undo.revision)}><p>要撤銷最近一次「{actions[undo.kind]??undo.kind}」嗎？若其他裝置剛更新，請重新核對最新操作。</p></Form></Modal>}
    {toast&&<div className="toast" role="status"><CircleCheck size={20}/>{toast}</div>}
  </div>
}
createRoot(document.getElementById('root')!).render(<App/>)
