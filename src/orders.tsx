import {useState} from 'react'
import {CircleAlert, ClipboardCheck, PackageCheck, ShoppingCart, SlidersHorizontal} from 'lucide-react'
import {demand} from '../server/model.mjs'
import {dateKey,money,short} from './data'
import type {Entry,Save,State} from './types'
import {Empty,ExportMenu,Field,Heading,SearchBox} from './ui'
import {download} from './sheets'
import type {DialogState} from './workspace'
import {readSupply,saveSupply} from './supply'

export function Orders({state,save,onDialog}:{state:State;save:Save;onDialog:(d:DialogState)=>void}) {
  const [{lead,buffer},setSupply]=useState(readSupply),[override,setOverride]=useState<Record<string,string>>({})
  function setDays(field:'lead'|'buffer',value:string) {
    const next={lead,buffer,[field]:Math.max(0,Math.min(60,Math.trunc(Number(value)||0)))}
    setSupply(next)
    saveSupply(next)
  }
  const [search,setSearch]=useState(''),[view,setView]=useState<'plan'|'history'>('plan'),[all,setAll]=useState(false)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[settings,setSettings]=useState(false),[cancel,setCancel]=useState('')
  const rows=state.items.map(i=>({i,d:demand(state.events,i.id,Date.now(),lead,buffer)})).sort((a,b)=>Number(b.d.urgent)-Number(a.d.urgent)||(a.d.days??Infinity)-(b.d.days??Infinity))
  const drafts=new Map(state.drafts.map(d=>[d.item,d.qty]))
  const selected=rows.filter(({i,d})=>i.name.toLowerCase().includes(search.toLowerCase())&&(all||d.proposed===null||(d.proposed??0)>0||d.urgent||drafts.has(i.id)||Number(override[i.id])>0))
  const qty=(id:string,proposed:number|null)=>Number(override[id]??drafts.get(id)??proposed??0)
  const plan=rows.map(({i,d})=>({i,d,qty:qty(i.id,d.proposed)})).filter(r=>r.qty>0)
  const orders=state.events.filter(e=>e.type==='order').sort((a,b)=>b.at-a.at)
  function report(format:'xlsx'|'csv') {
    if(view==='plan')void download('叫貨清單-'+dateKey(),[{name:'叫貨清單',rows:[['品項','目前等效瓶數','待到貨','建議支數','本次預計叫貨','預估單價','預估金額'],...plan.map(({i,d,qty})=>[i.name,d.balance,d.pending,d.proposed,qty,i.price,i.price==null?null:qty*i.price])]}],format)
    else void download('叫貨紀錄-'+dateKey(),[{name:'叫貨紀錄',rows:[['日期','批次','品項','叫貨支數','已到貨','當時庫存','狀態'],...orders.map(e=>[dateKey(e.at),e.batch??null,state.items.find(i=>i.id===e.item)?.name??'',e.qty??0,e.received??0,e.balance??null,e.closed?'結案':'待到貨'])]}],format)
  }
  async function run(kind:string,body:unknown,done:()=>void) {
    if(busy)return
    setBusy(true);setError('')
    try {await save(kind,body);done()} catch(e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  const create=()=> {
    if(!rows.every(({i,d})=>Number.isInteger(qty(i.id,d.proposed))&&qty(i.id,d.proposed)>=0&&qty(i.id,d.proposed)<=1000000)) {setError('本次叫貨量須為 0 至 1,000,000 的整數');return}
    void run('order',{rows:plan.map(({i,qty})=>({item:i.id,qty}))},()=>{setOverride({});setView('history')})
  }
  return <>
    <Heading title="智慧叫貨" description="依近期消耗、1F 與 3F 庫存與未到貨數量，安排下一批採購。"><ExportMenu onExport={report}/><button className="btn primary" disabled={busy||!plan.length||view==='history'} onClick={create}><ShoppingCart size={17}/>建立叫貨批次{plan.length?' · '+plan.length+' 項':''}</button></Heading>
    {error&&<div className="notice danger">{error}</div>}
    <div className="panel">
      <div className="table-toolbar"><div className="segmented"><button className={view==='plan'?'active':''} onClick={()=>setView('plan')}>建議清單</button><button className={view==='history'?'active':''} onClick={()=>setView('history')}>叫貨紀錄</button></div><button className="btn" onClick={()=>setSettings(!settings)}><SlidersHorizontal size={16}/>補貨設定</button></div>
      {settings&&<div className="settings"><div className="field-grid"><Field label="供應商到貨天數"><input type="number" min="0" max="60" value={lead} onChange={e=>setDays('lead',e.target.value)}/></Field><Field label="安全緩衝天數"><input type="number" min="0" max="60" value={buffer} onChange={e=>setDays('buffer',e.target.value)}/></Field></div><div className="hint">目標備貨 {lead+buffer} 天。建議量＝日均消耗 × 目標天數 − 現有庫存 − 未結案待到貨，無條件進位且最低為 0。</div></div>}
      {view==='plan'?<>
        <div className="table-toolbar secondary"><SearchBox value={search} onChange={setSearch}/><label className="checkbox"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>顯示全部品項</label><span className="muted">共 {plan.reduce((a,r)=>a+r.qty,0)} 支</span></div>
        {selected.length?<div className="orders-list">{selected.map(({i,d})=>{
          const status=d.urgent?'即將用罄':d.proposed===null?'資料待補':(d.proposed??0)>0?'建議補貨':d.daily===0?'尚無消耗':'庫存充足'
          const tone=d.urgent?'red':d.proposed===null?'neutral':(d.proposed??0)>0?'amber':'green'
          return <article className="order-row" key={i.id}><div><div className="order-title"><strong>{i.name}</strong><span className={'badge '+tone}>{status}</span>{drafts.has(i.id)&&<span className="badge green">已加入草稿</span>}</div>
            <div className="muted order-stats">現有 {short(d.balance)} 支 · 日均 {short(d.daily,3)} 支 · 預估每週 {short(d.weekly)} 支 · 待到貨 {d.pending} 支</div>
            <p>{d.last?'上次叫了 '+d.last.qty+' 支'+(d.last.balance!=null?'（當時剩 '+short(d.last.balance)+' 支）':'')+'。':''}
            {d.proposed===null?(d.anomaly?'近期盤點出現庫存增加但缺少對應到貨或調撥。請確認紀錄後再評估。':'近七天需至少有一天雙樓層可用的盤點區間，才能估算消耗；可先手動填寫叫貨量。'):
              '近 7 天已有 '+short(d.coverage,2)+' 天可比較的盤點資料，合計用了 '+short(d.used)+' 支。'}
            {d.proposed!==null&&<>{d.days==null?' 近期尚無消耗，暫不估算可支撐天數。':' 依目前庫存約可撐 '+short(d.days)+' 天。'} 建議叫 <strong>{d.proposed} 支</strong>，目標備貨 {lead+buffer} 天。</>}</p>
          </div><div className="order-input"><Field label="本次預計叫貨"><input aria-label={i.name+' 本次預計叫貨'} type="number" min="0" max="1000000" step="1" value={override[i.id]??drafts.get(i.id)??d.proposed??0} onChange={e=>setOverride(v=>({...v,[i.id]:e.target.value}))}/></Field><small>{i.price===null?'瓶價待補':money(i.price)+' / 支'}</small>
          {drafts.has(i.id)&&<button type="button" className="text-button" disabled={busy} onClick={()=>void run('queueOrder',{item:i.id,qty:0},()=>setOverride(v=>({...v,[i.id]:'0'})))}>移除草稿</button>}
          </div></article>
        })}</div>:<Empty title="目前沒有建議補貨品項">勾選「顯示全部品項」可手動建立叫貨。</Empty>}
      </>:orders.length?<div className="scroll-table"><table><thead><tr><th>日期</th><th>品項</th><th>叫貨 / 已到</th><th>當時庫存</th><th>狀態</th><th>操作</th></tr></thead><tbody>{orders.map((e:Entry)=><tr key={e.id}><td>{dateKey(e.at)}<small className="block">{e.batch?.slice(0,8)}</small></td><td><strong>{state.items.find(i=>i.id===e.item)?.name}</strong></td><td>{e.qty} / {e.received}</td><td>{short(e.balance)}</td><td><span className={'badge '+(e.closed?'neutral':'amber')}>{e.closed?'已結案':'待到貨'}</span></td><td>{!e.closed&&<div className="actions"><button className="btn" onClick={()=>onDialog({kind:'receipt',order:e})}><PackageCheck size={15}/>到貨</button>{cancel===e.id?<button className="btn" disabled={busy} onClick={()=>void run('closeOrder',{id:e.id},()=>setCancel(''))}><ClipboardCheck size={15}/>確認結案</button>:<button className="btn" onClick={()=>setCancel(e.id)}>結案</button>}</div>}</td></tr>)}</tbody></table></div>:<Empty title="尚無叫貨紀錄">由建議清單產生叫貨批次後，可在這裡登記分批到貨。</Empty>}
    </div>
    <div className="notice"><CircleAlert size={17}/><span>兩次盤點之間的用量＝期初庫存＋到貨＋調入−調出−期末庫存。跨出近七天的盤點區間，會依時間比例計入用量。</span></div>
  </>
}
