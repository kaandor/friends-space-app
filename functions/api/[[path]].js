// Backend REAL no Cloudflare Pages (Functions) — mesma origem do site.
// Antes de 18/10/2026 este arquivo era um proxy para o Vercel (quota 402) e o
// build apontava pro Worker dev (rota workers.dev lenta no BR: ~125ms base).
// Com o handler embutido aqui, /api/app rota direto no edge da Pages
// (~30-60ms), elimina o Vercel e o proxy duplicado.
import handler from '../../api/app.js'

export async function onRequest(context) {
  const request = context.request
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
    socket: { remoteAddress: request.headers.get('cf-connecting-ip') || '' },
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
    console.error('[pages-api] erro nao tratado:', error?.stack || error)
    status = 500
    outHeaders['content-type'] = 'application/json; charset=utf-8'
    outBody = JSON.stringify({ ok: false, error: 'Erro interno. Tente novamente.' })
  }

  let body = null
  if (outBody !== null) {
    body = typeof outBody === 'string' ? outBody : new TextDecoder().decode(outBody)
  }
  return new Response(body, { status, headers: outHeaders })
}
