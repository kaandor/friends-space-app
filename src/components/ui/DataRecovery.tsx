import { useEffect, useState } from 'react'
import { getDb } from '../../db'
import { getActiveProfileId } from '../../services/profile'
import { requestBackend } from '../../services/backend'
import { useUserStore } from '../../stores/userStore'
import { useServerStore } from '../../stores/serverStore'
import { useFriendStore } from '../../stores/friendStore'

async function gatherLocal() {
  const db = getDb(getActiveProfileId())
  const [users, servers, friends, directMessages, messages] = await Promise.all([
    db.users.toArray(),
    db.servers.toArray(),
    db.friends.toArray(),
    db.directMessages.toArray(),
    db.messages.orderBy('createdAt').reverse().limit(3000).toArray(),
  ])
  return { users, servers, friends, directMessages, messages }
}

export function DataRecovery({ onClose }: { onClose: () => void }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState('')
  const currentUser = useUserStore(s => s.currentUser)

  useEffect(() => {
    void (async () => {
      try {
        const g = await gatherLocal()
        setCounts({
          users: g.users.length,
          servers: g.servers.length,
          friends: g.friends.length,
          messages: g.messages.length,
        })
      } catch {
        setCounts({})
      }
    })()
  }, [])

  const run = async () => {
    if (!currentUser || working) return
    setWorking(true)
    setResult('')
    try {
      const g = await gatherLocal()
      const res = await requestBackend<{ restored: Record<string, number> }>('restoreSnapshot', {
        snapshot: g,
        userId: currentUser.id,
      })
      await Promise.allSettled([
        useServerStore.getState().loadServers(),
        useUserStore.getState().loadUsers(),
        useFriendStore.getState().loadFriends(currentUser.id),
      ])
      const r = res?.restored || {}
      setResult(`Recuperado: ${r.servers || 0} servidores, ${r.users || 0} usuários, ${r.friends || 0} amizades, ${r.messages || 0} mensagens.`)
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Falha. Tente de novo.')
    }
    setWorking(false)
  }

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, maxWidth: 380, width: '90%' }} onMouseDown={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 8px', fontSize: 17 }}>Recuperar meus dados</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Envia o que está salvo neste aparelho (servidores, amigos, mensagens) de volta para o servidor. Nada é apagado.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {counts === null ? 'Lendo aparelho...' : total === 0 ? 'Nada salvo neste aparelho.' : `No aparelho: ${counts.servers} servidores · ${counts.users} usuários · ${counts.friends} amizades · ${counts.messages} mensagens`}
        </p>
        {result && <p style={{ fontSize: 13, color: 'var(--text-primary)' }}>{result}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => void run()} disabled={working || total === 0} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#04120a', fontWeight: 700, cursor: working || total === 0 ? 'not-allowed' : 'pointer', opacity: working || total === 0 ? 0.6 : 1 }}>
            {working ? 'Enviando...' : 'Recuperar'}
          </button>
          <button type="button" onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
