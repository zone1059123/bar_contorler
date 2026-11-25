import {useEffect,useState} from 'react'
import {Search} from 'lucide-react'
import {suggestIngredient} from '../server/model.mjs'
import {INGREDIENTS} from './data'
import {responseData} from './client'
import type {Item,Save} from './types'
import {Field,Form,Modal,text,val} from './ui'

type Suggestion={ml:number;name:string;url:string;source:string}
type Fields={name:string;ml:string;origin:'empty'|'saved'|'suggested'|'manual'}
type Lookup={name:string;suggestions:Suggestion[];message:string;busy:boolean}

export function ItemEditor({item,save,close}:{item?:Item;save:Save;close:()=>void}) {
  const [value,setValue]=useState<Fields>(()=>({
    name:item?.name??'',ml:item?.ml?.toString()??'',origin:item?.ml==null?'empty':'saved'
  }))
  const [lookup,setLookup]=useState<Lookup|null>(null)
  const [attempt,setAttempt]=useState(0)
  const query=value.name.trim()

  useEffect(()=>{
    if(query.length<2 || (attempt===0&&item?.ml!=null&&query===item.name))return
    const controller=new AbortController()
    let active=true
    let deadline:ReturnType<typeof setTimeout>|undefined
    const timer=setTimeout(async()=>{
      setLookup({name:query,suggestions:[],message:'正在查詢包裝容量…',busy:true})
      deadline=setTimeout(()=>controller.abort(),8000)
      try {
        const result:{suggestions:Suggestion[]}=await responseData(await fetch('/api/item-capacity?name='+encodeURIComponent(query),{signal:controller.signal}))
        if(!active)return
        const suggestion=result.suggestions[0]
        setLookup({name:query,suggestions:result.suggestions,message:suggestion?'':'查無可靠的包裝容量，可直接手動輸入。',busy:false})
        if(suggestion)setValue(current=>current.name.trim()===query&&current.origin==='empty'
          ?{...current,ml:String(suggestion.ml),origin:'suggested'}:current)
      } catch(error) {
        if(active)setLookup({name:query,suggestions:[],message:controller.signal.aborted
          ?'容量查詢逾時，可直接手動輸入。'
          :error instanceof Error&&error.message.includes('手動輸入')?error.message:'目前無法查詢容量，可直接手動輸入。',busy:false})
      } finally {clearTimeout(deadline)}
    },550)
    return()=>{active=false;clearTimeout(timer);clearTimeout(deadline);controller.abort()}
  },[query,attempt,item?.name,item?.ml])

  const result=lookup?.name===query?lookup:null
  function rename(name:string) {
    if(name.trim()!==query)setLookup(null)
    setValue(current=>current.name.trim()!==name.trim()&&current.origin==='suggested'
      ?{name,ml:'',origin:'empty'}:{...current,name})
  }
  function editCapacity(ml:string) {
    setValue(current=>({...current,ml,origin:'manual'}))
  }

  return <Modal title={item?'編輯品項':'新增品項'} onClose={close}>
    <Form onDone={close} onSubmit={data=>save('item',{
      id:item?.id,name:text(data,'name'),category:text(data,'category'),price:val(data,'price'),
      ml:val(data,'ml'),ingredient:text(data,'ingredient')||suggestIngredient(text(data,'name'))
    })}>
      <Field label="品項名稱"><input name="name" required maxLength={120} value={value.name} onChange={event=>rename(event.target.value)}/></Field>
      <Field label="分類"><input name="category" maxLength={80} defaultValue={item?.category}/></Field>
      <div className="field-grid">
        <Field label="每瓶進價（NT$）"><input name="price" type="number" step="any" min="0" defaultValue={item?.price??''}/></Field>
        <Field label="瓶裝容量（ml）"><input name="ml" type="number" inputMode="decimal" step="any" min="1" max="100000" value={value.ml} onChange={event=>editCapacity(event.target.value)}/></Field>
      </div>
      <section className="capacity-lookup" aria-label="容量查詢">
        <button className="btn" type="button" disabled={query.length<2||Boolean(result?.busy)} onClick={()=>setAttempt(n=>n+1)}><Search size={16}/>自動查詢容量</button>
        {result?.message&&<small role="status">{result.message}</small>}
        {Boolean(result?.suggestions.length)&&<div className="capacity-suggestions">
          <small role="status">{value.origin==='suggested'?'已預填建議容量。':'容量建議。'}請以實際包裝標示為準。</small>
          {result?.suggestions.map(s=><div className="capacity-option" key={s.ml}>
            <a href={s.url} target="_blank" rel="noreferrer" title={s.name}>{s.ml} ml · {s.source}</a>
            {value.ml!==String(s.ml)&&<button className="btn" type="button" onClick={()=>editCapacity(String(s.ml))}>套用 {s.ml} ml</button>}
          </div>)}
        </div>}
      </section>
      <Field label="酒譜材料對應"><select name="ingredient" defaultValue={item?.ingredient??''}><option value="">依名稱自動辨識</option>{Object.entries(INGREDIENTS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
    </Form>
  </Modal>
}
