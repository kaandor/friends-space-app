export interface KlipyItem {
  id: string
  title: string
  url: string
  preview: string
}

const BASE = 'https://api.klipy.com/api/v1'

export function klipyKey(): string {
  try {
    return String((import.meta.env.VITE_KLIPY_KEY as string | undefined) || '').trim()
  } catch { return '' }
}

export function klipyEnabled(): boolean {
  return klipyKey().length > 0
}

interface KlipyFileVariant { url?: string; width?: number; height?: number }
interface KlipyFileSet { gif?: KlipyFileVariant; webp?: KlipyFileVariant; jpg?: KlipyFileVariant; mp4?: KlipyFileVariant; webm?: KlipyFileVariant }
interface KlipyEntry { id?: number | string; slug?: string; title?: string; file?: { hd?: KlipyFileSet; md?: KlipyFileSet; sm?: KlipyFileSet } }

function pickUrl(e: KlipyEntry): { url: string; preview: string } {
  const md = e.file?.md || e.file?.hd || e.file?.sm
  const sm = e.file?.sm
  const url = md?.gif?.url || md?.mp4?.url || md?.webp?.url || ''
  const preview = sm?.gif?.url || sm?.jpg?.url || sm?.webp?.url || url
  return { url, preview }
}

async function call(kind: 'gifs' | 'stickers', path: 'search' | 'trending', q = ''): Promise<KlipyItem[]> {
  const key = klipyKey()
  if (!key) return []
  const params = new URLSearchParams({ per_page: '24', content_filter: 'medium', locale: 'br' })
  if (path === 'search' && q.trim()) params.set('q', q.trim())
  const url = `${BASE}/${encodeURIComponent(key)}/${kind}/${path}?${params.toString()}`
  const ctl = new AbortController()
  const timer = window.setTimeout(() => ctl.abort(), 10000)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) throw new Error(`klipy:${res.status}`)
    const json = await res.json().catch(() => null) as { result?: boolean; data?: { data?: KlipyEntry[] } } | null
    const list = json?.data?.data
    if (!Array.isArray(list)) return []
    return list.map((e, i) => {
      const { url: u, preview } = pickUrl(e)
      return { id: String(e.id ?? e.slug ?? i), title: String(e.title || e.slug || ''), url: u, preview }
    }).filter((x) => x.url)
  } catch { return [] }
  finally { window.clearTimeout(timer) }
}

export function searchKlipy(kind: 'gifs' | 'stickers', q: string): Promise<KlipyItem[]> {
  return call(kind, q.trim() ? 'search' : 'trending', q)
}
