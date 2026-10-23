import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Award, Cake, Crown, MessageCircle, Server, Sparkles, UserRound, Users, X } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'
import { useServerStore } from '../../stores/serverStore'
import { useFriendStore } from '../../stores/friendStore'
import { useLangStore } from '../../stores/langStore'

const STORAGE_KEY = 'friends-space:achievements'

interface Achievement {
  id: string
  title: string
  description: string
  icon: ReactNode
  current: number
  target: number
}

function readStored(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {}
  } catch {
    return {}
  }
}

export function AchievementsModal({ onClose }: { onClose: () => void }) {
  const currentUser = useUserStore(s => s.currentUser)
  const messages = useServerStore(s => s.messages)
  const servers = useServerStore(s => s.servers)
  const friends = useFriendStore(s => s.friendUsers)
  const t = useLangStore(s => s.t)
  const [unlocked, setUnlocked] = useState<Record<string, number>>(readStored)

  const achievements = useMemo<Achievement[]>(() => {
    const myMessages = currentUser ? messages.filter(message => message.userId === currentUser.id).length : 0
    const forumThreads = servers.reduce((total, server) => total + (server.forums?.filter(thread => thread.authorId === currentUser?.id).length || 0), 0)
    const profileFields = currentUser ? [currentUser.photoUrl, currentUser.bio, currentUser.bannerUrl, currentUser.status].filter(Boolean).length : 0
    return [
      { id: 'first-message', title: t('achievements.firstMessage'), description: t('achievements.firstMessageDesc'), icon: <MessageCircle size={17} />, current: myMessages, target: 1 },
      { id: 'chatty', title: t('achievements.chatty'), description: t('achievements.chattyDesc'), icon: <MessageCircle size={17} />, current: myMessages, target: 100 },
      { id: 'social', title: t('achievements.social'), description: t('achievements.socialDesc'), icon: <Users size={17} />, current: friends.length, target: 3 },
      { id: 'explorer', title: t('achievements.explorer'), description: t('achievements.explorerDesc'), icon: <Server size={17} />, current: servers.length, target: 3 },
      { id: 'creator', title: t('achievements.creator'), description: t('achievements.creatorDesc'), icon: <Crown size={17} />, current: currentUser ? servers.filter(server => server.ownerId === currentUser.id).length : 0, target: 1 },
      { id: 'birthday', title: t('achievements.birthday'), description: t('achievements.birthdayDesc'), icon: <Cake size={17} />, current: currentUser?.birthday ? 1 : 0, target: 1 },
      { id: 'profile', title: t('achievements.profile'), description: t('achievements.profileDesc'), icon: <UserRound size={17} />, current: profileFields, target: 3 },
      { id: 'forum', title: t('achievements.forum'), description: t('achievements.forumDesc'), icon: <Sparkles size={17} />, current: forumThreads, target: 1 },
    ]
  }, [currentUser, messages, servers, friends.length, t])

  useEffect(() => {
    const now = Date.now()
    setUnlocked(previous => {
      let changed = false
      const next = { ...previous }
      for (const achievement of achievements) {
        if (achievement.current >= achievement.target && !next[achievement.id]) {
          next[achievement.id] = now
          changed = true
        }
      }
      if (changed) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { }
        return next
      }
      return previous
    })
  }, [achievements])

  const unlockedCount = achievements.filter(achievement => unlocked[achievement.id] || achievement.current >= achievement.target).length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={onClose}>
      <div className="fs-modal-in" onMouseDown={event => event.stopPropagation()} style={{ width: 'min(540px, 100%)', maxHeight: 'min(720px, calc(100vh - 40px))', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--accent)' }}><Award size={17} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800 }}>{t('achievements.title')}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 2 }}>{t('achievements.count').replace('{a}', String(unlockedCount)).replace('{b}', String(achievements.length))}</div>
          </div>
          <button onClick={onClose} title={t('modal.close')} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '14px 18px 20px' }}>
          {achievements.map(achievement => {
            const done = Boolean(unlocked[achievement.id]) || achievement.current >= achievement.target
            const progress = Math.min(100, Math.round((achievement.current / achievement.target) * 100))
            return (
              <div key={achievement.id} className={`fs-achievement-row${done ? '' : ' is-locked'}`}>
                <span className="fs-achievement-icon">{achievement.icon}</span>
                <div className="fs-achievement-copy">
                  <strong>{achievement.title}</strong>
                  <small>{achievement.description}</small>
                  {!done && <div className="fs-achievement-progress"><span style={{ width: `${progress}%` }} /></div>}
                </div>
                <span style={{ color: done ? 'var(--accent)' : 'var(--text-dim)', fontSize: 10.5, whiteSpace: 'nowrap' }}>
                  {done ? t('achievements.done') : `${Math.min(achievement.current, achievement.target)}/${achievement.target}`}
                </span>
              </div>
            )
          })}
          <p style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 10.5, lineHeight: 1.5 }}>{t('achievements.footnote')}</p>
        </div>
      </div>
    </div>
  )
}
