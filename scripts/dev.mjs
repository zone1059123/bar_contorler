import {spawnSync} from 'node:child_process'
const npm=process.platform==='win32'?'npm.cmd':'npm'
const build=spawnSync(npm,['run','build'],{stdio:'inherit',shell:process.platform==='win32'})
if(build.status!==0)process.exit(build.status??1)
if (process.argv.includes('--port')) process.env.PORT=process.argv[process.argv.indexOf('--port')+1]
if (process.argv.includes('--host')) process.env.HOST=process.argv[process.argv.indexOf('--host')+1]
await import('../server/node.mjs')
