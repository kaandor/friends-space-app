import { useState } from 'react'
import type { ServerFolder, User } from '../../types'
import { searchDirectory } from '../../services/backend'
import { Avatar } from '../ui/Avatar'

interface FolderShareModalProps {
  open: boolean
  folder: ServerFolder | null
  onClose: () => void
  onShare: (toUserId: string) => Promise<{ ok: boolean; error?: string }>
}

export function FolderShareModal({ open, folder, onClose, onShare }: FolderShareModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  if (!open || !folder) return null

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError('')
    try {
      const result = await searchDirectory(query.trim(), localStorage.getItem('friends-space:current-user-id') || '')
      setResults(result?.users || [])
    } catch {
      setError('Nao foi possivel buscar. Tente de novo.')
    } finally {
      setSearching(false)
    }
  }

  const share = async (user: User) => {
    setBusyId(user.id)
    setError('')
    setDone('')
    const result = await onShare(user.id)
    setBusyId(null)
    if (result.ok) {
      setDone(`Pasta encaminhada para ${user.name}!`)
      setResults([])
      setQuery('')
    } else {
      setError(result.error || 'Erro ao encaminhar pasta')
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
          <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, margin: 0 }}>Encaminhar pasta</h1>
          <p style={{ color: '#9ca3af', fontSize: 12.5, margin: '6px 0 0' }}>
            Envie a pasta <b style={{ color: '#4ade80' }}>{folder.name}</b> para outro usuario. So entram os servidores dos quais a pessoa e membro.
          </p>
        </div>

        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void runSearch() }}
              placeholder="Codigo de amigo, nome ou email..."
              style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <button onClick={() => void runSearch()} disabled={searching || !query.trim()} style={{ padding: '10px 16px', borderRadius: 10, background: '#4ade80', border: 'none', color: '#04120a', fontSize: 13.5, cursor: 'pointer', fontWeight: 700, opacity: searching || !query.trim() ? 0.6 : 1 }}>
              {searching ? '...' : 'Buscar'}
            </button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map(user => (
              <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
                <Avatar src={user.photoUrl} name={user.name} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                  <div style={{ color: '#9ca3af', fontSize: 11.5 }}>@{user.friendCode || 'sem-codigo'}</div>
                </div>
                <button
                  onClick={() => void share(user)}
                  disabled={busyId === user.id}
                  style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12.5, cursor: busyId === user.id ? 'default' : 'pointer', fontWeight: 600, opacity: busyId === user.id ? 0.6 : 1 }}
                >
                  {busyId === user.id ? '...' : 'Encaminhar'}
                </button>
              </div>
            ))}
          </div>

          {done && <p style={{ color: '#4ade80', fontSize: 13, marginTop: 12 }}>{done}</p>}
          {error && <p style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>

        <div style={{ padding: '14px 24px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--bg-hover)', border: 'none', color: '#d1d5db', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
