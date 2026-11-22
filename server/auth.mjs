const encoder = new TextEncoder()
const name = 'barkeep_session'
const age = 30 * 86400
const LIMIT = 10
const WINDOW = 15 * 60 * 1000

const b64 = data => btoa(String.fromCharCode(...data)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const hash = async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))

function equal(a, b) {
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i] ?? 0)
  return diff === 0
}

async function sign(value, env) {
  const bytes = await hash(JSON.stringify([env.BAR_PASSWORD, env.SESSION_SECRET || '']))
  const key = await crypto.subtle.importKey('raw', bytes, {name:'HMAC', hash:'SHA-256'}, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return b64(new Uint8Array(signed))
}

export const passwordMode = env => env.BAR_PASSWORD ? 'password' : env.REQUIRE_BAR_PASSWORD === 'true' ? 'unconfigured' : 'managed'

export async function session(request, env, now = Date.now()) {
  const mode = passwordMode(env)
  if (mode !== 'password') return {mode, authenticated:mode === 'managed'}
  const token = request.headers.get('Cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1)
  const parts = token?.match(/^(\d{10,12})\.([\w-]{22})\.([\w-]{43})$/)
  if (!parts || Number(parts[1]) <= Math.floor(now/1000)) return {mode,authenticated:false}
  const signature = await sign(parts[1]+'.'+parts[2],env)
  if (!equal(encoder.encode(signature),encoder.encode(parts[3]))) return {mode,authenticated:false}
  const id=b64(await hash(parts[2]))
  const [sessions]=await env.DB.batch([
    env.DB.prepare('SELECT id FROM bar_sessions WHERE id=? AND expires_at>?').bind(id,Math.floor(now/1000))
  ])
  return {mode,authenticated:sessions.results.length===1,id}
}

function cookie(request, token, maxAge) {
  const https = new URL(request.url).protocol === 'https:'
  return name+'='+token+'; Path=/; Max-Age='+maxAge+'; HttpOnly; SameSite=Strict'+(https?'; Secure':'')
}

export async function login(request, env, password, client, now = Date.now()) {
  if (passwordMode(env) !== 'password') return {status:503,message:'尚未啟用密碼登入，請聯絡管理者。'}
  if (typeof password !== 'string' || !password || password.length > 512) return {status:400,message:'請輸入有效的工作區密碼。'}
  const identity = b64(await hash(client || 'unknown'))
  const [active] = await env.DB.batch([
    env.DB.prepare('SELECT attempts FROM login_attempts WHERE client=? AND window_started>?').bind(identity,now-WINDOW)
  ])
  if (active.results[0]?.attempts >= LIMIT) return {status:429,message:'嘗試次數過多，請在 15 分鐘後再試。'}
  const valid = equal(await hash(password),await hash(env.BAR_PASSWORD))
  if (!valid) {
    const [result] = await env.DB.batch([
      env.DB.prepare('INSERT INTO login_attempts (client,window_started,attempts) VALUES (?,?,1) ON CONFLICT(client) DO UPDATE SET attempts=CASE WHEN window_started<=? THEN 1 ELSE MIN(attempts+1,?) END,window_started=CASE WHEN window_started<=? THEN excluded.window_started ELSE window_started END RETURNING attempts')
        .bind(identity,now,now-WINDOW,LIMIT+1,now-WINDOW),
      env.DB.prepare('DELETE FROM login_attempts WHERE window_started<=?').bind(now-2*WINDOW)
    ])
    return result.results[0].attempts > LIMIT
      ? {status:429,message:'嘗試次數過多，請在 15 分鐘後再試。'}
      : {status:401,message:'密碼不正確，請確認後再試。'}
  }
  const nonce=b64(crypto.getRandomValues(new Uint8Array(16)))
  const expires=Math.floor(now/1000)+age
  const value=expires+'.'+nonce
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE client=?').bind(identity),
    env.DB.prepare('DELETE FROM bar_sessions WHERE expires_at<=?').bind(Math.floor(now/1000)),
    env.DB.prepare('INSERT INTO bar_sessions (id,expires_at) VALUES (?,?)').bind(b64(await hash(nonce)),expires)
  ])
  return {status:200,cookie:cookie(request,value+'.'+await sign(value,env),age)}
}

export async function logout(request,env,current) {
  if (current.authenticated&&current.id) await env.DB.batch([env.DB.prepare('DELETE FROM bar_sessions WHERE id=?').bind(current.id)])
  return cookie(request,'',0)
}
