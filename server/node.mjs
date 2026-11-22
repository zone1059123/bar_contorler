import { createServer } from 'node:http'
import { createReadStream, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { DatabaseSync } from 'node:sqlite'
import { api } from './handler.mjs'

const root=resolve('dist/client')
const dbPath=process.env.DB_PATH||'data/barkeep.sqlite'
mkdirSync(dirname(dbPath),{recursive:true})
const sql=new DatabaseSync(dbPath)
sql.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;')
const migrationDir=new URL('../migrations/',import.meta.url)
sql.exec('CREATE TABLE IF NOT EXISTS local_migrations (filename TEXT PRIMARY KEY)')
for (const filename of readdirSync(migrationDir).filter(name=>name.endsWith('.sql')).sort()) {
  sql.exec('BEGIN IMMEDIATE')
  try {
    if (!sql.prepare('SELECT filename FROM local_migrations WHERE filename=?').get(filename)) {
      sql.exec(readFileSync(new URL(filename,migrationDir),'utf8'))
      sql.prepare('INSERT INTO local_migrations (filename) VALUES (?)').run(filename)
    }
    sql.exec('COMMIT')
  } catch(error) {sql.exec('ROLLBACK');throw error}
}
const DB={
  prepare(query){
    const stmt=sql.prepare(query)
    let args=[]
    return {
      bind(...values){args=values;return this},
      execute(){
        if (query.startsWith('SELECT') || /RETURNING\s/i.test(query)) return {results:stmt.all(...args)}
        return {meta:stmt.run(...args)}
      }
    }
  },
  batch(statements){
    sql.exec('BEGIN IMMEDIATE')
    try {
      const results=statements.map(statement=>statement.execute())
      sql.exec('COMMIT')
      return results
    } catch(error) {sql.exec('ROLLBACK');throw error}
  }
}
const env={DB,BRAVE_SEARCH_API_KEY:process.env.BRAVE_SEARCH_API_KEY,PUBLIC_ORIGIN:process.env.PUBLIC_ORIGIN, BAR_PASSWORD:process.env.BAR_PASSWORD, SESSION_SECRET:process.env.SESSION_SECRET, REQUIRE_BAR_PASSWORD:process.env.REQUIRE_BAR_PASSWORD, STORAGE_LABEL:'local'}
const port=Number(process.env.PORT||3000)
const host=process.env.HOST||'0.0.0.0'
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.xls':'application/vnd.ms-excel','.csv':'text/csv; charset=utf-8','.zip':'application/zip','.woff2':'font/woff2','.webmanifest':'application/manifest+json'}
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url, 'http://'+(req.headers.host||'localhost:'+port))
    if (url.pathname.startsWith('/api/')) {
      if (req.headers['x-forwarded-proto']==='https') url.protocol='https:'
      const method=req.method||'GET'
      const hasBody=!['GET','HEAD'].includes(method)
      const request=new Request(url,{method,headers:req.headers,...(hasBody?{body:Readable.toWeb(req),duplex:'half'}:{})})
      const response=await api(request,env,{client:req.socket.remoteAddress})
      res.writeHead(response.status,Object.fromEntries(response.headers))
      res.end(await response.text())
      return
    }
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname))
    if (!path.startsWith(root+sep)) {res.writeHead(404).end();return}
    let size
    try {const stat=statSync(path);if (stat.isFile()) size=stat.size} catch {}
    if (size===undefined) {res.writeHead(404).end('Not found');return}
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':size})
    if(req.method==='HEAD') res.end()
    else createReadStream(path).pipe(res)
  } catch (error) {
    console.error(error.message)
    if (!res.headersSent) res.writeHead(500,{'Content-Type':'application/json'})
    res.end(JSON.stringify({message:'資料庫暫時無法使用'}))
  }
}).listen(port,host,()=>console.log(`BARKEEP http://localhost:${port}`))
