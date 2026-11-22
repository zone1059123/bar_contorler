import {mutate} from './commands.mjs'
import {readState,writeState} from './storage.mjs'
const output=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})

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

export async function api(request,env) {
  const url=new URL(request.url)
  if (url.pathname==='/api/search' && request.method==='GET') {
    const query=(url.searchParams.get('q')??'').trim().slice(0,100)
    if (!query) return output({message:'請輸入查詢關鍵字'},400)
    try {return output(await search(query,env.BRAVE_SEARCH_API_KEY))}
    catch {return output({message:'外部搜尋目前無法連線，仍可查看內建推薦。'},503)}
  }
  if (url.pathname!=='/api/state') return output({message:'找不到 API'},404)
  if (request.method==='GET') return output(await readState(env.DB))
  if (request.method!=='POST') return output({message:'不支援此操作'},405)
  const origin=request.headers.get('Origin')
  if (origin && origin!==url.origin && origin!==env.PUBLIC_ORIGIN) return output({message:'請從系統頁面送出操作'},403)
  if (!request.headers.get('content-type')?.startsWith('application/json')) return output({message:'只接受 JSON 格式'},415)
  const raw=await request.text()
  if (raw.length>2_000_000) return output({message:'資料量過大，請分批匯入'},413)
  let payload
  try {
    payload=JSON.parse(raw)
    if (!payload || typeof payload.id!=='string' || payload.id.length>80) throw new Error('操作識別碼格式錯誤')
  } catch (error) {return output({message:error.message},400)}
  const row=await readState(env.DB,payload.id)
  const state=row.state
  state.applied=state.applied??[]
  const conflict='資料剛在另一個裝置更新。已重新載入，請確認後再儲存。'
  if (state.applied.includes(payload.id)) return output(row)
  if (payload.revision!==row.revision) return output({message:conflict,...row},409)
  let next
  try {next=mutate(state,payload)} catch (error) {return output({message:error.message},400)}
  if (!await writeState(env.DB,row.revision,payload.id,state,next)) {
    return output({message:conflict,...await readState(env.DB)},409)
  }
  return output({revision:row.revision+1,state:next})
}
