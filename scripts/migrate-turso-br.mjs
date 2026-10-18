#!/usr/bin/env node
// Migra o banco do Turso antigo (EUA) para um novo (ex.: regiao GRU / Sao Paulo).
//
// Uso:
//   node scripts/migrate-turso-br.mjs --to-url libsql://SEU-BANCO.turso.io --to-token eyJ...
//   node scripts/migrate-turso-br.mjs --to-url ... --to-token ... --kv-only
//
// As credenciais do banco ANTIGO vem do .env (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).
// Rode uma vez completo e, segundos antes de trocar os secrets, rode de novo com
// --kv-only (2a passada rapida: copia so o blob do store, que muda a cada save).

import fs from 'node:fs'

const args = process.argv.slice(2)
const getArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? String(args[i + 1] || '') : ''
}
const kvOnly = args.includes('--kv-only')

const envText = fs.readFileSync('.env', 'utf8')
const envOf = (key) => {
  const line = envText.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim() : ''
}

const FROM_URL = process.env.FROM_TURSO_URL || envOf('TURSO_DATABASE_URL')
const FROM_TOKEN = process.env.FROM_TURSO_TOKEN || envOf('TURSO_AUTH_TOKEN')
const TO_URL = getArg('--to-url') || process.env.TO_TURSO_URL || ''
const TO_TOKEN = getArg('--to-token') || process.env.TO_TURSO_TOKEN || ''

if (!FROM_URL || !FROM_TOKEN) {
  console.error('Faltam TURSO_DATABASE_URL/TURSO_AUTH_TOKEN do banco antigo no .env')
  process.exit(1)
}
if (!TO_URL || !TO_TOKEN) {
  console.error('Passe --to-url e --to-token do banco novo (Sao Paulo).')
  process.exit(1)
}

const baseUrlOf = (raw) =>
  raw.startsWith('libsql://') ? `https://${raw.slice('libsql://'.length)}` : raw.replace(/^http:\/\//, 'https://')

const asArg = (v) => {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'float', value: String(v) }
  return { type: 'text', value: String(v) }
}
const cellValue = (cell) => {
  if (cell === null || cell === undefined || cell.type === 'null') return null
  if (cell.type === 'integer' || cell.type === 'float') return Number(cell.value)
  if (cell.type === 'blob') return cell.base64
  return cell.value
}

const run = async (label, baseUrl, token, requests) => {
  const t0 = Date.now()
  const response = await fetch(`${baseUrl}/v2/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`${label}: HTTP ${response.status} ${detail.slice(0, 300)}`)
  }
  const data = await response.json()
  const results = data?.results || []
  const bad = results.find((r) => r && r.type === 'error')
  if (bad) throw new Error(`${label}: ${bad.error?.message || 'erro de banco'}`)
  const ms = Date.now() - t0
  const rows = results
    .filter((r) => r?.response?.type === 'execute')
    .map((r) => (r.response.result?.rows || []).map((row) => row.map(cellValue)))
  return { rows, ms, last: rows[rows.length - 1] || [] }
}

const exec = (baseUrl, token, sql, params = []) =>
  run(sql.slice(0, 60), baseUrl, token, [{ type: 'execute', stmt: { sql, args: params.map(asArg) } }])

const FROM = baseUrlOf(FROM_URL)
const TO = baseUrlOf(TO_URL)

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS locks (key TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS call_signals (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_call_signals_inbox ON call_signals (session_id, to_user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS ip_bans (ip TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS device_bans (id TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_hits (k TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_rate_hits_k ON rate_hits (k, ts)`,
  `CREATE TABLE IF NOT EXISTS ip_events (ip TEXT NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_ip_events_ip ON ip_events (ip, ts)`,
  `CREATE TABLE IF NOT EXISTS client_errors (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, ts INTEGER NOT NULL, whereami TEXT NOT NULL, message TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_client_errors_ts ON client_errors (ts)`,
]

// call_signals e locks ficam de fora: sao transitorios (signals/mutex de segundos).
const TABLES = [
  { name: 'kv', cols: ['key', 'value', 'updated_at'], replace: true },
  { name: 'ip_bans', cols: ['ip', 'reason', 'created_at'], replace: true },
  { name: 'device_bans', cols: ['id', 'reason', 'created_at'], replace: true },
  { name: 'rate_hits', cols: ['k', 'ts'], replace: false },
  { name: 'ip_events', cols: ['ip', 'ts', 'kind'], replace: false },
  { name: 'client_errors', cols: ['id', 'user_id', 'ts', 'whereami', 'message'], replace: true },
]

const CHUNK = 200

const main = async () => {
  console.log(`origem:  ${FROM}`)
  console.log(`destino: ${TO}${kvOnly ? '  (modo --kv-only)' : ''}`)
  console.log('')

  if (!kvOnly) {
    for (const sql of SCHEMA) await exec(TO, TO_TOKEN, sql)
    console.log(`schema criado no banco novo (${SCHEMA.length} statements)`)
  }

  const tables = kvOnly ? TABLES.filter((t) => t.name === 'kv') : TABLES

  for (const table of tables) {
    const select = await exec(FROM, FROM_TOKEN, `SELECT ${table.cols.join(', ')} FROM ${table.name}`)
    const rows = select.rows[0] || []
    const placeholders = `(${table.cols.map(() => '?').join(', ')})`
    const verb = table.replace ? 'INSERT OR REPLACE' : 'INSERT'
    if (!table.replace) await exec(TO, TO_TOKEN, `DELETE FROM ${table.name}`)
    let copied = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const requests = slice.map((row) => ({
        type: 'execute',
        stmt: {
          sql: `${verb} INTO ${table.name} (${table.cols.join(', ')}) VALUES ${placeholders}`,
          args: row.map(asArg),
        },
      }))
      await run(`insert ${table.name}`, TO, TO_TOKEN, requests)
      copied += slice.length
    }
    console.log(`ok ${table.name}: ${copied} linha(s) copiada(s) em ${select.ms}ms de leitura`)
  }

  const fromLen = await exec(FROM, FROM_TOKEN, `SELECT length(value), updated_at FROM kv WHERE key = 'friends-space:data'`)
  const toLen = await exec(TO, TO_TOKEN, `SELECT length(value), updated_at FROM kv WHERE key = 'friends-space:data'`)
  const a = fromLen.rows[0]?.[0] || []
  const b = toLen.rows[0]?.[0] || []
  console.log('')
  console.log(`store origem:  ${a[0]} bytes (updated_at ${a[1]})`)
  console.log(`store destino: ${b[0]} bytes (updated_at ${b[1]})`)
  if (String(a[0]) === String(b[0]) && String(a[1]) === String(b[1])) {
    console.log('CONFERIDO: store identico.')
  } else {
    console.log('ATENCAO: store diferente — rode de novo (o app pode ter salvado durante a copia).')
    process.exitCode = 2
  }

  const t = await exec(TO, TO_TOKEN, `SELECT 1`)
  console.log(`latencia destino: ${t.ms}ms (TRIP completo via fetch)`)
}

main().catch((err) => {
  console.error('FALHOU:', err.message)
  process.exit(1)
})
