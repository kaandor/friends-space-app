import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { klipyEnabled, searchKlipy, type KlipyItem } from '../../services/klipy'

interface Props {
  kind: 'gifs' | 'stickers'
  onPick: (url: string, name: string) => void
}

// Busca Klipy (GIFs ou figurinhas) com grade + fallback offline.
export function KlipyPicker({ kind, onPick }: Props) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<KlipyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!klipyEnabled()) return
    setLoading(true)
    setFailed(null)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await searchKlipy(kind, q)
          setItems(res)
        } catch (e) {
          try { console.error('[klipy]', e) } catch { /* ignore */ }
          const msg = String((e as Error)?.message || e || '')
          setFailed(msg.includes('429') ? 'limit' : 'error')
        }
        finally { setLoading(false) }
      })()
    }, q.trim() ? 450 : 0)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [q, kind, attempt])

  if (!klipyEnabled()) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 6px 6px 12px' }}>
        <Search size={14} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'gifs' ? 'Buscar GIFs...' : 'Buscar figurinhas...'} maxLength={60}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12 }} />
      </div>
      {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, padding: 8 }}>Buscando...</div>}
      {!loading && failed && (
        <button onClick={() => setAttempt(a => a + 1)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 8 }}>
          {failed === 'limit' ? 'Limite da chave teste (100/h) — aguarde e toque para tentar.' : 'Falha na busca — toque para tentar de novo.'}
        </button>
      )}
      {!loading && !failed && items.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, padding: 8 }}>Nada encontrado — tente outra palavra.</div>
      )}
      <div className="fs-media-grid">
        {items.map(it => (
          <button key={it.id} className="fs-media-grid-item" onClick={() => onPick(it.url, it.title || it.id)} title={it.title}>
            <img src={it.preview} alt={it.title} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}
