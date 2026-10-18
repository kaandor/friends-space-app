#!/usr/bin/env node
// Migra o banco do Turso (EUA) para o Neon (regiao Sao Paulo / aws-sa-east-1).
//
// Uso:
//   node scripts/migrate-to-neon.mjs --neon-url "postgresql://user:senha@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require"
//
// A origem (Turso) vem do .env (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).
// Pode rodar de novo a qualquer momento: kv/bans fazem UPSERT, o resto e
// recriado (DELETE + INSERT), entao a 2a passada pega saves do meio do caminho.

import fs from 'node:fs'

const args = process.argv.slice(2)
const getArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? String(args[i + 1] || '') : ''
}

const envText = fs.readFileSync('.env', 'utf8')
const envOf = (key) => {
  const line = envText.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim() : ''
}

const TURSO_URL = process.env.TURSO_DATABASE_URL || envOf('TURSO_DATABASE_URL')
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || envOf('TURSO_AUTH_TOKEN')
const NEON_URL = getArg('--neon-url') || process.env.NEON_DATABASE_URL || ''

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('Faltam TURSO_DATABASE_URL/TURSO_AUTH_TOKEN no .env')
  process.exit(1)
}
if (!NEON_URL) {
  console.error('Passe --neon-url "postgresql://..." do Neon (Sao Paulo).')
  process.exit(1)
}

const tursoBase = TURSO_URL.startsWith('libsql://') ? `https://${TURSO_URL.slice('libsql://'.length)}` : TURSO_URL.replace(/^http:\/\//, 'https://')
const neonHost = /@([^/]+)\//.exec(NEON_URL)?.[1] || ''
if (!neonHost) {
  console.error('NEON_URL invalida (nao achei o host).')
  process.exit(1)
}

const tursoArg = (v) => {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'float', value: String(v) }
  return { type: 'text', value: String(v) }
}
const cellValue = (c) => {
  if (c === null || c === undefined || c.type === 'null') return null
  return c.value
}

const tursoSql = async (sql, params = []) => {
  const t0 = Date.now()
  const response = await fetch(`${tursoBase}/v2/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TURSO_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args: params.map(tursoArg) } }, { type: 'close' }] }),
  })
  if (!response.ok) throw new Error(`Turso HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`)
  const data = await response.json()
  const result = data?.results?.[0]
  if (!result) throw new Error('Turso: resposta vazia')
  if (result.type === 'error') throw new Error(`Turso: ${result.error?.message || 'erro'}`)
  const r = result.response?.result || {}
  return { rows: (r.rows || []).map((row) => row.map(cellValue)), ms: Date.now() - t0 }
}

const neonSql = async (sql, params = []) => {
  const t0 = Date.now()
  let n = 0
  const query = sql.replace(/\?/g, () => `$${++n}`)
  const response = await fetch(`https://${neonHost}/sql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Neon-Connection-String': NEON_URL },
    body: JSON.stringify({ query, params }),
  })
  if (!response.ok) throw new Error(`Neon HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`)
  const data = await response.json()
  const rows = (data?.rows || []).map((r) => (Array.isArray(r) ? r : Object.values(r)))
  return { rows, rowCount: Number(data?.rowCount || 0), ms: Date.now() - t0 }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at BIGINT)`,
  `CREATE TABLE IF NOT EXISTS locks (key TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at BIGINT)`,
  `CREATE TABLE IF NOT EXISTS call_signals (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_call_signals_inbox ON call_signals (session_id, to_user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS ip_bans (ip TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS device_bans (id TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_hits (k TEXT NOT NULL, ts BIGINT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_rate_hits_k ON rate_hits (k, ts)`,
  `CREATE TABLE IF NOT EXISTS ip_events (ip TEXT NOT NULL, ts BIGINT NOT NULL, kind TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_ip_events_ip ON ip_events (ip, ts)`,
  `CREATE TABLE IF NOT EXISTS client_errors (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ts BIGINT NOT NULL, whereami TEXT NOT NULL, message TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_client_errors_ts ON client_errors (ts)`,
]

const rawArgs = (row) => row.map((v) => (v === null || v === undefined ? null : typeof v === 'string' ? v : String(v)))

const CHUNK = 100

const copyTable = async (name, cols) => {
  const source = await tursoSql(`SELECT ${cols.join(', ')} FROM ${name}`)
  const rows = source.rows
  await neonSql(`DELETE FROM ${name}`)
  let copied = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const tuple = `(${cols.map(() => '?').join(', ')})`
    const values = slice.map(() => tuple).join(', ')
    const sql = `INSERT INTO ${name} (${cols.join(', ')}) VALUES ${values}`
    await neonSql(sql, slice.flatMap(rawArgs))
    copied += slice.length
  }
  console.log(`ok ${name}: ${copied} linha(s) — leitura origem ${source.ms}ms`)
  return copied
}

const main = async () => {
  console.log(`origem:  Turso ${tursoBase}`)
  console.log(`destino: Neon ${neonHost}`)
  console.log('')

  for (const sql of SCHEMA) await neonSql(sql)
  await neonSql(`ALTER TABLE client_errors ADD COLUMN code TEXT`).catch(() => {})
  console.log(`schema criado (${SCHEMA.length} statements)`)

  await copyTable('kv', ['key', 'value', 'updated_at'])
  await copyTable('ip_bans', ['ip', 'reason', 'created_at'])
  await copyTable('device_bans', ['id', 'reason', 'created_at'])
  await copyTable('rate_hits', ['k', 'ts'])
  await copyTable('ip_events', ['ip', 'ts', 'kind'])

  let errorsOk = false
  try {
    await copyTable('client_errors', ['id', 'user_id', 'ts', 'whereami', 'message', 'code'])
    errorsOk = true
  } catch {
    await copyTable('client_errors', ['id', 'user_id', 'ts', 'whereami', 'message'])
    errorsOk = true
  }
  if (!errorsOk) console.log('aviso: client_errors nao copiada')

  const a = (await tursoSql(`SELECT length(value), updated_at FROM kv WHERE key = 'friends-space:data'`)).rows[0] || []
  const b = (await neonSql(`SELECT length(value), updated_at FROM kv WHERE key = 'friends-space:data'`)).rows[0] || []
  console.log('')
  console.log(`store Turso: ${a[0]} bytes (updated_at ${a[1]})`)
  console.log(`store Neon:  ${b[0]} bytes (updated_at ${b[1]})`)
  if (String(a[0]) === String(b[0]) && String(a[1]) === String(b[1])) {
    console.log('CONFERIDO: store identico.')
  } else {
    console.log('ATENCAO: store diferente — rode de novo (o app pode ter salvado durante a copia).')
    process.exitCode = 2
  }

  const t = await neonSql(`SELECT 1`)
  console.log(`latencia Neo (1 query): ${t.ms}ms`)
}

main().catch((err) => {
  console.error('FALHOU:', err.message)
  process.exit(1)
})
