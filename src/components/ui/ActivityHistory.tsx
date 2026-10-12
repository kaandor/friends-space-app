import { Fa } from '../../utils/fa'
import { useEffect, useState } from 'react'
import { requestBackend } from '../../services/backend'
import { useServerStore } from '../../stores/serverStore'

interface HistoryItem {
  kind: 'message' | 'dm' | 'call'
  title: string
  detail: string
  meta: string
  serverId: string
  channelId: string
  createdAt: number
}

function formatDate(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function icon(kind: string) {
  if (kind === 'call') return <Fa name="phone" size={14} style={{ color: '#23a55a' }} />
  if (kind === 'dm') return <Fa name="envelope" size={14} style={{ color: '#5865f2' }} />
  return <Fa name="hashtag" size={14} style={{ color: '#80848e' }} />
}

export function ActivityHistory({ userId }: { userId: string }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    requestBackend<HistoryItem[]>('loadActivityHistory', { userId })
      .then((result) => { if (!cancelled) setItems(result) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [userId])

  const openItem = (item: HistoryItem) => {
    if (item.serverId === 'dm') {
      window.dispatchEvent(new Event('friends-space:show-friends'))
      return
    }
    const store = useServerStore.getState()
    const server = store.servers.find(s => s.id === item.serverId)
    if (server) {
      store.setCurrentServer(server)
      const channel = server.channels.find(c => c.id === item.channelId)
      if (channel) store.setCurrentChannel(channel)
    }
  }

  const groups: { date: string; items: HistoryItem[] }[] = []
  let currentDate = ''
  for (const it of items || []) {
    const d = formatDate(it.createdAt)
    if (d !== currentDate) {
      currentDate = d
      groups.push({ date: d, items: [] })
    }
    groups[groups.length - 1].items.push(it)
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-secondary)', marginBottom: 8 }}>
        Historico de atividade
      </div>
      {items === null ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>Carregando...</div>
      ) : items.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>
          Nenhuma atividade registrada ainda. Chame, converse e suas chamadas e mensagens aparecerao aqui.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map((group, gi) => (
            <div key={gi}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', margin: '6px 0 4px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {group.date}
              </div>
              {group.items.map((it, ii) => (
                <button
                  key={`${gi}-${ii}`}
                  onClick={() => openItem(it)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)' }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {icon(it.kind)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                    {it.detail && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.detail}</span>}
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', opacity: 0.8 }}>{it.meta}</span>
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{formatTime(it.createdAt)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
