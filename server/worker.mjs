import { api } from './handler.mjs'
export default {
  async fetch(request,env) {
    try {
      const url=new URL(request.url)
      if (url.pathname.startsWith('/api/')) return await api(request,env)
      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('Frontend assets binding unavailable.',{status:503})
    } catch (error) {
      console.error(error)
      return Response.json({message:'資料庫暫時無法使用'},{status:500})
    }
  }
}
