import {useState} from 'react'
import {ArrowLeftRight,ClipboardList,Edit3,PackagePlus,Plus,Upload,History} from 'lucide-react'
import {stock,total} from '../server/model.mjs'
import {floorLabel, type DialogState} from './workspace'
import type {Entry,Floor,Item,Save,Slot,State} from './types'
import {dateKey, taipeiTime, parseTaipeiTime, floors, ingredientLabel, money, short} from './data'
import {Empty,ExportMenu,Field,Form,Heading,Modal,SearchBox,text,val} from './ui'
import {download} from './sheets'
import {ApiError} from './client'
import {ItemEditor} from './item-editor'

export function Inventory({state,onDialog,onImport}:{state:State;onDialog:(d:DialogState)=>void;onImport:()=>void}) {
  const [floor,setFloor]=useState<Floor|'all'>('all')
  const [search,setSearch]=useState('')
  const [category,setCategory]=useState('')
  const [history,setHistory]=useState(false)
  const categories=[...new Set(state.items.map(i=>i.category))].sort()
  const items=state.items.filter(i=>(!category||i.category===category)&&(i.name+' '+i.category).toLowerCase().includes(search.toLowerCase()))
  const shown=floor==='all'?floors:[floor]
  function exportReport(format:'xlsx'|'csv') {
    const rows=items.map(i=>{
      const s=stock(state.events,i.id)
      return [i.name,i.category,i.ml,i.price,i.price!=null&&i.ml!=null?i.price/i.ml:null,...shown.flatMap(f=>[s[f]?.whole??null,s[f]?.open??null,total(s[f])]),
        ...(floor==='all'?[s['1F']&&s['3F']?total(s['1F'])!+total(s['3F'])!:null]:[])]
    })
    void download('庫存盤點-'+dateKey(),[{name:'盤點報表',rows:[['品項','分類','容量（ml）','瓶價','每 ml 單價',...shown.flatMap(f=>[f+' 未開瓶數',f+' 開瓶比例',f+' 合計']),...(floor==='all'?['全館合計']:[])],...rows]}],format)
  }
  const changes=[...state.events].filter(e=>['count','transfer','receipt'].includes(e.type)).sort((a,b)=>b.at-a.at).slice(0,100)
  return <>
    <Heading title="庫存總覽" description="查看 1F 與 3F 的即時庫存，記錄盤點、到貨與樓層調撥。">
      <button className="btn" onClick={onImport}><Upload size={16}/>匯入</button><ExportMenu onExport={exportReport}/>
      <button className="btn primary" onClick={()=>onDialog({kind:'count',floor:floor==='all'?'1F':floor})}><ClipboardList size={17}/>開始盤點</button>
    </Heading>
    <div className="panel">
      <div className="table-toolbar">
        <div className="segmented" aria-label="樓層">{(['all',...floors] as const).map(f=><button className={floor===f&&!history?'active':''} key={f} onClick={()=>{setFloor(f);setHistory(false)}}>{floorLabel(f)}</button>)}
          <button className={history?'active':''} onClick={()=>setHistory(true)}><History size={15}/>紀錄</button></div>
        <div className="actions"><button className="btn" disabled={!state.items.length} onClick={()=>onDialog({kind:'receipt',floor:floor==='all'?'1F':floor})}><PackagePlus size={16}/>到貨</button>
        <button className="btn" disabled={!state.items.length} onClick={()=>onDialog({kind:'transfer',floor:floor==='all'?'1F':floor})}><ArrowLeftRight size={16}/>調撥</button>
        <button className="btn" onClick={()=>onDialog({kind:'item'})}><Plus size={16}/>新增品項</button></div>
      </div>
      {!history&&<div className="table-toolbar secondary"><SearchBox value={search} onChange={setSearch}/><select value={category} onChange={e=>setCategory(e.target.value)} aria-label="分類"><option value="">所有分類</option>{categories.map(c=><option key={c}>{c}</option>)}</select><small>{items.length} 個品項</small></div>}
      {history?(changes.length?<div className="scroll-table"><table><thead><tr><th>時間</th><th>品項</th><th>操作</th><th>庫位</th><th>瓶數</th></tr></thead><tbody>{changes.map(e=><tr key={e.id}><td>{new Date(e.at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}</td><td>{state.items.find(i=>i.id===e.item)?.name}</td><td>{e.type==='count'?'盤點':e.type==='receipt'?'到貨':'調撥'}</td><td>{e.floor}{e.to?' 至 '+e.to:''}</td><td>{e.type==='count'?short(total(e as unknown as Slot)):e.qty}</td></tr>)}</tbody></table></div>:<Empty title="目前沒有庫存異動"/>):
      items.length?<div className="scroll-table"><table><thead><tr><th>品項</th><th>分類</th><th>容量</th><th>每瓶進價</th><th>每 ml 單價</th>{shown.map(f=><th key={f}>{f} 庫存</th>)}{floor==='all'&&<th>全館合計</th>}<th>操作</th></tr></thead><tbody>{items.map(i=>{
        const s=stock(state.events,i.id)
        return <tr key={i.id}><td><strong>{i.name}</strong>{i.ingredient&&<small className="block">{ingredientLabel(i.ingredient)}</small>}</td><td><span className="badge neutral">{i.category}</span></td><td>{i.ml==null?'—':short(i.ml)+' ml'}</td><td>{money(i.price)}</td><td>{i.price!=null&&i.ml!=null?'NT$ '+short(i.price/i.ml,6):'—'}</td>
          {shown.map(f=><td key={f}>{s[f]?<><strong>{short(total(s[f]),6)}</strong><small className="block">{s[f].whole} 整瓶 · {short(s[f].open*100,4)}% 開瓶</small></>:<span className="muted">待盤點</span>}</td>)}
          {floor==='all'&&<td><strong>{s['1F']&&s['3F']?short(total(s['1F'])!+total(s['3F'])!,6):'—'}</strong></td>}
          <td><div className="row-actions"><button className="icon-button" title="盤點" aria-label={i.name+' 盤點'} onClick={()=>onDialog({kind:'count',item:i.id,floor:floor==='all'?'1F':floor})}><ClipboardList size={17}/></button><button className="icon-button" title="編輯品項" aria-label={i.name+' 編輯'} onClick={()=>onDialog({kind:'item',item:i.id})}><Edit3 size={16}/></button></div></td></tr>
      })}</tbody></table></div>:<Empty title={state.items.length?'沒有符合的品項':'庫存清單是空的'}>{state.items.length?'試試其他關鍵字或分類。':'匯入 Excel 或手動新增品項即可開始。'}</Empty>}
    </div>
  </>
}

export function ItemSelect({items,initial,onChange}:{items:Item[];initial?:string;onChange?:(v:string)=>void}) {
  return <select name="item" defaultValue={initial??''} required onChange={e=>onChange?.(e.target.value)}><option value="" disabled>請選擇品項</option>{items.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select>
}
export function FloorSelect({name='floor',initial='1F',onChange}:{name?:string;initial?:Floor;onChange?:(f:Floor)=>void}) {
  return <select name={name} defaultValue={initial} onChange={e=>onChange?.(e.target.value as Floor)}>{floors.map(f=><option key={f}>{f}</option>)}</select>
}

const openingPresets=['0','0.2','0.3','0.5','0.7','0.8','1.0']
function openingValue(value:string) {
  const normalized=value.trim().normalize('NFKC')
  return normalized.endsWith('%')?Number(normalized.slice(0,-1))/100:Number(normalized)
}

function CountDialog({dialog,state,save,close}:{dialog:DialogState;state:State;save:Save;close:()=>void}) {
  const [draft,setDraft]=useState<Record<string,{whole:string;open:string}>>({})
  const [floor,setFloor]=useState<Floor>(dialog.floor??'1F')
  const [filter,setFilter]=useState('')
  const [time,setTime]=useState('')
  const [confirmations,setConfirmations]=useState({confirmJump:false,confirmBackfill:false})
  const [warning,setWarning]=useState('')
  const items=state.items.filter(i=>(!dialog.item||i.id===dialog.item)&&i.name.toLowerCase().includes(filter.toLowerCase()))
  const cutoff=parseTaipeiTime(time)
  const resetConfirmation=()=>{setConfirmations({confirmJump:false,confirmBackfill:false});setWarning('')}
  const count=Object.keys(draft).length
  return <Modal title="快速盤點" wide onClose={close}>
    {!state.items.length?<Empty title="請先新增或匯入品項"/>:<Form onDone={close} label={warning?'確認並儲存':('儲存盤點'+(count?' · '+count+' 筆':''))} onSubmit={async()=>{
      const rows=Object.entries(draft).map(([key,v])=>{
        const [item,floor]=key.split('|')
        const whole=Number(v.whole),open=openingValue(v.open)
        if(v.whole.trim()===''||v.open.trim()===''||!Number.isInteger(whole)||whole<0||!Number.isFinite(open)||open<0||open>1)throw new Error('請輸入未開瓶整數與有效開瓶比例（0–1 或 0%–100%）。')
        return {item,floor,whole,open}
      })
      if(!rows.length)throw new Error('請至少填寫一筆盤點。')
      try {await save('count',{rows,time,...confirmations})}
      catch(error) {
        const code=(error as ApiError).code
        if(code==='confirmJump'||code==='confirmBackfill') {
          setWarning((error as Error).message)
          setConfirmations(flags=>({...flags,[code]:true}))
          return false
        }
        resetConfirmation()
        throw error
      }
    }}>
      <div className="split-line"><div className="segmented" aria-label="盤點樓層">{floors.map(f=><button type="button" key={f} className={f===floor?'active':''} onClick={()=>setFloor(f)}>{f}</button>)}</div>{!dialog.item&&<SearchBox value={filter} onChange={setFilter}/>}</div>
      <div className="hint">開瓶餘量可輸入 0.5 或 50%。切換樓層時會保留已填寫的數值。</div>
      <details className="backfill-field"><summary>回填歷史盤點</summary><Field label="盤點日期與時間（台北時間）"><input type="datetime-local" max={taipeiTime()} value={time} onChange={e=>{setTime(e.target.value);resetConfirmation()}}/></Field><small>留白時以送出時刻為準。歷史盤點會按時間順序重新計算。</small></details>
      {warning&&<div className="notice amber-notice" role="alert">{warning}</div>}
      <div className="count-list">{items.map(i=>{
        const key=i.id+'|'+floor
        const current=stock(state.events,i.id,Number.isFinite(cutoff)?cutoff:Infinity)[floor]
        const value=draft[key]??{whole:current?String(current.whole):'',open:current?String(current.open):''}
        function edit(patch:Partial<typeof value>) {
          resetConfirmation()
          setDraft(previous=>({...previous,[key]:{whole:value.whole||'0',open:value.open||'0',...patch}}))
        }
        function adjust(change:number) {
          const n=openingValue(value.open)
          const next=Math.round(Math.max(0,Math.min(1,(Number.isFinite(n)?n:0)+change))*1e6)/1e6
          edit({open:String(next)})
        }
        return <div className="count-row" key={i.id}>
          <div><strong>{i.name}</strong><small className="block">{draft[key]?'待儲存':current?'記錄庫存 '+short(total(current))+' 支':'尚未盤點'}</small>
            {current&&<button type="button" className="text-button" onClick={()=>edit({whole:String(current.whole),open:String(current.open)})}>沿用記錄庫存</button>}
          </div>
          <Field label="未開瓶支數"><input inputMode="numeric" type="number" step="1" min="0" value={value.whole} onChange={e=>edit({whole:e.target.value})} placeholder="0"/></Field>
          <div className="opening-control"><Field label="開瓶剩餘比例"><input inputMode="decimal" value={value.open} onChange={e=>edit({open:e.target.value})} placeholder="0–1"/></Field>
            <div className="quick" aria-label={i.name+'開瓶比例快選'}>{openingPresets.map(q=><button type="button" key={q} className={value.open.trim()!==''&&openingValue(value.open)===Number(q)?'chosen':''} onClick={()=>edit({open:q})}>{q}</button>)}</div>
            <div className="quick fine-adjust"><button type="button" onClick={()=>adjust(-.1)}>−0.1</button><button type="button" onClick={()=>adjust(.1)}>＋0.1</button></div>
          </div>
        </div>
      })}{!items.length&&<Empty title="找不到符合的品項"/>}</div>
    </Form>}
  </Modal>
}
export function InventoryDialog({dialog,state,save,close}:{dialog:DialogState;state:State;save:Save;close:()=>void}) {
  const initialId=dialog.item??dialog.order?.item
  const [id,setId]=useState(initialId??'')
  const [floor,setFloor]=useState<Floor>(dialog.floor??'1F')
  if(dialog.kind==='count')return <CountDialog dialog={dialog} state={state} save={save} close={close}/>
  const i=state.items.find(x=>x.id===id)
  if(dialog.kind==='item')return <ItemEditor item={i} save={save} close={close}/>
  if(dialog.kind==='transfer') {
    const s=i?stock(state.events,i.id):null
    const available=s?.[floor]?.whole??0
    const initialized=s?.['1F']&&s?.['3F']
    return <Modal title="1F↔3F 調撥" onClose={close}><Form onDone={close} label="確認調撥" onSubmit={d=>save('transfer',{item:text(d,'item'),floor,to:floor==='1F'?'3F':'1F',qty:val(d,'qty')})}>
      <Field label="品項"><ItemSelect items={state.items} initial={i?.id} onChange={setId}/></Field>
      <div className="field-grid"><Field label="來源"><FloorSelect initial={floor} onChange={setFloor}/></Field><Field label="目的庫位"><input value={floor==='1F'?'3F':'1F'} readOnly/></Field></div>
      <Field label="調撥未開瓶支數"><input name="qty" type="number" min="1" max={initialized?available:0} step="1" required/></Field><div className="hint">{initialized?'來源可調撥 '+available+' 支未開瓶酒。':i?'兩個庫位都需建立盤點基準，才能調撥。':'請先選擇要調撥的品項。'}</div>
    </Form></Modal>
  }
  const order=dialog.order as Entry|undefined
  return <Modal title="到貨驗收" onClose={close}><Form onDone={close} label="儲存到貨" onSubmit={d=>save('receipt',{item:order?.item??text(d,'item'),floor:text(d,'floor'),qty:val(d,'qty'),price:val(d,'price'),orderId:order?.id})}>
    <Field label="品項">{order?<input readOnly value={i?.name??''}/>:<ItemSelect items={state.items} initial={i?.id} onChange={setId}/>}</Field>
    <Field label="到貨庫位"><FloorSelect initial={floor}/></Field>
    <div className="field-grid"><Field label="到貨支數"><input name="qty" type="number" min="1" max={order?order.qty!-order.received!:undefined} defaultValue={order?order.qty!-order.received!:undefined} step="1" required/></Field><Field label="本次每瓶進價（NT$）"><input key={id} name="price" type="number" min="0" step="any" defaultValue={i?.price??''} required/></Field></div>
    <div className="hint">已盤點的樓層會增加未開瓶數。尚未盤點的樓層會保留為未知，直到首次盤點。</div>
  </Form></Modal>
}
