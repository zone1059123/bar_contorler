import {readFileSync,writeFileSync,unlinkSync} from 'node:fs'
import {spawnSync} from 'node:child_process'

const config = '.wrangler.deploy.toml'
const initial=readFileSync('wrangler.toml','utf8')
const placeholder='00000000-0000-0000-0000-000000000000'
const database=process.env.D1_DATABASE_ID || initial.match(/database_id\s*=\s*"([^"]+)"/)?.[1]
if (!database || database===placeholder || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(database)) {
  console.error('請在 Cloudflare 建置變數設定 D1_DATABASE_ID，或在 wrangler.toml 填入資料庫 ID。')
  process.exit(1)
}
const contents=initial.replace(/^(database_id\s*=\s*)"[^"]+"/m,(_,prefix)=>prefix+JSON.stringify(database))
function wrangler(args) {
  const launcher=process.platform==='win32'?'npm.cmd':'npm'
  const result=spawnSync(launcher,['exec','--','wrangler',...args,'--config',config],{stdio:'inherit',shell:process.platform==='win32'})
  if (result.status!==0) throw new Error('Cloudflare 指令失敗：'+args.join(' '))
}
try {
  writeFileSync(config,contents,{flag:'wx'})
  try {
    wrangler(['d1','migrations','apply','DB','--remote'])
    wrangler(['deploy'])
  } finally {unlinkSync(config)}
} catch (error) {
  console.error(error.message)
  process.exitCode=1
}
