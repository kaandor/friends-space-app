import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const STORE_KEY = 'friends-space:data'
const PRESENCE_KEY = 'friends-space:presence'
const PRESENCE_PRUNE_MS = 10 * 60_000
const FALLBACK_FILE = join(tmpdir(), 'friends-space', 'data.json')
const MAX_BODY_BYTES = 2_000_000
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 1500
const requestCounts = new Map()

// IDs raiz: contas com poder total de desenvolvedor (nao expostos no frontend).
// Aceita o userId OU o friendCode (ex.: "1YLUJFN6") da conta dona do Friends Space.
const ROOT_DEV_IDS = [
  '1YLUJFN6',
  'ca3f22cd-34d2-485b-9e21-4876d04e435c',
  // Admins promovidos pelo dono (por friendCode):
  '0XDEAD',
  '652OI4P1',
  'UQ3RQ3AR',
  'KIGS941H',
]

// Hierarquia: dev > support > verified. Soh dev e support acessam painel de
// moderacao; support faz apenas o que e do suporte; dev tem tudo.
function userIsRoot(user) {
  if (!user || typeof user !== 'object') return false
  const id = String(user.id || '')
  const code = normalizeFriendCode(user.friendCode)
  return ROOT_DEV_IDS.some((root) =>
    id === root || normalizeFriendCode(root) === code)
}

function userFlags(user) {
  const flags = user && typeof user === 'object' ? user.flags : null
  if (!flags || typeof flags !== 'object') return { dev: false, support: false, verified: false }
  return {
    dev: flags.dev === true || userIsRoot(user),
    support: flags.support === true,
    verified: flags.verified === true,
  }
}

function isDev(user) {
  return userIsRoot(user) || Boolean(user && user.flags && user.flags.dev === true)
}

function isSupport(user) {
  return isDev(user) || Boolean(user && user.flags && user.flags.support === true)
}

// Encontra um usuario no diretorio global pelo id.
function findGlobalUser(store, userId) {
  return getAllUsers(store).find((u) => u.id === userId) || null
}

const emptyData = () => ({
  users: [],
  servers: [],
  messages: [],
  friends: [],
  directMessages: [],
  callSessions: [],
})

const emptyStore = () => ({
  profiles: {},
  directory: {
    users: [],
    servers: [],
    friends: [],
    callSessions: [],
    callSignals: [],
    messages: [],
    directMessages: [],
    notifications: [],
    reports: [],
    unread: [],
    folders: [],
    stories: [],
    posts: [],
    wallPosts: [],
  },
})

const mergeById = (lists, current, extra) => {
  const map = new Map()
  for (const item of current) if (item && item.id) map.set(item.id, item)
  for (const item of extra) if (item && item.id && !map.has(item.id)) map.set(item.id, item)
  return Array.from(map.values())
}

const mergeStores = (current, extra) => {
  const base = current && typeof current === 'object' ? current : emptyStore()
  if (!extra || typeof extra !== 'object') return base
  const baseProfiles = base.profiles && typeof base.profiles === 'object' ? base.profiles : {}
  const extraProfiles = extra.profiles && typeof extra.profiles === 'object' ? extra.profiles : {}
  const profiles = { ...extraProfiles }
  for (const [pid, p] of Object.entries(baseProfiles)) {
    if (!p || typeof p !== 'object') continue
    if (!profiles[pid]) {
      profiles[pid] = p
      continue
    }
    const op = profiles[pid]
    const cp = p
    profiles[pid] = {
      users: mergeById([], cp.users || [], op.users || []),
      servers: mergeById([], cp.servers || [], op.servers || []),
      messages: mergeById([], cp.messages || [], op.messages || []),
      friends: mergeById([], cp.friends || [], op.friends || []),
      directMessages: mergeById([], cp.directMessages || [], op.directMessages || []),
      callSessions: mergeById([], cp.callSessions || [], op.callSessions || []),
      stories: mergeById([], cp.stories || [], op.stories || []),
      posts: mergeById([], cp.posts || [], op.posts || []),
      wallPosts: mergeById([], cp.wallPosts || [], op.wallPosts || []),
    }
  }
  const bd = base.directory && typeof base.directory === 'object' ? base.directory : {}
  const od = extra.directory && typeof extra.directory === 'object' ? extra.directory : {}
  const directory = {
    users: mergeById([], bd.users || [], od.users || []),
    servers: mergeById([], bd.servers || [], od.servers || []),
    friends: mergeById([], bd.friends || [], od.friends || []),
    callSessions: mergeById([], bd.callSessions || [], od.callSessions || []),
    callSignals: mergeById([], bd.callSignals || [], od.callSignals || []),
    messages: mergeById([], bd.messages || [], od.messages || []),
    directMessages: mergeById([], bd.directMessages || [], od.directMessages || []),
    notifications: mergeById([], bd.notifications || [], od.notifications || []),
    reports: mergeById([], bd.reports || [], od.reports || []),
    unread: mergeById([], bd.unread || [], od.unread || []),
    folders: mergeById([], bd.folders || [], od.folders || []),
    stories: mergeById([], bd.stories || [], od.stories || []),
    posts: mergeById([], bd.posts || [], od.posts || []),
    wallPosts: mergeById([], bd.wallPosts || [], od.wallPosts || []),
  }
  return { profiles, directory }
}

const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('access-control-allow-origin', res._corsOrigin || '*')
  res.setHeader('vary', 'Origin')
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type,authorization,cache-control,pragma')
  res.end(JSON.stringify(body))
}

const readBody = async (req) => {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      throw new Error('Arquivo ou mensagem muito grande')
    }
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim()

const isRateLimited = (req) => {
  const ip = clientIp(req)
  const nowMs = Date.now()
  const bucket = requestCounts.get(ip)
  if (!bucket || nowMs - bucket.startedAt > RATE_LIMIT_WINDOW) {
    requestCounts.set(ip, { count: 1, startedAt: nowMs })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT_MAX
}

const redisFetch = async (path, init) => {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    if (process.env.VERCEL) throw new Error('Banco online nao configurado: defina KV_REST_API_URL e KV_REST_API_TOKEN')
    return null
  }

  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!response.ok) {
    let detail = ''
    try {
      const text = await response.text()
      if (text) detail = text.slice(0, 300)
    } catch {}
    throw new Error(`KV request failed: ${response.status} ${detail}`)
  }
  return response.json()
}

const tursoEnv = () => ({
  url: process.env.TURSO_DATABASE_URL || process.env.TURSO_DB_URL || '',
  token: process.env.TURSO_AUTH_TOKEN || '',
})

const isTurso = () => {
  const { url, token } = tursoEnv()
  return Boolean((url && token) || isNeon())
}

const hasRemoteStorage = () => isTurso() || Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

let tursoSchemaReady = false

const tursoBaseUrl = () => {
  const raw = tursoEnv().url
  if (raw.startsWith('libsql://')) return `https://${raw.slice('libsql://'.length)}`
  return raw.startsWith('http') ? raw.replace(/^http:\/\//, 'https://') : `https://${raw}`
}

const tursoArg = (v) => {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'float', value: String(v) }
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' }
  return { type: 'text', value: String(v) }
}

// Driver Neon (Postgres sobre HTTP): entra em cena quando NEON_DATABASE_URL
// existe. O Neon tem regiao em Sao Paulo (aws-sa-east-1) — mais perto que o
// Turso nos EUA. O SQL do app e todo compativel (ja usa ON CONFLICT); so
// trocamos ? por $n e convertemos a resposta pro mesmo formato do Turso,
// entao nada mais no arquivo precisa saber qual banco esta ativo.
const neonEnv = () => ({ url: process.env.NEON_DATABASE_URL || '' })

// Driver ativo: "neon" liga o Neon (exige NEON_DATABASE_URL); qualquer outro
// valor (ou ausente) mantem o Turso. O Neon FREE estourou a cota de rede em
// 10/2026 (402 "exceeded the quota") e o Turso segue com os mesmos dados —
// basta trocar DB_DRIVER para voltar sem mexer no codigo.
const isNeon = () => Boolean(neonEnv().url) && process.env.DB_DRIVER === 'neon'

const neonTarget = () => {
  const raw = neonEnv().url
  const host = /@([^/]+)\//.exec(raw)?.[1] || ''
  if (!host) throw new Error('NEON_DATABASE_URL invalida')
  return { host, conn: raw }
}

const neonCell = (v) => {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'float', value: String(v) }
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' }
  return { type: 'text', value: String(v) }
}

const neonFetch = async (sql, args = []) => {
  const { host, conn } = neonTarget()
  let n = 0
  const query = sql.replace(/\?/g, () => `$${++n}`)
  const response = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Neon-Connection-String': conn,
      'Neon-Array-Mode': 'true',
      'Neon-Raw-Text-Output': 'true',
    },
    body: JSON.stringify({ query, params: args }),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const text = await response.text()
      if (text) detail = text.slice(0, 300)
    } catch {}
    throw new Error(`Neon request failed: ${response.status} ${detail}`)
  }
  const data = await response.json()
  const rows = Array.isArray(data?.rows)
    ? data.rows.map((r) => (Array.isArray(r) ? r.map(neonCell) : Object.values(r).map(neonCell)))
    : []
  return { rows, affected_row_count: Number(data?.rowCount || 0), rows_read: 0, rows_written: 0, query_duration_ms: 0 }
}

const tursoFetch = async (sql, args = []) => {
  if (isNeon()) return neonFetch(sql, args)
  const { token } = tursoEnv()
  const response = await fetch(`${tursoBaseUrl()}/v2/pipeline`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args.map(tursoArg) } },
        { type: 'close' },
      ],
    }),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const text = await response.text()
      if (text) detail = text.slice(0, 300)
    } catch {}
    throw new Error(`Turso request failed: ${response.status} ${detail}`)
  }
  const data = await response.json()
  const result = data?.results?.[0]
  if (!result) throw new Error('Turso: resposta vazia')
  if (result.type === 'error') {
    throw new Error(`Turso: ${result.error?.message || 'erro de banco'}`)
  }
  return result.response?.result || {}
}

const tursoPipeline = async (stmts) => {
  if (isNeon()) {
    for (const s of stmts) await neonFetch(s.sql, s.args)
    return []
  }
  const { token } = tursoEnv()
  const response = await fetch(`${tursoBaseUrl()}/v2/pipeline`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        ...stmts.map((s) => ({ type: 'execute', stmt: { sql: s.sql, args: (s.args || []).map(tursoArg) } })),
        { type: 'close' },
      ],
    }),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const text = await response.text()
      if (text) detail = text.slice(0, 300)
    } catch { }
    throw new Error(`Turso request failed: ${response.status} ${detail}`)
  }
  const data = await response.json()
  const erro = (data?.results || []).find((r) => r && r.type === 'error')
  if (erro) throw new Error(`Turso: ${erro?.error?.message || 'erro de banco'}`)
  return data.results || []
}

const ensureTursoSchema = async () => {
  if (tursoSchemaReady || !isTurso()) return
  // Todos os CREATE em UM pipeline HTTP: antes eram 9+ tursoFetch sequenciais
  // (~280ms cada nesta rede) pagos no cold start de toda request.
  // call_signals: o sendCallSignal é NO_LOCK_ACTIONS (sem lock global) e,
  // antes, escrevia no blob JSON do store — dois requests concorrentes
  // (answer + candidate) perdiam o answer => call presa em new/ice:new.
  // presence: 1 linha por usuario; heartbeat vira 1 único upsert SQL.
  await tursoPipeline([
    { sql: `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at BIGINT)` },
    { sql: `CREATE TABLE IF NOT EXISTS locks (key TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at BIGINT)` },
    { sql: `CREATE TABLE IF NOT EXISTS call_signals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_call_signals_inbox ON call_signals (session_id, to_user_id, created_at)` },
    { sql: `CREATE TABLE IF NOT EXISTS presence (user_id TEXT PRIMARY KEY, ts BIGINT NOT NULL)` },
    { sql: `CREATE TABLE IF NOT EXISTS ip_bans (ip TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at BIGINT NOT NULL)` },
    { sql: `CREATE TABLE IF NOT EXISTS device_bans (id TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at BIGINT NOT NULL)` },
    { sql: `CREATE TABLE IF NOT EXISTS rate_hits (k TEXT NOT NULL, ts BIGINT NOT NULL)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_rate_hits_k ON rate_hits (k, ts)` },
    { sql: `CREATE TABLE IF NOT EXISTS ip_events (ip TEXT NOT NULL, ts BIGINT NOT NULL, kind TEXT NOT NULL)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_ip_events_ip ON ip_events (ip, ts)` },
  ])
  tursoSchemaReady = true
}

const tursoGet = async (key) => {
  await ensureTursoSchema()
  const result = await tursoFetch(`SELECT value FROM kv WHERE key = ?`, [key])
  const rows = result.rows || []
  if (!rows.length) return null
  const cell = rows[0][0]
  return cell && typeof cell === 'object' && 'value' in cell ? cell.value : cell
}

// Quaisquer data URI de imagem acima desse tamanho e apagada ANTES de gravar no
// banco: parse/stringify do store acima de ~3MB estoura o orcamento de CPU do
// Workers free (10ms) por request, derrubando o site ("Failed to fetch").
const MAX_INLINE_DATA = 320_000
const HUGE_INLINE_RE = new RegExp(`data:image/[A-Za-z0-9.+-]+/[A-Za-z0-9+/=.;,:%_?&#-]{${MAX_INLINE_DATA},}`, 'g')
const stripHugeInline = (text) => {
  if (text.length <= MAX_INLINE_DATA) return text
  return text.replace(HUGE_INLINE_RE, '')
}

const tursoSet = async (key, value) => {
  await ensureTursoSchema()
  const text = stripHugeInline(typeof value === 'string' ? value : JSON.stringify(value))
  await tursoFetch(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, text, Date.now()],
  )
}

const tursoDel = async (key) => {
  await ensureTursoSchema()
  await tursoFetch(`DELETE FROM kv WHERE key = ?`, [key])
}

const tursoLock = async (key, token, ttlMs) => {
  await ensureTursoSchema()
  const nowMs = Date.now()
  const result = await tursoFetch(
    `INSERT INTO locks (key, token, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
     WHERE locks.expires_at < ?`,
    [key, token, nowMs + ttlMs, nowMs],
  )
  return Number(result.affected_row_count || 0) > 0
}

const tursoUnlock = async (key, token) => {
  await ensureTursoSchema()
  await tursoFetch(`DELETE FROM locks WHERE key = ? AND token = ?`, [key, token])
}

const kvGet = async (key) => {
  if (isTurso()) {
    const raw = await tursoGet(key)
    return raw == null ? null : decodeRedisStore(raw)
  }
  const kv = await redisFetch(`/get/${key}`)
  return kv ? decodeRedisStore(kv.result) : null
}

const kvSet = async (key, value) => {
  let text = typeof value === 'string' ? value : JSON.stringify(value)
  text = stripHugeInline(text)
  if (isTurso()) {
    await tursoSet(key, text)
    return true
  }
  const kv = await redisFetch(`/set/${key}`, { method: 'POST', body: JSON.stringify(text) })
  return kv !== null
}

const _kvDel = async (key) => {
  if (isTurso()) return tursoDel(key)
  await redisFetch(`/del/${key}`, { method: 'POST' })
}

// ---------------------------------------------------------------------------
// Push notifications (Web Push): assinaturas por usuario + envio.
// O navegador/Electron registra o service worker e assina com VAPID; o backend
// guarda a assinatura no KV/Turso e envia push quando alguem CHAMA o usuario
// (call DM) — assim a notificacao chega mesmo com o app fechado.
// ---------------------------------------------------------------------------
const PUSH_SUBS_KEY = 'friends-space:push-subs'
let webpush = null
try { webpush = createRequire(import.meta.url)('web-push') } catch { webpush = null }
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BHXAhzSnG8HBjv4epbJL6lbRxGNQ0TRBPq4NEToo5qOMI1Kq2jBIiQKf48Pl2JpuPvSGOm9W0Wm9ocxiv49a6z8'
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'HNw7vYoqvMrE4PH-TVvMINkVw2s2oPhWErKo-qp8qKg'
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:suporte@friends-space.app'
if (webpush && VAPID_PRIVATE_KEY) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) } catch { }
}

async function getPushSubs() {
  const raw = await kvGet(PUSH_SUBS_KEY)
  return (raw && typeof raw === 'object' && raw !== null) ? raw : {}
}

async function savePushSubs(map) {
  await kvSet(PUSH_SUBS_KEY, map)
}

// Fallback de noticias sem chave: RSS publico do Google Noticias (BR/pt).
// Usado quando NEWS_API_KEY nao existe (era o motivo de "as noticias sumiram"
// depois da migracao Vercel -> Workers) ou quando o provedor pago falha.
async function fetchNewsFromRss() {
  try {
    const r = await fetch('https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419', {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; FriendsSpace/1.0)' },
    })
    if (!r.ok) return []
    const xml = await r.text()
    const items = []
    for (const block of xml.split('<item>').slice(1, 21)) {
      const pick = (tag) => {
        const m = block.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>'))
        return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''
      }
      const title = pick('title')
      const link = pick('link')
      if (!title || !link) continue
      items.push({
        title: title.slice(0, 140),
        link: link.slice(0, 500),
        source: pick('source').slice(0, 60),
        pubDate: pick('pubDate').slice(0, 40),
        category: '',
        image: '',
      })
    }
    return items.slice(0, 10)
  } catch {
    return []
  }
}

async function sendPushToUser(userId, title, body, extra = {}) {
  if (!webpush) return
  try {
    const subs = await getPushSubs()
    const nowMs = Date.now()
    const list = (subs[userId] || []).filter((s) => {
      if (!s || !s.endpoint) return false
      // Assinatura vencida (expirationTime no passado) nao deve ser tentada:
      // endpoint morto retentado a cada chamada e sempre falha.
      if (s.expirationTime && Number(s.expirationTime) > 0 && Number(s.expirationTime) < nowMs) return false
      return true
    })
    if (!list.length) return
    const message = JSON.stringify({
      title,
      body,
      url: extra.url || '/',
      icon: extra.icon || '/Logo.png',
      badge: '/favicon.png',
      tag: extra.tag || `fs-${Date.now()}`,
      renotify: Boolean(extra.renotify),
    })
    const removed = []
    await Promise.all(list.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, message)
      } catch (err) {
        const code = err && err.statusCode
        // 404/410: assinatura nao existe mais. 403: chave invalida (permanente).
        if (code === 404 || code === 410 || code === 403) removed.push(sub.endpoint)
      }
    }))
    if (removed.length) {
      subs[userId] = list.filter((s) => !removed.includes(s.endpoint))
      await savePushSubs(subs)
    }
  } catch { }
}


const normalizeStore = (raw) => {
  if (!raw || typeof raw !== 'object') return emptyStore()

  if (raw.profiles) {
    const profiles = raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : {}
    const profileUsers = Object.values(profiles).flatMap((profile) => Array.isArray(profile?.users) ? profile.users : [])
    const directoryUsers = Array.isArray(raw.directory?.users) && raw.directory.users.length > 0 ? raw.directory.users : profileUsers
    const profileServers = Object.values(profiles).flatMap((profile) => Array.isArray(profile?.servers) ? profile.servers : [])
    const profileFriends = Object.values(profiles).flatMap((profile) => Array.isArray(profile?.friends) ? profile.friends : [])
    const profileCallSessions = Object.values(profiles).flatMap((profile) => Array.isArray(profile?.callSessions) ? profile.callSessions : [])
    const profileCallSignals = Object.values(profiles).flatMap((profile) => Array.isArray(profile?.callSignals) ? profile.callSignals : [])
    const profileMessages = Object.values(profiles).flatMap((profile) => Array.isArray(profile?.messages) ? profile.messages : [])
    const profileDirectMessages = Object.values(profiles).flatMap((profile) => Array.isArray(profile?.directMessages) ? profile.directMessages : [])
    return {
      profiles,
      directory: {
        users: directoryUsers,
        servers: Array.isArray(raw.directory?.servers) ? raw.directory.servers : profileServers,
        friends: Array.isArray(raw.directory?.friends) ? raw.directory.friends : profileFriends,
        callSessions: Array.isArray(raw.directory?.callSessions) ? raw.directory.callSessions : profileCallSessions,
        callSignals: Array.isArray(raw.directory?.callSignals) ? raw.directory.callSignals : profileCallSignals,
        messages: Array.isArray(raw.directory?.messages) ? raw.directory.messages : profileMessages,
        directMessages: Array.isArray(raw.directory?.directMessages) ? raw.directory.directMessages : profileDirectMessages,
        notifications: Array.isArray(raw.directory?.notifications) ? raw.directory.notifications : [],
        reports: Array.isArray(raw.directory?.reports) ? raw.directory.reports : [],
        unread: Array.isArray(raw.directory?.unread) ? raw.directory.unread : [],
        folders: Array.isArray(raw.directory?.folders) ? raw.directory.folders : [],
        stories: Array.isArray(raw.directory?.stories) ? raw.directory.stories : [],
        posts: Array.isArray(raw.directory?.posts) ? raw.directory.posts : [],
      },
    }
  }

  const legacyData = {
    users: Array.isArray(raw.users) ? raw.users : [],
    servers: Array.isArray(raw.servers) ? raw.servers : [],
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    friends: Array.isArray(raw.friends) ? raw.friends : [],
    directMessages: Array.isArray(raw.directMessages) ? raw.directMessages : [],
    callSessions: Array.isArray(raw.callSessions) ? raw.callSessions : [],
  }

  return {
    profiles: {
      default: legacyData,
    },
    directory: {
      users: legacyData.users,
      servers: legacyData.servers,
      friends: legacyData.friends,
      callSessions: legacyData.callSessions,
      callSignals: [],
      messages: legacyData.messages,
      directMessages: legacyData.directMessages,
      notifications: [],
      reports: [],
      unread: [],
      folders: [],
    },
  }
}

const decodeRedisStore = (result) => {
  if (!result) return emptyStore()
  let value = result
  for (let attempt = 0; attempt < 3 && typeof value === 'string'; attempt += 1) {
    try {
      value = JSON.parse(value)
    } catch {
      break
    }
  }
  return value
}

// TRAVA ANTI-WIPE: store sem nenhum usuário e nenhum servidor em lugar
// nenhum é degenerado — persistir isso apagaria o banco inteiro (foi o que
// aconteceu: um load falho + save subsequente zerou tudo).
const isDegenerateStore = (store) => {
  try {
    if (store?.directory) {
      if ((store.directory.users || []).length > 0) return false
      if ((store.directory.servers || []).length > 0) return false
    }
    const profs = store?.profiles && typeof store.profiles === 'object' ? Object.values(store.profiles) : []
    for (const pf of profs) {
      if (pf && (((pf.users || []).length > 0) || ((pf.servers || []).length > 0))) return false
    }
    return true
  } catch { return false }
}

