#!/usr/bin/env node
// Fechamento da migracao: copia o kv do Turso -> Neon UMA ultima vez e troca
// o secret NEON_DATABASE_URL no Worker na sequencia imediata (via API da
// Cloudflare), minimizando a janela em que saves vao pro banco antigo.
//
// Uso:
//   node scripts/finalize-neon-switch.mjs --neon-url "postgresql://..."

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

const TURSO_URL = envOf('TURSO_DATABASE_URL')
const TURSO_TOKEN = envOf('TURSO_AUTH_TOKEN')
const CF_TOKEN = envOf('CLOUDFLARE_API_TOKEN')
const NEON_URL = getArg('--neon-url') || process.env.NEON_DATABASE_URL || ''
const WORKER_NAME = 'friends-space-api'

if (!TURSO_URL || !TURSO_TOKEN || !CF_TOKEN || !NEON_URL) {
  console.error('Faltou credencial (TURSO_* ou CLOUDFLARE_API_TOKEN no .env, --neon-url).')
  process.exit(1)
}

const tursoBase = TURSO_URL.startsWith('libsql://') ? `https://${TURSO_URL.slice('libsql://'.length)}` : TURSO_URL.replace(/^http:\/\//, 'https://')
const neonHost = /@([^/]+)\//.exec(NEON_URL)?.[1] || ''
if (!neonHost) {
  console.error('--neon-url invalida.')
  process.exit(1)
}

const tursoArg = (v) => {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'float', value: String(v) }
  return { type: 'text', value: String(v) }
}

const tursoRowsOf = async (sql) => {
  const response = await fetch(`${tursoBase}/v2/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TURSO_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args: [] } }, { type: 'close' }] }),
  })
  if (!response.ok) throw new Error(`Turso HTTP ${response.status}`)
  const data = await response.json()
  const result = data?.results?.[0]
  if (!result || result.type === 'error') throw new Error('Turso: erro na leitura')
  return (result.response?.result?.rows || []).map((row) => row.map((c) => (c && c.type !== 'null' ? c.value : null)))
}

const neonSql = async (sql, params = []) => {
  let n = 0
  const query = sql.replace(/\?/g, () => `$${++n}`)
  const response = await fetch(`https://${neonHost}/sql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Neon-Connection-String': NEON_URL },
    body: JSON.stringify({ query, params }),
  })
  if (!response.ok) throw new Error(`Neon HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`)
  return response.json()
}

const main = async () => {
  const t0 = Date.now()
  const rows = await tursoRowsOf(`SELECT key, value, updated_at FROM kv`)
  const tuple = '(?, ?, ?)'
  const values = rows.map(() => tuple).join(', ')
  await neonSql(`DELETE FROM kv`)
  await neonSql(
    `INSERT INTO kv (key, value, updated_at) VALUES ${values}`,
    rows.flatMap((r) => [r[0], r[1], r[2] === null ? null : String(r[2])]),
  )
  const staged = rows.find((r) => r[0] === 'friends-space:data')
  console.log(`ultima copia: ${rows.length} linha(s) kv, updated_at ${staged?.[2]} (${Date.now() - t0}ms)`)
}

main()
  .then(async () => {
    const accResponse = await fetch('https://api.cloudflare.com/client/v4/accounts', {
      headers: { authorization: `Bearer ${CF_TOKEN}` },
    })
    const accData = await accResponse.json()
    const accountId = accData?.result?.[0]?.id
    if (!accountId) throw new Error('Cloudflare: nao achei a conta (token sem permissao?)')
    const putResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${WORKER_NAME}/secrets`,
      {
        method: 'PUT',
        headers: { authorization: `Bearer ${CF_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'NEON_DATABASE_URL', text: NEON_URL, type: 'secret_text' }),
      },
    )
    const putData = await putResponse.json()
    if (!putData?.success) throw new Error(`Cloudflare recusou o secret: ${JSON.stringify(putData?.errors || putData).slice(0, 300)}`)
    console.log('secret NEON_DATABASE_URL gravado no Worker — app agora usa o Neon de Sao Paulo.')
  })
  .then(async () => {
    const back = await neonSql(`SELECT length(value), updated_at FROM kv WHERE key = 'friends-space:data'`)
    const row = (back?.rows || [])[0]
    const vals = row ? Object.values(row) : []
    console.log(`conferencia Neon: ${vals[0]} bytes, updated_at ${vals[1]}`)
  })
  .catch((err) => {
    console.error('FALHOU:', err.message)
    process.exit(1)
  })
