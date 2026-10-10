// Proxy de vídeo do Drive com suporte a Range (para o <video> tocar).
// O Google bloqueia hotlink direto (403 por IP) e proíbe iframe; aqui o
// servidor busca o stream transcodificado e repassa em pedaços pequenos
// (4MB), então funciona em qualquer navegador e formato (até HEVC).
const CACHE = new Map()
const CACHE_TTL = 20 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

async function findStreams(fileId) {
  const hit = CACHE.get(fileId)
  if (hit && Date.now() - hit.at < CACHE_TTL && hit.urls.length) return hit.urls
  const response = await fetch(`https://drive.google.com/file/d/${fileId}/view`, {
    headers: { 'user-agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) return []
  const html = (await response.text()).slice(0, 600000)
  const found = []
  const re = /https?:\/\/[\w.-]*googlevideo\.com\/videoplayback[^"'\s\\]*/g
  let m
  while ((m = re.exec(html)) && found.length < 8) {
    const u = m[0].replace(/\\u0026/g, '&').replace(/\\u002F/g, '/').replace(/\\"/g, '')
    if (u.includes('videoplayback') && !found.includes(u)) found.push(u)
  }
  if (found.length) CACHE.set(fileId, { urls: found, at: Date.now() })
  return found
}

function pickMp4(urls) {
  const mp4 = urls.find((u) => /mime=video(%2F|\/)mp4/i.test(u))
  return mp4 || urls[0]
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).end(); return }
  const fileId = String((req.query && req.query.id) || '')
  if (!/^[\w-]{10,}$/.test(fileId)) { res.status(400).end(); return }
  try {
    const urls = await findStreams(fileId)
    if (!urls.length) { res.status(404).end(); return }
    const target = pickMp4(urls)
    const range = String(req.headers.range || '')
    const headers = { 'user-agent': UA }
    // Sem Range do player, pede só os primeiros 4MB (limite da serverless).
    if (range) headers.range = range
    else headers.range = 'bytes=0-4194303'
    const up = await fetch(target, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) })
    if (!up.ok && up.status !== 206) { res.status(502).end(); return }
    const out = {
      'Content-Type': up.headers.get('content-type') || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
      'Access-Control-Allow-Origin': '*',
    }
    const cr = up.headers.get('content-range')
    const cl = up.headers.get('content-length')
    if (cr) out['Content-Range'] = cr
    if (cl) out['Content-Length'] = cl
    res.writeHead(up.status === 206 ? 206 : 200, out)
    if (req.method === 'HEAD') { res.end(); return }
    const buf = Buffer.from(await up.arrayBuffer())
    res.end(buf)
  } catch {
    res.status(502).end()
  }
}