const loadStore = async () => {
  let store = emptyStore()
  let readFailed = false
  // Retry: um timeout isolado do Turso/KV não pode virar store vazio.
  const attempts = hasRemoteStorage() ? 3 : 1
  for (let i = 0; i < attempts; i += 1) {
    try {
      const value = await kvGet(STORE_KEY)
      if (value) store = normalizeStore(value)
      readFailed = false
      break
    } catch {
      readFailed = true
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  if (readFailed || !hasRemoteStorage()) {
    try {
      const raw = await readFile(FALLBACK_FILE, 'utf8')
      store = normalizeStore(JSON.parse(raw))
      readFailed = false
    } catch {}
  }
  // Banco remoto configurado mas ilegível: FALHA (503, sem save) em vez de
  // devolver vazio — devolver vazio + save = wipe total.
  if (readFailed && hasRemoteStorage()) throw new Error('Banco indisponível. Tente novamente.')
  await ensurePresence()
  return applyPresence(store, presenceCache)
}

const saveStore = async (store) => {
  if (isDegenerateStore(store)) {
    console.warn('[store] save BLOQUEADO: store degenerado (possível load falho)')
    return false
  }
  await kvSet(STORE_KEY, store)
  if (!hasRemoteStorage()) {
    await mkdir(dirname(FALLBACK_FILE), { recursive: true })
    await writeFile(FALLBACK_FILE, JSON.stringify(store, null, 2))
  }
}

let presenceCache = {}

const loadPresence = async () => {
  // Fast-path: 1 SELECT em linhas (tabela presence). Fallback: blob do kv.
  try {
    const result = await tursoFetch(`SELECT user_id, ts FROM presence`)
    const rows = result.rows || []
    const out = {}
    for (const row of rows) {
      const get = (i) => (row[i] && typeof row[i] === 'object' && 'value' in row[i] ? row[i].value : row[i])
      const uid = String(get(0) || '')
      const ts = Number(get(1) || 0)
      if (uid && ts > 0) out[uid] = ts
    }
    if (rows.length) return out
  } catch {
    // tabela ausente (schema antigo): usa o blob de presença
  }
  try {
    const value = await kvGet(PRESENCE_KEY)
    if (value && typeof value === 'object') return value
  } catch {
    // presença indisponível: segue com o que estiver em memória
  }
  return {}
}

const applyPresence = (store, presence) => {
  if (!presence || typeof presence !== 'object') return store
  for (const [uid, ts] of Object.entries(presence)) {
    if (typeof ts !== 'number') continue
    const user = (store.directory?.users || []).find((u) => u && u.id === uid)
    if (user && (!user.lastSeenAt || ts > user.lastSeenAt)) user.lastSeenAt = ts
    for (const profile of Object.values(store.profiles || {})) {
      const list = Array.isArray(profile?.users) ? profile.users : []
      const pu = list.find((u) => u && u.id === uid)
      if (pu && (!pu.lastSeenAt || ts > pu.lastSeenAt)) pu.lastSeenAt = ts
    }
  }
  return store
}

// Contagem de membros online por servidor para o Descubra. Usa o mesmo
// criterio do cliente (heartbeat recente = lastSeenAt fresco) e ignora contas
// com status invisivel.
const ONLINE_WINDOW_MS = 45000
const onlineCountOf = (store, members) => {
  if (!Array.isArray(members) || members.length === 0) return 0
  const ids = new Set(members)
  let count = 0
  for (const u of getAllUsers(store)) {
    if (!u || !u.id || !ids.has(u.id)) continue
    if (u.settings && u.settings.status === 'invisible') continue
    if (u.lastSeenAt && Date.now() - u.lastSeenAt < ONLINE_WINDOW_MS) count++
  }
  return count
}

let presenceLoadedAt = 0
const ensurePresence = async () => {
  // Cache de 10s: antes era carregado UMA vez por instância quente e ficava
  // velho para sempre — todo mundo aparecia offline mesmo com heartbeat ok.
  if (!Object.keys(presenceCache).length || Date.now() - presenceLoadedAt > 10000) {
    presenceCache = await loadPresence()
    presenceLoadedAt = Date.now()
  }
  return presenceCache
}

const LOCK_KEY = `${STORE_KEY}:lock`
const LOCK_TTL_SECONDS = 10

let _lastLockError = null

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const acquireLock = async () => {
  if (!hasRemoteStorage()) return true
  const deadline = Date.now() + 5000
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  _lastLockError = null
  if (isTurso()) {
    while (Date.now() < deadline) {
      try {
        if (await tursoLock(LOCK_KEY, token, LOCK_TTL_SECONDS * 1000)) return token
      } catch (error) {
        _lastLockError = `Turso lock err=${error instanceof Error ? error.message : String(error)}`
      }
      await sleep(120)
    }
    return false
  }
  while (Date.now() < deadline) {
    try {
      const res = await redisFetch(`/set/${LOCK_KEY}?NX=true&EX=${LOCK_TTL_SECONDS}`, {
        method: 'POST',
        body: JSON.stringify('1'),
      })
      const raw = Array.isArray(res) ? res[0] : res
      const value = raw && typeof raw === 'object' ? raw.result : raw
      _lastLockError = `SET resp=${JSON.stringify(res)}`
      if (value === 'OK' || value === 1 || value === '1') return token
    } catch (error) {
      _lastLockError = `SET err=${error instanceof Error ? error.message : String(error)}`
    }
    await sleep(120)
  }
  return false
}

const releaseLock = async (token) => {
  if (isTurso()) {
    if (token) await tursoUnlock(LOCK_KEY, token)
    return
  }
  try {
    await redisFetch(`/del/${LOCK_KEY}`, { method: 'POST' })
  } catch {
    // lock expira sozinho pelo TTL
  }
}

const id = () => crypto.randomUUID()
const now = () => Date.now()

const sha256HexLocal = async (input) => {
  try {
    const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return Array.from(new Uint8Array(data)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return Array.from(input).reduce((acc, ch) => acc + (ch.charCodeAt(0) || 0), 0).toString(36)
  }
}
const normalizeFriendCode = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

// injeta flags de hierarquia derivadas (dev raiz) em copias, sem mutar o store
const withPublicFlags = (user) => {
  if (!user || typeof user !== 'object') return user
  const root = userIsRoot(user)
  const dev = root || user.flags?.dev === true
  const support = root || user.flags?.support === true
  const verified = user.flags?.verified === true
  if (!dev && !support && !verified) return user
  return {
    ...user,
    flags: { ...(user.flags || {}), dev, support, verified },
  }
}

const withPublicUsers = (users) => (Array.isArray(users) ? users.map(withPublicFlags) : users)

const getAllUsers = (store) => {
  const fromProfiles = Object.values(store.profiles || {}).flatMap((profile) => profile.users || [])
  const fromDirectory = Array.isArray(store.directory?.users) ? store.directory.users : []
  const unique = new Map()
  for (const user of [...fromDirectory, ...fromProfiles]) {
    if (user?.id && !unique.has(user.id)) {
      unique.set(user.id, user)
    }
  }
  return withPublicUsers([...unique.values()])
}

const getAllServers = (store) => {
  const fromProfiles = Object.values(store.profiles || {}).flatMap((profile) => profile.servers || [])
  const fromDirectory = Array.isArray(store.directory?.servers) ? store.directory.servers : []
  const unique = new Map()
  for (const server of [...fromDirectory, ...fromProfiles]) {
    if (server?.id && !unique.has(server.id)) unique.set(server.id, server)
  }
  return [...unique.values()]
}

const getAllFriends = (store) => {
  const fromProfiles = Object.values(store.profiles || {}).flatMap((profile) => profile.friends || [])
  const fromDirectory = Array.isArray(store.directory?.friends) ? store.directory.friends : []
  const unique = new Map()
  for (const friend of [...fromDirectory, ...fromProfiles]) {
    if (friend?.id && !unique.has(friend.id)) unique.set(friend.id, friend)
  }
  return [...unique.values()]
}

const getAllWallPosts = (store) => {
  const fromProfiles = Object.values(store.profiles || {}).flatMap((profile) => profile.wallPosts || [])
  const fromDirectory = Array.isArray(store.directory?.wallPosts) ? store.directory.wallPosts : []
  const unique = new Map()
  for (const item of [...fromDirectory, ...fromProfiles]) {
    if (item?.id && !unique.has(item.id)) unique.set(item.id, item)
  }
  return [...unique.values()]
}

const getAllCallSessions = (store) => {
  const fromProfiles = Object.values(store.profiles || {}).flatMap((profile) => profile.callSessions || [])
  const fromDirectory = Array.isArray(store.directory?.callSessions) ? store.directory.callSessions : []
  const unique = new Map()
  for (const session of [...fromDirectory, ...fromProfiles]) {
    if (session?.id && !unique.has(session.id)) unique.set(session.id, session)
  }
  return [...unique.values()]
}

const CALL_SYNC_GRACE_MS = 35_000
const CALL_LEAVE_TOMBSTONE_MS = 90_000
// Convite toca por 30s. Depois disso o convidado nao entra mais por ele (o
// chamador tambem para de esperar e avisa "nao quis entrar").
const CALL_INVITE_TTL_MS = 30_000
const CALL_INVITE_DECLINE_TTL_MS = 120_000
const CALL_LEGACY_OFFLINE_MS = 60_000
const hasStaleStamp = (stamps, id, staleThreshold) => {
  const stamp = Number(stamps[id] || 0)
  return stamp > 0 && stamp < staleThreshold
}
const isOffline = (users, id, offlineThreshold) =>
  !users.some((u) => u.id === id && Number(u.lastSeenAt || 0) > offlineThreshold)
const cleanupCallSessions = (store, at = now()) => {
  const users = getAllUsers(store)
  const staleThreshold = at - CALL_SYNC_GRACE_MS
  const offlineThreshold = at - CALL_LEGACY_OFFLINE_MS
  const inviteThreshold = at - CALL_INVITE_TTL_MS
  const declineThreshold = at - CALL_INVITE_DECLINE_TTL_MS
  for (const session of getAllCallSessions(store)) {
    if (!session.active) continue
    const stamps = { ...(session.participantLastSync || {}) }
    let changed = false
    const kept = (session.participantIds || []).filter((id) => {
      if (hasStaleStamp(stamps, id, staleThreshold)) {
        changed = true
        return false
      }
      if (!stamps[id] && isOffline(users, id, offlineThreshold)) {
        changed = true
        return false
      }
      return true
    })
    for (const id of session.participantIds || []) {
      if (!kept.includes(id) && stamps[id]) {
        delete stamps[id]
        changed = true
      }
    }
    const invitedAt = { ...(session.invitedAt || {}) }
    const invitedBy = { ...(session.invitedBy || {}) }
    for (const id of Object.keys(invitedAt)) {
      if (Number(invitedAt[id] || 0) <= inviteThreshold) {
        delete invitedAt[id]
        delete invitedBy[id]
        changed = true
      }
    }
    const declinedAt = { ...(session.declinedAt || {}) }
    for (const id of Object.keys(declinedAt)) {
      if (Number(declinedAt[id] || 0) <= declineThreshold) {
        delete declinedAt[id]
        changed = true
      }
    }
    let screen = String(session.screenSharingUserId || '')
    if (screen && !kept.includes(screen)) {
      screen = ''
      changed = true
    }
    let stillActive = session.active
    if (kept.length === 0 && stillActive) {
      stillActive = false
      changed = true
    }
    if (changed) {
      upsertGlobalCallSession(store, {
        ...session,
        participantIds: kept,
        participantLastSync: stamps,
        invitedAt,
        invitedBy,
        declinedAt,
        screenSharingUserId: screen,
        active: stillActive,
        updatedAt: at,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Manutencao automatica: contas inativas, servidores sem dono, calls vazias.
// Roda sozinha a cada 6h (best-effort).
// ---------------------------------------------------------------------------
const MAINTENANCE_KEY = 'friends-space:maintenance-last-run'
const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000
const ACCOUNT_INACTIVE_MS = 90 * 24 * 60 * 60 * 1000 // 90 dias sem login

const removeUserEverywhere = (store, userId) => {
  if (store.directory) {
    // 'friends' tem a estrutura {id, userId, friendId}: o filtro por item.id
    // (id da amizade) NUNCA remove a amizade do usuario apagado — precisa
    // checar userId/friendId. 'users' e 'servers' usam id como identidade.
    if (Array.isArray(store.directory.friends)) {
      store.directory.friends = store.directory.friends.filter((f) => !f || (f.userId !== userId && f.friendId !== userId))
    }
    for (const field of ['users', 'servers']) {
      if (Array.isArray(store.directory[field])) {
        store.directory[field] = store.directory[field].filter((item) => !item || item.id !== userId)
      }
    }
    if (Array.isArray(store.directory.friendRequests)) {
      store.directory.friendRequests = store.directory.friendRequests.filter((r) => r && r.fromId !== userId && r.toId !== userId)
    }
    if (Array.isArray(store.directory.callSessions)) {
      store.directory.callSessions = store.directory.callSessions.map((s) => (s && Array.isArray(s.participantIds) ? { ...s, participantIds: s.participantIds.filter((id) => id !== userId) } : s))
    }
  }
  for (const profile of Object.values(store.profiles || {})) {
    if (!profile) continue
    if (Array.isArray(profile.users)) profile.users = profile.users.filter((u) => !u || u.id !== userId)
    if (Array.isArray(profile.friends)) profile.friends = profile.friends.filter((f) => !f || (f.userId !== userId && f.friendId !== userId))
    if (Array.isArray(profile.friendRequests)) profile.friendRequests = profile.friendRequests.filter((r) => r && r.fromId !== userId && r.toId !== userId)
    if (Array.isArray(profile.servers)) {
      profile.servers = profile.servers.map((s) => (s && Array.isArray(s.members) ? {
        ...s,
        members: s.members.filter((m) => m !== userId),
        staffMemberIds: (s.staffMemberIds || []).filter((m) => m !== userId),
      } : s))
    }
    if (Array.isArray(profile.callSessions)) {
      profile.callSessions = profile.callSessions.map((s) => (s && Array.isArray(s.participantIds) ? { ...s, participantIds: s.participantIds.filter((id) => id !== userId) } : s))
    }
  }
}

const runMaintenance = (store, at = now()) => {
  const results = { removedInactiveUsers: [], orphanServersDeleted: [], orphanServersTransferred: [], emptyCallsClosed: 0 }
  if (isDegenerateStore(store)) return { ...results, skipped: true }
  const users = getAllUsers(store)
  const userMap = new Map(users.map((u) => [u.id, u]))
  // 0) SEM PURGE de nao-aprovados: conta de gente de verdade nao se apaga
  // sozinha. Remocao apenas manual (banUser/rejectUser) pelos devs.
  // 1) Contas sem login ha mais de 90 dias (nunca apaga dev/support/guest).
  const inactiveCutoff = at - ACCOUNT_INACTIVE_MS
  for (const user of users) {
    if (!user || !user.id) continue
    if (user.id === 'guest' || user.authProvider === 'guest') continue
    if (user.flags && (user.flags.dev || user.flags.support)) continue
    const last = Number(user.lastSeenAt || user.createdAt || 0)
    if (last > 0 && last < inactiveCutoff) {
      removeUserEverywhere(store, user.id)
      results.removedInactiveUsers.push(user.id)
    }
  }
  // 2) Servidores sem dono: transfere para staff/membro vivo; NUNCA apaga
  // servidor que tenha QUALQUER membro (mesmo id desconhecido — pode ser
  // deriva de identidade, e apagar destruiria comunidades reais). So apaga
  // servidor sem dono E sem nenhum membro.
  for (const server of getAllServers(store)) {
    if (!server || !server.id) continue
    if (userMap.has(server.ownerId)) continue
    const members = (Array.isArray(server.members) ? server.members : []).filter((m) => userMap.has(m))
    const staff = (Array.isArray(server.staffMemberIds) ? server.staffMemberIds : []).filter((m) => userMap.has(m))
    const rawMembers = Array.isArray(server.members) ? server.members : []
    const nextOwner = staff[0] || members[0] || rawMembers[0]
    if (nextOwner) {
      const updated = { ...server, ownerId: nextOwner, staffMemberIds: staff.length ? staff : [nextOwner] }
      upsertGlobalItem(store, 'servers', updated)
      for (const profile of Object.values(store.profiles || {})) {
        if (profile && Array.isArray(profile.servers)) {
          const i = profile.servers.findIndex((s) => s && s.id === server.id)
          if (i !== -1) profile.servers[i] = updated
        }
      }
      results.orphanServersTransferred.push(`${server.id}->${nextOwner}`)
    } else if (rawMembers.length === 0) {
      if (store.directory && Array.isArray(store.directory.servers)) {
        store.directory.servers = store.directory.servers.filter((s) => !s || s.id !== server.id)
      }
      for (const profile of Object.values(store.profiles || {})) {
        if (profile && Array.isArray(profile.servers)) profile.servers = profile.servers.filter((s) => !s || s.id !== server.id)
      }
      results.orphanServersDeleted.push(server.id)
    } else {
      // Tem membros mas nenhum conhecido: transfere ao primeiro mesmo assim
      // (melhor que apagar). Auditoria registra a transferência.
      const updated = { ...server, ownerId: rawMembers[0], staffMemberIds: [rawMembers[0]] }
      upsertGlobalItem(store, 'servers', updated)
      for (const profile of Object.values(store.profiles || {})) {
        if (profile && Array.isArray(profile.servers)) {
          const i = profile.servers.findIndex((s) => s && s.id === server.id)
          if (i !== -1) profile.servers[i] = updated
        }
      }
      results.orphanServersTransferred.push(`${server.id}->${rawMembers[0]}`)
    }
  }
  // 3) Calls vazias / participantes fantasmas (DM encerra; servidor limpa membros).
  const before = getAllCallSessions(store).filter((s) => s && s.active).length
  cleanupCallSessions(store, at)
  const after = getAllCallSessions(store).filter((s) => s && s.active).length
  results.emptyCallsClosed = Math.max(0, before - after)
  return results
}

const maybeRunMaintenance = async (store) => {
  try {
    const last = await kvGet(MAINTENANCE_KEY)
    const lastNum = typeof last === 'number' ? last : (typeof last === 'string' ? Number(last) : 0)
    if (lastNum && now() - lastNum < MAINTENANCE_INTERVAL_MS) return null
    const results = runMaintenance(store, now())
    await kvSet(MAINTENANCE_KEY, now())
    return results
  } catch {
    return null
  }
}

const getAllCallSignals = (store) => {
  const signals = Array.isArray(store.directory?.callSignals) ? store.directory.callSignals : []
  const cutoff = now() - 120_000
  return signals.filter((signal) => Number(signal.createdAt || 0) >= cutoff)
}

const getAllMessages = (store) => {
  const fromProfiles = Object.values(store.profiles || {}).flatMap((profile) => profile.messages || [])
  const fromDirectory = Array.isArray(store.directory?.messages) ? store.directory.messages : []
  const unique = new Map()
  for (const message of [...fromDirectory, ...fromProfiles]) if (message?.id && !unique.has(message.id)) unique.set(message.id, message)
  return [...unique.values()]
}

const getAllDirectMessages = (store) => {
  const fromProfiles = Object.values(store.profiles || {}).flatMap((profile) => profile.directMessages || [])
  const fromDirectory = Array.isArray(store.directory?.directMessages) ? store.directory.directMessages : []
  const unique = new Map()
  for (const message of [...fromDirectory, ...fromProfiles]) if (message?.id && !unique.has(message.id)) unique.set(message.id, message)
  return [...unique.values()]
}

const upsertGlobalUser = (store, user) => {
  if (!store.directory) store.directory = { users: [], servers: [], friends: [], callSessions: [] }
  const nextUsers = Array.isArray(store.directory.users) ? [...store.directory.users] : []
  const index = nextUsers.findIndex((item) => item.id === user.id)
  if (index === -1) {
    nextUsers.push(user)
  } else {
    nextUsers[index] = user
  }
  store.directory.users = nextUsers
}

// ID fixo do usuário (friendCode): contas antigas nasceram sem código e nada
// preenchia depois — busca por código e convite falhavam. Garante 1x e
// persiste; depois disso o código nunca muda.
const ensureFriendCode = (store, data, user) => {
  if (!user || user.friendCode) return user
  user.friendCode = makeCode(getAllUsers(store).concat(data.users || []), 'friendCode')
  try {
    const idx = (data.users || []).findIndex((u) => u && u.id === user.id)
    if (idx !== -1) data.users[idx] = user
  } catch { }
  try { upsertGlobalUser(store, user) } catch { }
  try { if (typeof writeUserEverywhere === 'function') writeUserEverywhere(store, data, user) } catch { }
  return user
}

const upsertGlobalServer = (store, server) => {
  if (!store.directory) store.directory = { users: [], servers: [], friends: [] }
  const servers = Array.isArray(store.directory.servers) ? [...store.directory.servers] : []
  const index = servers.findIndex((item) => item.id === server.id)
  if (index === -1) servers.push(server)
  else servers[index] = server
  store.directory.servers = servers
}

// Onboarding conta nova: lobby público garantido + entrada automática +
// seed do feed oficial. Tudo idempotente (flags no store).
const ensureLobbyServer = (store, data) => {
  const servers = getAllServers(store)
  const ok = servers.find((s) => s && (!s.settings || !s.settings.toggles || s.settings.toggles.public !== false)
    && Array.isArray(s.channels) && s.channels.some((c) => c && c.type === 'voice')
    && (s.members || []).length < 50)
  if (ok) return ok
  if (data.lobbySeeded) return servers.find((s) => s && s.id === data.lobbySeeded) || null
  const serverId = id()
  const lobby = {
    id: serverId,
    name: 'Praça Central',
    category: 'Comunidade',
    photoUrl: '',
    bannerUrl: '',
    description: 'Ponto de encontro público: entre na call, transmita e faça amigos.',
    accentColor: '#00ff88',
    ownerId: 'system',
    inviteCode: makeCode(getAllServers(store), 'inviteCode'),
    createdAt: now(),
    members: [],
    channels: [
      { id: id(), name: 'geral', type: 'text', serverId },
      { id: id(), name: 'Call', type: 'voice', serverId },
    ],
    roles: [{ id: id(), name: 'Admin', color: '#00ff88', serverId, permissions: ['all'] }],
    categories: [],
    events: [],
    settings: { themes: ['Comunidade'], frequency: '', minAge: '', moderation: 'Médio', toggles: { public: true, verification: false, welcome: true, log: false, rules: false } },
    callAccess: 'public',
    callPassword: '',
    staffMemberIds: [],
    verified: true,
  }
  data.servers.push(lobby)
  upsertGlobalServer(store, lobby)
  data.lobbySeeded = serverId
  return lobby
}

const seedOfficialFeed = (store, data) => {
  if (data.feedSeeded) return
  let official = getAllUsers(store).find((u) => u && u.flags && u.flags.official)
  if (!official) {
    official = { id: id(), friendCode: 'FS-OFICIAL', name: 'Friends Space', bio: 'Conta oficial', photoUrl: '', bannerUrl: '', accentColor: '#00ff88', status: '', createdAt: now(), lastSeenAt: now(), flags: { official: true } }
    data.users.push(official)
    upsertGlobalUser(store, official)
  }
  if (!Array.isArray(data.posts)) data.posts = []
  const mk = (content) => ({
    id: id(), authorId: official.id, authorKind: 'user', content, poll: null,
    location: '', scheduledFor: 0, promoted: false, mediaUrl: '', type: 'image',
    linkUrl: '', linkTitle: '', linkImage: '', linkDescription: '', embedType: 'generic',
    hashtags: ['boasvindas'], likes: [], reposts: [], reports: 0, reportedBy: [], comments: [], createdAt: now(),
  })
  data.posts.push(mk('Bem-vindo ao Friends Space! Entre na Praça Central, abra a call e transmita sua tela. #boasvindas'))
  data.posts.push(mk('Novo por aqui? Use o Descobrir para achar servidores públicos, peça amizades e chame todo mundo para a call. #boasvindas'))
  data.posts.sort((a, b) => b.createdAt - a.createdAt)
  for (const p of data.posts.slice(0, 2)) { try { savePostEverywhere(store, data, p) } catch { } }
  data.feedSeeded = true
}

const onboardNewUser = (store, data, user) => {
  try { seedOfficialFeed(store, data) } catch { }
  if (!user || user.welcomed) return null
  const hasServers = memberServerIdsOf(store, user.id).length > 0
  if (hasServers) { user.welcomed = true; return null }
  const lobby = ensureLobbyServer(store, data)
  if (!lobby) return null
  if (!Array.isArray(lobby.members)) lobby.members = []
  if (!lobby.members.includes(user.id) && lobby.members.length < 50) {
    lobby.members.push(user.id)
    upsertGlobalServer(store, lobby)
  }
  user.welcomed = true
  return lobby
}

const upsertGlobalFriend = (store, friend) => {
  if (!store.directory) store.directory = { users: [], servers: [], friends: [] }
  const friends = Array.isArray(store.directory.friends) ? [...store.directory.friends] : []
  const index = friends.findIndex((item) => item.id === friend.id)
  if (index === -1) friends.push(friend)
  else friends[index] = friend
  store.directory.friends = friends
}

const upsertGlobalCallSession = (store, session) => {
  if (!store.directory) store.directory = { users: [], servers: [], friends: [], callSessions: [] }
  const sessions = Array.isArray(store.directory.callSessions) ? [...store.directory.callSessions] : []
  const index = sessions.findIndex((item) => item.id === session.id)
  if (index === -1) sessions.push(session)
  else sessions[index] = session
  store.directory.callSessions = sessions
}

const upsertGlobalItem = (store, field, item) => {
  if (!store.directory) store.directory = { users: [], servers: [], friends: [], callSessions: [], callSignals: [], messages: [], directMessages: [] }
  const items = Array.isArray(store.directory[field]) ? [...store.directory[field]] : []
  const index = items.findIndex((entry) => entry.id === item.id)
  if (index === -1) items.push(item)
  else items[index] = item
  store.directory[field] = items
}

const getAllReports = (store) => Array.isArray(store.directory?.reports) ? store.directory.reports : []

const getAllFolders = (store) => Array.isArray(store.directory?.folders) ? store.directory.folders : []

const getAllUnread = (store) => Array.isArray(store.directory?.unread) ? store.directory.unread : []

const unreadList = (store) => {
  if (!store.directory) store.directory = { users: [], servers: [], friends: [], callSessions: [], callSignals: [], messages: [], directMessages: [], notifications: [], reports: [], unread: [] }
  if (!Array.isArray(store.directory.unread)) store.directory.unread = []
  return store.directory.unread
}

const bumpUnread = (store, userId, channelId) => {
  const list = unreadList(store)
  const record = list.find((item) => item.userId === userId && item.channelId === channelId)
  if (record) record.count = (Number(record.count) || 0) + 1
  else list.push({ id: id(), userId, channelId, count: 1 })
}

const clearUnread = (store, userId, channelId) => {
  store.directory.unread = unreadList(store).filter((item) => !(item.userId === userId && item.channelId === channelId))
}

const ensureUnread = (store, userId, channelId) => {
  const list = unreadList(store)
  const record = list.find((item) => item.userId === userId && item.channelId === channelId)
  if (record) record.count = Math.max(1, Number(record.count) || 0)
  else list.push({ id: id(), userId, channelId, count: 1 })
}

const unreadMapFor = (store, userId) => {
  const map = {}
  for (const item of getAllUnread(store)) {
    if (item.userId !== userId) continue
    map[item.channelId] = Math.max(0, Number(item.count) || 0)
  }
  return map
}

const makeCode = (items, field, size = 8) => {
  let code = ''
  do {
    code = Math.random().toString(36).slice(2, 2 + size).toUpperCase()
  } while (items.some((item) => normalizeFriendCode(item[field]) === normalizeFriendCode(code)))
  return code
}

// Vigia da call (o servidor enxerga a saude): a partir das visoes que cada
// participante envia no sync (peerViews), calcula quem esta demorando para
// conectar, se a call esta ruim e para quem a tela nao esta chegando.
// Tudo best-effort e barato (mapas pequenos, sem I/O extra).
const sessionWatch = (session) => {
  const watch = { slowPeerIds: [], screenMissingFor: [], unhealthy: false, at: 0 }
  try {
    const t = now()
    watch.at = t
    const views = (session && session.peerViews) || {}
    const stamps = (session && session.participantLastSync) || {}
    const ids = (session && session.participantIds) || []
    const sharer = String((session && session.screenSharingUserId) || '')
    for (const id of ids) {
      const last = Number(stamps[id] || 0)
      const joinedAgo = t - last
      // Sem sync ha >20s mas ainda listado: demorando para conectar (ou caiu
      // e o stamp de 35s ainda nao o removeu). Recem-chegados (<8s) nao contam.
      if (last > 0 && joinedAgo > 20000) watch.slowPeerIds.push(id)
    }
    if (sharer) {
      for (const id of ids) {
        if (id === sharer) continue
        const v = views[id]
        if (!v || t - Number(v.at || 0) > 30000) continue
        const stats = v.stats || {}
        // Visao fresca mas sem trilha da tela do sharer = tela nao entregue.
        const gotScreen = Object.entries(stats).some(([pid, st]) => String(pid) === String(sharer) && st && (st.screen === true || Number(st.screenTracks || 0) > 0))
        if (!gotScreen) watch.screenMissingFor.push(id)
      }
    }
    watch.unhealthy = watch.slowPeerIds.length > 0 || watch.screenMissingFor.length > 0
  } catch { }
  return watch
}

const acceptedFriendUsers = (store, data, userId) => {
  const friendIds = getAllFriends(store)
    .filter((friend) => friend.status === 'accepted' && (friend.userId === userId || friend.friendId === userId))
    .map((friend) => friend.userId === userId ? friend.friendId : friend.userId)
  return getAllUsers(store).filter((user) => friendIds.includes(user.id))
}

const acceptedFriendIds = (store, userId) => getAllFriends(store)
  .filter((friend) => friend.status === 'accepted' && (friend.userId === userId || friend.friendId === userId))
  .map((friend) => friend.userId === userId ? friend.friendId : friend.userId)

const userSettingsOf = (store, userId) => {
  const user = getAllUsers(store).find((u) => u && u.id === userId)
  return user?.settings && typeof user.settings === 'object' ? user.settings : {}
}

// Chave de configuracao (privacidade) que liga/desliga cada tipo de aviso.
const NOTIF_SETTING_BY_TYPE = {
  dm: 'notifDm',
  mention: 'notifMentions',
  'server-message': 'notifServerMessages',
  'server-event': 'notifServerEvents',
  'call-invite': 'notifCallInvites',
  'call-invite-response': 'notifCallInvites',
  'call-join': 'notifFriendAlerts',
  'call-leave': 'notifFriendAlerts',
  'screen-start': 'notifFriendAlerts',
  'screen-stop': 'notifFriendAlerts',
  'participant-add': 'notifFriendAlerts',
  'friend-request': 'notifFriendAlerts',
  online: 'notifFriendAlerts',
  status: 'notifFriendAlerts',
  astro: 'notifFriendAlerts',
  'astro-gift': 'notifFriendAlerts',
}

const notifEnabled = (store, userId, key, fallback = true) => {
  const value = userSettingsOf(store, userId)[key]
  return value === undefined ? fallback : Boolean(value)
}

// Deteccao simples de mencao: "@codigo" ou "@nome" (case-insensitive).
const userMentionedIn = (store, userId, content) => {
  const text = String(content || '')
  if (!text || !text.includes('@')) return false
  const user = getAllUsers(store).find((u) => u && u.id === userId)
  if (!user) return false
  const lower = text.toLowerCase()
  return [user.friendCode, user.name]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .some((candidate) => candidate && lower.includes('@' + candidate))
}

const addNotification = (store, n) => {
  if (!store.directory) store.directory = { users: [], servers: [], friends: [], callSessions: [], notifications: [] }
  if (!Array.isArray(store.directory.notifications)) store.directory.notifications = []
  const toUserId = String(n.toUserId || '')
  const fromUserId = String(n.fromUserId || '')
  if (!toUserId || !fromUserId || toUserId === fromUserId) return null
  const type = String(n.type || 'system')
  const settingKey = NOTIF_SETTING_BY_TYPE[type]
  if (settingKey && !notifEnabled(store, toUserId, settingKey)) return null
  const notification = {
    id: id(),
    toUserId,
    fromUserId,
    fromName: String(n.fromName || ''),
    fromPhoto: String(n.fromPhoto || ''),
    type,
    title: String(n.title || ''),
    body: n.body == null ? '' : String(n.body),
    data: n.data || {},
    read: false,
    createdAt: now(),
  }
  store.directory.notifications.push(notification)
  if (store.directory.notifications.length > 400) {
    store.directory.notifications = store.directory.notifications.slice(-400)
  }
  return notification
}

const getChannelLabel = (store, serverId, channelId) => {
  const server = getAllServers(store).find((s) => s && s.id === serverId)
  const channel = server?.channels && Array.isArray(server.channels)
    ? server.channels.find((c) => c && c.id === channelId)
    : null
  return channel ? `#${channel.name}` : ''
}

const getProfileData = (store, profileId) => {
  if (!store.profiles[profileId]) {
    store.profiles[profileId] = emptyData()
  }
  return store.profiles[profileId]
}

// ---------------------------------------------------------------------------
// SESSÕES ASSINADAS (HMAC-SHA256): o userId NUNCA mais vem do body puro.
// O front recebe sessionToken no login e manda em toda action; o handler
// valida e injeta body.__actor. Sem token válido -> 401. userId != actor -> 403.
// ---------------------------------------------------------------------------
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const getSessionSecret = () => process.env.SESSION_SECRET || process.env.TURSO_AUTH_TOKEN || process.env.KV_REST_API_TOKEN || 'friends-space-dev-secret-change-me'
const getSessionSecrets = () => {
  const list = [process.env.SESSION_SECRET, process.env.TURSO_AUTH_TOKEN, process.env.KV_REST_API_TOKEN, 'friends-space-dev-secret-change-me'].filter(Boolean)
  return [...new Set(list)]
}
const b64uEnc = (s) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = typeof Buffer !== 'undefined' ? Buffer.from(bin, 'binary').toString('base64') : btoa(bin)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64uDec = (s) => {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/')
  const bin = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('binary') : atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}
const hmacSign = async (msg) => {
  const c = globalThis.crypto
  if (!c || !c.subtle) throw new Error('Sem WebCrypto')
  const key = await c.subtle.importKey('raw', new TextEncoder().encode(getSessionSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await c.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  const bytes = new Uint8Array(sig)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = typeof Buffer !== 'undefined' ? Buffer.from(bin, 'binary').toString('base64') : btoa(bin)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const issueSession = async (userId) => {
  const payload = b64uEnc(JSON.stringify({ uid: String(userId), exp: Date.now() + SESSION_TTL_MS }))
  const sig = await hmacSign(payload)
  return `${payload}.${sig}`
}
const verifySession = async (token) => {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    const secrets = getSessionSecrets()
    let ok = false
    for (const secret of secrets) {
      try {
        const c = globalThis.crypto
        if (!c || !c.subtle) continue
        const key = await c.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        const sigBuf = await c.subtle.sign('HMAC', key, new TextEncoder().encode(parts[0]))
        const sigBytes = new Uint8Array(sigBuf)
        let sigBin = ''
        for (let bi = 0; bi < sigBytes.length; bi++) sigBin += String.fromCharCode(sigBytes[bi])
        const expect = (typeof Buffer !== 'undefined' ? Buffer.from(sigBin, 'binary').toString('base64') : btoa(sigBin)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        const a = expect
        const b = String(parts[1])
        if (a.length !== b.length) continue
        let diff = 0
        for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
        if (diff === 0) { ok = true; break }
      } catch {}
    }
    if (!ok) return null
    const data = JSON.parse(b64uDec(parts[0]))
    if (!data || !data.uid || Number(data.exp) < Date.now()) return null
    return String(data.uid)
  } catch { return null }
}
const deny = (msg) => {
  const e = new Error(msg)
  e.status = 403
  throw e
}
// Verifica o ID token do Google (aud = nosso client). Sem isso, qualquer um
// forjava profile e logava como outra pessoa.
const verifyGoogleIdToken = async (idToken) => {
  const ctl = new AbortController()
  const timer = setTimeout(() => { try { ctl.abort() } catch {} }, 10000)
  let res
  try {
    res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(idToken))}`, { signal: ctl.signal })
  } finally { clearTimeout(timer) }
  if (!res.ok) throw new Error('Google token inválido')
  const info = await res.json()
  const allowedClients = [process.env.VITE_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_ID].filter(Boolean)
  if (allowedClients.length && !allowedClients.includes(info.aud)) throw new Error('Google token de outro app')
  if (!info.sub) throw new Error('Google token inválido')
  return info
}
const actorOf = (store, body) => {
  const actor = String(body.__actor || '')
  if (!actor) deny('Sessão expirada. Entre de novo.')
  return actor
}
const requireFlags = (store, body, ...flags) => {
  const actor = actorOf(store, body)
  const u = getAllUsers(store).find((x) => x && x.id === actor)
  const root = u && userIsRoot(u)
  if (!u || !flags.some((f) => root || (u.flags && u.flags[f] === true))) deny('Sem permissão (403)')
  return u
}
const actorIsStaffOf = (store, actor, server) => server && (server.ownerId === actor || (server.staffMemberIds || []).includes(actor))
const requireServerStaff = (store, body, serverId) => {
  const actor = actorOf(store, body)
  const server = getAllServers(store).find((s) => s && s.id === String(serverId || ''))
  if (!server) throw new Error('Servidor não encontrado')
  if (!actorIsStaffOf(store, actor, server)) deny('Somente staff (403)')
  return { actor, server }
}
const requireServerMember = (store, body, serverId) => {
  const actor = actorOf(store, body)
  const server = getAllServers(store).find((s) => s && s.id === String(serverId || ''))
  if (!server) throw new Error('Servidor não encontrado')
  if (server.ownerId !== actor && !(server.members || []).includes(actor)) deny('Apenas membros (403)')
  return { actor, server }
}
const serverOfChannel = (store, channelId) => getAllServers(store).find((s) => s && Array.isArray(s.channels) && s.channels.some((c) => c && c.id === channelId))
const isServerMember = (store, userId, serverId) => {
  const s = getAllServers(store).find((x) => x && x.id === String(serverId || ''))
  return Boolean(s && (s.ownerId === userId || (s.members || []).includes(userId)))
}
const memberServerIdsOf = (store, userId) => getAllServers(store).filter((s) => s && (s.ownerId === userId || (s.members || []).includes(userId))).map((s) => s.id)
const areFriends = (store, a, b) => getAllFriends(store).some((f) => f && f.status === 'accepted' && ((f.userId === a && f.friendId === b) || (f.userId === b && f.friendId === a)))

// ---------------------------------------------------------------------------
// REDE: IP/dispositivo banidos, rate-limit e auto-ban. O proxy repassa
// cf-connecting-ip/x-forwarded-for; sem IP (desconhecido) as regras por IP
// são ignoradas, mas sessão e permissões continuam valendo.
// ---------------------------------------------------------------------------
const memIpBans = new Map()
const memDeviceBans = new Map()
const memRate = []
const getClientIp = (req) => {
  try {
    const h = req?.headers || {}
    const get = (k) => {
      const v = h[k] ?? h[k.toLowerCase()] ?? (typeof h.get === 'function' ? h.get(k) : '')
      return Array.isArray(v) ? v[0] : v
    }
    const cf = String(get('cf-connecting-ip') || '').trim()
    if (cf) return cf.split(',')[0].trim()
    const xff = String(get('x-forwarded-for') || '').trim()
    if (xff) return xff.split(',')[0].trim()
    const xr = String(get('x-real-ip') || '').trim()
    if (xr) return xr
  } catch {}
  return ''
}
const tursoRows = (res) => {
  try {
    const rows = res?.rows || []
    return rows.map((r) => (Array.isArray(r) ? (r.map((c) => (c && typeof c === 'object' && 'value' in c ? c.value : c))) : r))
  } catch { return [] }
}
async function isIpBanned(ip) {
  if (!ip) return false
  // Auto-cura: bans automaticos antigos (CGNAT/inocentes) sao perdoados no
  // proximo request — so ban MANUAL continua valendo. Nao ha mais trava
  // automatica em nenhum lugar.
  const forgiveAuto = async (reason) => {
    if (typeof reason === 'string' && reason.startsWith('auto:')) {
      try {
        memIpBans.delete(ip)
        if (isTurso()) { try { await tursoFetch('DELETE FROM ip_bans WHERE ip = ?', [ip]) } catch {} }
      } catch {}
      return true
    }
    return false
  }
  if (memIpBans.has(ip)) {
    if (isTurso()) {
      try {
        const rows = tursoRows(await tursoFetch('SELECT reason FROM ip_bans WHERE ip = ?', [ip]))
        if (rows.length && await forgiveAuto(rows[0] && rows[0][0])) return false
      } catch {}
    }
    return true
  }
  if (!isTurso()) return false
  try {
    const rows = tursoRows(await tursoFetch('SELECT reason FROM ip_bans WHERE ip = ?', [ip]))
    if (rows.length) {
      if (await forgiveAuto(rows[0] && rows[0][0])) return false
      memIpBans.set(ip, 1)
      return true
    }
  } catch {}
  return false
}
async function isDeviceBanned(id) {
  if (!id) return false
  if (memDeviceBans.has(id)) return true
  if (!isTurso()) return false
  try {
    const rows = tursoRows(await tursoFetch('SELECT id FROM device_bans WHERE id = ?', [id]))
    if (rows.length) { memDeviceBans.set(id, 1); return true }
  } catch {}
  return false
}
async function banIp(ip, reason) {
  if (!ip) throw new Error('IP inválido')
  memIpBans.set(ip, 1)
  if (isTurso()) {
    try { await tursoFetch('INSERT INTO ip_bans (ip, reason, created_at) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason', [ip, String(reason || 'manual'), Date.now()]) } catch {}
  }
  return true
}
async function unbanIp(ip) {
  memIpBans.delete(ip)
  if (isTurso()) { try { await tursoFetch('DELETE FROM ip_bans WHERE ip = ?', [ip]) } catch {} }
  return true
}
async function banDevice(id, reason) {
  if (!id) throw new Error('Dispositivo inválido')
  memDeviceBans.set(id, 1)
  if (isTurso()) {
    try { await tursoFetch('INSERT INTO device_bans (id, reason, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET reason = excluded.reason', [id, String(reason || 'manual'), Date.now()]) } catch {}
  }
  return true
}
async function unbanDevice(id) {
  memDeviceBans.delete(id)
  if (isTurso()) { try { await tursoFetch('DELETE FROM device_bans WHERE id = ?', [id]) } catch {} }
  return true
}
async function rateCheck(key, limit, windowMs) {
  const nowMs = Date.now()
  const cutoff = nowMs - windowMs
  for (let i = memRate.length - 1; i >= 0; i--) { if (memRate[i].ts < cutoff || memRate[i].k !== key) { if (memRate[i].ts < cutoff) memRate.splice(i, 1) } }
  const local = memRate.filter((h) => h.k === key && h.ts >= cutoff).length
  if (local >= limit) return false
  if (isTurso()) {
    try {
      await tursoFetch('DELETE FROM rate_hits WHERE ts < ?', [cutoff])
      const rows = tursoRows(await tursoFetch('SELECT COUNT(*) FROM rate_hits WHERE k = ? AND ts >= ?', [key, cutoff]))
      if (Number(rows?.[0]?.[0] ?? 0) >= limit) return false
      await tursoFetch('INSERT INTO rate_hits (k, ts) VALUES (?, ?)', [key, nowMs])
    } catch {}
  }
  memRate.push({ k: key, ts: nowMs })
  if (memRate.length > 2000) memRate.splice(0, memRate.length - 2000)
  return true
}
async function recordDeny(ip) {
  if (!ip) return
  try {
    if (isTurso()) {
      const nowMs = Date.now()
      await tursoFetch('INSERT INTO ip_events (ip, ts, kind) VALUES (?, ?, ?)', [ip, nowMs, 'deny'])
      await tursoFetch('DELETE FROM ip_events WHERE ts < ?', [nowMs - 600000])
      const rows = tursoRows(await tursoFetch('SELECT COUNT(*) FROM ip_events WHERE ip = ? AND kind = ? AND ts >= ?', [ip, 'deny', nowMs - 600000]))
      if (Number(rows?.[0]?.[0] ?? 0) >= 25) await banIp(ip, 'auto: 25 negados/10min')
    }
  } catch {}
}
const rateLimitError = () => {
  const e = new Error('Muitas tentativas. Aguarde um minuto.')
  e.status = 429
  return e
}

const writeUserEverywhere = (store, data, u) => {
  if (store.directory && Array.isArray(store.directory.users)) {
    const gi = store.directory.users.findIndex((x) => x && x.id === u.id)
    if (gi !== -1) store.directory.users[gi] = u
  }
  for (const profile of Object.values(store.profiles || {})) {
    if (profile && Array.isArray(profile.users)) {
      const pi = profile.users.findIndex((x) => x && x.id === u.id)
      if (pi !== -1) profile.users[pi] = u
    }
  }
  if (data && Array.isArray(data.users)) {
    const di = data.users.findIndex((x) => x && x.id === u.id)
    if (di !== -1) data.users[di] = u
    else data.users.push(u)
  }
}

const RISK_FREE_EMAILS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com']
const scoreNewUser = (store, user) => {
  const reasons = []
  let score = 0
  const ip = user.signupIp || user.lastIp || ''
  const sameIp = ip ? getAllUsers(store).filter((x) => x && x.id !== user.id && (x.signupIp === ip || x.lastIp === ip)) : []
  if (sameIp.length) { score += 40 * sameIp.length; reasons.push(`${sameIp.length} conta(s) no mesmo IP`) }
  if (!user.photoUrl) { score += 15; reasons.push('sem foto') }
  const nm = String(user.name || '')
  if (nm.length < 3) { score += 10; reasons.push('nome curto') }
  else if (/^[^aeiouAEIOU\s]{5,}$/.test(nm.replace(/[^a-zA-Z]/g, ''))) { score += 10; reasons.push('nome aleatório') }
  const dom = String(user.email || '').split('@')[1]?.toLowerCase() || ''
  if (dom && !RISK_FREE_EMAILS.includes(dom)) { score += 10; reasons.push('email incomum') }
  return { score, reasons, sameIp: sameIp.map((x) => ({ id: x.id, name: x.name })) }
}

const pushQuiet = (...args) => {
  try {
    const r = sendPushToUser(...args)
    if (r && typeof r.catch === 'function') r.catch(() => {})
  } catch {}
}

const getAllStories = (store) => {
  const fromProfiles = Object.values(store.profiles || {}).flatMap((profile) => profile.stories || [])
  const fromDirectory = Array.isArray(store.directory?.stories) ? store.directory.stories : []
  const unique = new Map()
  for (const item of [...fromDirectory, ...fromProfiles]) {
    if (!item?.id) continue
    const prev = unique.get(item.id)
    if (!prev || Number(item.updatedAt || item.createdAt || 0) > Number(prev.updatedAt || prev.createdAt || 0)) unique.set(item.id, item)
  }
  return [...unique.values()]
}
const saveStoryEverywhere = (store, data, st) => {
  st.updatedAt = now()
  if (store.directory) {
    if (!Array.isArray(store.directory.stories)) store.directory.stories = []
    const gi = store.directory.stories.findIndex((x) => x && x.id === st.id)
    if (gi !== -1) store.directory.stories[gi] = st
    else store.directory.stories.push(st)
  }
  for (const profile of Object.values(store.profiles || {})) {
    if (profile && Array.isArray(profile.stories)) {
      const pi = profile.stories.findIndex((x) => x && x.id === st.id)
      if (pi !== -1) profile.stories[pi] = st
    }
  }
  if (data && Array.isArray(data.stories)) {
    const di = data.stories.findIndex((x) => x && x.id === st.id)
    if (di !== -1) data.stories[di] = st
    else data.stories.push(st)
  }
}
const getAllPosts = (store) => {
  const fromProfiles = Object.values(store.profiles || {}).flatMap((profile) => profile.posts || [])
  const fromDirectory = Array.isArray(store.directory?.posts) ? store.directory.posts : []
  const unique = new Map()
  for (const item of [...fromDirectory, ...fromProfiles]) {
    if (!item?.id) continue
    const prev = unique.get(item.id)
    if (!prev || Number(item.updatedAt || item.createdAt || 0) > Number(prev.updatedAt || prev.createdAt || 0)) unique.set(item.id, item)
  }
  return [...unique.values()]
}
const savePostEverywhere = (store, data, post) => {
  post.updatedAt = now()
  if (store.directory) {
    if (!Array.isArray(store.directory.posts)) store.directory.posts = []
    const gi = store.directory.posts.findIndex((x) => x && x.id === post.id)
    if (gi !== -1) store.directory.posts[gi] = post
    else store.directory.posts.push(post)
  }
  for (const profile of Object.values(store.profiles || {})) {
    if (profile && Array.isArray(profile.posts)) {
      const pi = profile.posts.findIndex((x) => x && x.id === post.id)
      if (pi !== -1) profile.posts[pi] = post
    }
  }
  if (data && Array.isArray(data.posts)) {
    const di = data.posts.findIndex((x) => x && x.id === post.id)
    if (di !== -1) data.posts[di] = post
    else data.posts.push(post)
  }
}

const actions = {
  state: async (store, data, body) => {
    const actor = actorOf(store, body)
    const ids = (data.users || []).map((u) => u && u.id)
    if (!ids.includes(actor)) {
      const me = getAllUsers(store).find((u) => u && u.id === actor)
      if (!me) deny('Sessão expirada. Entre de novo.')
      return { users: [], servers: [], friends: [] }
    }
    return data
  },
  directoryState: async (store, data, body) => {
    const actor = actorOf(store, body)
    void actor
    const pubUser = (u) => (u ? { id: u.id, name: u.name, photoUrl: u.photoUrl || '', friendCode: u.friendCode || '', flags: u.flags || {}, lastSeenAt: u.lastSeenAt || 0, activityName: u.activityName || '', activityDetails: u.activityDetails || '' } : u)
    return {
      users: getAllUsers(store).map(pubUser),
      servers: getAllServers(store).map((s) => {
        if (!s) return s
        const base = { ...s, inviteCode: undefined, callPassword: undefined, auditLog: undefined, onlineCount: onlineCountOf(store, s.members) }
        if (base.settings) {
          const st = { ...base.settings }
          delete st.bots
          delete st.webhooks
          delete st.integrations
          base.settings = st
        }
        const isPublic = s.settings && s.settings.toggles && s.settings.toggles.public === true
        if (isPublic) base.inviteCode = s.inviteCode
        return base
      }),
    }
  },
  ping: async () => ({ pong: Date.now() }),
  dbInfo: async () => {
    const url = String(process.env.TURSO_DATABASE_URL || '')
    let host = ''
    try { host = new URL(url.replace(/^libsql:\/\//, 'https://')).host } catch { }
    return { driver: String(process.env.DB_DRIVER || ''), host, hasToken: !!String(process.env.TURSO_AUTH_TOKEN || '').trim(), env: String(process.env.ENVIRONMENT || '') }
  },
  // Versão desktop via GitHub Releases (o app Electron usa electron-updater
  // direto; este endpoint serve instalações antigas sem feed + o modal web
  // "Baixar app"). Sem GH_OWNER/GH_REPO, retorna vazio (sem update).
  checkUpdate: async () => {
    const owner = process.env.GH_OWNER || ''
    const repo = process.env.GH_REPO || ''
    if (!owner || !repo) return { latestVersion: '', downloadUrl: '', downloadUrlLinux: '', downloadUrlMac: '', releaseNotes: '' }
    try {
      const now = Date.now()
      if (!globalThis.__checkUpdateCache || now - globalThis.__checkUpdateCache.at > 10 * 60 * 1000) {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
          headers: { 'User-Agent': 'friends-space', Accept: 'application/vnd.github+json' },
        })
        if (!res.ok) throw new Error(`github-${res.status}`)
        const rel = await res.json()
        const tag = String((rel && rel.tag_name) || '')
        const version = tag.replace(/^desktop-v/i, '').replace(/^v/i, '')
        const assets = Array.isArray(rel && rel.assets) ? rel.assets : []
        const pick = (...needles) => {
          const a = assets.find((x) => {
            const n = String((x && x.name) || '').toLowerCase()
            return needles.every((nd) => n.includes(nd))
          })
          return (a && a.browser_download_url) || ''
        }
        globalThis.__checkUpdateCache = {
          at: now,
          data: {
            latestVersion: version,
            downloadUrl: pick('setup', '.exe') || pick('.exe'),
            downloadUrlLinux: pick('.appimage') || pick('linux', '.tar.xz') || pick('.tar.xz'),
            downloadUrlMac: pick('mac', '.dmg') || pick('.dmg') || pick('mac', '.zip'),
            releaseNotes: String((rel && rel.body) || '').slice(0, 500),
            releasePage: (rel && rel.html_url) || `https://github.com/${owner}/${repo}/releases/latest`,
          },
        }
      }
      return globalThis.__checkUpdateCache.data
    } catch {
      if (globalThis.__checkUpdateCache) return globalThis.__checkUpdateCache.data
      return { latestVersion: '', downloadUrl: '', downloadUrlLinux: '', downloadUrlMac: '', releaseNotes: '' }
    }
  },
  loadUserServers: async (store, data, body) => getAllServers(store)
    .filter((server) => server && (server.ownerId === body.userId || (Array.isArray(server.members) && server.members.includes(body.userId)))),
  signInWithName: async (store, data, body) => {
    const devKey = String(body.devKey || '').trim()
    const devSecret = String(process.env.DEV_LOGIN_KEY || '').trim()
    if (!devSecret || devKey !== devSecret) throw new Error('Use o login Google')
    if (!(await rateCheck('login:' + (body.__ip || 'unknown'), 30, 60000))) throw rateLimitError()
    const name = String(body.name || '').trim()
    if (!name || name.length < 2) throw new Error('Nome deve ter pelo menos 2 caracteres')
    let user = data.users.find((item) => item.name.toLowerCase() === name.toLowerCase())
    if (!user) {
      user = {
        id: id(),
        friendCode: makeCode(getAllUsers(store).concat(data.users), 'friendCode'),
        name,
        bio: '',
        photoUrl: '',
        bannerUrl: '',
        accentColor: '#00ff88',
        status: '',
        authProvider: 'name',
        createdAt: now(),
        lastSeenAt: now(),
      }
      data.users.push(user)
    }
    upsertGlobalUser(store, user)
    try { user = ensureFriendCode(store, data, user) || user } catch { }
    if (user.googleId) throw new Error('Esta conta usa login Google. Entre com o Google.')
    let lobbyByName = null
    try { lobbyByName = onboardNewUser(store, data, user) } catch { }
    try { upsertGlobalUser(store, user) } catch { }
    return { user: withPublicFlags(user), users: getAllUsers(store).concat(data.users.filter((u) => !getAllUsers(store).some((g) => g.id === u.id))), sessionToken: await issueSession(user.id), lobby: lobbyByName ? { id: lobbyByName.id, name: lobbyByName.name, inviteCode: lobbyByName.inviteCode || '' } : null }
  },
  signInWithGoogle: async (store, data, body) => {
    if (!(await rateCheck('login:' + (body.__ip || 'unknown'), 30, 60000))) throw rateLimitError()
    if (body.idToken) {
      const info = await verifyGoogleIdToken(body.idToken)
      body.profile = {
        googleId: info.sub,
        email: String(info.email || '').toLowerCase(),
        name: info.name || '',
        photoUrl: info.picture || '',
      }
    }
    if (body.accessToken && !body.idToken) {
      const ctl2 = new AbortController()
      const timer2 = setTimeout(() => { try { ctl2.abort() } catch {} }, 10000)
      let meRes
      try {
        meRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${String(body.accessToken)}` }, signal: ctl2.signal })
      } finally { clearTimeout(timer2) }
      if (!meRes.ok) throw new Error('Google token inválido')
      const meInfo = await meRes.json()
      if (!meInfo.sub) throw new Error('Google token inválido')
      body.profile = {
        googleId: meInfo.sub,
        email: String(meInfo.email || '').toLowerCase(),
        name: meInfo.name || '',
        photoUrl: meInfo.picture || '',
      }
    }
    if (!body.idToken && !body.accessToken) throw new Error('Atualize o app para entrar com o Google')
    const profile = body.profile || {}
    const googleId = String(profile.googleId || '').trim()
    const email = String(profile.email || '').trim().toLowerCase()
    const name = String(profile.name || '').trim()
    const photoUrl = String(profile.photoUrl || '').trim()
    if (!googleId || !email || !name) {
      throw new Error('Perfil Google invalido')
    }

    let user =
      data.users.find((item) => item.googleId === googleId || item.email === email)
      || getAllUsers(store).find((item) => item.googleId === googleId || item.email === email)

    if (user) {
      user = {
        ...user,
        name,
        email,
        photoUrl,
        googleId,
        authProvider: 'google',
      }
      const existingIndex = data.users.findIndex((item) => item.id === user.id)
      if (existingIndex === -1) {
        data.users.push(user)
        user.signupIp = String(body.__ip || '')
        {
          const dayAgo = now() - 86400000
          const sameIp = getAllUsers(store).filter((x) => x && x.signupIp && x.signupIp === user.signupIp && (x.createdAt || 0) >= dayAgo)
          if (user.signupIp && sameIp.length >= 5) {
            // SEM TRAVA AUTOMATICA: IP compartilhado (CGNAT) e normal no Brasil.
            // So avisa os devs; a conta entra normalmente.
            try {
              for (const dev of getAllUsers(store).filter((x) => x && x.flags && (x.flags.dev || x.flags.support))) {
                addNotification(store, { toUserId: dev.id, fromUserId: user.id, fromName: user.name, fromPhoto: user.photoUrl || '', type: 'pending-user', title: `Volume alto no IP: ${user.name}`, body: `${sameIp.length} contas hoje`, data: { userId: user.id } })
              }
            } catch {}
          }
          const risk = scoreNewUser(store, user)
          // SEM TRAVA AUTOMATICA: todo mundo entra (chinês, angolano, carioca,
          // IP compartilhado). O score vira so SINAL para os devs moderarem
          // manualmente se preciso. Nenhum ban, delete ou recusa aqui.
          user.approved = true
          try {
            writeUserEverywhere(store, data, user)
            upsertGlobalUser(store, user)
          } catch {}
          for (const dev of getAllUsers(store).filter((x) => x && x.flags && (x.flags.dev || x.flags.support))) {
            addNotification(store, {
              toUserId: dev.id,
              fromUserId: user.id,
              fromName: user.name,
              fromPhoto: user.photoUrl || '',
              type: 'pending-user',
              title: `Nova conta (risco ${risk.score}): ${user.name}`,
              body: 'Sinais: ' + (risk.reasons.join(', ') || 'nenhum') + '.',
              data: { userId: user.id },
            })
            pushQuiet(dev.id, `Nova conta: ${user.name} (risco ${risk.score})`, risk.reasons.join(', ') || 'ok', { url: '/' })
          }
        }
      } else {
        data.users[existingIndex] = user
      }
    } else {
      user = {
        id: id(),
        friendCode: makeCode(getAllUsers(store), 'friendCode'),
        name,
        bio: '',
        photoUrl,
        bannerUrl: '',
        accentColor: '#00ff88',
        status: '',
        googleId,
        email,
        authProvider: 'google',
        createdAt: now(),
        lastSeenAt: now(),
      }
      data.users.push(user)
    }

    upsertGlobalUser(store, user)

    const profileUsers = Object.values(store.profiles || {}).flatMap((profile) => Array.isArray(profile?.users) ? profile.users : [])
    for (const storedUser of profileUsers) {
      if (storedUser?.id) upsertGlobalUser(store, storedUser)
    }

    // Onboarding: conta nova entra sozinha no lobby público (poder total:
    // públicos, amizades, calls) + garante seed do feed oficial.
    let lobby = null
    try { user = ensureFriendCode(store, data, user) || user } catch { }
    try { lobby = onboardNewUser(store, data, user) } catch { }
    try { upsertGlobalUser(store, user) } catch { }

    return { user: withPublicFlags(user), users: withPublicUsers(data.users), sessionToken: await issueSession(user.id), lobby: lobby ? { id: lobby.id, name: lobby.name, inviteCode: lobby.inviteCode || '' } : null }
  },
  updateUser: async (store, data, body) => {
    if (String(body.id || '') !== String(body.__actor || '')) deny('Operação negada (403)')
    const index = data.users.findIndex((user) => user.id === body.id)
    // O cliente manda profileId = id do proprio usuario depois do login, mas o
    // usuario pode estar salvo em outra fatia (ex.: "anonymous", de quando a
    // conta nasceu). Sem o fallback para o diretorio, QUALQUER edicao de perfil
    // (status, nome, mural, aparencia...) falhava com "Usuário não encontrado"
    // e nada era persistido — o status "não mudava".
    const prevUser = index !== -1
      ? data.users[index]
      : getAllUsers(store).find((user) => user && user.id === body.id)
    if (!prevUser) throw new Error('Usuário não encontrado')
    if (body.data && body.data.friendCode) {
      const newCode = normalizeFriendCode(body.data.friendCode)
      if (!newCode || newCode.length < 3 || newCode.length > 20) throw new Error('Codigo invalido: use de 3 a 20 caracteres (letras e numeros)')
      const taken = getAllUsers(store).concat(data.users).some((u) => u.id !== body.id && normalizeFriendCode(u.friendCode) === newCode)
      if (taken) throw new Error('Este codigo ja esta em uso')
      body.data.friendCode = newCode
    }
    const prevSettings = prevUser?.settings && typeof prevUser.settings === 'object' ? prevUser.settings : {}
    const nextSettings = body.data?.settings && typeof body.data.settings === 'object' ? body.data.settings : {}
    const prevStatus = String(prevSettings.statusMessage || '')
    const nextStatus = String(nextSettings.statusMessage || '')
    const prevPresence = String(prevSettings.status || '')
    const nextPresence = String(nextSettings.status || '')
    const ALLOWED_USER_FIELDS = ['name','bio','photoUrl','bannerUrl','accentColor','status','settings','activityName','activityDetails','activityStartedAt','friendCode','bookmarks']
    const safeData = {}
    for (const k of ALLOWED_USER_FIELDS) { if (body.data && body.data[k] !== undefined) safeData[k] = body.data[k] }
    // Imagem inline (data URI) gigante afoga o store compartilhado e derruba a
    // CPU do Workers free. Rejeita quem MANDE um valor novo maior que ~240KB.
    // (valor igual ao anterior passa: limpeza/migracao cuida do historico)
    for (const field of ['photoUrl', 'bannerUrl']) {
      const v = typeof safeData[field] === 'string' ? safeData[field] : ''
      if (v.startsWith('data:image/') && v.length > 360_000 && v !== String(prevUser[field] || '')) {
        throw new Error('Imagem muito grande. Use um arquivo de até ~240 KB ou conecte o Google Drive.')
      }
    }
    // Blindagem Astro: chaves de assinatura só podem ser alteradas pelas
    // actions pagas (activate/renew/cancel/refund) ou por dev via admin.
    // Sem isso qualquer logado se dava Astro Ultimate de graça.
    // O valor do SERVIDOR sempre prevalece: ignora o que o cliente mandou
    // e mantém o que já estava (antes deletava e o usuário caía p/ grátis).
    const PROTECTED_SETTINGS = ['astro','astroUntil','astroTier','astroMonths','astroPurchasedAt','astroFirstPaidAt','astroRefundedAt','astroAutoRenew','astroPaymentPending']
    if (safeData.settings && typeof safeData.settings === 'object') {
      const prevSettings = (prevUser?.settings && typeof prevUser.settings === 'object') ? prevUser.settings : {}
      safeData.settings = { ...safeData.settings }
      for (const k of PROTECTED_SETTINGS) {
        if (k in prevSettings) safeData.settings[k] = prevSettings[k]
        else delete safeData.settings[k]
      }
    }
    const updatedUser = { ...prevUser, ...safeData, id: prevUser.id }
    if (store.directory && Array.isArray(store.directory.users)) {
      const gi = store.directory.users.findIndex((x) => x && x.id === updatedUser.id)
      if (gi !== -1) store.directory.users[gi] = updatedUser
    }
    for (const profile of Object.values(store.profiles || {})) {
      if (profile && Array.isArray(profile.users)) {
        const pi = profile.users.findIndex((x) => x && x.id === updatedUser.id)
        if (pi !== -1) profile.users[pi] = updatedUser
      }
    }
    if (index === -1) data.users.push(updatedUser)
    else data.users[index] = updatedUser
    upsertGlobalUser(store, updatedUser)
    if ((prevStatus !== nextStatus || prevPresence !== nextPresence) && (nextStatus || nextPresence)) {
      for (const friendId of acceptedFriendIds(store, prevUser.id)) {
        addNotification(store, {
          toUserId: friendId,
          fromUserId: prevUser.id,
          fromName: updatedUser.name,
          fromPhoto: updatedUser.photoUrl || '',
          type: 'status',
          title: `${updatedUser.name} atualizou status`,
          body: nextStatus || '',
          data: { status: nextPresence },
        })
      }
    }
    return { user: withPublicFlags(updatedUser), users: withPublicUsers(data.users) }
  },
  getUser: async (store, data, body) =>
    withPublicFlags(getAllUsers(store).find((user) => user.id === body.id)
    || data.users.find((user) => user.id === body.id)),
  findUserByFriendCode: async (store, data, body) => {
    // Match EXATO (nao substring): adicionar amigo e a checagem de unicidade
    // do codigo dependem disso. Antes, digitar um codigo parcial casava com
    // qualquer nome/id/friendCode que CONTIVESSE o texto — dava para adicionar
    // a pessoa errada e o check de disponibilidade mentia.
    const code = normalizeFriendCode(body.friendCode)
    if (!code) return undefined
    const search = (list) => list.find((user) => normalizeFriendCode(user.friendCode) === code)
    return search(getAllUsers(store)) || search(data.users)
  },
  searchDirectory: async (store, data, body) => {
    const query = normalizeFriendCode(body.query || '')
    if (!query) {
      // Sem digitar: top servidores públicos (descoberta imediata). Pessoas
      // continuam exigindo busca (privacidade).
      const pubs = getAllServers(store)
        .filter((s) => s && (!s.settings || !s.settings.toggles || s.settings.toggles.public !== false))
        .sort((a, b) => ((b.members || []).length) - ((a.members || []).length))
        .slice(0, 6)
        .map((s) => ({ id: s.id, name: s.name, photoUrl: s.photoUrl || '', description: s.description || '', members: (s.members || []).length, category: String(s.category || '') }))
      return { users: [], servers: pubs }
    }
    const matches = (value) => normalizeFriendCode(value).includes(query)
    return {
      users: getAllUsers(store).filter((user) => user.id !== body.userId && (matches(user.name) || matches(user.friendCode))).slice(0, 20).map((u) => ({ id: u.id, name: u.name, photoUrl: u.photoUrl || '', friendCode: u.friendCode || '' })),
      servers: getAllServers(store).filter((server) => matches(server.name)).slice(0, 20).map((s) => ({ id: s.id, name: s.name, photoUrl: s.photoUrl || '', description: s.description || '', members: (s.members || []).length })),
    }
  },
  createServer: async (store, data, body) => {
    if (!(await rateCheck('create:' + String(body.__actor || body.userId || 'x'), 10, 60000))) throw rateLimitError()
    body.ownerId = String(body.__actor || '')
    if (!body.ownerId) deny('Operação negada (403)')
    const name = String(body.name || '').trim()
    if (!name) throw new Error('Nome obrigatorio')
    const category = String(body.category || (Array.isArray(body.themes) && body.themes[0]) || '').trim().slice(0, 40)
    const serverId = id()
    const cleanList = (arr, max) => Array.isArray(arr) ? arr.map(v => String(v || '').trim().slice(0, max)).filter(Boolean) : []
    const textNames = cleanList(body.textChannels, 40)
    const voiceNames = cleanList(body.voiceChannels, 40)
    const customChannels = [
      ...textNames.map(n => ({ id: id(), name: n, type: 'text', serverId })),
      ...voiceNames.map(n => ({ id: id(), name: n, type: 'voice', serverId })),
    ]
    const roleDrafts = Array.isArray(body.roles) ? body.roles.map(r => ({ name: String((r && r.name) || '').trim().slice(0, 30), color: String((r && r.color) || '#00ff88') })).filter(r => r.name) : []
    const customRoles = roleDrafts.length > 0
      ? roleDrafts.map(r => ({ id: id(), name: r.name, color: r.color, serverId, permissions: r.name.toLowerCase() === 'admin' ? ['all'] : [] }))
      : [{ id: id(), name: 'Admin', color: '#00ff88', serverId, permissions: ['all'] }]
    const customCategories = cleanList(body.categories, 40).map(n => ({ id: id(), name: n, serverId }))
    const customEvents = Array.isArray(body.events) ? body.events.map(e => ({
      id: id(), serverId,
      title: String((e && e.title) || '').trim().slice(0, 80) || 'Evento',
      description: String((e && e.description) || ''),
      date: Number(e && e.date) > 0 ? Number(e.date) : Date.now() + 24 * 3600 * 1000,
      createdBy: body.ownerId, createdAt: now(),
    })).filter(e => e.title) : []
    const server = {
      id: serverId,
      name,
      category,
      photoUrl: String(body.photoUrl || ''),
      bannerUrl: String(body.bannerUrl || ''),
      description: String(body.description ?? body.rules ?? ''),
      accentColor: '#00ff88',
      ownerId: body.ownerId,
      inviteCode: makeCode(getAllServers(store), 'inviteCode'),
      createdAt: now(),
      members: [body.ownerId],
      channels: customChannels.length > 0 ? customChannels : [
        { id: id(), name: 'geral', type: 'text', serverId },
        { id: id(), name: 'Call', type: 'voice', serverId },
      ],
      roles: customRoles,
      categories: customCategories,
      events: customEvents,
      settings: {
        themes: Array.isArray(body.themes) ? body.themes.slice(0, 5) : (category ? [category] : []),
        frequency: String(body.frequency || ''),
        minAge: String(body.minAge || ''),
        moderation: 'Médio',
        toggles: {
          public: body.toggles ? !!body.toggles.public : true,
          verification: body.toggles ? !!body.toggles.verify : false,
          welcome: body.toggles ? !!body.toggles.welcome : true,
          log: body.toggles ? !!body.toggles.logs : false,
          rules: false,
        },
      },
      callAccess: 'public',
      callPassword: '',
      staffMemberIds: [body.ownerId],
    }
    data.servers.push(server)
    upsertGlobalServer(store, server)
    return { server, servers: data.servers }
  },
  banIp: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    await banIp(String(body.ip || ''), String(body.reason || 'manual'))
    return { ok: true }
  },
  unbanIp: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    await unbanIp(String(body.ip || ''))
    return { ok: true }
  },
  banDevice: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    await banDevice(String(body.deviceId || ''), String(body.reason || 'manual'))
    return { ok: true }
  },
  unbanDevice: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    await unbanDevice(String(body.deviceId || ''))
    return { ok: true }
  },
  listBans: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    const ips = []
    const devices = []
    for (const ip of memIpBans.keys()) ips.push({ id: ip, reason: 'memória', createdAt: 0 })
    for (const id of memDeviceBans.keys()) devices.push({ id, reason: 'memória', createdAt: 0 })
    if (isTurso()) {
      try {
        for (const r of tursoRows(await tursoFetch('SELECT ip, reason, created_at FROM ip_bans'))) ips.push({ id: r[0], reason: r[1], createdAt: r[2] })
        for (const r of tursoRows(await tursoFetch('SELECT id, reason, created_at FROM device_bans'))) devices.push({ id: r[0], reason: r[1], createdAt: r[2] })
      } catch {}
    }
    return { ips, devices }
  },
  listPendingUsers: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    const week = now() - 7 * 86400000
    return getAllUsers(store)
      .filter((u) => u && (u.createdAt || 0) >= week && !(u.flags && (u.flags.dev || u.flags.support)))
      .map((u) => { const r = scoreNewUser(store, u); return { id: u.id, name: u.name, photoUrl: u.photoUrl || '', friendCode: u.friendCode || '', createdAt: u.createdAt || 0, score: r.score, reasons: r.reasons } })
      .sort((a, b) => b.score - a.score)
  },
  refreshSession: async (store, data, body) => {
    const actor = actorOf(store, body)
    return { sessionToken: await issueSession(actor) }
  },
  getUserDiagnostics: async (store, data, body) => {
    requireFlags(store, body, 'dev', 'support')
    const target = getAllUsers(store).find((u) => u && u.id === body.targetId)
    if (!target) throw new Error('Usuário não encontrado')
    const allMsgs = store.directory && Array.isArray(store.directory.messages) ? store.directory.messages : []
    const allReports = store.directory && Array.isArray(store.directory.reports) ? store.directory.reports : []
    const friends = getAllFriends(store).filter((f) => f && (f.userId === target.id || f.friendId === target.id) && f.status === 'accepted')
    const ips = [target.signupIp, target.lastIp].filter(Boolean)
    let denies = 0
    if (isTurso() && ips.length) {
      try {
        for (const ip of ips) {
          const rows = tursoRows(await tursoFetch('SELECT COUNT(*) FROM ip_events WHERE ip = ? AND kind = ?', [ip, 'deny']))
          denies += Number(rows?.[0]?.[0] ?? 0)
        }
      } catch {}
    }
    return {
      user: { id: target.id, name: target.name, photoUrl: target.photoUrl || '', friendCode: target.friendCode || '', email: target.email || '', approved: target.approved !== false, createdAt: target.createdAt || 0, lastSeenAt: target.lastSeenAt || 0, signupIp: target.signupIp || '', lastIp: target.lastIp || '', flags: target.flags || {} },
      stats: {
        messages: allMsgs.filter((m) => m && m.userId === target.id).length,
        reportsMade: allReports.filter((r) => r && r.reporterId === target.id).length,
        reportsAgainst: allReports.filter((r) => r && ((r.target && r.target.id === target.id) || r.targetId === target.id)).length,
        friends: friends.length,
        serversOwned: getAllServers(store).filter((s) => s && s.ownerId === target.id).map((s) => ({ id: s.id, name: s.name })),
        serversMember: getAllServers(store).filter((s) => s && s.ownerId !== target.id && (s.members || []).includes(target.id)).length,
        sameIpAccounts: ips.length ? getAllUsers(store).filter((u) => u && u.id !== target.id && ips.includes(u.signupIp)).map((u) => ({ id: u.id, name: u.name })) : [],
        deniesFromIp: denies,
        riskScore: scoreNewUser(store, target).score,
        riskReasons: scoreNewUser(store, target).reasons,
      },
    }
  },
  rejectUser: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    const target = getAllUsers(store).find((u) => u && u.id === body.targetId)
    if (!target) throw new Error('Usuário não encontrado')
    if (target.flags && (target.flags.dev || target.flags.support)) throw new Error('Não é possível rejeitar equipe')
    removeUserEverywhere(store, target.id)
    return { ok: true }
  },
  getLivekitToken: async (store, data, body) => {
    const actor = actorOf(store, body)
    const serverId = String(body.serverId || '')
    const channelId = String(body.channelId || '')
    let room = ''
    if (serverId && serverId !== 'dm') {
      if (!isServerMember(store, actor, serverId)) deny('Apenas membros (403)')
      room = `srv_${serverId}_${channelId || 'lobby'}`
    } else {
      const other = String(body.peerId || '')
      if (!other || (!areFriends(store, actor, other) && !memberServerIdsOf(store, actor).some((sid) => memberServerIdsOf(store, other).includes(sid)))) deny('Operação negada (403)')
      room = `dm_${[actor, other].sort().join('_')}`
    }
    room = room.replace(/[^a-zA-Z0-9_:=-]/g, '')
    const url = process.env.LIVEKIT_URL || ''
    const key = process.env.LIVEKIT_API_KEY || ''
    const secret = process.env.LIVEKIT_API_SECRET || ''
    if (!url || !key || !secret) throw new Error('LiveKit não configurado')
    const nowS = Math.floor(Date.now() / 1000)
    const header = b64uEnc(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = b64uEnc(JSON.stringify({ iss: key, sub: actor, iat: nowS, nbf: nowS, exp: nowS + 6 * 3600, video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true } }))
    const c = globalThis.crypto
    if (!c || !c.subtle) throw new Error('Sem WebCrypto')
    const k = await c.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sigBuf = await c.subtle.sign('HMAC', k, new TextEncoder().encode(header + '.' + payload))
    const bytes = new Uint8Array(sigBuf)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    const sig = (typeof Buffer !== 'undefined' ? Buffer.from(bin, 'binary').toString('base64') : btoa(bin)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return { url, token: `${header}.${payload}.${sig}` }
  },
  reportClientError: async (store, data, body) => {
    const actor = actorOf(store, body)
    try {
      if (isTurso()) {
        await tursoFetch('CREATE TABLE IF NOT EXISTS client_errors (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ts BIGINT NOT NULL, whereami TEXT NOT NULL, message TEXT NOT NULL)')
        try { await tursoFetch('ALTER TABLE client_errors ADD COLUMN code TEXT') } catch { }
        await tursoFetch('CREATE INDEX IF NOT EXISTS idx_client_errors_ts ON client_errors (ts)')
        try {
          await tursoFetch('INSERT INTO client_errors (id, user_id, ts, whereami, message, code) VALUES (?, ?, ?, ?, ?, ?)', [id(), actor, now(), String(body.where || '').slice(0, 120), String(body.message || '').slice(0, 1000), String(body.code || '').slice(0, 24)])
        } catch {
          await tursoFetch('INSERT INTO client_errors (id, user_id, ts, whereami, message) VALUES (?, ?, ?, ?, ?)', [id(), actor, now(), String(body.where || '').slice(0, 120), String(body.message || '').slice(0, 1000)])
        }
        await tursoFetch('DELETE FROM client_errors WHERE ts < ?', [now() - 86400000])
      }
    } catch {}
    return { ok: true }
  },
  pushSystemNotification: async (store, data, body) => {
    const userId = String(body.userId || body.__actor || '')
    if (!userId) throw new Error('userId obrigatorio')
    addNotification(store, {
      toUserId: userId,
      fromUserId: 'system',
      fromName: 'Friends Space',
      fromPhoto: '',
      type: String(body.type || 'update-news'),
      title: String(body.title || 'Novidade').slice(0, 120),
      body: String(body.body || '').slice(0, 200),
      data: (body.data && typeof body.data === 'object' ? body.data : {}),
    })
    return { ok: true }
  },
  clearFeed: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    const had = Array.isArray(data.posts) ? data.posts.length : 0
    data.posts = []
    try {
      if (store.directory) {
        for (const profile of Object.values(store.profiles || {})) {
          if (profile && Array.isArray(profile.posts)) profile.posts = []
        }
      }
    } catch { }
    return { ok: true, cleared: had }
  },
  listClientErrors: async (store, data, body) => {
    requireFlags(store, body, 'dev', 'support')
    const errors = []
    if (isTurso()) {
      try {
        let rows
        try {
          rows = await tursoFetch('SELECT id, user_id, ts, whereami, message, code FROM client_errors ORDER BY ts DESC LIMIT 100')
        } catch {
          rows = await tursoFetch('SELECT id, user_id, ts, whereami, message FROM client_errors ORDER BY ts DESC LIMIT 100')
        }
        for (const r of tursoRows(rows)) {
          errors.push({ id: r[0], userId: r[1], ts: r[2], where: r[3], message: r[4], code: r[5] || '' })
        }
      } catch {}
    }
    return { errors }
  },
  approveUser: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    const target = getAllUsers(store).find((u) => u && u.id === body.targetId)
    if (!target) throw new Error('Usuário não encontrado')
    const upd = { ...target, approved: true }
    writeUserEverywhere(store, data, upd)
    upsertGlobalUser(store, upd)
    return { user: withPublicFlags(upd) }
  },

  restoreSnapshot: async (store, data, body) => {
    // Recuperação pós-wipe: mescla coleções do aparelho no backend.
    // SOMENTE ADICIONA (por id); nunca remove nada.
    const snap = body.snapshot || {}
    const userId = String(body.userId || '')
    if (!userId) throw new Error('Sem usuário')
    const counts = {}
    const mergeInto = (key, items) => {
      if (!Array.isArray(items)) { counts[key] = 0; return }
    let clean = items.filter((x) => x && x.id)
    if (key === 'users') {
      const haveIds = new Set(getAllUsers(store).map((u) => u && u.id))
      clean = clean.filter((x) => !haveIds.has(x.id)).map((x) => { const c = { ...x }; delete c.flags; return c })
    }
    if (key === 'servers') {
      clean = clean.map((x) => { const c = { ...x }; delete c.auditLog; return c })
    }
      if (store.directory && Array.isArray(store.directory[key])) {
        store.directory[key] = mergeById([], store.directory[key], clean)
      }
      if (data && Array.isArray(data[key])) data[key] = mergeById([], data[key], clean)
      counts[key] = clean.length
    }
    mergeInto('users', snap.users)
    mergeInto('servers', snap.servers)
    mergeInto('friends', snap.friends)
    mergeInto('messages', snap.messages)
    mergeInto('directMessages', snap.directMessages)
    mergeInto('stories', snap.stories)
    mergeInto('posts', snap.posts)
    return { restored: counts }
  },
  restoreServer: async (store, data, body) => {
    // Recupera servidor que existe no aparelho mas sumiu do backend (ex.:
    // limpeza indevida). So recria se o id NAO existir; exige que o chamador
    // seja dono ou membro segundo o proprio objeto.
    const server = body.server
    const userId = String(body.userId || '')
    if (!server || !server.id) throw new Error('Servidor invalido')
    const existing = getAllServers(store).find((s) => s && s.id === server.id)
    if (existing) return { server: existing }
    if (server.ownerId !== userId && !(server.members || []).includes(userId)) throw new Error('Sem permissao')
    if (data && Array.isArray(data.servers)) data.servers.push(server)
    upsertGlobalServer(store, server)
    return { server }
  },
  getServerByInvite: async (store, data, body) => {
    const inviteCode = String(body.inviteCode || '').trim().toUpperCase()
    return getAllServers(store).find((item) => item.inviteCode === inviteCode)
  },
  getServer: async (store, data, body) => {
    const serverId = String(body.serverId || '')
    const userId = String(body.userId || '')
    const server = getAllServers(store).find((item) => item && item.id === serverId)
    if (!server) return null
    if (server.ownerId !== userId && !(server.members || []).includes(userId)) return null
    return server
  },
  joinServer: async (store, data, body) => {
    if (!(await rateCheck('join:' + String(body.__actor || body.userId || 'x'), 15, 60000))) throw rateLimitError()
    const inviteCode = String(body.inviteCode || '').trim()
    const norm = inviteCode.toUpperCase()
    const byId = String(body.serverId || '').trim()
    const isPublic = (s) => s && (!s.settings || !s.settings.toggles || s.settings.toggles.public !== false)
    const server = getAllServers(store).find((item) => {
      if (!item) return false
      // Entrada direta por ID: SÓ servidor público (Discover). Privado
      // continua exigindo o código de convite.
      if (byId && item.id === byId) return isPublic(item)
      if (String(item.inviteCode || '').toUpperCase() === norm) return true
      const invites = item.settings && Array.isArray(item.settings.invites) ? item.settings.invites : []
      return invites.some((inv) => inv && String(inv.code || '').toUpperCase() === norm)
    })
    if (!server) return { success: false, error: byId ? 'Servidor privado: peça o código de convite' : 'Servidor nao encontrado com este codigo' }
    const joinerId = String(body.__actor || body.userId || '')
    if (!joinerId) return { success: false, error: 'Sessão inválida' }
    if (!Array.isArray(server.members)) server.members = []
    const banned = server.settings && Array.isArray(server.settings.banned) ? server.settings.banned : []
    if (banned.includes(joinerId)) return { success: false, error: 'Você foi banido deste servidor' }
    if (server.members.includes(joinerId)) return { success: false, error: 'Voce ja e membro deste servidor' }
    if (server.members.length >= 50) return { success: false, error: 'Servidor cheio (max 50 membros)' }
    server.members.push(joinerId)
    if (server.autoRoleId && Array.isArray(server.roles) && server.roles.some((r) => r && r.id === server.autoRoleId)) {
      if (!server.memberRoles || typeof server.memberRoles !== 'object') server.memberRoles = {}
      const current = Array.isArray(server.memberRoles[joinerId]) ? server.memberRoles[joinerId] : []
      if (!current.includes(server.autoRoleId)) server.memberRoles[joinerId] = [...current, server.autoRoleId]
    }
    upsertGlobalServer(store, server)
    if (!data.servers.some((item) => item.id === server.id)) data.servers.push(server)
    return { success: true, server, servers: data.servers }
  },
  updateServer: async (store, data, body) => {
    const server = getAllServers(store).find((item) => item.id === body.serverId)
    if (!server) throw new Error('Servidor nao encontrado')
    const actor = String(body.userId || '')
    const isOwner = actor === server.ownerId
    const isStaff = Array.isArray(server.staffMemberIds) && server.staffMemberIds.includes(actor)
    const patch = { ...(body.data || {}) }
    const onlyMembersChanged = Object.keys(patch).every((key) => key === 'members')
    const onlyMembershipChanged = Object.keys(patch).every((key) => key === 'members' || key === 'memberRoles')
    const onlyAuditChanged = Object.keys(patch).every((key) => key === 'auditLog')
    const selfMembershipChange = Array.isArray(patch.members)
      ? patch.members.length !== (server.members || []).length && patch.members.every((id) => id === actor || (server.members || []).includes(id))
      : false
    const isMember = actor === server.ownerId || (Array.isArray(server.members) && server.members.includes(actor))
    const roleIds = server.memberRoles && Array.isArray(server.memberRoles[actor]) ? server.memberRoles[actor] : []
    const rolePerms = new Set()
    if (Array.isArray(server.roles)) {
      for (const role of server.roles) {
        if (role && roleIds.includes(role.id) && Array.isArray(role.permissions)) {
          for (const perm of role.permissions) rolePerms.add(String(perm))
        }
      }
    }
    const isAdminRole = rolePerms.has('administrator')
    const canAll = isOwner || isStaff || isAdminRole
    const PATCH_PERMS = {
      roles: ['manageRoles'], memberRoles: ['manageRoles'],
      members: ['manageMembers', 'moderate'],
      settings: ['manageServer', 'moderate'],
      channels: ['manageChannels'], categories: ['manageChannels'],
      events: ['manageEvents'],
      name: ['manageServer'], photoUrl: ['manageServer'], bannerUrl: ['manageServer'],
      description: ['manageServer'], accentColor: ['manageServer'],
      callAccess: ['manageServer'], callPassword: ['manageServer'],
      category: ['manageServer'], tags: ['manageServer'],
    }
    const allowedByRole = Object.keys(patch).length > 0 && Object.keys(patch).every((key) => {
      if (key === 'auditLog') return isMember
      const need = PATCH_PERMS[key]
      if (!need) return false
      return canAll || need.some((perm) => rolePerms.has(perm))
    })
    if (!isOwner && !isStaff && !allowedByRole && !(onlyMembershipChanged && selfMembershipChange) && !(onlyAuditChanged && isMember)) {
      throw new Error('Somente o dono e cargos podem editar este servidor')
    }
    if (!isOwner) {
      delete patch.ownerId
      delete patch.staffMemberIds
    }
    if (!canAll) {
      if (Array.isArray(patch.roles)) {
        patch.roles = patch.roles.map((role) => role && Array.isArray(role.permissions)
          ? { ...role, permissions: role.permissions.filter((perm) => String(perm) !== 'administrator') }
          : role)
      }
      if (onlyMembershipChanged && patch.memberRoles) {
        const autoRoleId = server.autoRoleId && Array.isArray(server.roles) && server.roles.some((r) => r && r.id === server.autoRoleId) ? server.autoRoleId : null
        const incoming = patch.memberRoles[actor]
        patch.memberRoles = autoRoleId && Array.isArray(incoming) && incoming.includes(autoRoleId)
          ? { [actor]: Array.from(new Set([...(server.memberRoles?.[actor] || []), autoRoleId])) }
          : {}
      }
    }
    const updated = { ...server, ...patch, id: server.id, ownerId: server.ownerId }
    upsertGlobalServer(store, updated)
    const index = data.servers.findIndex((item) => item.id === server.id)
    if (index === -1) data.servers.push(updated)
    else data.servers[index] = updated
    return { server: updated, servers: data.servers }
  },
  deleteServer: async (store, data, body) => {
    const server = getAllServers(store).find((item) => item.id === body.serverId)
    if (!server) throw new Error('Servidor nao encontrado')
    if (String(body.userId || '') !== String(server.ownerId)) {
      throw new Error('Somente o criador pode apagar este servidor')
    }

    if (store.directory?.servers) {
      store.directory.servers = store.directory.servers.filter((item) => item.id !== server.id)
    }
    for (const profile of Object.values(store.profiles || {})) {
      profile.servers = Array.isArray(profile.servers)
        ? profile.servers.filter((item) => item.id !== server.id)
        : []
      profile.messages = Array.isArray(profile.messages)
        ? profile.messages.filter((message) => !(server.channels || []).some((channel) => channel.id === message.channelId))
        : []
      profile.callSessions = Array.isArray(profile.callSessions)
        ? profile.callSessions.filter((session) => session.serverId !== server.id)
        : []
    }
    if (store.directory?.callSessions) {
      store.directory.callSessions = store.directory.callSessions.filter((session) => session.serverId !== server.id)
    }
    return { serverId: server.id, servers: getAllServers(store).filter((item) => item.members?.includes(body.userId)) }
  },
  canJoinCall: async (store, data, body) => {
    const server = getAllServers(store).find((item) => item.id === body.serverId)
    if (!server) return { allowed: false, reason: 'Servidor nao encontrado' }
    const userId = String(body.userId || '')
    if (!server.members?.includes(userId)) return { allowed: false, reason: 'Apenas membros do servidor podem entrar' }
    const staff = userId === server.ownerId || server.staffMemberIds?.includes(userId)
    if (server.callAccess === 'staff' && !staff) return { allowed: false, reason: 'Esta call e exclusiva para a staff' }
    if (server.callPassword && String(body.password || '') !== String(server.callPassword)) {
      return { allowed: false, reason: 'Senha da call invalida', requiresPassword: true }
    }
    return { allowed: true, requiresPassword: Boolean(server.callPassword) }
  },
  sendCallSignal: async (store, data, body) => {
    const signal = body.signal || {}
    if (String(signal.fromUserId || '') !== String(body.__actor || '')) deny('Operação negada (403)')
    {
      const sigFrom = String(signal.fromUserId)
      const sigTo = String(signal.toUserId)
      const coSess = getAllCallSessions(store).some((s) => s && s.active && (s.participantIds || []).includes(sigFrom) && (s.participantIds || []).includes(sigTo))
      if (!coSess) {
        const targetSess = getAllCallSessions(store).find((s) => s && s.id === String(signal.sessionId))
        const targetDM = !targetSess || targetSess.serverId === 'dm'
        if (targetDM) {
          if (!areFriends(store, sigFrom, sigTo)) deny('Operação negada (403)')
        } else {
          const fromServers = new Set(memberServerIdsOf(store, sigFrom))
          const sharedSrv = memberServerIdsOf(store, sigTo).some((sid) => fromServers.has(sid))
          if (!sharedSrv && !areFriends(store, sigFrom, sigTo)) deny('Operação negada (403)')
        }
      }
    }
    const allowedTypes = ['offer', 'answer', 'candidate', 'renegotiate', 'decline', 'cancel', 'resync']
    if (!signal.sessionId || !signal.fromUserId || !signal.toUserId || !allowedTypes.includes(signal.type) || !signal.payload) {
      throw new Error('Sinal WebRTC invalido')
    }
    // FIX RACE CONDITION (09/2026): ANTES, signals iam no blob JSON do store
    // (store.directory.callSignals). Como sendCallSignal é NO_LOCK_ACTIONS (sem
    // lock), requests concorrentes (ex: answer + candidate simultâneos) faziam
    // loadStore → push → saveStore por cima um do outro, PERDENDO o answer →
    // call presa em new/ice:new. Agora: INSERT atômico na tabela call_signals
    // do Turso (cada INSERT é independente; sem load-modify-save). Fallback
    // (sem Turso): mantém o array do store mas com saveStore direto.
    const stored = {
      id: id(),
      sessionId: String(signal.sessionId),
      fromUserId: String(signal.fromUserId),
      toUserId: String(signal.toUserId),
      type: signal.type,
      payload: signal.payload,
      createdAt: now(),
    }
    if (isTurso()) {
      await ensureTursoSchema()
      await tursoFetch(
        `INSERT INTO call_signals (id, session_id, from_user_id, to_user_id, type, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [stored.id, stored.sessionId, stored.fromUserId, stored.toUserId, stored.type, JSON.stringify(stored.payload), stored.createdAt],
      )
      // Mantém a tabela enxuta (cutoff 120s + folga): apaga o que passou de 5min.
      try {
        await tursoFetch(`DELETE FROM call_signals WHERE created_at < ?`, [now() - 300_000])
      } catch { }
    } else {
      if (!store.directory) store.directory = { users: [], servers: [], friends: [], callSessions: [], callSignals: [] }
      const signals = getAllCallSignals(store)
      signals.push(stored)
      store.directory.callSignals = signals.slice(-500)
      await saveStore(store)
    }
    return { accepted: true }
  },
  sendCallSignals: async (store, data, body) => {
    // Lote de signals (trickle de candidates): 1 HTTP em vez de N.
    const list = Array.isArray(body.signals) ? body.signals.slice(0, 25) : []
    const allowedTypes = ['offer', 'answer', 'candidate', 'renegotiate', 'decline', 'cancel', 'resync']
    const rows = []
    for (const signal of list) {
      if (!signal || !signal.sessionId || !signal.fromUserId || !signal.toUserId || !allowedTypes.includes(signal.type) || !signal.payload) continue
      rows.push({
        id: id(),
        sessionId: String(signal.sessionId),
        fromUserId: String(signal.fromUserId),
        toUserId: String(signal.toUserId),
        type: signal.type,
        payload: signal.payload,
        createdAt: now(),
      })
    }
    if (rows.length === 0) return { accepted: 0 }
    if (isTurso()) {
      await ensureTursoSchema()
      for (const r of rows) {
        await tursoFetch(
          `INSERT INTO call_signals (id, session_id, from_user_id, to_user_id, type, payload, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [r.id, r.sessionId, r.fromUserId, r.toUserId, r.type, JSON.stringify(r.payload), r.createdAt],
        )
      }
      try {
        await tursoFetch(`DELETE FROM call_signals WHERE created_at < ?`, [now() - 300_000])
      } catch { }
    } else {
      if (!store.directory) store.directory = { users: [], servers: [], friends: [], callSessions: [], callSignals: [] }
      const signals = getAllCallSignals(store)
      for (const r of rows) signals.push(r)
      store.directory.callSignals = signals.slice(-500)
      await saveStore(store)
    }
    return { accepted: rows.length }
  },
  loadCallSignals: async (store, data, body) => {
    const userId = String(body.userId || '')
    const sessionId = String(body.sessionId || '')
    const since = Number(body.since || 0)
    if (isTurso()) {
      await ensureTursoSchema()
      // Incremental: o cliente manda o createdAt maximo ja visto; sem ele,
      // cai no cutoff de 120s. Sem isso cada poll baixava TODOS os signals
      // (centenas de candidates) a cada 400ms — pesando a call à toa.
      const cutoff = since > 0 ? since : now() - 120_000
      const result = await tursoFetch(
        `SELECT id, session_id, from_user_id, to_user_id, type, payload, created_at
         FROM call_signals
         WHERE session_id = ? AND to_user_id = ? AND created_at >= ?
         ORDER BY created_at ASC`,
        [sessionId, userId, cutoff],
      )
      const rows = result.rows || []
      return rows.map((row) => {
        const get = (i) => (row[i] && typeof row[i] === 'object' && 'value' in row[i] ? row[i].value : row[i])
        // colunas: 0=id 1=session_id 2=from_user_id 3=to_user_id 4=type 5=payload 6=created_at
        let payload = get(5)
        try { payload = JSON.parse(payload) } catch { }
        return {
          id: get(0),
          sessionId: get(1),
          fromUserId: get(2),
          toUserId: get(3),
          type: get(4),
          payload,
          createdAt: Number(get(6)),
        }
      })
    }
    return getAllCallSignals(store).filter((signal) => signal.sessionId === sessionId && signal.toUserId === userId && (since <= 0 || Number(signal.createdAt || 0) >= since))
  },
  // Servidores ICE (STUN + TURN) servidos pelo backend. O frontend chamava
  // getTurnCredentials mas a action nunca existiu no Vercel: ele caia sempre
  // no fallback com credenciais TURN estáticas do .env que EXPIRAM (metered.ca
  // rotaciona a cada 24h) — em rede 4G/5G sem TURN válido o ICE nao acha rota,
  // o WebRTC nao conecta e a call fica muda (ou o chamador preso em "Ligando...").
  // Agora as credenciais vivem nas env vars do Vercel (TURN_URL/TURN_USERNAME/
  // TURN_CREDENTIAL) e sao servidas aqui, rotacionaveis sem rebuild do front.
  getTurnCredentials: async (store, data, body) => {
    const inCallNow = getAllCallSessions(store).some((s) => s && s.active && ((s.participantIds || []).includes(body.__actor)))
    if (!inCallNow) deny('Entre em uma call primeiro (403)')
    // Prioridade 1: API key do metered.ca (TURN_API_KEY) — busca credenciais
    // FRESCAS do provedor (metered rotaciona a cada 24h). A API key nao expira,
    // entao o backend sempre devolve credenciais validas sem rebuild do front.
    const turnApiKey = String(process.env.TURN_API_KEY || '')
    if (turnApiKey) {
      try {
        const res = await fetch(`https://friendsspace.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(turnApiKey)}`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        })
        if (res.ok) {
          const fresh = await res.json()
          if (Array.isArray(fresh) && fresh.length) {
            const iceServers = fresh.map((s) => ({
              urls: Array.isArray(s.urls) ? s.urls : String(s.urls || '').split(',').map((u) => u.trim()).filter(Boolean),
              ...(s.username ? { username: s.username } : {}),
              ...(s.credential ? { credential: s.credential } : {}),
            }))
            // Garante STUN publico de fallback junto com o relay.
            if (!iceServers.some((s) => /stun:/i.test(String((s.urls || [])[0] || '')))) {
              iceServers.push({ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] })
            }
            return { iceServers }
          }
        }
      } catch { /* cai no fallback estatico abaixo */ }
    }
    // Prioridade 2: env vars estaticas (TURN_URL/TURN_USERNAME/TURN_CREDENTIAL).
    const turnUrl = String(process.env.TURN_URL || '')
    const turnUsername = String(process.env.TURN_USERNAME || '')
    const turnCredential = String(process.env.TURN_CREDENTIAL || '')
    const iceServers = []
    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({ urls: turnUrl.split(',').map((url) => url.trim()).filter(Boolean), username: turnUsername, credential: turnCredential })
    }
    iceServers.push({
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
      ],
    })
    return { iceServers }
  },
  botPost: async (store, data, body) => {
    const serverId = String(body.serverId || '')
    const channelId = String(body.channelId || '')
    const botName = String(body.botName || '').trim()
    const text = String(body.text || '')
    if (!botName) throw new Error('Bot inválido')
    const server = getAllServers(store).find((s) => s && s.id === serverId)
    if (!server) throw new Error('Servidor nao encontrado')
    if (server.ownerId !== body.__actor && !(server.staffMemberIds || []).includes(body.__actor)) deny('Somente staff (403)')
    const message = {
      id: id(),
      channelId,
      userId: `bot:${serverId}:${now()}`,
      userName: botName,
      userPhoto: '',
      content: text.slice(0, 2000),
      type: 'text',
      isBot: true,
      createdAt: now(),
    }
    data.messages.push(message)
    upsertGlobalItem(store, 'messages', message)
    return { message }
  },
  sendMessage: async (store, data, body) => {
    const message = { id: id(), createdAt: now(), type: 'text', ...body.message }
    if (String(message.userId || '') !== String(body.__actor || '') || (message.fromId && String(message.fromId) !== String(body.__actor || ''))) deny('Operação negada (403)')
    {
      const srvMsg = serverOfChannel(store, message.channelId)
      if (!srvMsg || (srvMsg.ownerId !== body.__actor && !(srvMsg.members || []).includes(body.__actor))) deny('Apenas membros (403)')
    }
    data.messages.push(message)
    upsertGlobalItem(store, 'messages', message)
    const server = getAllServers(store).find((s) => s && Array.isArray(s.channels) && s.channels.some((c) => c && c.id === message.channelId))
    const channel = server?.channels && Array.isArray(server.channels)
      ? server.channels.find((c) => c && c.id === message.channelId)
      : null
    if (server && channel) {
      const preview = String(message.content || '').slice(0, 80)
        || (message.attachmentName ? `[${message.attachmentName}]` : '')
        || (message.type === 'audio' ? '[audio]' : '')
      for (const memberId of (server.members || [])) {
        if (memberId === message.userId) continue
        bumpUnread(store, memberId, message.channelId)
        if (userMentionedIn(store, memberId, message.content)) {
          addNotification(store, {
            toUserId: memberId,
            fromUserId: message.userId,
            fromName: message.userName || 'Usuario',
            fromPhoto: message.userPhoto || '',
            type: 'mention',
            title: `${message.userName || 'Usuario'} te mencionou em #${channel.name}`,
            body: preview,
            data: { serverId: server.id, channelId: message.channelId, mention: true },
          })
          continue
        }
        addNotification(store, {
          toUserId: memberId,
          fromUserId: message.userId,
          fromName: message.userName || 'Usuario',
          fromPhoto: message.userPhoto || '',
          type: 'server-message',
          title: `${message.userName || 'Usuario'} mandou em #${channel.name}`,
          body: preview,
          data: { serverId: server.id, channelId: message.channelId },
        })
      }
    }
    return { message, messages: getAllMessages(store).filter((item) => item.channelId === message.channelId).sort((a, b) => a.createdAt - b.createdAt) }
  },
  loadMessages: async (store, data, body) => {
    if (body.userId) clearUnread(store, String(body.userId), String(body.channelId || ''))
    {
      const srvLoad = serverOfChannel(store, body.channelId)
      if (!srvLoad || (srvLoad.ownerId !== body.__actor && !(srvLoad.members || []).includes(body.__actor))) deny('Apenas membros (403)')
    }
    return getAllMessages(store).filter((message) => message.channelId === body.channelId).sort((a, b) => a.createdAt - b.createdAt)
  },
  getUnread: async (store, data, body) => {
    const userId = String(body.userId || '')
    const map = unreadMapFor(store, userId)
    const total = Object.values(map).reduce((sum, count) => sum + count, 0)
    return { map, total }
  },
  markChannelRead: async (store, data, body) => {
    clearUnread(store, String(body.userId || ''), String(body.channelId || ''))
    return { map: unreadMapFor(store, String(body.userId || '')) }
  },
  markChannelUnread: async (store, data, body) => {
    ensureUnread(store, String(body.userId || ''), String(body.channelId || ''))
    return { map: unreadMapFor(store, String(body.userId || '')) }
  },
  editMessage: async (store, data, body) => {
    const message = getAllMessages(store).find((item) => item.id === body.messageId)
    if (!message) throw new Error('Mensagem nao encontrada')
    const actorId = String(body.userId || '')
    const server = getAllServers(store).find((s) => s && Array.isArray(s.channels) && s.channels.some((c) => c && c.id === message.channelId))
    const isStaff = server && (server.ownerId === actorId || server.staffMemberIds?.includes(actorId))
    if (message.userId !== actorId && !isStaff) throw new Error('Sem permissao para editar')
    message.content = String(body.content || '')
    message.edited = true
    message.editedAt = now()
    upsertGlobalItem(store, 'messages', message)
    return { message }
  },
  deleteMessage: async (store, data, body) => {
    const message = getAllMessages(store).find((item) => item.id === body.messageId)
    if (!message) throw new Error('Mensagem nao encontrada')
    const actorId = String(body.userId || '')
    const server = getAllServers(store).find((s) => s && Array.isArray(s.channels) && s.channels.some((c) => c && c.id === message.channelId))
    const isStaff = server && (server.ownerId === actorId || server.staffMemberIds?.includes(actorId))
    if (message.userId !== actorId && !isStaff) throw new Error('Sem permissao para excluir')
    for (const profile of Object.values(store.profiles || {})) {
      profile.messages = Array.isArray(profile.messages) ? profile.messages.filter((item) => item.id !== message.id) : []
    }
    if (store.directory?.messages) {
      store.directory.messages = store.directory.messages.filter((item) => item.id !== message.id)
    }
    return { messageId: message.id }
  },
  addReaction: async (store, data, body) => {
    const message = getAllMessages(store).find((item) => item.id === body.messageId)
    if (!message) throw new Error('Mensagem nao encontrada')
    {
      const srvReact = serverOfChannel(store, message.channelId)
      if (!srvReact || (srvReact.ownerId !== body.__actor && !(srvReact.members || []).includes(body.__actor))) deny('Apenas membros (403)')
    }
    const emoji = String(body.emoji || '')
    const userId = String(body.userId || '')
    if (!emoji || !userId) throw new Error('Reacao invalida')
    const reactions = Array.isArray(message.reactions) ? [...message.reactions] : []
    const existing = reactions.find((item) => item.emoji === emoji)
    if (existing) {
      if (!existing.userIds.includes(userId)) existing.userIds = [...existing.userIds, userId]
    } else {
      reactions.push({ emoji, userIds: [userId] })
    }
    message.reactions = reactions
    upsertGlobalItem(store, 'messages', message)
    return { message }
  },
  removeReaction: async (store, data, body) => {
    const message = getAllMessages(store).find((item) => item.id === body.messageId)
    if (!message) throw new Error('Mensagem nao encontrada')
    {
      const srvReact = serverOfChannel(store, message.channelId)
      if (!srvReact || (srvReact.ownerId !== body.__actor && !(srvReact.members || []).includes(body.__actor))) deny('Apenas membros (403)')
    }
    const emoji = String(body.emoji || '')
    const userId = String(body.userId || '')
    const reactions = Array.isArray(message.reactions) ? message.reactions.map((item) => item.emoji === emoji ? { ...item, userIds: item.userIds.filter((id) => id !== userId) } : item).filter((item) => item.userIds.length > 0) : []
    message.reactions = reactions
    upsertGlobalItem(store, 'messages', message)
    return { message }
  },
  forwardMessage: async (store, data, body) => {
    const source = getAllMessages(store).find((item) => item.id === body.messageId)
    if (!source) throw new Error('Mensagem nao encontrada')
    const targetChannelId = String(body.targetChannelId || '')
    if (!targetChannelId) throw new Error('Canal de destino invalido')
    const forwarder = getAllUsers(store).find((u) => u && u.id === body.userId) || {}
    const message = {
      id: id(),
      channelId: targetChannelId,
      userId: body.userId || '',
      userName: forwarder.name || String(body.userName || 'Usuario'),
      userPhoto: forwarder.photoUrl || String(body.userPhoto || ''),
      content: source.content || '',
      type: source.type || 'text',
      audioUrl: source.audioUrl,
      attachmentUrl: source.attachmentUrl,
      attachmentName: source.attachmentName,
      attachmentType: source.attachmentType,
      forwardedFrom: { id: source.userId, userName: source.userName || 'Usuario' },
      createdAt: now(),
    }
    data.messages.push(message)
    {
      const srvFwdSrc = serverOfChannel(store, source.channelId)
      if (!srvFwdSrc || (srvFwdSrc.ownerId !== body.__actor && !(srvFwdSrc.members || []).includes(body.__actor))) deny('Apenas membros (403)')
      const srvFwdDst = serverOfChannel(store, targetChannelId)
      if (!srvFwdDst || (srvFwdDst.ownerId !== body.__actor && !(srvFwdDst.members || []).includes(body.__actor))) deny('Apenas membros (403)')
    }
    upsertGlobalItem(store, 'messages', message)
    return { message }
  },
  createReport: async (store, data, body) => {
    const reporterId = String(body.reporterId || '')
    if (reporterId !== String(body.__actor || '')) deny('Operação negada (403)')
    const type = String(body.type || '')
    const target = body.target && typeof body.target === 'object' ? body.target : {}
    if (!reporterId || !['media', 'message', 'user', 'server', 'help'].includes(type) || !target.id) {
      throw new Error('Denuncia invalida')
    }
    const questionnaire = Array.isArray(body.questionnaire) ? body.questionnaire.map((item) => String(item)) : []
    const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 8).map((item) => ({
      url: String(item?.url || '').slice(0, 2000),
      name: String(item?.name || 'Prova').slice(0, 180),
      type: String(item?.type || 'file').slice(0, 120),
    })).filter((item) => item.url) : []
    const report = {
      id: id(),
      reporterId,
      type,
      subject: String(body.subject || '').slice(0, 160),
      target: {
        id: String(target.id),
        name: target.name == null ? '' : String(target.name),
        channelId: target.channelId == null ? '' : String(target.channelId),
        serverId: target.serverId == null ? '' : String(target.serverId),
        messageId: target.messageId == null ? '' : String(target.messageId),
        preview: target.preview == null ? '' : String(target.preview),
      },
      questionnaire,
      description: String(body.description || ''),
      proofUrl: String(body.proofUrl || ''),
      evidence,
      messages: [],
      defenseOpen: false,
      status: 'pending',
      response: '',
      complained: false,
      complaintMessage: '',
      createdAt: now(),
    }
    upsertGlobalItem(store, 'reports', report)
    return { report }
  },
  getMyReports: async (store, data, body) => getAllReports(store)
    .filter((report) => report.reporterId === String(body.userId || ''))
    .sort((a, b) => b.createdAt - a.createdAt),
  reportUnanswered: async (store, data, body) => {
    const report = getAllReports(store).find((item) => item.id === body.reportId && item.reporterId === String(body.userId || ''))
    if (!report) throw new Error('Denuncia nao encontrada')
    report.complained = true
    report.complaintMessage = String(body.message || '')
    report.complainedAt = now()
    upsertGlobalItem(store, 'reports', report)
    return { report }
  },

  // ===== Moderação (dev / support) =====

  listAllReports: async (store, data, body) => {
    const admin = requireFlags(store, body, 'support')
    if (!isSupport(admin)) throw new Error('Sem permissao de suporte')
    const onlyPending = body.onlyPending === true
    const reports = getAllReports(store)
      .filter((r) => !onlyPending || r.status === 'pending')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => {
        const reporter = findGlobalUser(store, r.reporterId)
        return {
          ...r,
          reporterName: reporter ? reporter.name : 'Usuario',
        }
      })
    return { reports }
  },

  respondReport: async (store, data, body) => {
    const admin = requireFlags(store, body, 'support')
    if (!isSupport(admin)) throw new Error('Sem permissao de suporte')
    const report = getAllReports(store).find((r) => r.id === String(body.reportId || ''))
    if (!report) throw new Error('Denuncia nao encontrada')
    if (!Array.isArray(report.messages)) report.messages = []
    const message = {
      id: id(),
      authorId: admin.id,
      authorName: admin.name || 'Suporte',
      authorRole: 'support',
      content: String(body.response || ''),
      attachments: [],
      createdAt: now(),
    }
    if (message.content) report.messages.push(message)
    report.status = 'awaiting_user'
    report.response = String(body.response || '')
    report.respondedAt = now()
    report.respondedBy = admin.name
    report.assignedTo = admin.id
    report.assignedToName = admin.name || 'Suporte'
    upsertGlobalItem(store, 'reports', report)
    if (message.content) {
      addNotification(store, {
        toUserId: report.reporterId,
        fromUserId: 'system',
        fromName: 'Friends Space',
        type: 'ticket',
        title: 'Seu ticket foi respondido',
        body: message.content.slice(0, 160),
        data: { reportId: report.id },
      })
    }
    return { report }
  },

  sendReportMessage: async (store, data, body) => {
    const actor = actorOf(store, body)
    const actorUser = findGlobalUser(store, actor)
    if (!actorUser) deny('Usuario nao encontrado')
    const report = getAllReports(store).find((r) => r.id === String(body.reportId || ''))
    if (!report) throw new Error('Ticket nao encontrado')
    const staff = isSupport(actorUser)
    const reporter = report.reporterId === actor
    const target = report.target && report.target.id === actor && report.defenseOpen === true
    if (!staff && !reporter && !target) deny('Sem acesso a este ticket (403)')
    const content = String(body.content || '').slice(0, 4000)
    const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 8).map((item) => ({
      url: String(item?.url || '').slice(0, 2000),
      name: String(item?.name || 'Prova').slice(0, 180),
      type: String(item?.type || 'file').slice(0, 120),
    })).filter((item) => item.url) : []
    if (!content.trim() && attachments.length === 0) throw new Error('Escreva uma mensagem ou anexe uma prova')
    if (!Array.isArray(report.messages)) report.messages = []
    const message = {
      id: id(),
      authorId: actor,
      authorName: actorUser.name || 'Usuario',
      authorRole: staff ? 'support' : reporter ? 'reporter' : 'target',
      content,
      attachments,
      createdAt: now(),
    }
    report.messages.push(message)
    if (staff) {
      report.status = report.status === 'resolved' ? 'resolved' : 'awaiting_user'
      report.assignedTo = actor
      report.assignedToName = actorUser.name || 'Suporte'
    } else if (report.status !== 'resolved') {
      report.status = 'awaiting_support'
    }
    upsertGlobalItem(store, 'reports', report)
    if (staff && report.reporterId !== actor) {
      addNotification(store, {
        toUserId: report.reporterId,
        fromUserId: 'system',
        fromName: 'Friends Space',
        type: 'ticket',
        title: 'Nova resposta no seu ticket',
        body: content ? content.slice(0, 160) : 'A equipe anexou uma prova.',
        data: { reportId: report.id },
      })
    }
    if (staff && reporter === false && report.target && report.defenseOpen) {
      addNotification(store, {
        toUserId: report.target.id,
        fromUserId: 'system',
        fromName: 'Friends Space',
        type: 'ticket',
        title: 'Atualizacao na sua defesa',
        body: content ? content.slice(0, 160) : 'A equipe anexou uma prova.',
        data: { reportId: report.id, defense: true },
      })
    }
    return { report }
  },

  setReportStatus: async (store, data, body) => {
    const admin = requireFlags(store, body, 'support')
    if (!isSupport(admin)) throw new Error('Sem permissao de suporte')
    const report = getAllReports(store).find((r) => r.id === String(body.reportId || ''))
    if (!report) throw new Error('Ticket nao encontrado')
    const allowed = ['pending', 'open', 'awaiting_user', 'awaiting_support', 'defense', 'resolved']
    const status = String(body.status || '')
    if (status && !allowed.includes(status)) throw new Error('Status invalido')
    if (!Array.isArray(report.messages)) report.messages = []
    if (body.defenseOpen === true && report.defenseOpen !== true) {
      report.defenseOpen = true
      report.status = 'defense'
      report.messages.push({
        id: id(),
        authorId: admin.id,
        authorName: admin.name || 'Suporte',
        authorRole: 'system',
        content: 'O usuario denunciado foi chamado para apresentar a defesa dele.',
        attachments: [],
        createdAt: now(),
      })
      addNotification(store, {
        toUserId: report.target && report.target.id,
        fromUserId: 'system',
        fromName: 'Friends Space',
        type: 'ticket',
        title: 'Voce foi chamado a se defender',
        body: 'Abra Ajuda > Meus tickets para ver o caso e enviar sua defesa com provas.',
        data: { reportId: report.id, defense: true },
      })
    }
    if (status === 'resolved') {
      report.status = 'resolved'
      report.resolvedAt = now()
      report.resolvedBy = admin.name || 'Suporte'
      report.verdict = String(body.verdict || report.verdict || '').slice(0, 2000)
      report.punishment = String(body.punishment || report.punishment || '').slice(0, 300)
      report.messages.push({
        id: id(),
        authorId: admin.id,
        authorName: admin.name || 'Suporte',
        authorRole: 'system',
        content: 'Ticket encerrado.' + (report.verdict ? ' Veredito: ' + report.verdict : '') + (report.punishment ? ' Consequencia: ' + report.punishment : ''),
        attachments: [],
        createdAt: now(),
      })
      addNotification(store, {
        toUserId: report.reporterId,
        fromUserId: 'system',
        fromName: 'Friends Space',
        type: 'ticket',
        title: 'Seu ticket foi encerrado',
        body: (report.verdict || 'Veja o veredito no seu ticket.').slice(0, 160),
        data: { reportId: report.id },
      })
      if (report.target && report.target.id) {
        addNotification(store, {
          toUserId: report.target.id,
          fromUserId: 'system',
          fromName: 'Friends Space',
          type: 'ticket',
          title: 'Resultado do caso',
          body: (report.verdict || 'Veja o resultado no seu ticket.').slice(0, 160),
          data: { reportId: report.id, defense: true },
        })
      }
    } else if (status) {
      report.status = status
    }
    if (body.assign === true) {
      report.assignedTo = admin.id
      report.assignedToName = admin.name || 'Suporte'
    }
    upsertGlobalItem(store, 'reports', report)
    return { report }
  },

  getMyDefenses: async (store, data, body) => {
    const actor = actorOf(store, body)
    return getAllReports(store)
      .filter((report) => report && report.defenseOpen === true && report.target && report.target.id === actor)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((report) => ({
        ...report,
        reporterId: '',
        reporterName: 'Equipe Friends Space',
        messages: Array.isArray(report.messages)
          ? report.messages.filter((message) => message.authorRole !== 'reporter')
          : [],
      }))
  },

  banUser: async (store, data, body) => {
    const admin = requireFlags(store, body, 'support')
    if (!isSupport(admin)) throw new Error('Sem permissao de suporte')
    const target = findGlobalUser(store, String(body.targetId || ''))
    if (!target) throw new Error('Usuario nao encontrado')
    if (isDev(target)) throw new Error('Nao e possivel banir outro dev')
    target.flags = { ...(target.flags || {}), banned: true }
    target.banReason = String(body.reason || '')
    target.bannedAt = now()
    target.bannedBy = admin.name
    upsertGlobalItem(store, 'users', target)
    const all = getAllUsers(store).map((u) => u.id === target.id ? target : u)
    return { user: target, users: all }
  },

  unbanUser: async (store, data, body) => {
    const admin = requireFlags(store, body, 'support')
    if (!isSupport(admin)) throw new Error('Sem permissao de suporte')
    const target = findGlobalUser(store, String(body.targetId || ''))
    if (!target) throw new Error('Usuario nao encontrado')
    const flags = { ...(target.flags || {}) }
    delete flags.banned
    target.flags = flags
    delete target.banReason
    delete target.bannedAt
    delete target.bannedBy
    upsertGlobalItem(store, 'users', target)
    const all = getAllUsers(store).map((u) => u.id === target.id ? target : u)
    return { user: target, users: all }
  },

  setUserVerified: async (store, data, body) => {
    const admin = requireFlags(store, body, 'dev')
    if (!isDev(admin)) throw new Error('Somente dev pode verificar contas')
    const target = findGlobalUser(store, String(body.targetId || ''))
    if (!target) throw new Error('Usuario nao encontrado')
    target.flags = { ...(target.flags || {}), verified: body.verified === true }
    if (body.verified === true) {
      target.verifiedAt = now()
      target.verifiedBy = admin.name
    } else {
      delete target.verifiedAt
      delete target.verifiedBy
    }
    upsertGlobalItem(store, 'users', target)
    const all = getAllUsers(store).map((u) => u.id === target.id ? target : u)
    return { user: target, users: all }
  },

  setUserDev: async (store, data, body) => {
    const admin = requireFlags(store, body, 'dev')
    if (!isDev(admin)) throw new Error('Somente dev pode promover dev')
    const target = findGlobalUser(store, String(body.targetId || ''))
    if (!target) throw new Error('Usuario nao encontrado')
    target.flags = { ...(target.flags || {}), dev: body.makeDev === true }
    writeUserEverywhere(store, data, target)
    upsertGlobalItem(store, 'users', target)
    const all = getAllUsers(store).map((u) => u.id === target.id ? target : u)
    return { user: target, users: all }
  },
  setUserSupport: async (store, data, body) => {
    const admin = requireFlags(store, body, 'dev')
    if (!isDev(admin)) throw new Error('Somente dev pode promover suporte')
    const target = findGlobalUser(store, String(body.targetId || ''))
    if (!target) throw new Error('Usuario nao encontrado')
    if (body.support === true && isDev(target)) throw new Error('Nao e possivel alterar outro dev')
    target.flags = { ...(target.flags || {}), support: body.support === true }
    upsertGlobalItem(store, 'users', target)
    const all = getAllUsers(store).map((u) => u.id === target.id ? target : u)
    return { user: target, users: all }
  },

  findUserById: async (store, data, body) => {
    const admin = requireFlags(store, body, 'dev')
    if (!isSupport(admin)) throw new Error('Sem permissao de suporte')
    const q = String(body.query || '').trim().toLowerCase()
    if (!q) return { users: [] }
    const users = getAllUsers(store).filter((u) =>
      (u && String(u.id || '').toLowerCase()) === q
      || (u && String(u.friendCode || '').toLowerCase()) === q
      || (u && String(u.email || '').toLowerCase()) === q
      || (u && String(u.name || '').toLowerCase().includes(q))
    ).slice(0, 20)
    return { users: withPublicUsers(users) }
  },

  setServerVerified: async (store, data, body) => {
    const admin = findGlobalUser(store, String(body.adminId || ''))
    if (!isDev(admin)) throw new Error('Somente dev pode verificar servidores')
    const server = getAllServers(store).find((s) => s.id === String(body.serverId || '') || s.inviteCode === String(body.serverId || ''))
    if (!server) throw new Error('Servidor nao encontrado')
    server.verified = body.verified === true
    if (body.verified === true && body.partner) server.partner = String(body.partner).slice(0, 40)
    if (body.verified !== true) delete server.partner
    server.verifiedAt = now()
    upsertGlobalServer(store, server)
    const servers = getAllServers(store).map((s) => s.id === server.id ? server : s)
    return { server, servers }
  },

  transferServerOwner: async (store, data, body) => {
    const admin = requireFlags(store, body, 'dev')
    if (!isDev(admin)) throw new Error('Somente dev pode transferir servidores')
    const server = getAllServers(store).find((s) => s.id === String(body.serverId || ''))
    if (!server) throw new Error('Servidor nao encontrado')
    const newOwner = findGlobalUser(store, String(body.newOwnerId || ''))
    if (!newOwner) throw new Error('Novo dono nao encontrado')
    server.ownerId = newOwner.id
    if (!Array.isArray(server.members)) server.members = []
    if (!server.members.includes(newOwner.id)) server.members.push(newOwner.id)
    upsertGlobalServer(store, server)
    const servers = getAllServers(store).map((s) => s.id === server.id ? server : s)
    return { server, servers }
  },

  listCallSessionsAdmin: async (store, data, body) => {
    const admin = requireFlags(store, body, 'dev')
    if (!isDev(admin)) throw new Error('Somente dev pode inspecionar chamadas')
    const sessions = getAllCallSessions(store).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    const users = getAllUsers(store)
    const signals = Array.isArray(store.directory.callSignals) ? store.directory.callSignals : []
    return {
      sessions: sessions.map((s) => ({
        ...s,
        memberNames: (s.participantIds || []).map((mid) => users.find((u) => u.id === mid)?.name || mid),
        signalCount: signals.filter((sig) => sig.sessionId === s.id).length,
      })),
      signalCount: signals.length,
    }
  },

  cleanupCallSession: async (store, data, body) => {
    const admin = requireFlags(store, body, 'dev')
    if (!isDev(admin)) throw new Error('Somente dev pode limpar chamadas')
    const sessionId = String(body.sessionId || '')
    if (!sessionId) throw new Error('sessionId obrigatorio')
    const sessions = getAllCallSessions(store)
    const before = sessions.length
    const kept = sessions.filter((s) => s.id !== sessionId)
    store.directory.callSessions = kept
    store.directory.callSignals = (Array.isArray(store.directory.callSignals) ? store.directory.callSignals : [])
      .filter((sig) => sig.sessionId !== sessionId)
    saveStore(store)
    const nowCount = getAllCallSessions(store).length
    return { removed: before - nowCount }
  },

  loadMyFolders: async (store, data, body) => getAllFolders(store)
    .filter((folder) => folder.ownerId === String(body.userId || ''))
    .sort((a, b) => a.createdAt - b.createdAt),
  createFolder: async (store, data, body) => {
    const ownerId = String(body.userId || '')
    const name = String(body.name || '').trim().slice(0, 60)
    if (!ownerId || !name) throw new Error('Nome da pasta invalido')
    const folder = {
      id: id(),
      ownerId,
      name,
      serverIds: Array.isArray(body.serverIds) ? body.serverIds.filter((item) => typeof item === 'string') : [],
      createdAt: now(),
    }
    upsertGlobalItem(store, 'folders', folder)
    return { folder }
  },
  updateFolder: async (store, data, body) => {
    const userId = String(body.userId || '')
    const folder = getAllFolders(store).find((item) => item.id === body.folderId)
    if (!folder) throw new Error('Pasta nao encontrada')
    if (folder.ownerId !== userId) throw new Error('Somente o dono pode editar a pasta')
    if (body.name !== undefined) folder.name = String(body.name || '').trim().slice(0, 60) || folder.name
    if (Array.isArray(body.serverIds)) {
      const targetIds = body.serverIds.filter((item) => typeof item === 'string')
      for (const other of getAllFolders(store)) {
        if (other.id === folder.id || other.ownerId !== userId) continue
        other.serverIds = (Array.isArray(other.serverIds) ? other.serverIds : []).filter((item) => !targetIds.includes(item))
      }
      folder.serverIds = targetIds
    }
    if (body.color !== undefined) folder.color = body.color ? String(body.color).slice(0, 24) : undefined
    upsertGlobalItem(store, 'folders', folder)
    return { folder, folders: getAllFolders(store).filter((item) => item.ownerId === userId) }
  },
  deleteFolder: async (store, data, body) => {
    const userId = String(body.userId || '')
    const folder = getAllFolders(store).find((item) => item.id === body.folderId)
    if (!folder) throw new Error('Pasta nao encontrada')
    if (folder.ownerId !== userId) throw new Error('Somente o dono pode apagar a pasta')
    if (store.directory?.folders) {
      store.directory.folders = store.directory.folders.filter((item) => item.id !== folder.id)
    }
    return { folderId: folder.id }
  },
  shareFolder: async (store, data, body) => {
    const userId = String(body.userId || '')
    const toUserId = String(body.toUserId || '')
    const folder = getAllFolders(store).find((item) => item.id === body.folderId)
    if (!folder) throw new Error('Pasta nao encontrada')
    if (folder.ownerId !== userId) throw new Error('Somente o dono pode encaminhar a pasta')
    if (!toUserId || toUserId === userId) throw new Error('Destino invalido')
    const memberServers = getAllServers(store)
      .filter((server) => folder.serverIds.includes(server.id) && server.members?.includes(toUserId))
      .map((server) => server.id)
    const copy = {
      id: id(),
      ownerId: toUserId,
      name: `${folder.name} (compartilhada)`,
      serverIds: memberServers,
      color: folder.color,
      sharedFrom: folder.id,
      createdAt: now(),
    }
    upsertGlobalItem(store, 'folders', copy)
    const from = getAllUsers(store).find((u) => u && u.id === userId)
    addNotification(store, {
      toUserId,
      fromUserId: userId,
      fromName: from?.name || 'Usuario',
      fromPhoto: from?.photoUrl || '',
      type: 'folder-share',
      title: `Pasta "${folder.name}" compartilhada`,
      body: `${from?.name || 'Alguem'} encaminhou uma pasta de servidores para voce`,
      data: { folderId: copy.id },
    })
    return { folder: copy }
  },
  sendFriendRequest: async (store, data, body) => {
    if (!(await rateCheck('friend:' + String(body.__actor || body.userId || 'x'), 20, 60000))) throw rateLimitError()
    if (body.userId === body.friendId) throw new Error('Você não pode adicionar você mesmo')
    const requester = getAllUsers(store).find((u) => u && u.id === body.userId)
    const target = getAllUsers(store).find((u) => u && u.id === body.friendId)
    const requesterBlocked = Array.isArray(requester?.blocked) ? requester.blocked : []
    const targetBlocked = Array.isArray(target?.blocked) ? target.blocked : []
    if (targetBlocked.includes(body.userId)) throw new Error('Você foi bloqueado por este usuário')
    if (requesterBlocked.includes(body.friendId)) throw new Error('Você bloqueou este usuário')
    const existing = getAllFriends(store).find((friend) =>
      (friend.userId === body.userId && friend.friendId === body.friendId)
      || (friend.userId === body.friendId && friend.friendId === body.userId)
    )
    if (existing) {
      if (existing.status === 'pending' && existing.userId === body.friendId) {
        existing.status = 'accepted'
        upsertGlobalFriend(store, existing)
      }
    } else {
      const friend = { id: id(), userId: body.userId, friendId: body.friendId, status: 'pending', createdAt: now() }
      data.friends.push(friend)
      upsertGlobalFriend(store, friend)
      const requester = getAllUsers(store).find((u) => u && u.id === body.userId)
      if (requester) {
        addNotification(store, {
          toUserId: body.friendId,
          fromUserId: body.userId,
          fromName: requester.name,
          fromPhoto: requester.photoUrl || '',
          type: 'friend-request',
          title: `${requester.name} te enviou uma solicitacao de amizade`,
          body: `@${requester.friendCode || ''}`,
          data: { friendId: friend.id },
        })
        pushQuiet(body.friendId, `${requester.name} te enviou uma solicitacao de amizade`, 'Amizade', { url: '/' })
      }
    }
    return { friends: getAllFriends(store).filter((friend) => friend.userId === body.userId || friend.friendId === body.userId), friendUsers: acceptedFriendUsers(store, data, body.userId) }
  },
  respondFriendRequest: async (store, data, body) => {
    const friend = getAllFriends(store).find((item) => item.id === body.friendId)
    if (!friend) throw new Error('Solicitacao nao encontrada')
    if (String(friend.friendId) !== String(body.userId)) {
      throw new Error('Somente o destinatario pode responder a solicitacao')
    }
    if (body.accept) {
      friend.status = 'accepted'
      upsertGlobalFriend(store, friend)
      const accepter = getAllUsers(store).find((u) => u && u.id === body.userId)
      if (accepter) {
        addNotification(store, {
          toUserId: friend.userId,
          fromUserId: body.userId,
          fromName: accepter.name,
          fromPhoto: accepter.photoUrl || '',
          type: 'friend-accept',
          title: `${accepter.name} aceitou sua amizade`,
          body: '',
          data: {},
        })
        pushQuiet(friend.userId, `${accepter.name} aceitou sua amizade`, 'Amizade', { url: '/' })
      }
    } else {
      data.friends = data.friends.filter((item) => item.id !== friend.id)
      if (store.directory?.friends) store.directory.friends = store.directory.friends.filter((item) => item.id !== friend.id)
    }
    return { friends: getAllFriends(store).filter((friend) => friend.userId === body.userId || friend.friendId === body.userId), friendUsers: acceptedFriendUsers(store, data, body.userId) }
  },
  loadFriends: async (store, data, body) => ({
    friends: getAllFriends(store).filter((friend) => friend.userId === body.userId || friend.friendId === body.userId),
    friendUsers: acceptedFriendUsers(store, data, body.userId),
  }),
  removeFriend: async (store, data, body) => {
  {
    const fr = getAllFriends(store).find((x) => x && x.id === body.friendId)
    if (!fr || (fr.userId !== body.__actor && fr.friendId !== body.__actor)) deny('Operação negada (403)')
  }
    data.friends = data.friends.filter((friend) => friend.id !== body.friendId)
    if (store.directory?.friends) store.directory.friends = store.directory.friends.filter((friend) => friend.id !== body.friendId)
    return { friends: getAllFriends(store).filter((friend) => friend.userId === body.userId || friend.friendId === body.userId), friendUsers: acceptedFriendUsers(store, data, body.userId) }
  },
  sendDirectMessage: async (store, data, body) => {
    const message = { id: id(), createdAt: now(), type: 'text', ...body.message }
    if (String(message.fromId || '') !== String(body.__actor || '')) deny('Operação negada (403)')
    data.directMessages.push(message)
    upsertGlobalItem(store, 'directMessages', message)
    const sender = getAllUsers(store).find((u) => u && u.id === message.fromId)
    if (sender && message.toId && message.fromId !== message.toId) {
      const preview = String(message.content || '').slice(0, 80)
        || (message.attachmentName ? `[${message.attachmentName}]` : '')
        || (message.type === 'audio' ? '[audio]' : '')
      const mentioned = userMentionedIn(store, message.toId, message.content)
      addNotification(store, {
        toUserId: message.toId,
        fromUserId: message.fromId,
        fromName: sender.name,
        fromPhoto: sender.photoUrl || '',
        type: mentioned ? 'mention' : 'dm',
        title: mentioned ? `${sender.name} te mencionou` : `${sender.name} mandou`,
        body: preview,
        data: { toId: message.toId, fromId: message.fromId, mention: mentioned },
      })
    }
    return { message }
  },
  loadDirectMessages: async (store, data, body) => {
    const actor = actorOf(store, body)
    const a = String(body.userId1 || '')
    const b = String(body.userId2 || '')
    if (actor !== a && actor !== b) deny('Operação negada (403)')
    return getAllDirectMessages(store)
      .filter((message) =>
        (message.fromId === a && message.toId === b)
        || (message.fromId === b && message.toId === a)
      )
      .sort((x, y) => x.createdAt - y.createdAt)
  },
  deleteDirectMessage: async (store, data, body) => {
    const message = getAllDirectMessages(store).find((item) => item.id === body.messageId)
    if (!message) throw new Error('Mensagem nao encontrada')
    const actorId = String(body.__actor || body.userId || '')
    if (String(message.fromId || '') !== actorId) throw new Error('Sem permissao para excluir')
    for (const profile of Object.values(store.profiles || {})) {
      profile.directMessages = Array.isArray(profile.directMessages) ? profile.directMessages.filter((item) => item.id !== message.id) : []
    }
    if (store.directory?.directMessages) {
      store.directory.directMessages = store.directory.directMessages.filter((item) => item.id !== message.id)
    }
    return { messageId: message.id }
  },
  loadMutuals: async (store, data, body) => {
    const actor = actorOf(store, body)
    const targetId = String(body.userId || '')
    if (!actor || !targetId || actor === targetId) return { friends: [], servers: [] }
    const users = getAllUsers(store)
    const target = users.find((item) => item?.id === targetId)
    if (!target) return { friends: [], servers: [] }
    const targetSettings = target.settings && typeof target.settings === 'object' ? target.settings : {}
    const myFriendIds = new Set(acceptedFriendIds(store, actor))
    const mutualIds = acceptedFriendIds(store, targetId).filter((id) => id !== actor && myFriendIds.has(id))
    const friendById = new Map(users.map((item) => [item.id, item]))
    const friends = targetSettings.showFriends === false ? [] : [...new Set(mutualIds)].map((id) => {
      const user = friendById.get(id)
      return user ? { id, name: user.name || 'Usuário', username: user.friendCode || '', photoUrl: user.photoUrl || '' } : null
    }).filter(Boolean)
    const servers = targetSettings.showServers === false ? [] : getAllServers(store)
      .filter((server) => Array.isArray(server.members) && server.members.includes(actor) && server.members.includes(targetId))
      .map((server) => ({ id: server.id, name: server.name || 'Servidor', photoUrl: server.photoUrl || '', members: server.members.length }))
    return { friends, servers }
  },
  loadNotifications: async (store, data, body) => {
    const userId = String(body.userId || '')
    const list = Array.isArray(store.directory?.notifications) ? store.directory.notifications : []
    return list.filter((n) => n.toUserId === userId).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
  },
  loadActivityHistory: async (store, data, body) => {
    const userId = String(body.userId || '')
    const allUsers = getAllUsers(store)
    const userNameOf = (id) => {
      const u = allUsers.find((x) => x && x.id === id)
      return u ? u.name : 'Alguem'
    }
    const items = []
    const servers = getAllServers(store)
    const channelLabelOf = (channelId) => {
      for (const s of servers) {
        const c = (s.channels || []).find((ch) => ch && ch.id === channelId)
        if (c) return { channel: c.name, server: s.name, serverId: s.id }
      }
      return null
    }
    for (const m of getAllMessages(store)) {
      if (String(m.userId || '') !== userId) continue
      const loc = channelLabelOf(m.channelId)
      const preview = String(m.content || '').slice(0, 70)
        || (m.attachmentName ? `[${m.attachmentName}]` : '')
        || (m.type === 'audio' ? '[audio]' : '')
      items.push({
        kind: 'message',
        title: loc ? `Mensagem em #${loc.channel}` : 'Mensagem',
        detail: preview,
        meta: loc ? loc.server : '',
        serverId: loc ? loc.serverId : '',
        channelId: m.channelId,
        createdAt: Number(m.createdAt || 0),
      })
    }
    for (const m of getAllDirectMessages(store)) {
      if (String(m.fromId || '') !== userId && String(m.toId || '') !== userId) continue
      const incoming = String(m.fromId || '') !== userId
      const other = incoming ? m.fromId : m.toId
      const preview = String(m.content || '').slice(0, 70)
        || (m.attachmentName ? `[${m.attachmentName}]` : '')
        || (m.type === 'audio' ? '[audio]' : '')
      items.push({
        kind: 'dm',
        title: incoming ? `Mensagem de ${userNameOf(other)}` : `Mensagem para ${userNameOf(other)}`,
        detail: preview,
        meta: '@DM',
        serverId: 'dm',
        channelId: 'dm',
        createdAt: Number(m.createdAt || 0),
      })
    }
    for (const s of getAllCallSessions(store)) {
      if (!Array.isArray(s.participantIds) || !s.participantIds.includes(userId)) continue
      const label = channelLabelOf(s.channelId)
      const mode = s.callMode === 'video' ? 'video' : 'voz'
      items.push({
        kind: 'call',
        title: `Chamada de ${mode}`,
        detail: label ? `#${label.channel} - ${label.server}` : (s.serverId === 'dm' ? 'Mensagem direta' : 'Servidor'),
        meta: (s.participantIds.length || 1) + ' participante(s)',
        serverId: s.serverId || 'dm',
        channelId: s.channelId || 'dm',
        createdAt: Number(s.createdAt || s.updatedAt || 0),
      })
    }
    return items.filter((it) => it.createdAt > 0).sort((a, b) => b.createdAt - a.createdAt).slice(0, 60)
  },
  markNotificationsRead: async (store, data, body) => {
    const userId = String(body.userId || '')
    if (Array.isArray(store.directory?.notifications)) {
      for (const n of store.directory.notifications) {
        if (n.toUserId === userId) n.read = true
      }
    }
    return { ok: true }
  },
  createNotification: async (store, data, body) => {
    if (String(body.fromUserId || '') !== String(body.__actor || '')) deny('Operação negada (403)')
    const notification = addNotification(store, {
      toUserId: body.toUserId,
      fromUserId: body.fromUserId,
      fromName: body.fromName,
      fromPhoto: body.fromPhoto,
      type: body.type,
      title: body.title,
      body: body.body,
      data: body.data,
    })
    return { notification }
  },
  // Push avulso p/ casos especificos (ex.: "fulano esta esperando sua chamada").
  // Avisa o destino mesmo com o app fechado/background, sem criar notificacao no store.
  sendPush: async (store, data, body) => {
    const userId = String(body.userId || '')
    if (String(body.fromUserId || '') !== String(body.__actor || '')) deny('Operação negada (403)')
    const title = String(body.title || 'Friends Space')
    const message = String(body.body || '')
    if (!userId || !title || !message) throw new Error('sendPush invalido')
    void sendPushToUser(userId, title, message, {
      url: String(body.url || '/'),
      icon: String(body.icon || '/Logo.png'),
      tag: String(body.tag || `fs-${Date.now()}`),
      renotify: Boolean(body.renotify),
    })
    return { ok: true }
  },
  inviteFriendToServer: async (store, data, body) => {
    const server = getAllServers(store).find((s) => s && s.id === body.serverId)
    if (!server) throw new Error('Servidor nao encontrado')
    const fromUserId = String(body.userId || '')
    const toUserId = String(body.friendUserId || '')
    if (!toUserId) throw new Error('Amigo nao informado')
    if (!server.members.includes(fromUserId)) throw new Error('Voce precisa ser membro para convidar amigos')
    if (server.members.includes(toUserId)) throw new Error('Esse amigo ja esta no servidor')
    const friends = getAllFriends(store)
    const isFriend = friends.some((f) =>
      f.status === 'accepted'
      && ((f.userId === fromUserId && f.friendId === toUserId) || (f.userId === toUserId && f.friendId === fromUserId))
    )
    if (!isFriend) throw new Error('Esse usuario nao e seu amigo')
    const from = getAllUsers(store).find((u) => u && u.id === fromUserId)
    addNotification(store, {
      toUserId,
      fromUserId,
      fromName: from?.name || 'Alguem',
      fromPhoto: from?.photoUrl || '',
      type: 'server-invite',
      title: `${from?.name || 'Alguem'} te convidou para ${server.name}`,
      body: `Toque em aceitar para entrar no servidor ${server.name}`,
      data: { serverId: server.id, inviteCode: server.inviteCode },
    })
    pushQuiet(toUserId, `${from?.name || 'Alguem'} te convidou para ${server.name}`, 'Convite', { url: '/' })
    return { ok: true }
  },
  activateAstro: async (store, data, body) => {
    const userId = String(body.userId || '')
    const tier = ['astro', 'astro_plus', 'astro_ultimate'].includes(body.tier) ? body.tier : 'astro'
    const months = Math.max(1, Math.min(120, Number(body.months) || 1))
    if (!(await rateCheck('activate:' + userId, 5, 86400000))) throw rateLimitError()
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    if (!user) throw new Error('Usuario nao encontrado')
    const settings = user.settings || {}
    const paymentPending = settings.astroPaymentPending === true || settings.astroPaymentPending === 'true'
    if (!paymentPending) throw new Error('Pagamento nao confirmado')
    const wasActive = settings.astro === true || settings.astro === 'true'
    const payMethod = ['pix', 'googlepay', 'paypal', 'bitpay', 'mercadopago'].includes(body.method) ? body.method : (settings.astroPayMethod || '')
    const updated = {
      ...user,
      settings: {
        ...settings,
        astro: true,
        astroMonths: months,
        astroTier: tier,
        astroAutoRenew: true,
        astroPurchasedAt: now(),
        astroFirstPaidAt: wasActive && settings.astroFirstPaidAt ? settings.astroFirstPaidAt : now(),
        astroPayMethod: payMethod,
        astroRefundedAt: 0,
        // Troca de plano / nova compra estende o tempo restante (nunca apaga dias pagos)
        astroUntil: Math.max(now(), Number(settings.astroUntil) || 0) + months * 30 * 24 * 3600 * 1000,
        astroPaymentPending: false,
      },
    }
    upsertGlobalUser(store, updated)
    const index = data.users.findIndex((u) => u.id === userId)
    if (index === -1) data.users.push(updated)
    else data.users[index] = updated
    for (const friendId of acceptedFriendIds(store, userId)) {
      addNotification(store, {
        toUserId: friendId,
        fromUserId: userId,
        fromName: updated.name,
        fromPhoto: updated.photoUrl || '',
        type: 'astro',
        title: `${updated.name} assinou Astro`,
        body: `${months} ${months === 1 ? 'mes' : 'meses'}`,
        data: { months },
      })
    }
    return { user: updated, users: data.users }
  },
  markAstroPaymentPending: async (store, data, body) => {
    const userId = String(body.userId || '')
    if (!(await rateCheck('paypend:' + userId, 10, 86400000))) throw rateLimitError()
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    if (!user) throw new Error('Usuario nao encontrado')
    const updated = {
      ...user,
      settings: {
        ...(user.settings || {}),
        astroPaymentPending: true,
      },
    }
    upsertGlobalUser(store, updated)
    const index = data.users.findIndex((u) => u && u.id === userId)
    if (index === -1) data.users.push(updated)
    else data.users[index] = updated
    return { ok: true, user: updated, users: data.users }
  },
  applyTheme: async (store, data, body) => {
    const userId = String(body.userId || '')
    const themeId = String(body.themeId || '')
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    if (!user) throw new Error('Usuario nao encontrado')
    if (!Array.isArray(data.themes)) data.themes = []
    if (!Array.isArray(data.themeGrants)) data.themeGrants = []
    const theme = data.themes.find((x) => x && x.id === themeId)
    if (!theme) throw new Error('Tema nao encontrado')
    const allowed = theme.ownerId === userId || data.themeGrants.some((g) => g && g.themeId === themeId && g.toUserId === userId)
    if (!allowed) throw new Error('Tema nao liberado para voce')
    const updated = {
      ...user,
      settings: {
        ...(user.settings || {}),
        appliedTheme: { accent: theme.accent, bg: theme.bg, bg2: theme.bg2, text: theme.text, animated: theme.kind === 'animated' },
        appliedThemeId: theme.id,
      },
    }
    upsertGlobalUser(store, updated)
    const index = data.users.findIndex((u) => u && u.id === userId)
    if (index === -1) data.users.push(updated)
    else data.users[index] = updated
    return { user: updated, users: data.users }
  },
  renewAstro: async (store, data, body) => {
    const userId = String(body.userId || '')
    const months = Math.max(1, Math.min(24, Number(body.months) || 1))
    if (!(await rateCheck('renew:' + userId, 5, 86400000))) throw rateLimitError()
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    if (!user) throw new Error('Usuario nao encontrado')
    const settings = user.settings || {}
    const paymentPending = settings.astroPaymentPending === true || settings.astroPaymentPending === 'true'
    if (!paymentPending) throw new Error('Pagamento nao confirmado')
    const payMethod = ['pix', 'googlepay', 'paypal', 'bitpay', 'mercadopago'].includes(body.method) ? body.method : (settings.astroPayMethod || '')
    const base = Math.max(now(), Number(settings.astroUntil) || 0)
    const updated = {
      ...user,
      settings: {
        ...settings,
        astro: true,
        astroMonths: (Number(settings.astroMonths) || 0) + months,
        astroAutoRenew: true,
        astroPurchasedAt: now(),
        astroPayMethod: payMethod,
        astroUntil: base + months * 30 * 24 * 3600 * 1000,
        astroPaymentPending: false,
      },
    }
    upsertGlobalUser(store, updated)
    const index = data.users.findIndex((u) => u && u.id === userId)
    if (index === -1) data.users.push(updated)
    else data.users[index] = updated
    return { user: updated, users: data.users }
  },
  refundAstro: async (store, data, body) => {
    const userId = String(body.userId || '')
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    if (!user) throw new Error('Usuario nao encontrado')
    const settings = user.settings || {}
    const firstPaid = Number(settings.astroFirstPaidAt) || Number(settings.astroPurchasedAt) || 0
    if (!firstPaid) throw new Error('Nenhuma compra encontrada')
    if (!(await rateCheck('refund:' + userId, 3, 86400000))) throw rateLimitError()
    if (now() - firstPaid > 7 * 24 * 3600 * 1000) throw new Error('Prazo de reembolso (7 dias) expirado')
    if (settings.astroRefundedAt) throw new Error('Reembolso ja processado')
    const ticket = 'ASTRO-' + now().toString(36).toUpperCase()
    const updated = {
      ...user,
      settings: {
        ...settings,
        astro: false,
        astroUntil: 0,
        astroMonths: 0,
        astroAutoRenew: false,
        astroRefundedAt: now(),
        appearanceTheme: 'default',
        appearanceBg: 'default',
        appearanceTextColor: 'default',
        frame: 'none',
        nameColor: 'default',
        nameEffect: 'none',
        astroBadge: false,
        appliedTheme: null,
        appliedThemeId: '',
      },
      bannerUrl: '',
    }
    upsertGlobalUser(store, updated)
    const index = data.users.findIndex((u) => u.id === userId)
    if (index === -1) data.users.push(updated)
    else data.users[index] = updated
    upsertGlobalItem(store, 'reports', {
      id: id(),
      reporterId: userId,
      type: 'help',
      target: { id: userId, name: user.name || '', channelId: '', serverId: '', messageId: '', preview: '' },
      questionnaire: ['Reembolso Astro'],
      description: `Ticket ${ticket}: reembolso solicitado dentro de 7 dias. Processar estorno no gateway (${settings.astroPayMethod || 'metodo nao registrado'}).`,
      proofUrl: '',
      status: 'pending',
      response: '',
      complained: false,
      complaintMessage: '',
      createdAt: now(),
    })
    return { user: updated, users: data.users, ticket }
  },
  setAstroPayMethod: async (store, data, body) => {
    const userId = String(body.userId || '')
    const method = String(body.method || '')
    if (!['pix', 'googlepay', 'paypal', 'bitpay', 'mercadopago'].includes(method)) throw new Error('Metodo invalido')
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    if (!user) throw new Error('Usuario nao encontrado')
    const updated = { ...user, settings: { ...(user.settings || {}), astroPayMethod: method } }
    upsertGlobalUser(store, updated)
    const index = data.users.findIndex((u) => u && u.id === userId)
    if (index === -1) data.users.push(updated)
    else data.users[index] = updated
    return { user: updated, users: data.users }
  },
  cancelAstro: async (store, data, body) => {
    const userId = String(body.userId || '')
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    if (!user) throw new Error('Usuario nao encontrado')
    const updated = {
      ...user,
      settings: {
        ...(user.settings || {}),
        astro: false,
        astroUntil: 0,
        astroMonths: 0,
        // Ao cancelar, o tema do site volta para o gratuito e os
        // recursos premium (molduras) saem — limitações do plano free.
        appearanceTheme: 'default',
        appearanceBg: 'default',
        appearanceTextColor: 'default',
        frame: 'none',
        nameColor: 'default',
        nameEffect: 'none',
        astroBadge: false,
        appliedTheme: null,
        appliedThemeId: '',
      },
      // Banner e mini-banner somem ao cancelar; o icone de perfil (photoUrl) permanece.
      bannerUrl: '',
    }
    upsertGlobalUser(store, updated)
    const index = data.users.findIndex((u) => u.id === userId)
    if (index === -1) data.users.push(updated)
    else data.users[index] = updated
    return { user: updated, users: data.users }
  },
  // Admins: gerenciar Astro de qualquer conta (ativar por id/friendCode/email).
  // Somente dev (ROOT_DEV_IDS) pode usar.
  adminSetAstro: async (store, data, body) => {
    const admin = requireFlags(store, body, 'dev')
    if (!isDev(admin)) throw new Error('Somente dev pode configurar Astro')
    const q = String(body.target || '').trim().toLowerCase()
    const months = Math.max(1, Math.min(120, Number(body.months) || 1))
    const tier = ['astro', 'astro_plus', 'astro_ultimate'].includes(body.tier) ? body.tier : 'astro'
    const find = (list) => (list || []).find((u) => u && u.id && (
      u.id.toLowerCase() === q
      || (u.friendCode || '').toLowerCase() === (q.startsWith('@') ? q.slice(1) : q)
      || (u.email || '').toLowerCase() === q
    ))
    const to = find(getAllUsers(store)) || find(data.users)
    if (!to) throw new Error('Usuario nao encontrado')
    const updated = {
      ...to,
      settings: {
        ...(to.settings || {}),
        astro: true,
        astroMonths: months,
        astroTier: tier,
        astroAutoRenew: false,
        astroUntil: now() + months * 30 * 24 * 3600 * 1000,
        astroPaymentPending: false,
      },
    }
    upsertGlobalUser(store, updated)
    const idx = data.users.findIndex((u) => u.id === to.id)
    if (idx === -1) data.users.push(updated)
    else data.users[idx] = updated
    return { user: updated, users: data.users }
  },
  adminCancelAstro: async (store, data, body) => {
    const admin = requireFlags(store, body, 'dev')
    if (!isDev(admin)) throw new Error('Somente dev pode configurar Astro')
    const q = String(body.target || '').trim().toLowerCase()
    const find = (list) => (list || []).find((u) => u && u.id && (
      u.id.toLowerCase() === q
      || (u.friendCode || '').toLowerCase() === (q.startsWith('@') ? q.slice(1) : q)
      || (u.email || '').toLowerCase() === q
    ))
    const to = find(getAllUsers(store)) || find(data.users)
    if (!to) throw new Error('Usuario nao encontrado')
    const updated = {
      ...to,
      settings: {
        ...(to.settings || {}),
        astro: false,
        astroUntil: 0,
        astroMonths: 0,
        astroTier: 'none',
        appearanceTheme: 'default',
        appearanceBg: 'default',
        appearanceTextColor: 'default',
        frame: 'none',
      },
      bannerUrl: '',
    }
    upsertGlobalUser(store, updated)
    const idx = data.users.findIndex((u) => u.id === to.id)
    if (idx === -1) data.users.push(updated)
    else data.users[idx] = updated
    return { user: updated, users: data.users }
  },
  // ---- Stories (estilo Instagram) ----
  // A midia fica no Google Drive do autor (pasta 'stories'); aqui so o
  // registro (id, url, tipo, legenda) — o servidor Friends Space nao guarda
  // arquivos. Stories expiram em 24h (podadas na leitura e na escrita).
  addStory: async (store, data, body) => {
    const userId = String(body.userId || '')
    const authorKind = body.authorKind === 'server' ? 'server' : 'user'
    if (authorKind === 'server') {
      const srv = getAllServers(store).find((s) => s && s.id === userId)
      if (!srv) throw new Error('Servidor nao encontrado')
      const aflags = getAllUsers(store).find((x) => x && x.id === body.__actor)?.flags
      if (srv.ownerId !== body.__actor && !(srv.staffMemberIds || []).includes(body.__actor) && !aflags?.dev && !aflags?.support) deny('Somente staff (403)')
    }
    const user = authorKind === 'server'
      ? { id: userId, name: '', photoUrl: '', flags: {} }
      : getAllUsers(store).find((u) => u && u.id === userId)
    if (!user && authorKind === 'user') throw new Error('Usuario nao encontrado')
    if (user.flags?.contentRestricted) throw new Error('Conta em restricao de conteudo: nao pode publicar stories')
    const mediaUrl = String(body.mediaUrl || '')
    const sharedPostId = String(body.sharedPostId || '')
    if (!mediaUrl && !sharedPostId) throw new Error('Midia obrigatoria')
    if (!Array.isArray(data.stories)) data.stories = []
    const visibility = body.visibility === 'global' ? 'global' : 'friends'
    const ov = body.overlayStyle && typeof body.overlayStyle === 'object' ? body.overlayStyle : {}
    const story = {
      id: id(),
      userId,
      authorKind,
      mediaUrl,
      type: body.type === 'video' ? 'video' : 'image',
      caption: String(body.caption || '').slice(0, 200),
      visibility,
      createdAt: now(),
      updatedAt: now(),
      sharedPostId,
      overlayText: String(body.overlayText || '').slice(0, 140),
      overlayStyle: {
        color: String(ov.color || '#ffffff').slice(0, 9),
        size: Math.min(64, Math.max(12, Number(ov.size) || 24)),
        bold: ov.bold === true,
        position: ov.position === 'bottom' ? 'bottom' : 'top',
        font: ['sans', 'serif', 'mono', 'fun'].includes(String(ov.font || '')) ? String(ov.font) : 'sans',
        x: Math.min(90, Math.max(0, Number(ov.x))),
        y: Math.min(90, Math.max(0, Number(ov.y))),
      },
      likes: [],
      viewers: [],
    }
    data.stories.push(story)
    saveStoryEverywhere(store, data, story)
    const cutoff = now() - 24 * 3600 * 1000
    data.stories = data.stories.filter((s) => s && s.createdAt > cutoff)
    data.stories.sort((a, b) => b.createdAt - a.createdAt)
    return { ok: true, stories: data.stories }
  },
  getStories: async (store, data, body) => {
    const userId = String(body.userId || '')
    const cutoff = now() - 24 * 3600 * 1000
    if (!Array.isArray(data.stories)) data.stories = []
    data.stories = data.stories.filter((s) => s && s.createdAt > cutoff)
    // Visibilidade: o proprio usuario + amigos + stories globais
    const viewer = getAllUsers(store).find((u) => u && u.id === userId)
    const friendIds = new Set(userId ? acceptedFriendIds(store, userId) : [])
    const following = new Set(Array.isArray(viewer?.following) ? viewer.following : [])
    const myServers = new Set(userId ? memberServerIdsOf(store, userId) : [])
    const visible = data.stories.filter((s) =>
      s.userId === userId ||
      (s.visibility === 'global') ||
      friendIds.has(s.userId) ||
      following.has(s.userId) ||
      (s.authorKind === 'server' && myServers.has(s.userId))
    )
    visible.sort((a, b) => b.createdAt - a.createdAt)
    return { ok: true, stories: visible }
  },
  deleteStory: async (store, data, body) => {
    const userId = String(body.userId || '')
    const storyId = String(body.storyId || '')
    const drop = (s) => !(s && s.id === storyId && s.userId === userId)
    if (store.directory && Array.isArray(store.directory.stories)) {
      store.directory.stories = store.directory.stories.filter(drop)
    }
    for (const profile of Object.values(store.profiles || {})) {
      if (profile && Array.isArray(profile.stories)) {
        profile.stories = profile.stories.filter(drop)
      }
    }
    if (Array.isArray(data.stories)) {
      data.stories = data.stories.filter(drop)
    }
    return { ok: true }
  },
  // ---- Feed (estilo Twitter/X) ----
  // Posts no store (texto curto + midia opcional no Drive); hashtags viram
  // "Assuntos do dia" via getTrending.
  createPost: async (store, data, body) => {
    const userId = String(body.userId || '')
    const authorKind = body.authorKind === 'server' ? 'server' : 'user'
    if (authorKind === 'server') {
      const srv = getAllServers(store).find((s) => s && s.id === userId)
      if (!srv) throw new Error('Servidor nao encontrado')
      const aflags = getAllUsers(store).find((x) => x && x.id === body.__actor)?.flags
      if (srv.ownerId !== body.__actor && !(srv.staffMemberIds || []).includes(body.__actor) && !aflags?.dev && !aflags?.support) deny('Somente staff (403)')
    }
    const user = authorKind === 'server'
      ? { id: userId, name: '', photoUrl: '' }
      : getAllUsers(store).find((u) => u && u.id === userId)
    if (!user && authorKind === 'user') throw new Error('Usuario nao encontrado')
    if (body.mediaUrl && user.flags?.contentRestricted) throw new Error('Conta em restricao de conteudo: nao pode compartilhar midia no feed')
    const content = String(body.content || '').trim().slice(0, 500)
    let poll = null
    if (Array.isArray(body.pollOptions)) {
      const opts = body.pollOptions.map((o) => String(o || '').trim().slice(0, 100)).filter(Boolean).slice(0, 4)
      if (opts.length >= 2) {
        const days = Math.min(7, Math.max(1, Number(body.pollDays) || 1))
        poll = { options: opts.map((text) => ({ text, votes: [] })), endsAt: now() + days * 86400000, createdAt: now() }
      }
    }
    const scheduledFor = Number(body.scheduledFor) || 0
    if (!content && !body.mediaUrl && !poll) throw new Error('Post vazio')
    if (!Array.isArray(data.posts)) data.posts = []
    const hashtags = [...new Set((content.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase()))]
    const post = {
      id: id(),
      authorId: userId,
      authorKind,
      content,
      poll,
      location: String(body.location || '').slice(0, 100),
      scheduledFor: scheduledFor > now() ? scheduledFor : 0,
      promoted: body.promoted === true,
      mediaUrl: String(body.mediaUrl || ''),
      type: body.type === 'video' ? 'video' : 'image',
      linkUrl: String(body.linkUrl || ''),
      linkTitle: String(body.linkTitle || '').slice(0, 200),
      linkImage: String(body.linkImage || '').slice(0, 500),
      linkDescription: String(body.linkDescription || '').slice(0, 400),
      embedType: ['youtube', 'tiktok', 'generic', 'video', 'image'].includes(body.embedType) ? body.embedType : 'generic',
      hashtags,
      likes: [],
      reposts: [],
      reports: 0,
      reportedBy: [],
      comments: [],
      createdAt: now(),
    }
    data.posts.push(post)
    data.posts.sort((a, b) => b.createdAt - a.createdAt)
    savePostEverywhere(store, data, post)
    return { ok: true, post }
  },
  getPost: async (store, data, body) => {
    actorOf(store, body)
    const post = getAllPosts(store).find((x) => x && x.id === String(body.postId || ''))
    if (!post) throw new Error('Post não encontrado')
    return { post }
  },
  sharePost: async (store, data, body) => {
    const actor = actorOf(store, body)
    void actor
    const post = getAllPosts(store).find((x) => x && x.id === String(body.postId || ''))
    if (!post) throw new Error('Post não encontrado')
    post.shares = (Number(post.shares) || 0) + 1
    post.updatedAt = now()
    if (store.directory && Array.isArray(store.directory.posts)) {
      const i = store.directory.posts.findIndex((x) => x && x.id === post.id)
      if (i !== -1) store.directory.posts[i] = post
    }
    return { ok: true, shares: post.shares }
  },
  toggleStoryLike: async (store, data, body) => {
    const actor = actorOf(store, body)
    const stories = getAllStories(store)
    const st = stories.find((x) => x && x.id === String(body.storyId || ''))
    if (!st) throw new Error('Story não encontrado')
    if (!Array.isArray(st.likes)) st.likes = []
    const i = st.likes.indexOf(actor)
    if (i === -1) st.likes.push(actor)
    else st.likes.splice(i, 1)
    saveStoryEverywhere(store, data, st)
    return { ok: true, likes: st.likes }
  },
  viewStory: async (store, data, body) => {
    const actor = actorOf(store, body)
    const stories = getAllStories(store)
    const st = stories.find((x) => x && x.id === String(body.storyId || ''))
    if (!st) throw new Error('Story não encontrado')
    if (!Array.isArray(st.viewers)) st.viewers = []
    if (!st.viewers.includes(actor)) {
      st.viewers.push(actor)
      saveStoryEverywhere(store, data, st)
    }
    return { ok: true }
  },
  toggleBookmark: async (store, data, body) => {
    const actor = actorOf(store, body)
    const postId = String(body.postId || '')
    const u = getAllUsers(store).find((x) => x && x.id === actor)
    if (!u) throw new Error('Usuario nao encontrado')
    if (!Array.isArray(u.bookmarks)) u.bookmarks = []
    const i = u.bookmarks.indexOf(postId)
    if (i === -1) u.bookmarks.push(postId)
    else u.bookmarks.splice(i, 1)
    writeUserEverywhere(store, data, u)
    upsertGlobalUser(store, u)
    return { ok: true, bookmarked: i === -1 }
  },
  getUserHistory: async (store, data, body) => {
    const actor = actorOf(store, body)
    const targetId = String(body.targetId || actor)
    if (targetId !== actor) requireFlags(store, body, 'dev', 'support')
    const u = getAllUsers(store).find((x) => x && x.id === targetId)
    if (!u) throw new Error('Usuario nao encontrado')
    const all = getAllPosts(store)
    const liked = all.filter((x) => x && Array.isArray(x.likes) && x.likes.includes(targetId)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 100)
    const reposted = all.filter((x) => x && Array.isArray(x.reposts) && x.reposts.includes(targetId)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 100)
    const saved = all.filter((x) => x && Array.isArray(u.bookmarks) && u.bookmarks.includes(x.id)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 100)
    return { ok: true, liked, reposted, bookmarked: saved }
  },
  getStoryAds: async (store, data, body) => {
    if (!Array.isArray(data.ads)) data.ads = []
    const act = data.ads.filter((a) => a && a.active !== false && a.mediaUrl)
    return { ok: true, ads: act.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20) }
  },
  saveStoryAd: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    if (!Array.isArray(data.ads)) data.ads = []
    const mediaUrl = String(body.mediaUrl || '').slice(0, 500)
    if (!mediaUrl) throw new Error('Midia obrigatoria')
    const kind = body.kind === 'image' ? 'image' : 'video'
    const ad = {
      id: String(body.id || '') || id(),
      kind,
      mediaUrl,
      linkUrl: String(body.linkUrl || '').slice(0, 500),
      title: String(body.title || '').slice(0, 120),
      seconds: Math.min(60, Math.max(3, Number(body.seconds) || 8)),
      active: body.active !== false,
      createdAt: now(),
    }
    const i = data.ads.findIndex((a) => a && a.id === ad.id)
    if (i === -1) data.ads.push(ad)
    else data.ads[i] = ad
    return { ok: true, ad }
  },
  deleteStoryAd: async (store, data, body) => {
    requireFlags(store, body, 'dev')
    const adId = String(body.adId || '')
    if (Array.isArray(data.ads)) data.ads = data.ads.filter((a) => !(a && a.id === adId))
    return { ok: true }
  },
  trackPostViews: async (store, data, body) => {
    if (!(await rateCheck('views:' + String(body.__actor || 'x'), 30, 60000))) throw rateLimitError()
    const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x)).slice(0, 50) : []
    const views = {}
    if (ids.length > 0) {
      for (const p of getAllPosts(store)) {
        if (p && ids.includes(p.id)) {
          p.views = (Number(p.views) || 0) + 1
          views[p.id] = p.views
        }
      }
    }
    return { ok: true, views }
  },
  deletePost: async (store, data, body) => {
    const userId = String(body.userId || '')
    const postId = String(body.postId || '')
    const post = getAllPosts(store).find((p) => p && p.id === postId)
    if (!post) throw new Error('Post nao encontrado')
    const flags = getAllUsers(store).find((x) => x && x.id === body.__actor)?.flags
    const isAuthor = post.authorId === userId
    if (!isAuthor && !flags?.dev && !flags?.support) deny('Somente o autor (403)')
    if (store.directory && Array.isArray(store.directory.posts)) {
      store.directory.posts = store.directory.posts.filter((x) => !(x && x.id === postId))
    }
    for (const profile of Object.values(store.profiles || {})) {
      if (profile && Array.isArray(profile.posts)) {
        profile.posts = profile.posts.filter((x) => !(x && x.id === postId))
      }
    }
    if (data && Array.isArray(data.posts)) {
      data.posts = data.posts.filter((x) => !(x && x.id === postId))
    }
    return { ok: true }
  },
  votePoll: async (store, data, body) => {
    const actor = actorOf(store, body)
    const postId = String(body.postId || '')
    const opt = Number(body.option)
    const post = getAllPosts(store).find((x) => x && x.id === postId)
    if (!post || !post.poll) throw new Error('Enquete nao encontrada')
    if (now() > (post.poll.endsAt || 0)) throw new Error('Enquete encerrada')
    if (!post.poll.options[opt]) throw new Error('Opcao invalida')
    for (const o of post.poll.options) o.votes = (o.votes || []).filter((v) => v !== actor)
    post.poll.options[opt].votes.push(actor)
    return { ok: true, poll: post.poll }
  },
  getNews: async (store, data, body) => {
    const ttl = 30 * 60 * 1000
    if (data.newsCache && Array.isArray(data.newsCache.items) && (now() - (data.newsCache.at || 0)) < ttl) {
      return { ok: true, news: data.newsCache.items, cached: true }
    }
    const key = String(process.env.NEWS_API_KEY || '')
    try {
      let items = []
      if (key) {
        const r = await fetch(`https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(key)}&country=br&language=pt&size=10`)
        const j = await r.json().catch(() => null)
        items = ((j && j.results) || []).slice(0, 10).map((n) => ({
          title: String(n.title || '').slice(0, 140),
          link: String(n.link || '').slice(0, 500),
          source: String(n.source_id || n.source_name || '').slice(0, 60),
          pubDate: String(n.pubDate || '').slice(0, 40),
          category: String(((n.category || [])[0]) || '').slice(0, 40),
          image: String(n.image_url || '').slice(0, 500),
        })).filter((n) => n.title)
      }
      // Sem NEWS_API_KEY (ou provedor fora do ar): fallback gratuito e sem
      // chave via RSS do Google Noticias BR/pt — era o motivo de
      // "as noticias sumiram" (a key antiga morava no Vercel).
      if (items.length === 0) {
        items = await fetchNewsFromRss()
      }
      if (items.length > 0) {
        data.newsCache = { at: now(), items }
        return { ok: true, news: items }
      }
      return { ok: true, news: (data.newsCache && data.newsCache.items) || [] }
    } catch {
      return { ok: true, news: (data.newsCache && data.newsCache.items) || [] }
    }
  },
  saveTheme: async (store, data, body) => {
    const userId = String(body.userId || '')
    if (!(await rateCheck('theme:' + userId, 20, 86400000))) throw rateLimitError()
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    if (!user) throw new Error('Usuario nao encontrado')
    const s = user.settings || {}
    const subActive = (s.astro === true || s.astro === 'true') && !(Number(s.astroUntil || 0) > 0 && Number(s.astroUntil) < now())
    if (!subActive) throw new Error('Apenas assinantes Astro criam temas')
    if (!Array.isArray(data.themes)) data.themes = []
    const input = body.theme || {}
    const hex = (v, fb) => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : fb
    const themeId = String(input.id || '') || id()
    const existing = data.themes.find((x) => x && x.id === themeId)
    if (existing && existing.ownerId !== userId) throw new Error('Tema de outro autor')
    const theme = {
      id: themeId,
      ownerId: userId,
      ownerName: String(user.name || ''),
      name: String(input.name || 'Meu tema').slice(0, 40),
      kind: input.kind === 'animated' ? 'animated' : 'solid',
      accent: hex(input.accent, '#00ff88'),
      bg: hex(input.bg, '#0a0a0a'),
      bg2: hex(input.bg2, '#111111'),
      text: hex(input.text, '#f0f3f4'),
      price: Math.max(0, Number(input.price) || 0),
      onSale: false,
      updatedAt: now(),
      createdAt: existing?.createdAt || now(),
    }
    if (existing) Object.assign(existing, theme)
    else data.themes.push(theme)
    return { ok: true, theme }
  },
  deleteTheme: async (store, data, body) => {
    const userId = String(body.userId || '')
    const themeId = String(body.themeId || '')
    if (!Array.isArray(data.themes)) data.themes = []
    const flags = getAllUsers(store).find((x) => x && x.id === body.__actor)?.flags
    data.themes = data.themes.filter((x) => !(x && x.id === themeId && (x.ownerId === userId || flags?.dev)))
    if (Array.isArray(data.themeGrants)) data.themeGrants = data.themeGrants.filter((g) => !(g && g.themeId === themeId))
    return { ok: true }
  },
  getThemes: async (store, data, body) => {
    const userId = String(body.userId || '')
    if (!Array.isArray(data.themes)) data.themes = []
    if (!Array.isArray(data.themeGrants)) data.themeGrants = []
    const grantedIds = new Set(data.themeGrants.filter((g) => g && g.toUserId === userId).map((g) => g.themeId))
    const mine = data.themes.filter((x) => x && x.ownerId === userId)
    const granted = data.themes.filter((x) => x && x.ownerId !== userId && grantedIds.has(x.id))
    return { ok: true, mine, granted }
  },
  shareTheme: async (store, data, body) => {
    const userId = String(body.userId || '')
    const themeId = String(body.themeId || '')
    if (!(await rateCheck('sharetheme:' + userId, 20, 86400000))) throw rateLimitError()
    const toRaw = String(body.toUserId || body.toCode || '').trim()
    if (!Array.isArray(data.themes)) data.themes = []
    if (!Array.isArray(data.themeGrants)) data.themeGrants = []
    const theme = data.themes.find((x) => x && x.id === themeId && x.ownerId === userId)
    if (!theme) throw new Error('Tema nao encontrado')
    const toUser = getAllUsers(store).find((u) => u && (u.id === toRaw || (u.friendCode || '').toUpperCase() === toRaw.toUpperCase()))
    if (!toUser) throw new Error('Usuario nao encontrado')
    if (toUser.id === userId) throw new Error('Voce ja tem este tema')
    const ts = toUser.settings || {}
    const recipientAstro = (ts.astro === true || ts.astro === 'true') && Number(ts.astroUntil || 0) > now()
    if (!recipientAstro) throw new Error('Apenas usuarios com Astro ativo podem receber temas')
    if (!data.themeGrants.some((g) => g && g.themeId === themeId && g.toUserId === toUser.id)) {
      data.themeGrants.push({ themeId, toUserId: toUser.id, fromUserId: userId, at: now() })
    }
    return { ok: true, toName: toUser.name }
  },
  getSuggestedServers: async (store, data, body) => {
    const userId = String(body.userId || '')
    const mine = new Set(memberServerIdsOf(store, userId))
    // So VERIFICADOS aqui (curadoria). Descubra/busca mostra todos os publicos.
    const list = getAllServers(store)
      .filter((s) => s && s.verified)
      .sort((a, b) => ((b.members || []).length) - ((a.members || []).length))
      .slice(0, 6)
      .map((s) => ({ id: s.id, name: s.name, photoUrl: s.photoUrl || '', members: (s.members || []).length, onlineCount: onlineCountOf(store, s.members), inviteCode: s.inviteCode || '', verified: Boolean(s.verified), member: mine.has(s.id) || s.ownerId === userId, category: String(s.category || (s.settings && s.settings.category) || '').slice(0, 40) }))
    return { ok: true, servers: list }
  },
  searchServers: async (store, data, body) => {
    const userId = String(body.userId || '')
    const q = String(body.q || '').trim().toLowerCase()
    const mine = new Set(memberServerIdsOf(store, userId))
    const catOf = (s) => String(s.category || (s.settings && s.settings.category) || '')
    const tagsOf = (s) => (Array.isArray(s.tags) ? s.tags : (s.settings && Array.isArray(s.settings.tags) ? s.settings.tags : [])).map((x) => String(x))
    const toCard = (s) => ({ id: s.id, name: s.name, photoUrl: s.photoUrl || '', members: (s.members || []).length, onlineCount: onlineCountOf(store, s.members), inviteCode: s.inviteCode || '', verified: Boolean(s.verified), member: mine.has(s.id) || s.ownerId === userId, category: catOf(s).slice(0, 40), tags: tagsOf(s).slice(0, 5), description: String(s.description || '').slice(0, 160) })
    // Sem busca: top públicos (aba Servidores nunca abre vazia).
    if (!userId) return { ok: true, servers: [] }
    if (q.length < 2) {
      const pubs = getAllServers(store)
        .filter((s) => s && (!s.settings || !s.settings.toggles || s.settings.toggles.public !== false))
        .sort((a, b) => ((b.members || []).length) - ((a.members || []).length))
        .slice(0, 6)
        .map(toCard)
      return { ok: true, servers: pubs }
    }
    const servers = getAllServers(store)
      .filter((s) => {
        if (!s) return false
        const hay = `${s.name || ''} ${catOf(s)} ${tagsOf(s).join(' ')} ${s.description || ''}`.toLowerCase()
        return q.split(/\s+/).every((w) => hay.includes(w))
      })
      .sort((a, b) => ((b.members || []).length) - ((a.members || []).length))
      .slice(0, 20)
      .map(toCard)
    return { ok: true, servers }
  },
  getFeed: async (store, data, body) => {
    const userId = String(body.userId || '')
    const hashtag = String(body.hashtag || '').toLowerCase()
    const limit = Math.max(1, Math.min(100, Number(body.limit) || 50))
    const beforeScore = Number(body.beforeScore) || Infinity
    const beforeId = String(body.beforeId || '')
    const scope = String(body.scope || 'global')
    const friendIds = new Set(userId ? acceptedFriendIds(store, userId) : [])
    const myServers = new Set(userId ? memberServerIdsOf(store, userId) : [])
    let posts = getAllPosts(store)
    // Feed vivo 24h: post com mais de 24h nao aparece (dados intactos).
    try {
      const dayAgo = now() - 86400000
      posts = posts.filter((p) => p && Number(p.createdAt || 0) >= dayAgo)
    } catch { }
    if (scope === 'amigos' && userId) {
      posts = posts.filter((p) => p && (p.authorId === userId || friendIds.has(p.authorId) || (p.authorKind === 'server' && myServers.has(p.authorId))))
    }
    const tnow = now()
    posts = posts.filter((p) => !p || !(p.scheduledFor && p.scheduledFor > tnow) || p.authorId === userId)
    if (hashtag) posts = posts.filter((p) => p && Array.isArray(p.hashtags) && p.hashtags.includes(hashtag))
    if (body.kind === 'user') posts = posts.filter((p) => p && p.authorKind !== 'server')
    if (body.kind === 'server') posts = posts.filter((p) => p && p.authorKind === 'server')
    const q = String(body.search || '').trim().toLowerCase()
    if (body.mediaOnly) posts = posts.filter((p) => p && p.mediaUrl)
    if (q) {
      const usersById = new Map(getAllUsers(store).filter((u) => u).map((u) => [u.id, u]))
      const srvsById = new Map(getAllServers(store).filter((s) => s).map((s) => [s.id, s]))
      posts = posts.filter((p) => {
        if (!p) return false
        const a = p.authorKind === 'server' ? srvsById.get(p.authorId) : usersById.get(p.authorId)
        const hay = `${p.content || ''} ${(p.hashtags || []).join(' ')} ${(p.location || '')} ${a?.name || ''}`.toLowerCase()
        return q.split(/\s+/).every((w) => hay.includes(w))
      })
    }
    if (body.sort === 'recent') {
      posts = [...posts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      return { ok: true, posts: posts.slice(0, limit) }
    }
    const scored = posts
      .filter((p) => p)
      .map((p) => ({
        post: p,
        score: Number(p.createdAt || 0) + (Array.isArray(p.likes) ? p.likes.length : 0) * 3600000 + (friendIds.has(p.authorId) ? 1800000 : 0),
      }))
    scored.sort((x, y) => y.score - x.score || (x.post.id < y.post.id ? -1 : 1))
    const page = scored
      .filter((s) => s.score < beforeScore || (s.score === beforeScore && s.post.id > beforeId))
      .slice(0, limit)
    return { ok: true, posts: page.map((s) => ({ ...s.post, score: s.score })) }
  },
  togglePostLike: async (store, data, body) => {
    const userId = String(body.userId || '')
    const postId = String(body.postId || '')
    let post = getAllPosts(store).find((p) => p && p.id === postId)
    if (!post) throw new Error('Post nao encontrado')
    if (!Array.isArray(post.likes)) post.likes = []
    const idx = post.likes.indexOf(userId)
    if (idx === -1) post.likes.push(userId)
    else post.likes.splice(idx, 1)
    savePostEverywhere(store, data, post)
    return { ok: true, likes: post.likes }
  },
  toggleRepost: async (store, data, body) => {
    const userId = String(body.userId || '')
    const postId = String(body.postId || '')
    let post = getAllPosts(store).find((p) => p && p.id === postId)
    if (!post) throw new Error('Post nao encontrado')
    if (!Array.isArray(post.reposts)) post.reposts = []
    const idx = post.reposts.indexOf(userId)
    if (idx === -1) post.reposts.push(userId)
    else post.reposts.splice(idx, 1)
    savePostEverywhere(store, data, post)
    return { ok: true, reposts: post.reposts }
  },
  reportPost: async (store, data, body) => {
    const userId = String(body.userId || '')
    const postId = String(body.postId || '')
    let post = getAllPosts(store).find((p) => p && p.id === postId)
    if (!post) throw new Error('Post nao encontrado')
    if (!Array.isArray(post.reportedBy)) post.reportedBy = []
    if (post.reportedBy.includes(userId)) return { ok: true, already: true }
    post.reportedBy.push(userId)
    post.reports = (post.reports || 0) + 1
    // Duas denuncias em conteudo do MESMO autor -> lista de contas com
    // restricao: nao pode compartilhar midia (stories/feed), mas pode
    // mandar texto, entrar em calls e DMs normalmente.
    const author = getAllUsers(store).find((u) => u && u.id === post.authorId)
    if (author) {
      const total = (Array.isArray(data.posts) ? data.posts : [])
        .filter((p) => p && p.authorId === post.authorId)
        .reduce((acc, p) => acc + (p.reports || 0), 0)
      if (total >= 2) {
        if (!author.flags) author.flags = {}
        author.flags.contentRestricted = true
        addNotification(store, {
          toUserId: author.id,
          fromUserId: userId,
          fromName: 'Friends Space',
          fromPhoto: '',
          type: 'system',
          title: 'Restricao de conteudo',
          body: 'Seu perfil foi restringido: voce nao pode mais compartilhar midia (stories e feed).',
        })
      }
    }
    savePostEverywhere(store, data, post)
    return { ok: true, reports: post.reports }
  },
  addPostComment: async (store, data, body) => {
    const userId = String(body.userId || '')
    const postId = String(body.postId || '')
    const content = String(body.content || '').trim().slice(0, 280)
    if (!content) throw new Error('Comentario vazio')
    let post = getAllPosts(store).find((p) => p && p.id === postId)
    if (!post) throw new Error('Post nao encontrado')
    if (!Array.isArray(post.comments)) post.comments = []
    const imageUrl = String(body.imageUrl || '').slice(0, 500)
    if (imageUrl && !/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('data:image/')) throw new Error('Imagem inválida')
    const parentId = String(body.parentId || '')
    if (parentId && !post.comments.some((c) => c && c.id === parentId && !c.parentId)) throw new Error('Comentario original nao encontrado')
    post.comments.push({ id: id(), userId, content, imageUrl, parentId: parentId || '', likes: [], dislikes: [], createdAt: now() })
    try {
      const commenter = getAllUsers(store).find((u) => u && u.id === userId)
      const targets = new Set()
      if (post.authorId && post.authorId !== userId) targets.add(post.authorId)
      if (parentId) {
        const parent = post.comments.find((c) => c && c.id === parentId)
        if (parent && parent.userId && parent.userId !== userId) targets.add(parent.userId)
      }
      for (const tid of targets) {
        addNotification(store, {
          toUserId: tid,
          fromUserId: userId,
          fromName: (commenter && commenter.name) || 'Alguem',
          fromPhoto: (commenter && commenter.photoUrl) || '',
          type: 'feed-comment',
          title: `${(commenter && commenter.name) || 'Alguem'} comentou no seu post`,
          body: content.slice(0, 90),
          data: { postId },
        })
      }
    } catch { }
    for (const c of post.comments) {
      if (!c) continue
      if (!Array.isArray(c.likes)) c.likes = []
      if (!Array.isArray(c.dislikes)) c.dislikes = []
      if (typeof c.parentId !== 'string') c.parentId = ''
    }
    savePostEverywhere(store, data, post)
    return { ok: true, comments: post.comments }
  },
  ratePostComment: async (store, data, body) => {
    const userId = String(body.userId || '')
    const postId = String(body.postId || '')
    const commentId = String(body.commentId || '')
    const rate = body.rate === 'dislike' ? 'dislike' : body.rate === 'like' ? 'like' : 'none'
    const post = getAllPosts(store).find((p) => p && p.id === postId)
    if (!post) throw new Error('Post nao encontrado')
    const c = (post.comments || []).find((x) => x && x.id === commentId)
    if (!c) throw new Error('Comentario nao encontrado')
    if (!Array.isArray(c.likes)) c.likes = []
    if (!Array.isArray(c.dislikes)) c.dislikes = []
    c.likes = c.likes.filter((v) => v !== userId)
    c.dislikes = c.dislikes.filter((v) => v !== userId)
    if (rate === 'like') c.likes.push(userId)
    if (rate === 'dislike') c.dislikes.push(userId)
    savePostEverywhere(store, data, post)
    return { ok: true, comments: post.comments }
  },
  getTrending: async (store, data) => {
    const counts = {}
    const cutoff = now() - 24 * 3600 * 1000
    const __allPosts = getAllPosts(store)
      for (const p of __allPosts) {
        if (!p || p.createdAt < cutoff || !Array.isArray(p.hashtags)) continue
        for (const tag of p.hashtags) counts[tag] = (counts[tag] || 0) + 1
      }
    const trending = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }))
    return { ok: true, trending }
  },
  // Preview de link (OG tags) para o feed: o usuario cola uma URL e o post
  // vira um card com player (YouTube/TikTok) ou thumb + titulo + descricao.
  getDriveStream: async (store, data, body) => {
    // Extrai as URLs transcodificadas (googlevideo) da página de preview do
    // Drive: tocam em qualquer navegador, mesmo se o original for HEVC ou
    // o download direto estiver instável. Sem login, só arquivo público.
    const fileId = String(body.fileId || '')
    if (!/^[\w-]{10,}$/.test(fileId)) throw new Error('Arquivo inválido')
    if (!(await rateCheck('drvstream:' + String(body.__actor || 'x'), 20, 60000))) throw rateLimitError()
    try {
      const response = await fetch(`https://drive.google.com/file/d/${fileId}/view`, {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return { ok: true, urls: [] }
      const html = (await response.text()).slice(0, 600000)
      const found = []
      const re = /https?:\/\/[\w.-]*googlevideo\.com\/videoplayback[^"'\s\\]*/g
      let m
      while ((m = re.exec(html)) && found.length < 8) {
        let u = m[0].replace(/\\u0026/g, '&').replace(/\\u002F/g, '/').replace(/\\"/g, '')
        if (u.includes('videoplayback') && !found.includes(u)) found.push(u)
      }
      return { ok: true, urls: found.slice(0, 6) }
    } catch {
      return { ok: true, urls: [] }
    }
  },
  getLinkPreview: async (store, data, body) => {
    if (!(await rateCheck('linkprev:' + String(body.__actor || 'x'), 20, 60000))) throw rateLimitError()
    const url = String(body.url || '').trim()
    if (!/^https?:\/\//i.test(url)) throw new Error('URL invalida')
    let linkHost = ''
    try { linkHost = new URL(url).hostname.toLowerCase() } catch { throw new Error('URL invalida') }
    if (!linkHost || linkHost === 'localhost') throw new Error('URL bloqueada')
    try {
      const dnsMod = await import('node:dns')
      const resolved = await dnsMod.promises.lookup(linkHost, { all: true })
      const badAddr = (x) => /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|0\.0\.0\.0|::1$|fc00:|fe80:)/i.test(String(x || ''))
      if (resolved.length && resolved.some((r) => badAddr(r.address))) throw new Error('URL bloqueada')
    } catch (e) { if (e && /bloqueada/.test(String((e && e.message) || ''))) throw e }
    const preview = { url, title: '', image: '', description: '', siteName: '', embedType: 'generic' }
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
          accept: 'text/html,*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) return { ok: true, preview: null }
      const type = String(response.headers.get('content-type') || '')
      if (type.startsWith('video/')) {
        preview.embedType = 'video'
        preview.title = url
        return { ok: true, preview }
      }
      if (type.startsWith('image/')) {
        preview.embedType = 'image'
        preview.title = url
        preview.image = url
        return { ok: true, preview }
      }
      const html = (await response.text()).slice(0, 300000)
      const og = (name) => {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']og:${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
          || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:${name}["']`, 'i'))
        return m ? m[1].replace(/&amp;/g, '&') : ''
      }
      preview.title = (og('title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim().slice(0, 200)
      preview.image = og('image')
      preview.description = og('description').trim().slice(0, 400)
      preview.siteName = (og('site_name') || '').trim().slice(0, 100)
      const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i.exec(url)
      if (yt) {
        preview.embedType = 'youtube'
        preview.videoId = yt[1]
        if (!preview.image) preview.image = `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`
      } else if (/tiktok\.com\//i.test(url)) {
        preview.embedType = 'tiktok'
      }
      return { ok: true, preview }
    } catch {
      return { ok: true, preview: null }
    }
  },
  // ---- Seguir / Bloquear (estilo rede social) ----
  // Seguir libera as stories e o feed do usuario; conversar so com amizade
  // aceita. Bloquear remove a amizade/solicitacao e impede novos contatos.
  toggleFollow: async (store, data, body) => {
    const userId = String(body.userId || '')
    const targetId = String(body.targetId || '')
    if (!userId || !targetId || userId === targetId) throw new Error('Usuarios invalidos')
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    const target = getAllUsers(store).find((u) => u && u.id === targetId)
    if (!user || !target) throw new Error('Usuario nao encontrado')
    if (!Array.isArray(user.following)) user.following = []
    if (!Array.isArray(target.followers)) target.followers = []
    const idx = user.following.indexOf(targetId)
    if (idx === -1) {
      user.following.push(targetId)
      if (!target.followers.includes(userId)) target.followers.push(userId)
      writeUserEverywhere(store, data, user)
      upsertGlobalUser(store, user)
      writeUserEverywhere(store, data, target)
      upsertGlobalUser(store, target)
      return { ok: true, following: true }
    }
    user.following.splice(idx, 1)
    const tIdx = target.followers.indexOf(userId)
    if (tIdx !== -1) target.followers.splice(tIdx, 1)
    writeUserEverywhere(store, data, user)
    upsertGlobalUser(store, user)
    writeUserEverywhere(store, data, target)
    upsertGlobalUser(store, target)
    return { ok: true, following: false }
  },
  toggleBlock: async (store, data, body) => {
    const userId = String(body.userId || '')
    const targetId = String(body.targetId || '')
    if (!userId || !targetId || userId === targetId) throw new Error('Usuarios invalidos')
    const user = getAllUsers(store).find((u) => u && u.id === userId)
    const target = getAllUsers(store).find((u) => u && u.id === targetId)
    if (!user || !target) throw new Error('Usuario nao encontrado')
    if (!Array.isArray(user.blocked)) user.blocked = []
    const idx = user.blocked.indexOf(targetId)
    if (idx === -1) {
      user.blocked.push(targetId)
      // Bloqueio limpa amizade/solicitacao pendente e segue/segue-de-volta.
      data.friends = (data.friends || []).filter((f) =>
        !((f.userId === userId && f.friendId === targetId) || (f.userId === targetId && f.friendId === userId)))
      if (Array.isArray(user.following)) {
        const fIdx = user.following.indexOf(targetId)
        if (fIdx !== -1) user.following.splice(fIdx, 1)
      }
      if (Array.isArray(user.followers)) {
        const fIdx = user.followers.indexOf(targetId)
        if (fIdx !== -1) user.followers.splice(fIdx, 1)
      }
      if (Array.isArray(target.followers)) {
        const fIdx = target.followers.indexOf(userId)
        if (fIdx !== -1) target.followers.splice(fIdx, 1)
      }
      if (Array.isArray(target.following)) {
        const fIdx = target.following.indexOf(userId)
        if (fIdx !== -1) target.following.splice(fIdx, 1)
      }
      writeUserEverywhere(store, data, user)
      upsertGlobalUser(store, user)
      writeUserEverywhere(store, data, target)
      upsertGlobalUser(store, target)
      return { ok: true, blocked: true }
    }
    user.blocked.splice(idx, 1)
    writeUserEverywhere(store, data, user)
    upsertGlobalUser(store, user)
    return { ok: true, blocked: false }
  },
  addServerEmoji: async (store, data, body) => {
    const server = getAllServers(store).find((s) => s && s.id === body.serverId)
    if (!server) throw new Error('Servidor nao encontrado')
    const actor = String(body.userId || '')
    const isStaff = actor === server.ownerId || (Array.isArray(server.staffMemberIds) && server.staffMemberIds.includes(actor))
    if (!isStaff) throw new Error('Somente o dono e a staff podem gerenciar emojis')
    const kind = ['emoji', 'gif', 'sticker'].includes(body.kind) ? body.kind : 'emoji'
    const url = String(body.url || '').trim()
    if (!url) throw new Error('Imagem do emoji obrigatoria')
    const emojis = server.emojis || []
    if (emojis.length >= 50) throw new Error('Maximo de 50 emojis por servidor')
    let updated
    if (kind === 'emoji') {
      const name = String(body.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      if (!name || name.length > 32) throw new Error('Nome do emoji invalido')
      const existing = emojis.find((e) => e.name === name && e.kind === 'emoji')
      if (existing) {
        updated = {
          ...server,
          emojis: emojis.map((e) => e.id === existing.id
            ? { ...e, url, addedBy: actor, createdAt: now() }
            : e),
        }
      } else {
        updated = {
          ...server,
          emojis: [...emojis, { id: id(), serverId: server.id, name, url, addedBy: actor, createdAt: now(), kind }],
        }
      }
    } else {
      const name = String(body.name || '').trim().slice(0, 64)
      updated = {
        ...server,
        emojis: [...emojis, { id: id(), serverId: server.id, name, url, addedBy: actor, createdAt: now(), kind }],
      }
    }
    upsertGlobalServer(store, updated)
    const index = data.servers.findIndex((s) => s.id === server.id)
    if (index === -1) data.servers.push(updated)
    else data.servers[index] = updated
    return { server: updated, servers: data.servers }
  },
  deleteServerEmoji: async (store, data, body) => {
    const server = getAllServers(store).find((s) => s && s.id === body.serverId)
    if (!server) throw new Error('Servidor nao encontrado')
    const actor = String(body.userId || '')
    const isStaff = actor === server.ownerId || (Array.isArray(server.staffMemberIds) && server.staffMemberIds.includes(actor))
    if (!isStaff) throw new Error('Somente o dono e a staff podem gerenciar emojis')
    const updated = { ...server, emojis: (server.emojis || []).filter((e) => e.id !== body.emojiId) }
    upsertGlobalServer(store, updated)
    const index = data.servers.findIndex((s) => s.id === server.id)
    if (index === -1) data.servers.push(updated)
    else data.servers[index] = updated
    return { server: updated, servers: data.servers }
  },
  addServerEvent: async (store, data, body) => {
    const server = getAllServers(store).find((s) => s && s.id === body.serverId)
    if (!server) throw new Error('Servidor nao encontrado')
    const actor = String(body.userId || '')
    const isStaff = actor === server.ownerId || (Array.isArray(server.staffMemberIds) && server.staffMemberIds.includes(actor))
    if (!isStaff) throw new Error('Somente o dono e a staff podem criar eventos')
    const title = String(body.title || '').trim().slice(0, 120)
    if (!title) throw new Error('Titulo do evento obrigatorio')
    const date = Number(body.date)
    if (!Number.isFinite(date) || date <= 0) throw new Error('Data do evento invalida')
    if ((server.events || []).length >= 50) throw new Error('Maximo de 50 eventos por servidor')
    const event = {
      id: id(),
      serverId: server.id,
      title,
      description: body.description == null ? undefined : String(body.description).trim().slice(0, 1000),
      date,
      location: body.location == null ? undefined : String(body.location).trim().slice(0, 120),
      createdBy: actor,
      createdAt: now(),
    }
    const updated = { ...server, events: [...(server.events || []), event] }
    upsertGlobalServer(store, updated)
    const index = data.servers.findIndex((s) => s.id === server.id)
    if (index === -1) data.servers.push(updated)
    else data.servers[index] = updated
    const creator = getAllUsers(store).find((u) => u && u.id === body.userId)
    for (const memberId of (server.members || [])) {
      if (memberId === body.userId) continue
      addNotification(store, {
        toUserId: memberId,
        fromUserId: body.userId || 'system',
        fromName: creator?.name || 'Sistema',
        fromPhoto: creator?.photoUrl || '',
        type: 'server-event',
        title: `Novo evento em ${server.name}`,
        body: String(body.title || ''),
        data: { serverId: server.id },
      })
    }
    return { server: updated, servers: data.servers }
  },
  deleteServerEvent: async (store, data, body) => {
    const server = getAllServers(store).find((s) => s && s.id === body.serverId)
    if (!server) throw new Error('Servidor nao encontrado')
    const actor = String(body.userId || '')
    const isStaff = actor === server.ownerId || (Array.isArray(server.staffMemberIds) && server.staffMemberIds.includes(actor))
    if (!isStaff) throw new Error('Somente o dono e a staff podem gerenciar eventos')
    const updated = { ...server, events: (server.events || []).filter((e) => e.id !== body.eventId) }
    upsertGlobalServer(store, updated)
    const index = data.servers.findIndex((s) => s.id === server.id)
    if (index === -1) data.servers.push(updated)
    else data.servers[index] = updated
    return { server: updated, servers: data.servers }
  },
  upsertCallSession: async (store, data, body) => {
    const incoming = body.session || {}
    cleanupCallSessions(store, now())
    const incomingId = String(incoming.id || '')
    const incomingActive = Boolean(incoming.active)
    const serverId = String(incoming.serverId || '')
    {
      const meSelf = String(body.userId || '')
      if (serverId && serverId !== 'dm') {
        if (!isServerMember(store, meSelf, serverId)) deny('Apenas membros (403)')
      } else if (serverId === 'dm') {
        const exSess = getAllCallSessions(store).find((s) => s && s.id === incomingId)
        const isExistingParticipant = Boolean(exSess && (exSess.participantIds || []).includes(meSelf))
        const isInvited = Boolean(exSess && (exSess.invitedAt || {})[meSelf])
        if (!isExistingParticipant && !isInvited) {
          const invitedIds = Array.isArray(body.invitedIds) ? body.invitedIds.map((v) => String(v)) : []
          const othersDm = [...new Set([...(incoming.participantIds || []), ...invitedIds])]
            .filter((x) => x && x !== meSelf)
          const mineSet = new Set(memberServerIdsOf(store, meSelf))
          const okDm = othersDm.length > 0 && othersDm.every((oid) => areFriends(store, meSelf, String(oid)) || memberServerIdsOf(store, String(oid)).some((sid) => mineSet.has(sid)))
          if (!okDm) deny('Operação negada (403)')
        }
      }
    }
    const channelId = String(incoming.channelId || '')

    let canonicalId = incomingId
    if (incomingActive && serverId && serverId !== 'dm') {
      const sameChannel = getAllCallSessions(store).find((item) =>
        item.active && item.id !== incomingId && item.serverId === serverId && item.channelId === channelId)
      if (sameChannel) canonicalId = sameChannel.id
    }

    const existing = getAllCallSessions(store).find((item) => item.id === canonicalId)
    const participantIds = Array.isArray(incoming.participantIds) ? incoming.participantIds : []
    const selfId = String(body.userId || '')
    const prevIds = existing ? [...(existing.participantIds || [])] : []
    const prevScreenSharer = String(existing?.screenSharingUserId || '')
    const stamps = { ...(existing?.participantLastSync || {}) }
    const staleThreshold = now() - CALL_SYNC_GRACE_MS
    // Tumba de quem saiu: o sync dos outros nao pode re-adicionar o fantasma.
    // A propria pessoa limpa a tumba quando volta (sync com selfId).
    const leftAt = { ...(existing?.leftAt || {}) }
    if (body.leaveUserId) leftAt[body.leaveUserId] = now()
    if (selfId) delete leftAt[selfId]
    const leftGrace = now() - CALL_LEAVE_TOMBSTONE_MS
    for (const id of Object.keys(leftAt)) {
      if (Number(leftAt[id] || 0) <= leftGrace) delete leftAt[id]
    }
    const invitedIds = Array.isArray(body.invitedIds) ? body.invitedIds.map((v) => String(v)) : []
    const invitedAt = { ...(existing?.invitedAt || {}) }
    const invitedBy = { ...(existing?.invitedBy || {}) }
    const declinedAt = { ...(existing?.declinedAt || {}) }
    // Merge dos ids do existing com os do incoming. Em canal de SERVIDOR so o
    // proprio participante pode se anunciar: o front de cada um manda a lista
    // local completa, que pode conter gente que ja saiu — e era isso que
    // "ressuscitava" o fantasma (aparecia na call/channel depois de sair).
    // Em DM mantemos o merge legado (o chamador 1-a-1 lista o alvo antes dele
    // aceitar). Convites NUNCA entram em participantIds: so vao para invitedAt
    // e o convidado vira participante quando o sync DELE chegar (ao aceitar).
    const isDmCall = serverId === 'dm'
    let mergedIds = isDmCall
      ? [...new Set([...(existing?.participantIds || []), ...participantIds])]
      : [...(existing?.participantIds || [])]
    mergedIds = mergedIds.filter((id) => id === selfId || (!hasStaleStamp(stamps, id, staleThreshold) && !(Number(leftAt[id] || 0) > leftGrace)))
    if (invitedIds.length) mergedIds = mergedIds.filter((id) => !invitedIds.includes(id))
    if (body.leaveUserId) mergedIds = mergedIds.filter((id) => id !== body.leaveUserId)
    // (O "ultimo a sair apaga na hora" roda DEPOIS do session existir — antes
    // era feito aqui citando `session` antes do const (ReferenceError/500).)
    if (selfId) {
      mergedIds = [selfId, ...mergedIds.filter((id) => id !== selfId)]
      stamps[selfId] = now()
    }
    if (body.leaveUserId && stamps[body.leaveUserId]) delete stamps[body.leaveUserId]
    // Convite ativo (botao "Adicionar pessoa na call"): NAO entra na call.
    // Fica em invitedAt/invitedBy por 30s; o app do convidado toca o convite e
    // so chama startCall se ele aceitar. Sem stamp/participantIds ele nao vira
    // fantasma nem aparece na lista de quem esta na call antes de aceitar.
    for (const id of invitedIds) {
      if (!id || id === selfId) continue
      invitedAt[id] = now()
      invitedBy[id] = selfId
      delete declinedAt[id]
    }
    if (selfId) {
      delete invitedAt[selfId]
      delete invitedBy[selfId]
    }
    const inviteGrace = now() - CALL_INVITE_TTL_MS
    for (const id of Object.keys(invitedAt)) {
      if (Number(invitedAt[id] || 0) <= inviteGrace) {
        delete invitedAt[id]
        delete invitedBy[id]
      }
    }
    // Quem recusou: remove o convite e guarda o "nao quis entrar" por alguns
    // minutos para o chamador mostrar o aviso (sem encerrar a call de grupo).
    const declineInviteIds = Array.isArray(body.declineInviteIds)
      ? body.declineInviteIds.map((v) => String(v)).filter((id) => id && id === selfId)
      : []
    for (const id of declineInviteIds) {
      delete invitedAt[id]
      delete invitedBy[id]
      declinedAt[id] = now()
    }
    const declineGrace = now() - CALL_INVITE_DECLINE_TTL_MS
    for (const id of Object.keys(declinedAt)) {
      if (Number(declinedAt[id] || 0) <= declineGrace) delete declinedAt[id]
    }
    // Quem ja esta na call nao continua "convidado" (legado/retry).
    for (const id of mergedIds) {
      if (invitedAt[id]) {
        delete invitedAt[id]
        delete invitedBy[id]
      }
    }
    // Poda explicita: um peer viu a PC de outro morrer e avisa. Sem isso, o
    // stamp fresco do morto o mantem para todos. Nunca poda o selfId; se o
    // "morto" estiver vivo em outra aba, o sync dele o readiciona.
    const pruneIds = Array.isArray(body.pruneIds) ? body.pruneIds.map((v) => String(v)) : []
    if (pruneIds.length) {
      mergedIds = mergedIds.filter((id) => id === selfId || !pruneIds.includes(id))
      for (const id of pruneIds) { if (id !== selfId && stamps[id]) delete stamps[id] }
    }
    const addedIds = mergedIds.filter((id) => !prevIds.includes(id))
    const removedIds = prevIds.filter((id) => !mergedIds.includes(id))
    const nextScreenSharer = String(incoming.screenSharingUserId || existing?.screenSharingUserId || '')
    const allUsers = getAllUsers(store)
    const userNameOf = (userId) => {
      const u = allUsers.find((x) => x && x.id === userId)
      return u ? u.name : 'Alguem'
    }
    const userPhotoOf = (userId) => {
      const u = allUsers.find((x) => x && x.id === userId)
      return u ? (u.photoUrl || '') : ''
    }
    const channelLabel = getChannelLabel(store, serverId, channelId)
    if (addedIds.length === 1 && addedIds[0] === selfId) {
      for (const memberId of mergedIds) {
        if (memberId === selfId) continue
        addNotification(store, {
          toUserId: memberId,
          fromUserId: selfId,
          fromName: userNameOf(selfId),
          fromPhoto: userPhotoOf(selfId),
          type: 'call-join',
          title: `${userNameOf(selfId)} entrou na call`,
          body: channelLabel || 'Chamada',
          data: { serverId, channelId, sessionId: canonicalId },
        })
      }
    }
    // Push de CHAMADA: nova call DM ativa criada por alguem (selfId = chamador)
    // com outra pessoa nos participantes -> notifica quem foi chamado, mesmo
    // com o navegador/app fechado.
    if (serverId === 'dm' && incomingActive && selfId && !(existing && existing.active)) {
      for (const memberId of mergedIds) {
        if (memberId === selfId) continue
        if (!memberId) continue
        const callerName = userNameOf(selfId)
        void sendPushToUser(memberId, `${callerName} esta chamando voce`, 'Chamada DM', {
          url: '/',
          tag: `call-${canonicalId}`,
          renotify: true,
          icon: userPhotoOf(selfId) || '/Logo.png',
        })
      }
    }
    if (removedIds.length === 1 && removedIds[0] === selfId && prevIds.includes(selfId)) {
      for (const memberId of mergedIds) {
        if (memberId === selfId) continue
        addNotification(store, {
          toUserId: memberId,
          fromUserId: selfId,
          fromName: userNameOf(selfId),
          fromPhoto: userPhotoOf(selfId),
          type: 'call-leave',
          title: `${userNameOf(selfId)} saiu da call`,
          body: channelLabel || 'Chamada',
          data: { serverId, channelId, sessionId: canonicalId },
        })
      }
    }
    if (prevScreenSharer !== nextScreenSharer && nextScreenSharer) {
      for (const memberId of mergedIds) {
        if (memberId === nextScreenSharer) continue
        addNotification(store, {
          toUserId: memberId,
          fromUserId: nextScreenSharer,
          fromName: userNameOf(nextScreenSharer),
          fromPhoto: userPhotoOf(nextScreenSharer),
          type: 'screen-start',
          title: `${userNameOf(nextScreenSharer)} comecou a transmitir tela`,
          body: channelLabel || 'Chamada',
          data: { serverId, channelId, sessionId: canonicalId },
        })
      }
    } else if (prevScreenSharer !== nextScreenSharer && prevScreenSharer) {
      for (const memberId of mergedIds) {
        if (memberId === prevScreenSharer) continue
        addNotification(store, {
          toUserId: memberId,
          fromUserId: prevScreenSharer,
          fromName: userNameOf(prevScreenSharer),
          fromPhoto: userPhotoOf(prevScreenSharer),
          type: 'screen-stop',
          title: `${userNameOf(prevScreenSharer)} parou de transmitir tela`,
          body: channelLabel || 'Chamada',
          data: { serverId, channelId, sessionId: canonicalId },
        })
      }
    }
    const views = { ...((existing && existing.peerViews) || {}) }
    if (selfId) views[selfId] = { stats: (incoming.connectionStats && typeof incoming.connectionStats === 'object' ? incoming.connectionStats : {}), at: now() }
    for (const rid of Object.keys(views)) {
      try { if (!views[rid] || now() - Number(views[rid].at || 0) > 45000) delete views[rid] } catch { }
    }
    const session = {
      id: canonicalId,
      serverId: String(incoming.serverId || existing?.serverId || ''),
      channelId: String(incoming.channelId || existing?.channelId || ''),
      active: serverId === 'dm' ? mergedIds.length > 0 : true,
      hostUserId: String(existing?.hostUserId || incoming.hostUserId || ''),
      participantIds: [...new Set(mergedIds)],
      invitedAt,
      invitedBy,
      declinedAt,
      screenSharingUserId: String(incoming.screenSharingUserId || existing?.screenSharingUserId || ''),
      callMode: String(incoming.callMode || existing?.callMode || ''),
      connectionStats: incoming.connectionStats || existing?.connectionStats || {},
      participantLastSync: stamps,
      peerViews: views,
      leftAt,
      updatedAt: now(),
      createdAt: existing ? Number(existing.createdAt || now()) : Number(incoming.createdAt || now()),
    }
    if (body.leaveUserId) {
      session.participantIds = session.participantIds.filter((id) => id !== body.leaveUserId)
      if (session.hostUserId === body.leaveUserId) session.hostUserId = session.participantIds[0] || ''
    }
    // Ultimo a sair (ou cancelamento antes de alguem entrar) apaga a sessao na
    // hora, sem esperar os 35s do stamp. Chamador esperando sozinho continua
    // ativo porque o alvo segue listado em participantIds.
    if (session.serverId === 'dm' && session.participantIds.length === 0) {
      session.active = false
    }
    session.watch = sessionWatch(session)
    upsertGlobalCallSession(store, session)
    if (canonicalId !== incomingId) {
      const orphans = getAllCallSessions(store).filter((item) =>
        item.active && item.serverId === serverId && item.channelId === channelId && item.id !== canonicalId)
      for (const orphan of orphans) {
        upsertGlobalCallSession(store, { ...orphan, active: false, updatedAt: now() })
      }
    }
    // Payload leve (fix ping alto): antes devolvia TODAS as sessões ativas do
    // banco a cada presença (3s × N users). Agora devolve só o mesmo
    // server/canal (máx 20), o front já filtra por serverId mesmo.
    const scopedSessions = getAllCallSessions(store).filter((item) =>
      item && item.active && (!serverId || item.serverId === serverId)).slice(-20)
    return { session, callSessions: scopedSessions }
  },
  savePushSubscription: async (store, data, body) => {
    const userId = String(body.userId || '')
    const sub = body.subscription
    if (!userId || !sub || !sub.endpoint) throw new Error('Assinatura invalida')
    const subs = await getPushSubs()
    const list = (subs[userId] || []).filter((s) => s && s.endpoint !== sub.endpoint)
    list.push({ endpoint: String(sub.endpoint), keys: sub.keys || {}, expirationTime: sub.expirationTime || null })
    subs[userId] = list.slice(-5)
    await savePushSubs(subs)
    return { ok: true }
  },
  removePushSubscription: async (store, data, body) => {
    const userId = String(body.userId || '')
    const endpoint = String(body.endpoint || '')
    const subs = await getPushSubs()
    if (subs[userId]) subs[userId] = subs[userId].filter((s) => s && s.endpoint !== endpoint)
    await savePushSubs(subs)
    return { ok: true }
  },
  refreshPushRegistration: async () => ({ ok: true }),
  loadCallSessions: async (store, data, body) => {
    const serverId = String(body.serverId || '')
    const userId = String(body.userId || '')
    // Limpeza aqui tambem: quando TODOS saem da call ninguem mais da sync e
    // o fantasma viveria para sempre (o upsert que pruneia nunca mais roda).
    // O saveStore acontece pois loadCallSessions esta em NO_LOCK_ACTIONS.
    cleanupCallSessions(store, now())
    const actor = String(body.__actor || '')
    const isIn = (session, id) => Boolean(id) && (
      (session.participantIds || []).includes(id) || Boolean((session.invitedAt || {})[id])
    )
    return getAllCallSessions(store).filter((session) => session.active
      && (session.participantIds || []).length > 0
      && (!serverId || session.serverId === serverId)
      && (!userId || isIn(session, userId))
      && (isIn(session, actor) || isServerMember(store, actor, session.serverId)))
      .map((session) => ({ ...session, watch: sessionWatch(session) }))
  },
}

// Hosts do site aceitos no CORS/autoridade de origem: Cloudflare Pages,
// Vercel, Firebase Hosting e desenvolvimento local.
function isAllowedSiteHost(host) {
  return host === 'friends-space.pages.dev'
    || host.endsWith('.vercel.app')
    || host.endsWith('.web.app')
    || host.endsWith('.firebaseapp.com')
    || host === 'localhost'
    || host === '127.0.0.1'
    || host.endsWith('.localhost')
}

export default async function handler(req, res) {
  try {
    try {
      const __o = String(req?.headers?.origin || '')
      let __h = ''
      try { __h = new URL(__o).hostname.toLowerCase() } catch {}
      res._corsOrigin = (!__o || __o === 'file://' || isAllowedSiteHost(__h)) ? (__o || '*') : 'null'
    } catch { res._corsOrigin = '*' }
    const url = new URL(req.url, 'http://localhost')
    const profileIdFromQuery = url.searchParams.get('profileId')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.setHeader('access-control-allow-origin', res._corsOrigin || '*')
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
      res.setHeader('access-control-allow-headers', 'content-type,authorization,cache-control,pragma')
      res.setHeader('access-control-max-age', '86400')
      res.end()
      return
    }
    if (isRateLimited(req)) {
      json(res, 429, { ok: false, error: 'Muitas requisições. Tente novamente em instantes.' })
      return
    }

    if (req.method === 'GET') {
      const qActor = await verifySession(String(url.searchParams.get('sessionToken') || ''))
      if (!qActor) { json(res, 401, { ok: false, error: 'Sessão expirada. Entre de novo.' }); return }
      const store = await loadStore()
      const profileId = profileIdFromQuery || 'anonymous'
      const data = getProfileData(store, profileId)
      const ids = (data.users || []).map((u) => u && u.id)
      if (!ids.includes(qActor)) {
        const me = getAllUsers(store).find((u) => u && u.id === qActor)
        if (!me) { json(res, 401, { ok: false, error: 'Sessão expirada. Entre de novo.' }); return }
        // Formato AppData direto (o cliente espera users/servers/friends sem
        // wrapper ok/result). Inclui o usuario logado mesmo que a fatia do
        // perfil ainda nao o tenha (o login grava na fatia "anonymous").
        json(res, 200, {
          ...data,
          users: withPublicUsers([...(data.users || []), me]),
        })
        return
      }
      json(res, 200, {
        ...data,
        users: withPublicUsers(data.users || []),
      })
      return
    }

    if (req.method !== 'POST') {
      json(res, 405, { error: 'Método não permitido' })
      return
    }

    const body = await readBody(req)
    try { console.log('[cv]', String(body.cv || '?'), String(body.action || '?'), String(req.headers.get('user-agent') || '').slice(0, 70)) } catch { }

    if (body.action === 'markOffline') {
      const moActor = await verifySession(body.sessionToken)
      if (!moActor || String(body.userId || '') !== moActor) { json(res, 401, { ok: false, error: 'Sessão expirada. Entre de novo.' }); return }
      const userId = String(body.userId || '')
      if (userId) {
        try {
          if (isTurso()) {
            await tursoFetch('DELETE FROM presence WHERE user_id = ?', [userId])
          } else {
            const kv = await kvGet(PRESENCE_KEY)
            if (kv && typeof kv === 'object' && kv[userId]) {
              delete kv[userId]
              await kvSet(PRESENCE_KEY, kv)
            }
          }
        } catch { }
        presenceCache = { ...presenceCache }
        delete presenceCache[userId]
      }
      json(res, 200, { ok: true, result: { ok: true } })
      return
    }

    if (body.action === 'heartbeat') {
      const hbActor = await verifySession(body.sessionToken)
      if (!hbActor || String(body.userId || '') !== hbActor) { json(res, 401, { ok: false, error: 'Sessão expirada. Entre de novo.' }); return }
      const heartbeatAt = Date.now()
      const userId = String(body.userId || '')
      if (!userId) {
        json(res, 400, { ok: false, error: 'userId obrigatorio' })
        return
      }
      try {
        // UM pipeline HTTP (1 roundtrip): upsert da linha + prune de velhos.
        // Antes: kvGet + kvSet do blob (2 roundtrips Turso de ~280ms) — era
        // exatamente o "RTT presença" de ~500ms que o Debug mostrava.
        if (isTurso()) {
          await tursoPipeline([
            { sql: 'INSERT INTO presence (user_id, ts) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET ts = excluded.ts', args: [userId, heartbeatAt] },
            { sql: 'DELETE FROM presence WHERE ts < ?', args: [heartbeatAt - PRESENCE_PRUNE_MS] },
            { sql: 'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE kv.value <> excluded.value', args: [`clientcv:${String(body.deviceId || userId)}`, JSON.stringify({ cv: String(body.cv || ''), ua: String(req.headers.get('user-agent') || '').slice(0, 80), userId }), heartbeatAt] },
          ])
        } else {
          // SEMPRE mergeia com o kv atual para evitar que multiplas instancias
          // quentes clobberem a presenca umas das outras.
          const kv = await kvGet(PRESENCE_KEY)
          const latest = (kv && typeof kv === 'object') ? { ...kv, [userId]: heartbeatAt } : { [userId]: heartbeatAt }
          for (const [uid, ts] of Object.entries(latest)) {
            if (typeof ts === 'number' && heartbeatAt - ts > PRESENCE_PRUNE_MS) delete latest[uid]
          }
          await kvSet(PRESENCE_KEY, latest)
        }
        presenceCache = { ...presenceCache, [userId]: heartbeatAt }
      } catch {
        // presença é best-effort: não derruba o heartbeat
      }
      json(res, 200, { ok: true, result: { ok: true, lastSeenAt: heartbeatAt } })
      return
    }

    if (body.action === 'getGeo') {
    const geoActor = await verifySession(body.sessionToken)
    if (!geoActor) { json(res, 401, { ok: false, error: 'Sessão expirada. Entre de novo.' }); return }
      // Deteccao automatica de idioma por IP: a Vercel injeta o header
      // x-vercel-ip-country (e cf-ipcountry quando a requisicao vem via
      // proxy do Cloudflare Pages).
      const country = String(
        req.headers['x-vercel-ip-country'] ||
        req.headers['cf-ipcountry'] ||
        ''
      ).toUpperCase()
      json(res, 200, { ok: true, result: { country } })
      return
    }

    const action = actions[body.action]
    if (!action) {
      json(res, 400, { error: 'Ação inválida' })
      return
    }

    const READONLY_ACTIONS = new Set([
      'state',
      'directoryState',
      'loadUserServers',
      'getServer',
      'getUser',
      'findUserByFriendCode',
      'searchDirectory',
      'canJoinCall',
      'loadCallSignals',
      'loadFriends',
      'loadDirectMessages',
      'loadMutuals',
      'loadCallSessions',
      'loadNotifications',
      'loadActivityHistory',
      'getUnread',
      'getMyReports',
      'getMyDefenses',
      'getStories',
      'getFeed',
      'getTrending',
      'getNews',
      'getLinkPreview',
      'loadMyFolders',
      'listAllReports',
      'findUserById',
      'listCallSessionsAdmin',
      'checkUpdate',
    ])
    // Sinais WebRTC e sync de sessao sao insercao de registros pontuais que nao
    // precisam do lock de escrita global. Durante uma call com varios
    // participantes, os candidatos ICE batem no mesmo lock de 5s e o backend
    // devolve 503, perdendo oferta/resposta/candidatos e travando a media.
    // Exemptos do lock (o saveStore continua sendo feito, pois a chamada nao
    // pode depender do lock para persistir os sinais).
    const NO_LOCK_ACTIONS = new Set(['sendCallSignal', 'sendCallSignals', 'upsertCallSession', 'loadMessages', 'loadCallSessions'])
    try {
      const h = req?.headers || {}
      const origin = String(h.origin || (typeof h.get === 'function' ? h.get('origin') : '') || '')
      if (origin) {
        let host = ''
        try { host = new URL(origin).hostname.toLowerCase() } catch {}
        if (!isAllowedSiteHost(host)) { json(res, 403, { ok: false, error: 'Origem negada.' }); return }
      }
    } catch {}
    const __ip = getClientIp(req)
    body.__ip = __ip
    if (__ip && await isIpBanned(__ip)) { json(res, 403, { ok: false, error: 'Rede bloqueada. Contate o suporte.' }); return }
    const __dev = String(body.deviceId || '')
    if (__dev && await isDeviceBanned(__dev)) { json(res, 403, { ok: false, error: 'Dispositivo bloqueado. Contate o suporte.' }); return }
    const CALL_CV_ACTIONS = new Set(['upsertCallSession', 'loadCallSessions', 'loadCallSignals', 'sendCallSignal', 'sendCallSignals', 'heartbeat', 'markOffline'])
    if (CALL_CV_ACTIONS.has(body.action) && body.cv) {
      const day = String(body.cv).slice(0, 10)
      if (day < '2026-09-08') { json(res, 403, { ok: false, error: 'Atualize o app (Ctrl+F5). Versão antiga.' }); return }
    }
    const PUBLIC_ACTIONS = new Set(['ping', 'checkUpdate', 'signInWithName', 'signInWithGoogle', 'dbInfo'])
    let __actor = null
    if (!PUBLIC_ACTIONS.has(body.action)) {
      __actor = await verifySession(body.sessionToken)
      if (!__actor) { json(res, 401, { ok: false, error: 'Sessão expirada. Entre de novo.' }); return }
    }
    body.__actor = __actor
    if (__actor && typeof body.userId === 'string' && body.userId && body.userId !== __actor) {
      json(res, 403, { ok: false, error: 'Operação negada (403)' }); return
    }
    // FAST-PATH (10/2026): ping e poll de signals NÃO passam pelo loadStore
    // do blob inteiro (~900KB) — no 4G isso sozinho custava ~1500ms por
    // request, e o "PING SERVIDOR" do Debug media o peso do banco, não a
    // rede. Vale para TODOS os clients (inclusive build velho, sem Ctrl+F5):
    // - ping: responde direto (já é PUBLIC, sem actor).
    // - loadCallSignals com Turso: SELECT pontual na tabela call_signals
    //   (mesma query da action, sem lock/store/save). Sem Turso, cai no
    //   fluxo normal (signals moram no blob).
    if (body.action === 'ping') {
      json(res, 200, { ok: true, result: { pong: Date.now() } })
      return
    }
    if (body.action === 'loadCallSignals' && isTurso()) {
      try {
        const __userId = String(body.userId || '')
        const __sessionId = String(body.sessionId || '')
        const __since = Number(body.since || 0)
        await ensureTursoSchema()
        const __cutoff = __since > 0 ? __since : now() - 120_000
        const __result = await tursoFetch(
          `SELECT id, session_id, from_user_id, to_user_id, type, payload, created_at
           FROM call_signals
           WHERE session_id = ? AND to_user_id = ? AND created_at >= ?
           ORDER BY created_at ASC`,
          [__sessionId, __userId, __cutoff],
        )
        const __rows = __result.rows || []
        const __signals = __rows.map((row) => {
          const __get = (i) => (row[i] && typeof row[i] === 'object' && 'value' in row[i] ? row[i].value : row[i])
          let __payload = __get(5)
          try { __payload = JSON.parse(__payload) } catch { }
          return {
            id: __get(0),
            sessionId: __get(1),
            fromUserId: __get(2),
            toUserId: __get(3),
            type: __get(4),
            payload: __payload,
            createdAt: Number(__get(6)),
          }
        })
        json(res, 200, { ok: true, result: __signals })
      } catch (__e) {
        json(res, 400, { ok: false, error: __e instanceof Error ? __e.message : 'Erro inesperado' })
      }
      return
    }
    const isWrite = !READONLY_ACTIONS.has(body.action) && !body.readonly && !NO_LOCK_ACTIONS.has(body.action)
    let lockToken = null
    if (isWrite) {
      let acquired = await acquireLock()
      if (!acquired) {
        // Pico de concorrência: espera um pouco e tenta de novo antes de
        // devolver 503 (evita "derrubada" aparente em horário de pico).
        await new Promise((r) => setTimeout(r, 900))
        acquired = await acquireLock()
      }
      if (!acquired) {
        json(res, 503, { ok: false, error: 'Sistema ocupado. Tente novamente em instantes.' })
        return
      }
      lockToken = acquired === true ? null : acquired
    }

    try {
      const store = await loadStore()
      if (body.__actor) {
        const gateUser = getAllUsers(store).find((x) => x && x.id === body.__actor)
        if (!gateUser || gateUser.authProvider === 'guest') { json(res, 403, { ok: false, error: 'EXPULSO: conta inválida.' }); return }
      
      }
      // Manutencao automatica (a cada ~6h): contas inativas, servidores sem
      // dono e calls vazias — roda em qualquer POST, silenciosamente.
      const maintenance = await maybeRunMaintenance(store)
      const profileId = String(body.profileId || profileIdFromQuery || 'anonymous').trim() || 'anonymous'
      const profileData = getProfileData(store, profileId)
      const result = await action(store, profileData, body)
      if (isWrite || NO_LOCK_ACTIONS.has(body.action) || maintenance) await saveStore(store)
      json(res, 200, { ok: true, result })
    } finally {
      if (isWrite) await releaseLock(lockToken)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro inesperado'
    const st = typeof error?.status === 'number' ? error.status : 0
    const code = st || (/Banco indisponível|Sistema ocupado/.test(msg) ? 503 : 400)
    try { const __b = body; if (code === 403 && __b && __b.__ip) await recordDeny(__b.__ip) } catch {}
    json(res, code, { ok: false, error: msg })
  }
}
