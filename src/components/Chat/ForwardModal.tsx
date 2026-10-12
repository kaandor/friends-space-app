import { Fa } from '../../utils/fa'
import { useState } from 'react'
import type { Message, Server } from '../../types'

interface ForwardModalProps {
  message: Message | null
  servers: Server[]
  onSelect: (targetChannelId: string) => void
  onClose: () => void
}

export function ForwardModal({ message, servers, onSelect, onClose }: ForwardModalProps) {
  const [error, setError] = useState('')

  if (!message) return null

  const pick = (channelId: string) => {
    try {
      onSelect(channelId)
      onClose()
    } catch {
      setError('Nao foi possivel encaminhar a mensagem')
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, margin: 0 }}>Encaminhar mensagem</h1>
          <p style={{ color: '#9ca3af', fontSize: 12.5, margin: '6px 0 0' }}>Escolha o canal de destino</p>
        </div>
        <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>
          {servers.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13.5, textAlign: 'center', padding: '20px 0', margin: 0 }}>Voce nao esta em nenhum servidor.</p>
          ) : (
            servers.map(server => (
              <div key={server.id} style={{ marginBottom: 10 }}>
                <div style={{ color: '#9ca3af', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '6px 8px' }}>{server.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {(server.channels || []).filter(ch => ch.type === 'text').map(channel => (
                    <button
                      key={channel.id}
                      onClick={() => pick(channel.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13.5, cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <Fa name="hashtag" size={12} style={{ color: 'var(--text-muted)' }} />
                      {channel.name}
                    </button>
                  ))}
                  {!server.channels?.some(ch => ch.type === 'text') && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '4px 10px' }}>Nenhum canal de texto</div>
                  )}
                </div>
              </div>
            ))
          )}
          {error && <p style={{ color: '#f87171', fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>{error}</p>}
        </div>
        <div style={{ padding: '12px 24px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 10, background: 'var(--bg-hover)', border: 'none', color: '#d1d5db', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
