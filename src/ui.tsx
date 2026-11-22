import {useEffect,useRef,useState,type ReactNode,type FormEvent} from 'react'
import {X, Search, Download, Inbox, ChevronDown} from 'lucide-react'
export function Heading({title,description,children}:{title:string;description?:string;children?:ReactNode}) {
  return <div className="page-heading"><div><h1>{title}</h1>{description&&<p>{description}</p>}</div><div className="actions">{children}</div></div>
}
export function Empty({title='目前沒有資料',children}:{title?:string;children?:ReactNode}) {
  return <div className="empty"><Inbox size={27}/><strong>{title}</strong>{children&&<p>{children}</p>}</div>
}
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{ref.current?.showModal()},[])
  return <dialog ref={ref} className={wide?'dialog wide':'dialog'} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current)onClose()}}><div className="dialog-inner"><div className="dialog-head"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="關閉"><X size={21}/></button></div>{children}</div></dialog>
}
export function Form({onSubmit,onDone,children,label='儲存'}:{onSubmit:(data:FormData)=>Promise<void|false>;onDone:()=>void;children:ReactNode;label?:string}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if(busy)return
    const data=new FormData(e.currentTarget)
    setBusy(true);setError('')
    try {if(await onSubmit(data)!==false)onDone()} catch(e) {setError(e instanceof Error?e.message:'操作失敗')} finally {setBusy(false)}
  }
  return <form onSubmit={submit} className="form"><div className="form-fields">{children}</div>{error&&<div className="notice danger" role="alert">{error}</div>}<div className="dialog-actions"><button className="btn primary" disabled={busy}>{busy?'儲存中…':label}</button></div></form>
}
export const Field=({label,children}:{label:string;children:ReactNode})=><label className="field"><span>{label}</span>{children}</label>
export function SearchBox({value,onChange,placeholder='搜尋品項…'}:{value:string;onChange:(v:string)=>void;placeholder?:string}) {
  return <label className="search"><Search size={17}/><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/></label>
}
export function ExportMenu({onExport}:{onExport:(format:'xlsx'|'csv')=>void}) {
  return <details className="dropdown"><summary className="btn"><Download size={16}/> 匯出 <ChevronDown size={14}/></summary><div className="dropdown-menu">{(['xlsx','csv'] as const).map(f=><button key={f} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');onExport(f)}}>{f==='xlsx'?'Excel (.xlsx)':'CSV (.csv)'}</button>)}</div></details>
}
export const text=(d:FormData,key:string)=>String(d.get(key)??'').trim()
export const val=(d:FormData,key:string)=>{const v=text(d,key);return v===''?null:Number(v)}
