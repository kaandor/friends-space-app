import { useState } from 'react'
import { useCallStore } from '../../stores/callStore'

export function parseYouTubeId(input: string): string | null {
  const s = String(input || '').trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  const m = s.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

// Assistir junto (YouTube): cola o link e todos da call assistem juntos.
export function WatchPartyModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const startWatchParty = useCallStore(s => s.startWatchParty)
  const submit = () => {
    const id = parseYouTubeId(url)
    if (!id) { setError('Link do YouTube inválido'); return }
    try { startWatchParty(id, 'YouTube') } catch { }
    onClose()
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, width: '100%', maxWidth: 400 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Assistir junto — YouTube</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Cole o link e todos da call assistem ao mesmo vídeo.</div>
        <input
          value={url}
          onChange={e => { setUrl(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="https://youtube.com/watch?v=..."
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }}
        />
        {error && <div style={{ color: '#f04747', fontSize: 12, marginTop: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={submit} style={{ background: 'var(--accent)', color: '#04120a', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Começar</button>
        </div>
      </div>
    </div>
  )
}
