import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import handler from '../api/app.js'

try {
  const raw = await readFile(fileURLToPath(new URL('../.dev.vars', import.meta.url)), 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.trim()
    if (!clean || clean.startsWith('#')) continue
    const eq = clean.indexOf('=')
    if (eq <= 0) continue
    const key = clean.slice(0, eq).trim()
    const value = clean.slice(eq + 1).trim()
    if (key && process.env[key] === undefined) process.env[key] = value
  }
} catch { }

const port = Number(process.env.PORT || 8787)

const server = http.createServer(async (req, res) => {
  try {
    await handler(req, res)
  } catch (error) {
    console.error('[api-local] erro:', error?.stack || error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: 'Erro interno. Tente novamente.' }))
    } else {
      try { res.end() } catch { }
    }
  }
})

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`[api-local] A porta ${port} ja esta em uso. Feche a outra janela da API e tente de novo.`)
  } else {
    console.error('[api-local] erro no servidor:', error)
  }
  process.exit(1)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`API local do Friends Space em http://127.0.0.1:${port}/api/app`)
  console.log('Os dados locais ficam em um arquivo de teste (nao tocam no banco de producao).')
  console.log('Para parar: feche esta janela ou aperte Ctrl+C.')
})
