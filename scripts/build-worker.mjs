import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'

await build({entryPoints:['server/worker.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022'})

if (existsSync('.openai/hosting.json')) {
  await mkdir('dist/.openai',{recursive:true})
  await cp('.openai/hosting.json','dist/.openai/hosting.json')
  await cp('migrations','dist/.openai/drizzle',{recursive:true})
}
