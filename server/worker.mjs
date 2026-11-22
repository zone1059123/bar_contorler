import {api} from './handler.mjs'

export default {
  async fetch(request,env) {
    try {
      const url=new URL(request.url)
      if (url.pathname.startsWith('/api/')) return await api(request,env)
      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('網站資源尚未綁定。',{status:503})
    } catch (error) {
      console.error('BARKEEP request failed',error)
      return Response.json({message:'正式庫存服務暫時無法使用，請稍後重試。'},{status:500,headers:{'Cache-Control':'no-store'}})
    }
  }
}
