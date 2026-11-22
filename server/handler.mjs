import {empty,mutate} from './commands.mjs'
import {readState,readUndo,writeState} from './storage.mjs'
import {session,login,logout} from './auth.mjs'
import {BACKUP_LIMIT,backupDocument,validateBackup} from './backup.mjs'
import {inverseChanges,revertChanges} from './undo.mjs'
const output=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',...headers}})
export const RESET_CONFIRM='清空正式庫存'
export const RESTORE_CONFIRM='還原正式庫存'

async function bodyOf(request,limit) {
  const bad = (message,status) => {throw Object.assign(new Error(message),{status})}
  if (!request.headers.get('content-type')?.startsWith('application/json')) bad('只接受 JSON 格式。',415)
  if (Number(request.headers.get('content-length'))>limit) bad('檔案過大，無法接收。',413)
  if (!request.body) bad('缺少請求內容。',400)
  const reader=request.body.getReader()
  const decoder=new TextDecoder()
  let bytes=0, raw=''
  try {
    for (;;) {
      const next=await reader.read()
      if (next.done) break
      bytes+=next.value.byteLength
      if (bytes>limit) {
        await reader.cancel()
        bad('檔案過大，無法接收。',413)
      }
      raw+=decoder.decode(next.value,{stream:true})
    }
    return JSON.parse(raw+decoder.decode())
  } catch(error) {if(error.status) throw error;bad('無法讀取 JSON 資料。',400)}
  finally {reader.releaseLock()}
}

async function search(query, apiKey) {
  if (apiKey) {
    const url=new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q',query)
    url.searchParams.set('count','6')
    const response=await fetch(url,{headers:{Accept:'application/json','X-Subscription-Token':apiKey},signal:AbortSignal.timeout(6500)})
    if (!response.ok) throw new Error('Brave Search unavailable')
    const data=await response.json()
    return {source:'Brave Search',results:(data.web?.results??[]).map(r=>({title:r.title,url:r.url,description:r.description}))}
  }
  const url=new URL('https://zh.wikipedia.org/w/api.php')
  for (const [key,value] of Object.entries({action:'opensearch',search:query,limit:'6',namespace:'0',format:'json'})) url.searchParams.set(key,value)
  const response=await fetch(url,{headers:{'User-Agent':'Barkeep/1.0 (bar reference search)'},signal:AbortSignal.timeout(6500)})
  if (!response.ok) throw new Error('Wikimedia unavailable')
  const [,titles,descriptions,urls]=await response.json()
  return {source:'維基百科',results:titles.map((title,i)=>({title,url:urls[i],description:descriptions[i]}))}
}

export async function api(request,env,{client}={}) {
  const url=new URL(request.url)
  const path=url.pathname
  const currentSession=await session(request,env)
  if (request.method==='POST') {
    const origin=request.headers.get('Origin')
    if (request.headers.get('Sec-Fetch-Site')==='cross-site' || (origin && origin!==url.origin && origin!==env.PUBLIC_ORIGIN))
      return output({message:'請從 BARKEEP 網頁送出操作。'},403)
  }
  if (path==='/api/session' && request.method==='GET') return output({mode:currentSession.mode,authenticated:currentSession.authenticated,storage:env.STORAGE_LABEL??'cloud'})
  if (path==='/api/login' && request.method==='POST') {
    let data
    try {data=await bodyOf(request,4096)} catch(error) {return output({message:error.message},error.status??400)}
    const result=await login(request,env,data?.password,client??request.headers.get('CF-Connecting-IP'))
    return output({authenticated:result.status===200,message:result.message},result.status,result.cookie?{'Set-Cookie':result.cookie}:{})
  }
  if (path==='/api/logout' && request.method==='POST') return output({authenticated:false},200,{'Set-Cookie':await logout(request,env,currentSession)})
  if (path==='/api/search' && request.method==='GET') {
    const query=(url.searchParams.get('q')??'').trim().slice(0,100)
    if (!query) return output({message:'請輸入查詢關鍵字。'},400)
    try {return output(await search(query,currentSession.authenticated?env.BRAVE_SEARCH_API_KEY:undefined))}
    catch {return output({message:'目前無法連線至外部搜尋。內建的進酒建議仍可使用。'},503)}
  }
  if (!['/api/state','/api/backup'].includes(path)) return output({message:'找不到指定功能。'},404)
  if (!currentSession.authenticated) {
    const setup=currentSession.mode==='unconfigured'
    return output({code:setup?'setup':'login',message:setup?'部署尚未設定工作區密碼，正式庫存暫不開放。':'請先登入正式庫存。'},setup?503:401)
  }
  if (path==='/api/backup' && request.method==='GET') {
    const {state}=await readState(env.DB)
    return output(backupDocument(state))
  }
  if (path==='/api/state' && request.method==='GET') {
    const known=url.searchParams.get('since')
    if (known!==null && /^\d+$/.test(known)) {
      const [current]=await env.DB.batch([env.DB.prepare('SELECT revision FROM bar_revision WHERE id=1')])
      if (Number(known)===current.results[0].revision)
        return new Response(null,{status:204,headers:{'Cache-Control':'private, no-store'}})
    }
    return output(await readState(env.DB))
  }
  if (path!=='/api/state' || request.method!=='POST') return output({message:'不支援此操作。'},405)

  let payload
  try {
    payload=await bodyOf(request,BACKUP_LIMIT+4096)
    if (!payload || typeof payload.id!=='string' || !payload.id.trim() || payload.id.length>80) throw new Error('操作識別碼格式錯誤。')
  } catch (error) {return output({message:error.message},error.status??400)}
  const row=await readState(env.DB,payload.id)
  const state=row.state
  const conflict='另一個裝置剛更新了資料。已載入最新紀錄，請核對後重試。'
  if (state.applied.includes(payload.id)) return output(row)
  if (payload.revision!==row.revision) return output({message:conflict,...row},409)
  let next,restore=false,undo=null
  try {
    switch(payload.kind) {
      case 'restore':
        if (payload.body?.confirm!==RESTORE_CONFIRM) throw new Error('請輸入還原確認文字。')
        next=validateBackup(payload.body.backup)
        restore=true
        break
      case 'reset':
        if (payload.body?.confirm!==RESET_CONFIRM) throw new Error('請輸入清空確認文字。')
        next=empty()
        restore=true
        break
      case 'undo': {
        const inverse=await readUndo(env.DB,row.revision)
        if (!inverse) throw new Error('目前沒有可撤銷的操作，或資料已由其他裝置更新。')
        next=revertChanges(state,inverse)
        break
      }
      default: {
        next=mutate(state,payload)
        const inverse=JSON.stringify(inverseChanges(state,next))
        if (new TextEncoder().encode(inverse).byteLength<1_000_000) undo={kind:payload.kind,inverse}
      }
    }
  } catch (error) {return output({message:error.message,code:error.code},400)}
  if (!await writeState(env.DB,row.revision,payload.id,state,next,{replace:restore,undo})) {
    const current=await readState(env.DB,payload.id)
    if(current.state.applied.includes(payload.id)) return output(current)
    return output({message:conflict,...current},409)
  }
  return output({revision:row.revision+1,state:{...next,applied:[]},undo:undo?.kind??null})
}
