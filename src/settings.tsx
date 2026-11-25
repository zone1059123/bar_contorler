import {useState} from 'react'
import {Archive,Download,FileSpreadsheet,RotateCcw,ShieldCheck,Trash2} from 'lucide-react'
import {validateBackup} from '../server/backup.mjs'
import {decodeBackupFile,downloadBackup,type Backup} from './backup-file'
import {responseData} from './client'
import type {Save} from './types'
import {Field,Form,Heading,Modal,text} from './ui'

type BackupState={name:string;backup:Backup}
type Props={revision?:number;storage:'cloud'|'local';password:boolean;onLogout:()=>Promise<void>;save:Save}
const LIMIT=16_000_000
export function Settings({revision,storage,password,onLogout,save}:Props) {
  const [pending,setPending]=useState<BackupState|null>(null),[action,setAction]=useState<{kind:'restore'|'reset';revision?:number}|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function download(format:'json'|'xlsx') {
    if (busy) return
    setBusy(true);setError('')
    try {downloadBackup(await responseData(await fetch('/api/backup')),format)}
    catch (error) {setError((error as Error).message)}
    finally {setBusy(false)}
  }
  async function choose(file:File|undefined) {
    if(!file)return
    setPending(null);setError('')
    try {
      if (file.size>LIMIT) throw new Error('此頁支援還原 16 MB 以內的備份檔。')
      const backup=decodeBackupFile(await file.arrayBuffer(),file.name) as Backup
      validateBackup(backup)
      if(new TextEncoder().encode(JSON.stringify(backup)).byteLength>LIMIT) throw new Error('備份解開後超過 16 MB，無法透過此頁還原。')
      setPending({name:file.name,backup})
    } catch (error) {setError(error instanceof SyntaxError?'無法讀取備份檔，請確認檔案完整。':(error as Error).message)}
  }
  const confirm=action?.kind==='reset'?'清空正式庫存':'還原正式庫存'
  return <>
    <Heading title="系統設定" description="管理正式庫存的登入狀態、備份與還原。"/>
    <section className="panel settings-panel">
      <div className="section-head"><div><h2><ShieldCheck size={21}/> 正式庫存工作區</h2><p>{storage==='cloud'?'正式庫存資料保存於雲端資料庫。':'正式庫存資料保存於這台伺服器的 SQLite 資料庫。'}</p></div>{password&&<button className="btn" disabled={busy} onClick={()=>void onLogout().catch(e=>setError(e.message))}>登出</button>}</div>
    </section>
    <section className="panel settings-panel">
      <div className="section-head"><div><h2><Archive size={21}/> 下載完整資料備份</h2><p>包含品項、盤點、調撥、進貨、叫貨與草稿、營收、用量校準及核銷紀錄。</p></div></div>
      <div className="settings-body actions"><button className="btn primary" disabled={busy} onClick={()=>void download('json')}><Download size={17}/>下載 JSON</button><button className="btn" disabled={busy} onClick={()=>void download('xlsx')}><FileSpreadsheet size={17}/>下載 Excel</button></div>
    </section>
    <section className="panel settings-panel">
      <div className="section-head"><div><h2><RotateCcw size={21}/> 從備份檔還原</h2><p>還原會用選定的備份取代整份正式庫存。請先下載目前的完整資料。</p></div></div>
      <div className="settings-body">
        <Field label="選擇 BARKEEP 備份（JSON 或 .xlsx）"><input type="file" accept=".json,.xlsx" onChange={e=>{void choose(e.target.files?.[0]);e.target.value=''}}/></Field>
        {pending&&<div className="notice">{pending.name} · {pending.backup.items.length} 個品項、{pending.backup.events.length} 筆庫存與成本紀錄、{pending.backup.sales.length} 個營收日、{pending.backup.drafts.length} 筆叫貨草稿。<button className="btn primary" onClick={()=>setAction({kind:'restore',revision})}>查看還原確認</button></div>}
      </div>
    </section>
    <section className="panel settings-panel destructive">
      <div className="section-head"><div><h2><Trash2 size={20}/> 清空重置正式庫存</h2><p>清空會移除正式工作區的所有營運資料。可使用事先下載的備份還原。</p></div><button className="btn danger-button" onClick={()=>setAction({kind:'reset',revision})}>查看清空確認</button></div>
    </section>
    {error&&<div className="notice danger" role="alert">{error}</div>}
    {action&&<Modal title={confirm} onClose={()=>setAction(null)}>
      <Form label={action.kind==='reset'?'確定清空':'確定還原'} onDone={()=>{setAction(null);setPending(null)}} onSubmit={async data=>{
        if(text(data,'confirm')!==confirm)throw new Error('請完整輸入畫面上的確認文字。')
        await save(action.kind,{confirm,...(action.kind==='restore'?{backup:pending?.backup}:{})},action.revision)
      }}>
        <div className="notice danger">{action.kind==='reset'?'正式庫存的所有營運資料會被清空。':'目前正式庫存將由 '+pending?.name+' 取代。'} 請先確認已下載需要的備份。</div>
        <Field label={'輸入「'+confirm+'」'}><input name="confirm" required autoComplete="off"/></Field>
      </Form>
    </Modal>}
  </>
}
