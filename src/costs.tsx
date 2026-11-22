import {useState} from 'react'
import {BadgeDollarSign, Banknote, Calculator, ChartNoAxesColumnIncreasing, CircleHelp, Plus, ReceiptText} from 'lucide-react'
import {costReport,DAY} from '../server/model.mjs'
import {dateKey,midnight,money,period,short} from './data'
import type {Save,State} from './types'
import {Empty,ExportMenu,Field,Form,Heading,Modal,text,val} from './ui'
import {download} from './sheets'
import type {DialogState} from './workspace'
import {ItemSelect} from './inventory'

export const metricDefinitions=[
  {name:'進貨成本',formula:'Σ（實際到貨支數 × 各次到貨單價）',description:'期間每 100 元營收中，相當於多少元用於採購支出。',icon:ReceiptText,tone:'mint'},
  {name:'使用成本',formula:'Σ（實際使用瓶數 × 品項目前每瓶進價）',description:'期間每 100 元營收耗用多少元酒水。',icon:Banknote,tone:'gold'},
  {name:'銷售成本（COGS）',formula:'實際耗用口徑採用使用成本；核銷口徑加總登記的已售成本。',description:'期間每 100 元營收對應的已售酒水成本。',icon:BadgeDollarSign,tone:'mint'},
  {name:'總成本',formula:'銷售成本（COGS）＋期間登記的其他營運成本',description:'期間每 100 元營收對應的酒水銷售成本與其他已登記成本。',icon:Calculator,tone:'gold'},
]
const ratio=(cost:number|null,revenue:number|null)=>cost!==null&&revenue!==null&&revenue>0?cost/revenue*100:null
const pct=(value:number|null)=>value===null?'—':short(value,2)+'%'

