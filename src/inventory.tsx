import {useState} from 'react'
import {ArrowLeftRight,ClipboardList,Edit3,PackagePlus,Plus,Upload,History} from 'lucide-react'
import {stock,total,suggestIngredient} from '../server/model.mjs'
import {floorLabel, type DialogState} from './workspace'
import type {Entry,Floor,Item,Save,Slot,State} from './types'
import {dateKey, floors, ingredientLabel, INGREDIENTS, money, short} from './data'
import {Empty,ExportMenu,Field,Form,Heading,Modal,SearchBox,text,val} from './ui'
import {download} from './sheets'

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
    <Heading title="庫存管理" description="查看 1F 與 3F 的即時庫存，記錄盤點、到貨與樓層調撥。">
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
      {!history&&<div className="table-toolbar secondary"><SearchBox value={search} onChange={setSearch}/><select value={category} onChange={e=>setCategory(e.target.value)} aria-label="分類"><option value="">所有分類</option>{categories.map(c=><option key={c}>{c}</option>)}</select><small>{items.length} 項品項</small></div>}
      {history?(changes.length?<div className="scroll-table"><table><thead><tr><th>時間</th><th>品項</th><th>操作</th><th>庫位</th><th>瓶數</th></tr></thead><tbody>{changes.map(e=><tr key={e.id}><td>{new Date(e.at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}</td><td>{state.items.find(i=>i.id===e.item)?.name}</td><td>{e.type==='count'?'盤點':e.type==='receipt'?'到貨':'調撥'}</td><td>{e.floor}{e.to?' 至 '+e.to:''}</td><td>{e.type==='count'?short(total(e as unknown as Slot)):e.qty}</td></tr>)}</tbody></table></div>:<Empty title="目前沒有庫存異動"/>):
      items.length?<div className="scroll-table"><table><thead><tr><th>品項</th><th>分類</th><th>容量</th><th>每瓶進價</th><th>每 ml</th>{shown.map(f=><th key={f}>{f} 庫存</th>)}{floor==='all'&&<th>全館合計</th>}<th>操作</th></tr></thead><tbody>{items.map(i=>{
        const s=stock(state.events,i.id)
        return <tr key={i.id}><td><strong>{i.name}</strong>{i.ingredient&&<small className="block">{ingredientLabel(i.ingredient)}</small>}</td><td><span className="badge neutral">{i.category}</span></td><td>{i.ml==null?'—':short(i.ml)+' ml'}</td><td>{money(i.price)}</td><td>{i.price!=null&&i.ml!=null?'$ '+short(i.price/i.ml,6):'—'}</td>
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

function CountDialog({dialog,state,save,close}:{dialog:DialogState;state:State;save:Save;close:()=>void}) {
  const [draft,setDraft]=useState<Record<string,{whole:string;open:string}>>({})
  const [floor,setFloor]=useState<Floor>(dialog.floor??'1F')
  const [filter,setFilter]=useState('')
  const items=state.items.filter(i=>(!dialog.item||i.id===dialog.item)&&i.name.toLowerCase().includes(filter.toLowerCase()))
  const parseOpen=(value:string)=>value.endsWith('%')?Number(value.slice(0,-1))/100:Number(value)
  return <Modal title="庫存盤點" wide onClose={close}>
    {!state.items.length?<Empty title="請先新增或匯入品項"/>:<Form onDone={close} label={'儲存盤點'+(Object.keys(draft).length?' · '+Object.keys(draft).length+' 筆':'')} onSubmit={async()=>{
      const rows=Object.entries(draft).map(([key,v])=>{
        const [item,floor]=key.split('|')
        const whole=Number(v.whole),open=parseOpen(v.open.trim())
        if(v.whole.trim()===''||v.open.trim()===''||!Number.isInteger(whole)||whole<0||!Number.isFinite(open)||open<0||open>1)throw new Error('請輸入未開瓶整數與有效開瓶比例（0–1 或 0%–100%）')
        return {item,floor,whole,open}
      })
      if(!rows.length)throw new Error('請至少填寫一筆盤點')
      await save('count',{rows})
    }}>
      <div className="split-line"><div className="segmented">{floors.map(f=><button type="button" key={f} className={f===floor?'active':''} onClick={()=>setFloor(f)}>{f}</button>)}</div>{!dialog.item&&<SearchBox value={filter} onChange={setFilter}/>}</div>
      <div className="hint">填寫本次實際盤到的數字。開瓶部分可輸入 0.5 或 50%。切換樓層會保留已填寫的數值。</div>
      <div className="count-list">{items.map(i=>{
        const key=i.id+'|'+floor,current=stock(state.events,i.id)[floor]
        const b=draft[key]??{whole:current?String(current.whole):'',open:current?String(current.open):''}
        const edit=(patch:Partial<typeof b>)=>setDraft(d=>({...d,[key]:{...b,...patch}}))
        return <div className="count-row" key={i.id}><div><strong>{i.name}</strong><small className="block">{draft[key]?'待儲存':current?'上次庫存 '+short(total(current))+' 支':'尚未盤點'}</small>
          {current&&<button type="button" className="text-button" onClick={()=>edit({})}>沿用上次數值</button>}</div>
          <Field label="未開瓶數"><input inputMode="numeric" type="number" step="1" min="0" value={b.whole} onChange={e=>edit({whole:e.target.value})} placeholder="0"/></Field>
          <div><Field label="開瓶比例"><input inputMode="decimal" value={b.open} onChange={e=>edit({open:e.target.value})} placeholder="0–1"/></Field><div className="quick">{['0','0.2','0.5','0.8','1'].map(q=><button type="button" key={q} className={b.open===q?'chosen':''} onClick={()=>edit({open:q})}>{q}</button>)}</div></div></div>
      })}</div>
    </Form>}
  </Modal>
}
export function InventoryDialog({dialog,state,save,close}:{dialog:DialogState;state:State;save:Save;close:()=>void}) {
  const initialId=dialog.item??dialog.order?.item
  const [id,setId]=useState(initialId??'')
  const [floor,setFloor]=useState<Floor>(dialog.floor??'1F')
  if(dialog.kind==='count')return <CountDialog dialog={dialog} state={state} save={save} close={close}/>
  const i=state.items.find(x=>x.id===id)
  if(dialog.kind==='item')return <Modal title={i?'編輯品項':'新增品項'} onClose={close}><Form onDone={close} onSubmit={d=>save('item',{id:i?.id,name:text(d,'name'),category:text(d,'category'),price:val(d,'price'),ml:val(d,'ml'),ingredient:text(d,'ingredient')||suggestIngredient(text(d,'name'))})}>
    <Field label="品項名稱"><input name="name" required maxLength={120} defaultValue={i?.name}/></Field>
    <Field label="分類"><input name="category" maxLength={80} defaultValue={i?.category}/></Field>
    <div className="field-grid"><Field label="每瓶進價（NT$）"><input name="price" type="number" step="any" min="0" defaultValue={i?.price??''}/></Field><Field label="瓶裝容量（ml）"><input name="ml" type="number" step="any" min="1" defaultValue={i?.ml??''}/></Field></div>
    <Field label="酒譜材料對應"><select name="ingredient" defaultValue={i?.ingredient??''}><option value="">依名稱自動辨識</option>{Object.entries(INGREDIENTS).map(([k,v])=><option key={k} value={k}>{v as string}</option>)}</select></Field>
  </Form></Modal>
  if(dialog.kind==='transfer') {
    const s=i?stock(state.events,i.id):null
    const available=s?.[floor]?.whole??0
    return <Modal title="樓層調撥" onClose={close}><Form onDone={close} label="確認調撥" onSubmit={d=>save('transfer',{item:text(d,'item'),floor,to:floor==='1F'?'3F':'1F',qty:val(d,'qty')})}>
      <Field label="品項"><ItemSelect items={state.items} initial={i?.id} onChange={setId}/></Field>
      <div className="field-grid"><Field label="來源"><FloorSelect initial={floor} onChange={setFloor}/></Field><Field label="目的庫位"><input value={floor==='1F'?'3F':'1F'} readOnly/></Field></div>
      <Field label="調撥未開瓶支數"><input name="qty" type="number" min="1" max={available||undefined} step="1" required/></Field><div className="hint">來源可調撥 {available} 支。兩個庫位都需完成盤點。</div>
    </Form></Modal>
  }
  const order=dialog.order as Entry|undefined
  return <Modal title="登記到貨" onClose={close}><Form onDone={close} label="儲存到貨" onSubmit={d=>save('receipt',{item:order?.item??text(d,'item'),floor:text(d,'floor'),qty:val(d,'qty'),price:val(d,'price'),orderId:order?.id})}>
    <Field label="品項">{order?<input readOnly value={i?.name??''}/>:<ItemSelect items={state.items} initial={i?.id} onChange={setId}/>}</Field>
    <Field label="到貨庫位"><FloorSelect initial={floor}/></Field>
    <div className="field-grid"><Field label="到貨支數"><input name="qty" type="number" min="1" max={order?order.qty!-order.received!:undefined} defaultValue={order?order.qty!-order.received!:undefined} step="1" required/></Field><Field label="本次每瓶進價（NT$）"><input key={id} name="price" type="number" min="0" step="any" defaultValue={i?.price??''} required/></Field></div>
    <div className="hint">已盤點的樓層會增加未開瓶數。尚未盤點的樓層會保留為未知，直到首次盤點。</div>
  </Form></Modal>
}
