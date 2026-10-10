import { useEffect, useState } from 'react'
import { requestBackend } from '../../services/backend'
import { useServerStore } from '../../stores/serverStore'
import type { Server } from '../../types'
import { assetUrl } from '../../utils/assets'
import { toImageUrl } from '../../services/driveService'

export function VerifiedServers() {
  const [servers, setServers] = useState<Server[] | null>(null)
  const setCurrentServer = useServerStore(s => s.setCurrentServer)

  useEffect(() => {
    let cancelled = false
    requestBackend<{ servers: Server[] }>('directoryState', {})
      .then((result) => {
        if (cancelled) return
        const verified = (result.servers || []).filter(s => s.verified === true)
        setServers(verified)
      })
      .catch(() => { if (!cancelled) setServers([]) })
    return () => { cancelled = true }
  }, [])

  if (servers === null) {
    return (
      <div style={{ padding: '14px 20px', color: 'var(--text-muted)', fontSize: 12 }}>Carregando servidores verificados...</div>
    )
  }

  if (servers.length === 0) {
    return (
      <div style={{ padding: '14px 20px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
        Nenhum servidor verificado ainda.
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <i className="fa-solid fa-badge-check" style={{ color: '#5865f2', fontSize: 15 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 0.3 }}>
          Servidores verificados
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {servers.map(server => (
          <button
            key={server.id}
            onClick={() => setCurrentServer(server)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 12,
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12,
              textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)',
            }}
          >
            <img src={toImageUrl(server.photoUrl || assetUrl('Logo.png'))} alt={server.name} style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover', flexShrink: 0, background: 'var(--bg-tertiary)' }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</span>
                {server.partner === 'friends-space' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#0f0f12', background: 'var(--accent)', padding: '2px 7px', borderRadius: 20, flexShrink: 0 }}>
                    <i className="fa-solid fa-handshake" style={{ fontSize: 9 }} /> PARCEIRO
                  </span>
                )}
                {server.partner !== 'friends-space' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: '#5865f2', padding: '2px 7px', borderRadius: 20, flexShrink: 0 }}>
                    <i className="fa-solid fa-badge-check" style={{ fontSize: 9 }} /> VERIFICADO
                  </span>
                )}
              </span>
              {server.description && (
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.description}</span>
              )}
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3, opacity: 0.85 }}>
                <i className="fa-solid fa-user-group" /> {(server.members || []).length} membros
              </span>
            </span>
            <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  )
}