export function Costs({state,onDialog}:{state:State;onDialog:(d:DialogState)=>void}) {
  const [kind,setKind]=useState('week')
  const [dates,setDates]=useState(period('week'))
  const [basis,setBasis]=useState('usage'),[salesType,setSalesType]=useState('beverage')
  function select(k:string) {setKind(k);if(k!=='custom')setDates(period(k))}
  const start=midnight(dates.start),end=midnight(dates.end)+DAY
  const valid=Number.isFinite(start)&&Number.isFinite(end)&&start<end&&dates.end<=dateKey()
  const report=valid?costReport(state,start,end,basis,salesType):null
  const values=report?[report.purchases,report.use,report.cogs,report.totalCost]:[]
  const revenue=report?.revenue??null
  const elapsed=Math.max(0,(Math.min(end,Date.now())-start)/DAY)
  const partial=report?.rows.filter(row=>!row.calibrated&&row.h.days+0.0001<elapsed).length??0
  const missingPrice=report?.rows.filter(row=>row.item.price===null).length??0
  function exportReport(format:'xlsx'|'csv') {
    if(!report)return
    void download('成本統計-'+dates.start+'-'+dates.end,[{name:'成本與銷售比',rows:[
      ['起日','迄日','COGS 口徑','營收分母','銷售額','營收日數','期間日數'],
      [dates.start,dates.end,basis==='usage'?'實際消耗':'已售核銷',salesType==='beverage'?'酒水銷售額':'總銷售額',revenue,report.revenueDays,report.expectedDays],
      ['指標','金額','銷售比（%）','公式'],...metricDefinitions.map((m,i)=>[m.name,values[i],ratio(values[i],revenue),m.formula]),['其他成本',report.extra],['使用成本缺漏品項',report.missingUse],['COGS 缺漏品項',report.missingCogs]
    ]},{name:'品項明細',rows:[['品項','容量（ml）','每瓶進價','每 ml 單價','用量（瓶）','用量（ml）','進貨成本','使用成本','銷售成本','量測涵蓋（天）','校準'],...report.rows.map(r=>[r.item.name,r.item.ml,r.item.price,r.item.ml!=null&&r.item.price!=null?r.item.price/r.item.ml:null,r.used,r.ml,r.receiving,r.usageCost,r.cogs,r.h.days,r.calibrated?'是':'否'])]}],format)
  }
  return <>
    <Heading title="成本分析" description="對照期間採購、耗用與銷售成本，掌握各項銷售比。"><ExportMenu onExport={exportReport}/><button className="btn primary" onClick={()=>onDialog({kind:'sale'})}><Plus size={17}/>登記營收</button></Heading>
    <div className="panel report-toolbar"><div className="segmented">{[['week','本週'],['month','本月'],['custom','自訂']].map(([k,label])=><button key={k} className={kind===k?'active':''} onClick={()=>select(k)}>{label}</button>)}</div>
      <Field label="起日"><input type="date" value={dates.start} max={dateKey()} onChange={e=>{setKind('custom');setDates({...dates,start:e.target.value})}}/></Field><Field label="迄日"><input type="date" value={dates.end} max={dateKey()} onChange={e=>{setKind('custom');setDates({...dates,end:e.target.value})}}/></Field>
      <Field label="營收分母"><select value={salesType} onChange={e=>setSalesType(e.target.value)}><option value="beverage">酒水銷售額</option><option value="overall">總銷售額</option></select></Field><Field label="COGS 計價口徑"><select value={basis} onChange={e=>setBasis(e.target.value)}><option value="usage">實際消耗</option><option value="cleared">已售核銷</option></select></Field>
    </div>
    {!report?<div className="notice danger">請選擇有效日期，結束日不可早於起日或晚於今天。</div>:<>
      <div className="notice"><ChartNoAxesColumnIncreasing size={18}/><div>期間營收 <strong>{money(revenue)}</strong> · 已填 {report.revenueDays}/{report.expectedDays} 日。{revenue===null?' 請登記或匯入營收才能計算銷售比。':revenue<=0?' 銷售額為 0，銷售比暫不顯示。':report.revenueDays<report.expectedDays?' 銷售比暫按已填營收計算，請補齊整個期間再比較。':''}
      {(report.missingUse>0||report.missingCogs>0)&&<div>使用成本 {report.missingUse} 項待補，COGS {report.missingCogs} 項待補，合計依已知紀錄計算。</div>}{(partial>0||missingPrice>0)&&<div>盤點涵蓋不足 {partial} 項，瓶價待補 {missingPrice} 項。</div>}</div></div>
      <div className="metric-grid">{metricDefinitions.map((m,i)=><article className="metric-card cost-card" key={m.name}><span className={'metric-icon '+m.tone}><m.icon size={19}/></span><span>{m.name}</span><strong>{money(values[i])}</strong><div className="ratio"><span>銷售比</span><b>{pct(ratio(values[i],revenue))}</b></div><p>{m.description}</p><details><summary><CircleHelp size={14}/>公式與口徑</summary><p>{m.formula}</p><p>{m.name}銷售比＝{m.name} ÷ 期間{salesType==='beverage'?'酒水銷售額':'總銷售額'} × 100%。</p></details></article>)}</div>
      <section className="panel">
        <div className="section-head"><div><h2>品項用量與成本</h2><p>{dates.start} 至 {dates.end} · 台北時間 · 每週一開始</p></div><div className="actions"><button className="btn" disabled={!state.items.length} onClick={()=>onDialog({kind:'calibration'})}>校準用量</button><button className="btn" disabled={!state.items.length} onClick={()=>onDialog({kind:'cogs'})}>登記核銷</button></div></div>
        {report.rows.length?<div className="scroll-table"><table><thead><tr><th>品項</th><th>每瓶進價</th><th>每 ml 單價</th><th>期間用量</th><th>進貨成本</th><th>使用成本</th><th>COGS</th></tr></thead><tbody>{report.rows.map(r=><tr key={r.item.id}><td><strong>{r.item.name}</strong><small className="block">{r.item.ml==null?'容量待補':short(r.item.ml)+' ml'}</small></td><td>{r.item.price===null?<span className="badge amber">瓶價待補</span>:money(r.item.price)}</td><td>{r.item.price!=null&&r.item.ml!=null?'NT$ '+short(r.item.price/r.item.ml,6):'—'}</td><td>{r.used===null?'資料待補':short(r.used,4)+' 支'}<small className="block">{r.calibrated?'手動校準':r.h.anomaly?'有異常盤點區間':r.used!==null?'涵蓋 '+short(r.h.days)+' 天'+(r.h.days+.0001<elapsed?'，資料不足':''):''}{r.ml!==null?' · '+short(r.ml)+' ml':''}</small></td><td>{money(r.receiving)}</td><td>{money(r.usageCost)}</td><td>{money(r.cogs)}</td></tr>)}</tbody></table></div>:<Empty title="尚無品項用量"/>}
      </section>
      <details className="panel formula-panel"><summary>用量與總成本口徑</summary><p>用量＝期初庫存＋期間進貨−期末庫存。以雙樓層連續盤點估算，樓層調撥在各庫位一加一減。跨日期的盤點區間按時間分攤；缺少盤點的時間留空，負用量區間標為差異。指定期間可用實際用量校準。</p><p>每 ml 單價＝每瓶進價 ÷ 容量（ml）。容量缺漏時仍可依瓶價計算瓶數成本。其他成本目前登記 {money(report.extra)}；總成本使用所選 COGS 口徑與其他成本。</p></details>
    </>}
  </>
}
export function CostDialog({dialog,state,save,close}:{dialog:DialogState;state:State;save:Save;close:()=>void}) {
  const [day,setDay]=useState(dateKey())
  const sale=state.sales.find(r=>r.date===day)
  if(dialog.kind==='sale')return <Modal title="登記每日營收" onClose={close}><Form onDone={close} onSubmit={d=>save('sales',{date:text(d,'date'),beverage:val(d,'beverage'),overall:val(d,'overall'),extra:val(d,'extra')})}>
    <Field label="日期"><input name="date" type="date" max={dateKey()} value={day} onChange={e=>setDay(e.target.value)} required/></Field>
    <div key={day} className="field-grid"><Field label="酒水銷售額（NT$）"><input name="beverage" type="number" step="any" min="0" defaultValue={sale?.beverage??''}/></Field><Field label="總銷售額（NT$）"><input name="overall" type="number" step="any" min="0" defaultValue={sale?.overall??''}/></Field><Field label="其他成本（NT$）"><input name="extra" type="number" step="any" min="0" defaultValue={sale?.extra??''}/></Field></div><div className="hint">同一天重存會更新該日。留白代表未填，輸入 0 代表確認為零。</div>
  </Form></Modal>
  if(dialog.kind==='calibration')return <Modal title="校準期間用量" onClose={close}><Form onDone={close} onSubmit={d=>save('calibration',{item:text(d,'item'),start:text(d,'start'),end:text(d,'end'),qty:val(d,'qty')})}>
    <Field label="品項"><ItemSelect items={state.items}/></Field><div className="field-grid"><Field label="起日"><input name="start" type="date" defaultValue={period('week').start} max={dateKey()} required/></Field><Field label="迄日"><input name="end" type="date" defaultValue={dateKey()} max={dateKey()} required/></Field></div><Field label="全館實際使用瓶數"><input name="qty" type="number" step="any" min="0" required/></Field>
    <div className="hint">日期起迄完全相同時採用此用量，可重存更新；歷史自動推演仍依盤點紀錄。</div>
  </Form></Modal>
  return <Modal title="登記已售核銷成本" onClose={close}><Form onDone={close} onSubmit={d=>save('cogs',{item:text(d,'item'),date:text(d,'date'),amount:val(d,'amount')})}>
    <Field label="品項"><ItemSelect items={state.items}/></Field><Field label="日期"><input name="date" type="date" defaultValue={dateKey()} max={dateKey()} required/></Field><Field label="該品項當日已售成本（NT$）"><input name="amount" type="number" step="any" min="0" required/></Field><div className="hint">同一品項與日期重存會更新核銷金額。報表可切換至「已售核銷」口徑。</div>
  </Form></Modal>
}
