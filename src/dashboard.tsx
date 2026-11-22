import {useState} from 'react'
import {ArrowRight, BellRing, ClipboardList, Layers, Package, ShoppingCart, UploadCloud, Wallet, Wine} from 'lucide-react'
import {stock,total,demand,costReport,DAY} from '../server/model.mjs'
import {dateKey,midnight,period,short,money,shift} from './data'
import type {Screen,State} from './types'
import type {DialogState} from './workspace'
import {Empty} from './ui'

export function Dashboard({state,go,dialog}:{state:State;go:(screen:Screen)=>void;dialog:(d:DialogState)=>void}) {
  const [days,setDays]=useState(7),[focus,setFocus]=useState<number|null>(null)
  const today=dateKey()
  const now=Date.now()
  const alerts=state.items.map(i=>({i,d:demand(state.events,i.id,now)})).filter(({d})=>d.urgent||(d.proposed??0)>0)
    .sort((a,b)=>Number(b.d.urgent)-Number(a.d.urgent)||(a.d.days??Infinity)-(b.d.days??Infinity))
  const totalInventory=state.items.reduce((a,i)=>{const s=stock(state.events,i.id);return a+(total(s['1F'])??0)+(total(s['3F'])??0)},0)
  const weekly=costReport(state,midnight(period('week').start),midnight(today)+DAY)
  const chart=Array.from({length:days},(_,idx)=>{
    const key=shift(today,idx-days+1)
    const report=costReport(state,midnight(key),midnight(key)+DAY)
    return {key,label:key.slice(5).replace('-','/'),purchases:report.purchases,use:report.use}
  })
  const highest=Math.max(0,...chart.flatMap(x=>[x.purchases,x.use??0]))
  const step=highest?Math.max(100,Math.ceil(highest/4/500)*500):500
  const chartMax=step*4
  const sample=chart.some(x=>x.purchases||x.use!==null)
  const metrics=[
    {label:'庫存品項',value:short(state.items.length),unit:'項',detail:'1F 與 3F 全館品項',icon:Package,tone:'mint',to:'inventory'},
    {label:'全館庫存',value:short(totalInventory,1),unit:'支',detail:'已盤點的等效瓶數',icon:Layers,tone:'cream',to:'inventory'},
    {label:'本週使用成本',value:money(weekly.use),unit:'',detail:weekly.missingUse?'部分品項待補':'依盤點與實際用量計算',icon:Wallet,tone:'mint',to:'costs'},
    {label:'補貨提醒',value:short(alerts.length),unit:'項',detail:alerts.length?'依近期消耗推算':'目前無補貨提醒',icon:BellRing,tone:'peach',to:'orders'}
  ] as const
  return <>
    <section className="hero">
      <div className="hero-content"><div className="hero-kicker"><span/> BAR OPERATIONS</div><h1>營運總覽</h1><p>即時掌握庫存、用量與叫貨建議。</p>
        <div className="actions"><button className="btn gold-button" onClick={()=>dialog({kind:'count',floor:'1F'})}><ClipboardList size={16}/>開始盤點</button><button className="btn hero-button" onClick={()=>go('import')}><UploadCloud size={16}/>匯入 Excel</button></div>
      </div>
    </section>
    <div className="metric-grid dashboard-metrics">{metrics.map(m=><button type="button" className="metric-card dashboard-metric" key={m.label} onClick={()=>go(m.to)}>
      <div className="metric-top"><span className={'metric-icon '+m.tone}><m.icon size={20}/></span><span>{m.label}</span></div>
      <div className="metric-number"><strong>{m.value}</strong>{m.unit&&<span>{m.unit}</span>}</div><small>{m.detail}</small>
    </button>)}</div>
    <div className="dashboard-columns">
      <section className="panel trend-panel">
        <div className="section-head"><div><h2>成本趨勢</h2><p>進貨與使用成本 · 新台幣</p></div><select aria-label="趨勢期間" value={days} onChange={e=>{setDays(Number(e.target.value));setFocus(null)}}><option value={7}>近 7 天</option><option value={14}>近 14 天</option><option value={30}>近 30 天</option></select></div>
        {sample?<div className="chart-wrap">
          <div className="chart"><div className="axis">{[4,3,2,1,0].map(n=><span key={n}>{short(step*n,0)}</span>)}</div>
            <div className="plot"><div className="grid-lines">{[0,1,2,3,4].map(x=><span key={x}/>)}</div>
              <div className="bars">{chart.map((x,i)=><button className="bar-pair" key={x.key} type="button" onFocus={()=>setFocus(i)} onBlur={()=>setFocus(null)} onMouseEnter={()=>setFocus(i)} onMouseLeave={()=>setFocus(null)} onClick={()=>setFocus(focus===i?null:i)} aria-label={x.label+' 進貨 '+money(x.purchases)+' 使用 '+money(x.use)}>
                <span className="bar purchase" style={{height:Math.max(x.purchases>0?2:0,x.purchases/chartMax*100)+'%'}}/><span className="bar used" style={{height:Math.max(x.use?2:0,(x.use??0)/chartMax*100)+'%'}}/>
                {(days<=14||i%5===0||i===days-1)&&<span className="date-label">{x.label}</span>}
                {focus===i&&<span className={'chart-tip '+(i>days-3?'align-right':'')}>{x.label}<br/>進貨 {money(x.purchases)}<br/>使用 {money(x.use)}</span>}
              </button>)}</div></div></div>
          <div className="legend"><span><i className="purchase"/>進貨成本</span><span><i className="used"/>使用成本</span></div>
        </div>:<Empty title="尚無成本趨勢">登記到貨與定期盤點後會在這裡看到趨勢。</Empty>}
      </section>
      <section className="panel alert-panel">
        <div className="section-head"><div><h2>叫貨提醒 <span className="badge amber">{alerts.length}</span></h2><p>依消耗速度與剩餘庫存排序</p></div><span className="alert-icon"><BellRing size={18}/></span></div>
        {alerts.length?<div className="alert-list">{alerts.slice(0,3).map(({i,d})=><div className="alert-row" key={i.id}><span className={'alert-symbol '+(d.urgent?'peach':'cream')}><Wine size={18}/></span><div><strong>{i.name}</strong><small>{d.days!==null?'約可撐 '+short(d.days,1)+' 天':'剩 '+short(d.balance)+' 支'}</small></div><span className={'badge '+(d.urgent?'red':'amber')}>建議 {d.proposed} 支</span></div>)}</div>:<Empty title="目前沒有叫貨提醒">雙樓層盤點與到貨紀錄會用來推算建議。</Empty>}
        <div className="alert-footer"><button className="text-button" onClick={()=>go('orders')}><ShoppingCart size={16}/>查看智慧叫貨 <ArrowRight size={15}/></button></div>
      </section>
    </div>
    <section className="panel overview-stock">
      <div className="section-head"><div><h2>庫位概況</h2><p>各樓層已盤點的等效瓶數</p></div><button className="btn" onClick={()=>go('inventory')}>查看庫存</button></div>
      <div className="location-grid">{(['1F','3F'] as const).map(f=>{
        const quantities=state.items.map(i=>total(stock(state.events,i.id)[f])).filter((x):x is number=>x!==null)
        return <div key={f}><span className="metric-icon mint"><Layers size={18}/></span><div><strong>{f} 庫位</strong><small className="block">已盤點 {quantities.length} 項</small></div><b>{short(quantities.reduce((a,b)=>a+b,0),2)} 支</b></div>
      })}</div>
    </section>
  </>
}
