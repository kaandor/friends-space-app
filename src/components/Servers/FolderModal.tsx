import { useEffect, useState } from 'react'
import type { Server, ServerFolder } from '../../types'

interface FolderModalProps {
  open: boolean
  folder: ServerFolder | null
  servers: Server[]
  onClose: () => void
  onSave: (name: string, serverIds: string[]) => void
}

export function FolderModal({ open, folder, servers, onClose, onSave }: FolderModalProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setName(folder?.name || '')
      setSelected(folder ? [...(folder.serverIds || [])] : [])
    }
  }, [open, folder])

  if (!open) return null

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const save = () => {
    if (!name.trim()) return
    onSave(name.trim(), selected)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, margin: 0 }}>
            {folder ? 'Personalizar pasta' : 'Criar pasta'}
          </h1>
          <p style={{ color: '#9ca3af', fontSize: 12.5, margin: '6px 0 0' }}>
            {folder ? 'Renomeie e escolha os servidores da pasta.' : 'Dê um nome e escolha os servidores que ficarao nela.'}
          </p>
        </div>

        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          <label style={{ display: 'block', color: '#d1d5db', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Nome da pasta</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
            placeholder="Ex: Jogos, Escola, Familia..."
            style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit' }}
          />

          <label style={{ display: 'block', color: '#d1d5db', fontSize: 13, fontWeight: 600, margin: '16px 0 6px' }}>Servidores ({selected.length})</label>
          {servers.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13, margin: '4px 0 0' }}>Voce ainda nao esta em nenhum servidor.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {servers.map(server => {
                const checked = selected.includes(server.id)
                return (
                  <label
                    key={server.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-tertiary)', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '8px 12px', cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(server.id)} style={{ accentColor: '#4ade80' }} />
                    {server.photoUrl ? (
                      <img src={server.photoUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                        {server.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span style={{ color: 'var(--text-primary)', fontSize: 13.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--bg-hover)', border: 'none', color: '#d1d5db', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}>
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            style={{ padding: '10px 16px', borderRadius: 10, background: '#4ade80', border: 'none', color: '#04120a', fontSize: 13.5, cursor: 'pointer', fontWeight: 700, opacity: name.trim() ? 1 : 0.6 }}
          >
            {folder ? 'Salvar' : 'Criar pasta'}
          </button>
        </div>
      </div>
    </div>
  )
}
