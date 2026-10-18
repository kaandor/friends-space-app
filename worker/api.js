// API do Friends Space no Cloudflare Workers (plano gratis).
// Usa o MESMO handler da api/app.js (importado direto — o bundler do wrangler
// resolve o arquivo). O adapter abaixo converte o Request/Response padrao do
// Workers para o par (req, res) estilo Node que o handler espera.
// Variaveis de ambiente: process.env e populado pelas vars/secrets do worker
// (compatibility_date >= 2025-04-01 + nodejs_compat).
import handler from '../api/app.js'

export default {
  async fetch(request) {
    const url = new URL(request.url)

    const headers = {}
    for (const [key, value] of request.headers.entries()) headers[key.toLowerCase()] = value

    let raw = null
    if (request.body) {
      const buf = await request.arrayBuffer()
      if (buf.byteLength) raw = new Uint8Array(buf)
    }

    const req = {
      method: request.method,
      url: url.pathname + url.search,
      headers,
      socket: { remoteAddress: headers['cf-connecting-ip'] || '' },
      async *[Symbol.asyncIterator]() {
        if (raw) yield Buffer.from(raw)
      },
    }

    let status = 200
    const outHeaders = {}
    let outBody = null

    const res = {
      get statusCode() { return status },
      set statusCode(value) { status = Number(value) || 200 },
      setHeader(key, value) { outHeaders[String(key).toLowerCase()] = String(value) },
      getHeader(key) { return outHeaders[String(key).toLowerCase()] },
      removeHeader(key) { delete outHeaders[String(key).toLowerCase()] },
      write(chunk) { outBody = outBody === null ? chunk : outBody + chunk; return true },
      end(chunk) { if (chunk !== undefined && chunk !== null) outBody = outBody === null ? chunk : outBody + chunk },
    }

    try {
      await handler(req, res)
    } catch (error) {
      console.error('[api] erro nao tratado:', error?.stack || error)
      status = 500
      outHeaders['content-type'] = 'application/json; charset=utf-8'
      outBody = JSON.stringify({ ok: false, error: 'Erro interno. Tente novamente.' })
    }

    let body = null
    if (outBody !== null) {
      body = typeof outBody === 'string' ? outBody : new TextDecoder().decode(outBody)
    }
    return new Response(body, { status, headers: outHeaders })
  },
}
