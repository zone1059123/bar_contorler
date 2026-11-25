const units = {ml:1,cc:1,毫升:1,cl:10,l:1000,公升:1000,升:1000}
const volumePattern = '(\\d+(?:[.,]\\d+)?)\\s*(毫升|公升|ml|cc|cl|l|升)'
const aliases = [
  [/金巴利/g,'Campari'],[/君度/g,'Cointreau'],[/海尼根/g,'Heineken'],[/百加得/g,'Bacardi'],
  [/可口可樂/g,'Coca-Cola'],[/孟買藍寶石/g,'Bombay Sapphire'],[/絕對伏特加/g,'Absolut Vodka'],
  [/糖漿/g,'syrup'],[/啤酒/g,'beer'],[/琴酒/g,'gin'],[/伏特加/g,'vodka'],[/威士忌/g,'whisky']
]
function ml(value,unit) {
  const amount=Math.round(Number(value.replace(',','.'))*units[unit.toLowerCase()]*1000)/1000
  return amount>=15&&amount<=100000?amount:null
}

function terms(value) {
  const text=String(value??'').normalize('NFKC')
  const translated=aliases.reduce((all,[pattern,replacement])=>all.replace(pattern,' '+replacement+' '),text)
  return [...new Set(translated.toLowerCase().replace(/whiskey/g,'whisky').match(/[\p{L}\p{N}]+/gu)??[])]
}
const generic=new Set(['whisky','gin','vodka','rum','beer','wine','juice','syrup','brandy','liqueur','果汁','利口酒','香甜酒','烈酒','紅酒','氣泡酒','飲料'])
function matches(name, brands, query) {
  const label=new Set(terms(name))
  const brand=new Set(terms(Array.isArray(brands)?brands.join(' '):brands))
  return query.some(t=>label.has(t) && !generic.has(t)) &&
    query.every(t=>label.has(t)||brand.has(t))
}
function clean(value) {
  return String(value??'').replace(/<[^>]*>/g,'').replaceAll('&amp;','&').trim().slice(0,170)
}
function sourceLink(value) {
  try {const url=new URL(value);return url.protocol==='https:'?url.href:null} catch {return null}
}
const standardSizes=new Set([250,330,350,355,375,500,700,720,750,1000,1500])
const wholeVolume=new RegExp('^'+volumePattern+'$','i')

export async function lookupCapacity(name, apiKey, fetcher=fetch) {
  const normalized=name.normalize('NFKC').trim()
  const explicit=[...normalized.matchAll(new RegExp(volumePattern+'(?![a-z])','gi'))]
  const desired=explicit.length===1?ml(explicit[0][1],explicit[0][2]):null
  const title=normalized.replace(new RegExp(volumePattern+'(?![a-z])','gi'),' ').trim()
  const query=terms(title)
  if (!query.some(t=>!generic.has(t))) return {suggestions:[]}
  const searchTitle=query.join(' ')
  let available=false
  const results=new Map()
  const seenSources=new Set()
  function add(amount,name,url,source) {
    if(amount===null || (explicit.length>0&&amount!==desired) || !url || seenSources.has(url))return
    seenSources.add(url)
    const existing=results.get(amount)
    if(existing)existing.matches++
    else results.set(amount,{suggestion:{ml:amount,name,url,source},matches:1})
  }
  try {
    const url=new URL('https://search.openfoodfacts.org/search')
    url.searchParams.set('q',searchTitle)
    url.searchParams.set('page_size','24')
    url.searchParams.set('fields','code,product_name,product_name_en,brands,quantity')
    const response=await fetcher(url,{headers:{'User-Agent':'BARKEEP/1.0 (product packaging lookup)'},signal:AbortSignal.timeout(3200)})
    if(!response.ok)throw new Error('Open Food Facts unavailable')
    const data=await response.json()
    if(!Array.isArray(data.hits)||data.timed_out)throw new Error('Open Food Facts incomplete')
    available=true
    for (const row of data.hits) {
      const name=clean(row.product_name||row.product_name_en)
      const pack=String(row.quantity??'').normalize('NFKC').trim().match(wholeVolume)
      if(pack && /^\d{8,14}$/.test(row.code) &&
        (matches(name,row.brands,query)||matches(row.product_name_en,row.brands,query))) {
        add(ml(pack[1],pack[2]),name,'https://world.openfoodfacts.org/product/'+row.code,'Open Food Facts')
      }
    }
  } catch {}
  if(!results.size&&apiKey) {
    try {
      const url=new URL('https://api.search.brave.com/res/v1/web/search')
      url.searchParams.set('q',title+' '+(desired?desired+'ml':'容量 ml'))
      url.searchParams.set('count','8')
      const response=await fetcher(url,{headers:{Accept:'application/json','X-Subscription-Token':apiKey},signal:AbortSignal.timeout(3200)})
      if(!response.ok)throw new Error('Brave Search unavailable')
      const data=await response.json()
      available=true
      for(const row of data.web?.results??[]) {
        const name=clean(row.title)
        if(!matches(name,'',query)||/\d\s*[x×*]\s*\d|(?:\d+\s*入|入組|箱購)/i.test(name))continue
        const sizes=[...new Set([...name.matchAll(new RegExp(volumePattern+'(?![a-z])','gi'))].map(m=>ml(m[1],m[2])).filter(x=>x!==null))]
        if(sizes.length===1)add(sizes[0],name,sourceLink(row.url),'Brave Search')
      }
    } catch {}
  }
  if(!available)throw new Error('容量查詢暫時無法連線或已逾時，仍可手動輸入。')
  const ranked=[...results.values()].sort((a,b)=>
    b.matches-a.matches || Number(standardSizes.has(b.suggestion.ml))-Number(standardSizes.has(a.suggestion.ml))
  )
  return {suggestions:ranked.slice(0,5).map(r=>r.suggestion)}
}
