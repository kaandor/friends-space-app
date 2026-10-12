import { Fa } from '../../utils/fa'
import { useState } from 'react'
import { useUserStore, isUserOnline } from '../../stores/userStore'
import { useFriendStore } from '../../stores/friendStore'
import { Avatar } from '../ui/Avatar'
import { useUserMenuStore } from '../../stores/userMenuStore'

export function UsersView() {
  const { users, currentUser } = useUserStore()
  const { open: openUserMenu } = useUserMenuStore()
  const addFriendById = useFriendStore(s => s.addFriendById)
  const friends = useFriendStore(s => s.friends)
  const [query, setQuery] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)
  const onlineCount = users.filter(isUserOnline).length
  const q = query.trim().toLowerCase()
  // Conta oficial não aparece na lista de pessoas.
  const visible = users.filter(u => !u.flags?.official)
  const listed = q.length === 0
    ? visible
    : visible.filter(u => `${u.name || ''} ${u.friendCode || ''}`.toLowerCase().includes(q))
  const friendIds = new Set((friends || []).map(f => f.friendId || f.id))

  const openMenu = (e: React.MouseEvent, user: typeof users[number]) => {
    e.preventDefault()
    openUserMenu(user, e.clientX, e.clientY)
  }

  return (
    <div className="fs-chat-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
            <Fa name="users" size={14} />
          </span>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Usuarios Online
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 10px', paddingLeft: 36 }}>
          {onlineCount} online · {visible.length} usuario{visible.length !== 1 ? 's' : ''} cadastrado{visible.length !== 1 ? 's' : ''}
        </p>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nome ou código..."
          style={{ marginLeft: 36, width: 'calc(100% - 36px)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {listed.map(user => {
          const online = isUserOnline(user)
          const isSelf = currentUser?.id === user.id
          const isFriend = friendIds.has(user.id)
          return (
          <div
            key={user.id}
            onContextMenu={(e) => openMenu(e, user)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)', marginBottom: 6,
              border: '1px solid var(--border)', cursor: 'context-menu',
            }}
          >
            <Avatar src={user.photoUrl} name={user.name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                {user.name}
                {user.activityEnabled !== false && user.activityPrivacy !== 'private' && user.activityName && (
                  <span style={{ color: 'var(--accent)', fontSize: 12, marginLeft: 8 }}>
                    — {user.activityName}
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                Codigo: <span style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{user.friendCode || '---'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!isSelf && !isFriend && currentUser && (
                <button
                  title="Pedir amizade"
                  disabled={addingId === user.id}
                  onClick={() => {
                    setAddingId(user.id)
                    void addFriendById(currentUser.id, user.id).then(r => {
                      try {
                        window.dispatchEvent(new CustomEvent('friends-space:toast', {
                          detail: r.ok ? `Pedido enviado para ${user.name}` : (r.error || 'Falha ao pedir amizade'),
                        }))
                      } catch { }
                    }).finally(() => setAddingId(null))
                  }}
                  style={{ background: 'var(--accent)', color: '#04120a', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  <Fa name="user-plus" size={12} />
                </button>
              )}
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: online ? 'var(--accent)' : 'var(--text-muted)',
              }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {online ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
          )
        })}
        {listed.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>
            {q ? `Ninguém encontrado para “${query}”.` : 'Nenhum usuario cadastrado.'}
          </div>
        )}
      </div>
    </div>
  )
}
