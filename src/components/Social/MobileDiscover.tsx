import { useEffect, useMemo, useState } from 'react'
import { Fa } from '../../utils/fa'
import { Avatar } from '../ui/Avatar'
import { requestBackend } from '../../services/backend'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import type { Server } from '../../types'

interface Found {
  id: string
  name: string
  photoUrl: string
  members: number
  inviteCode: string
  verified: boolean
  member: boolean
}

// Descubra do MOBILE (aba de baixo): lista + busca, sem o modal da versao PC.
export function MobileDiscover() {
  const { currentUser } = useUserStore()
  const joinServer = useServerStore(s => s.joinServer)
  const setCurrentServer = useServerStore(s => s.setCurrentServer)
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await requestBackend<{ servers: Server[] }>('directoryState', {})
        if (!cancelled) setServers((res?.servers || []).filter(s => s.settings?.toggles?.public !== false))
      } catch { if (!cancelled) setServers([]) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || !currentUser) { setFound(null); return }
    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await requestBackend<{ servers: Found[] }>('searchServers', { userId: currentUser.id, q })
          if (!cancelled) setFound(r?.servers || [])
        } catch { if (!cancelled) setFound([]) }
      })()
    }, 350)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [query, currentUser])

  const list: Found[] = useMemo(() => {
    if (found !== null) return found
    return servers
      .slice()
      .sort((a, b) => ((b.members || []).length) - ((a.members || []).length))
      .map(s => ({
        id: s.id, name: s.name, photoUrl: s.photoUrl || '',
        members: (s.members || []).length, inviteCode: s.inviteCode || '',
        verified: Boolean(s.verified),
        member: useServerStore.getState().servers.some(x => x.id === s.id),
      }))
  }, [servers, found])

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2800)
  }

  const handleJoin = (s: Found) => {
    if (joiningId || !currentUser) return
    setJoiningId(s.id)
    void (async () => {
      try {
        const r = await joinServer(s.inviteCode || '', currentUser.id, s.id)
        if (r?.ok) {
          const updated = useServerStore.getState().servers.find(x => x.id === s.id)
          if (updated) setCurrentServer(updated)
        } else if (r?.error) showNotice(r.error)
      } finally { setJoiningId(null) }
    })()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 6px 4px 14px' }}>
        <Fa name="magnifying-glass" size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar servidores..."
          maxLength={80}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 16, padding: '8px 0' }}
        />
        {query && (
          <button onClick={() => setQuery('')} title="Limpar" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, padding: '6px 8px', cursor: 'pointer' }}>✕</button>
        )}
      </div>
      {notice && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--text-primary)' }}>{notice}</div>
      )}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>Carregando servidores...</div>
      ) : list.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
          {query.trim().length >= 2 ? `Nenhum servidor para “${query.trim()}”.` : 'Nenhum servidor público ainda.'}
        </div>
      ) : list.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
          <Avatar src={s.photoUrl} name={s.name} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name} {s.verified && <Fa name="badge-check" size={12} style={{ color: 'var(--text-primary)' }} />}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.members} membro{s.members === 1 ? '' : 's'}</div>
          </div>
          {s.member ? (
            <button onClick={() => { const full = useServerStore.getState().servers.find(x => x.id === s.id); if (full) setCurrentServer(full) }}
              style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
              Abrir
            </button>
          ) : (
            <button onClick={() => handleJoin(s)} disabled={joiningId === s.id}
              style={{ padding: '8px 14px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 12, cursor: 'pointer', opacity: joiningId === s.id ? 0.5 : 1 }}>
              {joiningId === s.id ? '...' : 'Entrar'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
