import { useUserStore, isUserOnline } from '../../stores/userStore'
import { Avatar } from '../ui/Avatar'
import { useUserMenuStore } from '../../stores/userMenuStore'

export function UsersView() {
  const { users } = useUserStore()
  const { open: openUserMenu } = useUserMenuStore()
  const onlineCount = users.filter(isUserOnline).length

  const openMenu = (e: React.MouseEvent, user: typeof users[number]) => {
    e.preventDefault()
    openUserMenu(user, e.clientX, e.clientY)
  }

  return (
    <div className="fs-chat-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
            <i className="fa-solid fa-users" />
          </span>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Usuarios Online
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 0', paddingLeft: 36 }}>
          {onlineCount} online · {users.length} usuario{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {users.map(user => {
          const online = isUserOnline(user)
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
        {users.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>
            Nenhum usuario cadastrado.
          </div>
        )}
      </div>
    </div>
  )
}
