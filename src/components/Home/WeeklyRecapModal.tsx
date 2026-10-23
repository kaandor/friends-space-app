import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, MessageCircle, Phone, Users, X } from 'lucide-react'
import { requestBackend } from '../../services/backend'
import { useUserStore } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'
import { EmptyState } from '../ui/EmptyState'

interface ActivityItem {
  kind: string
  title: string
  detail: string
  meta: string
  serverId: string
  channelId: string
  createdAt: number
}

const DAY_MS = 86400000

export function WeeklyRecapModal({ onClose }: { onClose: () => void }) {
  const currentUser = useUserStore(s => s.currentUser)
  const t = useLangStore(s => s.t)
  const [history, setHistory] = useState<ActivityItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    void (async () => {
      try {
        const items = await requestBackend<ActivityItem[]>('loadActivityHistory', { userId: currentUser.id })
        if (!cancelled) setHistory(Array.isArray(items) ? items : [])
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('recap.loadError'))
          setHistory([])
        }
      }
    })()
    return () => { cancelled = true }
  }, [currentUser, t])

  const recap = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const start = todayStart - 6 * DAY_MS
    const week = (history || []).filter(item => item.createdAt >= start)
    const messages = week.filter(item => item.kind === 'message').length
    const dms = week.filter(item => item.kind === 'dm').length
    const calls = week.filter(item => item.kind === 'call').length
    const byDay = Array.from({ length: 7 }, (_, index) => {
      const dayStart = start + index * DAY_MS
      const dayEnd = dayStart + DAY_MS
      return {
        label: new Date(dayStart).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3),
        count: week.filter(item => item.createdAt >= dayStart && item.createdAt < dayEnd).length,
      }
    })
    const maxDay = Math.max(1, ...byDay.map(day => day.count))
    const servers = new Map<string, number>()
    for (const item of week) {
      if (item.kind === 'message' && item.meta) servers.set(item.meta, (servers.get(item.meta) || 0) + 1)
    }
    const topServers = [...servers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    const activeDays = byDay.filter(day => day.count > 0).length
    return { messages, dms, calls, week, byDay, maxDay, topServers, activeDays }
  }, [history])

  const stats = [
    { label: t('recap.messages'), value: recap.messages, icon: <MessageCircle size={15} /> },
    { label: t('recap.dms'), value: recap.dms, icon: <Users size={15} /> },
    { label: t('recap.calls'), value: recap.calls, icon: <Phone size={15} /> },
    { label: t('recap.activeDays'), value: recap.activeDays, icon: <CalendarDays size={15} /> },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={onClose}>
      <div className="fs-modal-in" onMouseDown={event => event.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: 'min(720px, calc(100vh - 40px))', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--accent)' }}><CalendarDays size={17} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800 }}>{t('recap.title')}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 2 }}>{t('recap.subtitle')}</div>
          </div>
          <button onClick={onClose} title={t('modal.close')} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 18px 20px' }}>
          {history === null ? (
            <div style={{ padding: '34px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>{t('recap.loading')}</div>
          ) : (
            <>
              <div className="fs-insight-grid">
                {stats.map(stat => (
                  <div key={stat.label} className="fs-insight-card">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{stat.icon}{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>

              <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-tertiary)' }}>
                <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 800 }}>{t('recap.rhythm')}</div>
                <div className="fs-spark-bars">
                  {recap.byDay.map(day => (
                    <div key={day.label} title={`${day.count} atividade(s)`}>
                      <span className="fs-spark-bar" style={{ height: `${Math.max(5, (day.count / recap.maxDay) * 100)}%` }} />
                      <small>{day.label}</small>
                    </div>
                  ))}
                </div>
              </div>

              {recap.topServers.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, marginBottom: 7 }}>{t('recap.topServers')}</div>
                  {recap.topServers.map(([name, count], index) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: index < recap.topServers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ width: 20, color: 'var(--text-dim)', fontSize: 10.5, fontWeight: 800 }}>#{index + 1}</span>
                      <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 12 }}>{name}</span>
                      <strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>{count}</strong>
                    </div>
                  ))}
                </div>
              )}

              {recap.week.length === 0 && (
                <div style={{ marginTop: 12 }}>
                  <EmptyState
                    icon={<CalendarDays size={20} />}
                    title={t('recap.emptyTitle')}
                    description={error || t('recap.emptyBody')}
                    compact
                  />
                </div>
              )}

              <div style={{ marginTop: 14, color: 'var(--text-dim)', fontSize: 10.5, lineHeight: 1.5 }}>
                {t('recap.footnote')}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
