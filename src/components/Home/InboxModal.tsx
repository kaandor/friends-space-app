import { useEffect, useMemo, useState } from 'react'
import { Fa } from '../../utils/fa'
import { Avatar } from '../ui/Avatar'
import { useUserStore } from '../../stores/userStore'
import { useFriendStore } from '../../stores/friendStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useServerStore } from '../../stores/serverStore'
import { requestBackend } from '../../services/backend'
import type { User } from '../../types'

type Tab = 'unread' | 'mentions' | 'history'

interface ActivityItem {
  kind: string
  title: string
  detail: string
  meta: string
  serverId: string
  channelId: string
  createdAt: number
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'unread', label: 'Não lidas' },
  { id: 'mentions', label: 'Menções' },
  { id: 'history', label: 'Histórico' },
]

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'agora'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} h`
  return new Date(ts).toLocaleDateString()
}

export function InboxModal({ onClose }: { onClose: () => void }) {
  const { currentUser, users } = useUserStore()
  const { friends, loadFriends, respondFriend } = useFriendStore()
  const { notifications, unread, markAllRead } = useNotificationStore()
  const servers = useServerStore(s => s.servers)
  const unreadMap = useServerStore(s => s.unread)
  const [tab, setTab] = useState<Tab>('unread')
  const [history, setHistory] = useState<ActivityItem[] | null>(null)

  useEffect(() => {
    if (!currentUser) return
    if (tab !== 'history' || history) return
    void (async () => {
      try {
        const items = await requestBackend<ActivityItem[]>('loadActivityHistory', { userId: currentUser.id })
        setHistory(Array.isArray(items) ? items : [])
      } catch {
        setHistory([])
      }
    })()
  }, [tab, history, currentUser])

  const pendingRequests = useMemo(
    () => (currentUser ? friends.filter(f => f.status === 'pending' && f.friendId === currentUser.id) : []),
    [friends, currentUser],
  )
  const pendingUsers = useMemo(
    () => pendingRequests.map(req => users.find(u => u.id === req.userId)).filter((u): u is User => Boolean(u)),
    [pendingRequests, users],
  )
  const mentions = useMemo(() => notifications.filter(n => String(n.type || '') === 'mention'), [notifications])
  const unreadChannels = useMemo(() => {
    const rows: { serverId: string; serverName: string; channelId: string; channelName: string; count: number }[] = []
    for (const [channelId, count] of Object.entries(unreadMap)) {
      if (!count) continue
      for (const server of servers) {
        const channel = server.channels.find(c => c.id === channelId)
        if (channel) {
          rows.push({ serverId: server.id, serverName: server.name, channelId, channelName: channel.name, count })
          break
        }
      }
    }
    return rows.sort((a, b) => b.count - a.count)
  }, [unreadMap, servers])

  if (!currentUser) return null

  const acceptRequest = async (userId: string) => {
    const req = pendingRequests.find(r => r.userId === userId)
    if (!req) return
    await respondFriend(req.id, true)
    await loadFriends(currentUser.id)
  }

  const declineRequest = async (userId: string) => {
    const req = pendingRequests.find(r => r.userId === userId)
    if (!req) return
    await respondFriend(req.id, false)
    await loadFriends(currentUser.id)
  }

  const openDmWith = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (!user) return
    try { window.dispatchEvent(new CustomEvent('friends-space:open-dm', { detail: user })) } catch { }
    onClose()
  }

  const openChannel = (serverId: string, channelId: string) => {
    const server = servers.find(s => s.id === serverId)
    const channel = server?.channels.find(c => c.id === channelId)
    if (!server || !channel) return
    useServerStore.setState({ currentServer: server, currentChannel: channel })
    try { window.dispatchEvent(new Event('friends-space:show-friends')) } catch { }
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        className="fs-modal-in"
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 560, height: 'min(660px, calc(100vh - 48px))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 0' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Fa name="inbox" size={15} />
          </span>
          <div style={{ flex: 1 }}>
            <h4 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 16, margin: 0 }}>Caixa de Entrada</h4>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{unread} não lidas · {mentions.length} menções</div>
          </div>
          {unread > 0 && (
            <button
              onClick={() => void markAllRead()}
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 11.5, fontWeight: 700, padding: '7px 10px', cursor: 'pointer' }}
            >
              Marcar todas como lidas
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 18px' }}>
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12.5, background: tab === tb.id ? 'var(--accent)' : 'var(--bg-tertiary)', color: tab === tb.id ? '#04120a' : 'var(--text-secondary)' }}
            >
              {tb.label}{tb.id === 'unread' && unread > 0 ? ` (${unread})` : ''}{tb.id === 'mentions' && mentions.length > 0 ? ` (${mentions.length})` : ''}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tab === 'unread' && (
            <>
              {pendingUsers.length > 0 && (
                <>
                  <div className="fs-inbox-section">Solicitações de amizade</div>
                  {pendingUsers.map(user => (
                    <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                      <Avatar src={user.photoUrl} name={user.name} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>quer ser seu amigo</div>
                      </div>
                      <button onClick={() => void acceptRequest(user.id)} style={{ padding: '6px 12px', background: 'var(--accent)', color: '#04120a', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Aceitar</button>
                      <button onClick={() => void declineRequest(user.id)} style={{ padding: '6px 12px', background: 'var(--bg-tertiary)', color: '#ed4245', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Recusar</button>
                    </div>
                  ))}
                </>
              )}

              {unreadChannels.length > 0 && (
                <>
                  <div className="fs-inbox-section">Canais com mensagens novas</div>
                  {unreadChannels.map(row => (
                    <button
                      key={row.channelId}
                      onClick={() => openChannel(row.serverId, row.channelId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <Fa name="hashtag" size={13} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{row.channelName}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{row.serverName}</span>
                      </span>
                      <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#ed4245', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{row.count}</span>
                    </button>
                  ))}
                </>
              )}

              {notifications.length > 0 && (
                <>
                  <div className="fs-inbox-section">Notificações</div>
                  {notifications.slice(0, 30).map(n => {
                    const dmId = String((n.data as Record<string, unknown> | undefined)?.['fromId'] || '')
                    const isDm = String(n.type || '') === 'dm' || String(n.type || '') === 'mention'
                    return (
                      <div
                        key={n.id}
                        onClick={isDm && dmId ? () => openDmWith(dmId) : undefined}
                        style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderLeft: n.read ? '1px solid var(--border)' : '3px solid var(--accent)', borderRadius: 10, padding: 10, cursor: isDm && dmId ? 'pointer' : 'default', opacity: n.read ? 0.65 : 1 }}
                      >
                        <Avatar src={n.fromPhoto} name={n.fromName} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.35 }}>{n.title}</div>
                          {n.body ? <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{n.body}</div> : null}
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{timeAgo(Number(n.createdAt) || 0)}</div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {pendingUsers.length === 0 && unreadChannels.length === 0 && notifications.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12.5, textAlign: 'center', padding: 30 }}>Tudo em dia por aqui.</div>
              )}
            </>
          )}

          {tab === 'mentions' && (
            <>
              {mentions.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12.5, textAlign: 'center', padding: 30 }}>
                  Ninguém te mencionou ainda. Use @nas mensagens e quem for mencionado vê aqui.
                </div>
              )}
              {mentions.map(n => {
                const fromId = String((n.data as Record<string, unknown> | undefined)?.['fromId'] || '')
                return (
                  <div
                    key={n.id}
                    onClick={fromId ? () => openDmWith(fromId) : undefined}
                    style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, cursor: fromId ? 'pointer' : 'default' }}
                  >
                    <Avatar src={n.fromPhoto} name={n.fromName} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)' }}>{n.title}</div>
                      {n.body ? <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{n.body}</div> : null}
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{timeAgo(Number(n.createdAt) || 0)}</div>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {tab === 'history' && (
            <>
              {!history && <div style={{ color: 'var(--text-muted)', fontSize: 12.5, textAlign: 'center', padding: 30 }}>Carregando histórico...</div>}
              {history && history.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12.5, textAlign: 'center', padding: 30 }}>Nada por aqui ainda.</div>}
              {history && history.map((item, index) => (
                <div key={`${item.kind}-${item.channelId}-${item.createdAt}-${index}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0 }}>
                    <Fa name={item.kind === 'call' ? 'phone' : item.kind === 'dm' ? 'envelope' : 'hashtag'} size={13} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)' }}>{item.title}</div>
                    {item.detail ? <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.detail}</div> : null}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{item.meta ? `${item.meta} · ` : ''}{timeAgo(item.createdAt)}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
