import { Fa } from '../../utils/fa'
import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { StatusIcon } from './StatusIcon'
import { UserProfileModal } from '../Profile/UserProfileModal'
import { IconSend, IconAdd, IconCheck, IconClose } from '../../utils/icons'
import { useFriendStore } from '../../stores/friendStore'
import { useUserStore, isUserOnline } from '../../stores/userStore'
import { useUserMenuStore } from '../../stores/userMenuStore'
import { useLangStore } from '../../stores/langStore'
import { useCallStore } from '../../stores/callStore'
import { ReportModal } from '../Chat/ReportModal'

const clampVolume = (v?: number) => (typeof v === 'number' && !Number.isNaN(v) ? Math.min(1, Math.max(0, v)) : 1)

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      value={Math.round(value * 100)}
      onChange={event => onChange(Number(event.target.value) / 100)}
      style={{ flex: 1, accentColor: 'var(--accent)' }}
    />
  )
}

function Item({ icon, label, danger, onClick, disabled }: {
  icon?: React.ReactNode
  label: string
  danger?: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 6,
        color: danger ? '#f23f43' : 'var(--text-secondary)',
        background: 'transparent', border: 'none', textAlign: 'left',
        fontSize: 13, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {icon}
      {label}
    </button>
  )
}

export function UserContextMenu() {
  const { currentUser } = useUserStore()
  const { friends, loadFriends, addFriendById, respondFriend } = useFriendStore()
  const { user: menu, x, y, close } = useUserMenuStore()
  const { t } = useLangStore()
  const activeCall = useCallStore(s => s.activeCall)
  const participants = useCallStore(s => s.participants)
  const remoteScreenStreams = useCallStore(s => s.remoteScreenStreams)
  const volumes = useCallStore(s => s.volumes)
  const setVolume = useCallStore(s => s.setVolume)
  const [viewProfileUser, setViewProfileUser] = useState<typeof menu>(null)
  const [reportUser, setReportUser] = useState<typeof menu>(null)

  useEffect(() => {
    if (!menu) return
    setReportUser(null)
    const onDown = (e: MouseEvent) => {
      const el = document.getElementById('user-context-menu')
      if (el && !el.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, close])

  if (viewProfileUser) {
    const viewUser = viewProfileUser
    return (
      <UserProfileModal
        user={viewUser}
        onClose={() => setViewProfileUser(null)}
        onAction={(action) => {
          if (action === 'message') {
            setViewProfileUser(null)
            window.dispatchEvent(new CustomEvent('friends-space:open-dm', { detail: { user: viewUser } }))
            close()
          } else if (action === 'request') {
            setViewProfileUser(null)
            if (currentUser) {
              void addFriendById(currentUser.id, viewUser.id).then(async (added) => {
                if (added.ok) await loadFriends(currentUser.id)
              })
            }
            close()
          } else if (action === 'report') {
            setViewProfileUser(null)
            setReportUser(viewUser)
          }
        }}
      />
    )
  }

  const reportModal = reportUser && (
    <ReportModal
      open={reportUser !== null}
      type="user"
      target={{ id: reportUser.id, name: reportUser.name }}
      onClose={() => setReportUser(null)}
    />
  )

  if (!menu) return reportModal

  const user = menu
  const meId = currentUser?.id
  const rel = friends.find(f =>
    (f.userId === user.id && f.friendId === meId) ||
    (f.friendId === user.id && f.userId === meId)
  )
  const isMe = user.id === meId
  const isFriend = rel?.status === 'accepted'
  const isOutgoing = rel?.status === 'pending' && rel.userId === meId
  const isIncoming = rel?.status === 'pending' && rel.friendId === meId
  const online = isUserOnline(user)
  const settings = (user.settings || {}) as Record<string, string | boolean | undefined>
  const pronoun = typeof settings['pronoun'] === 'string' ? settings['pronoun'] as string : ''
  const statusKey = typeof settings['status'] === 'string' ? settings['status'] as string : 'online'
  const statusMessage = typeof settings['statusMessage'] === 'string' ? settings['statusMessage'] as string : ''
  const astro = settings['astro'] === true || settings['astro'] === 'true'
  const verified = Boolean(user.googleId || user.authProvider === 'google')
  const badgeHidden = settings['showBadges'] === false
  const showJoinDate = settings['showJoinDate'] !== false

  const sendMessage = () => {
    window.dispatchEvent(new CustomEvent('friends-space:open-dm', { detail: { user } }))
    close()
  }

  const requestFriend = async () => {
    if (!currentUser) return
    const added = await addFriendById(currentUser.id, user.id)
    if (added.ok) await loadFriends(currentUser.id)
    close()
  }

  const accept = async () => {
    if (!rel || !currentUser) return
    await respondFriend(rel.id, true)
    await loadFriends(currentUser.id)
    close()
  }

  const decline = async () => {
    if (!rel || !currentUser) return
    await respondFriend(rel.id, false)
    await loadFriends(currentUser.id)
    close()
  }

  const menuWidth = 300
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - menuWidth - 8),
    top: Math.min(y, window.innerHeight - 420),
    width: menuWidth,
    maxWidth: 'calc(100vw - 16px)',
    position: 'fixed',
    zIndex: 5000,
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  }

  return (
    <>
    <div id="user-context-menu" style={style}>
      <div style={{ position: 'relative', borderBottom: '1px solid var(--border)' }}>
        {user.bannerUrl ? (
          <img src={user.bannerUrl} alt="Banner" style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ height: 90, background: `linear-gradient(135deg, ${user.accentColor || '#00ff88'}22, transparent)` }} />
        )}
      </div>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar src={user.photoUrl} name={user.name} size={46} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
              <StatusIcon status={statusKey} online={online} size={14} />
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>@{user.friendCode || 'sem-codigo'}</div>
            {statusMessage && (
              <div style={{ color: 'var(--accent)', fontSize: 11.5, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {statusMessage}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {isFriend && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--accent)', color: '#000', fontWeight: 700 }}>{t('menu.friend')}</span>}
          {!badgeHidden && astro && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#a020f0', color: '#fff', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Fa name="rocket" size={9} /> ASTRO
            </span>
          )}
          {!badgeHidden && verified && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Fa name="check" size={9} style={{  color: '#23a55a' }} /> {t('menu.verified')}
            </span>
          )}
          {pronoun && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{pronoun}</span>}
          {showJoinDate && user.createdAt > 0 && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              {t('menu.joinedOn')} {new Date(user.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        {user.bio && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, wordBreak: 'break-word' }}>{user.bio}</p>
        )}
        {user.activityName && settings['showActivity'] !== false && user.activityPrivacy !== 'private' && (
          <div style={{ margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <Fa name="gamepad" size={12} style={{ color: 'var(--accent)' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}>{user.activityName}</div>
              {user.activityDetails && <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.activityDetails}</div>}
            </div>
          </div>
        )}
      </div>

      {activeCall && !isMe && participants.some(p => p.userId === user.id) && (
        <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Fa name="volume-high" size={10} /> Volume na chamada
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Fa name="microphone" size={12} style={{  color: 'var(--text-muted)', width: 16, flexShrink: 0 }} />
            <VolumeSlider value={clampVolume(volumes[user.id])} onChange={v => setVolume(user.id, v)} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 30, textAlign: 'right', flexShrink: 0 }}>{Math.round(clampVolume(volumes[user.id]) * 100)}%</span>
          </div>
          {remoteScreenStreams[user.id] && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Fa name="display" size={12} style={{  color: 'var(--text-muted)', width: 16, flexShrink: 0 }} />
              <VolumeSlider value={clampVolume(volumes[`screen:${user.id}`])} onChange={v => setVolume(`screen:${user.id}`, v)} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 30, textAlign: 'right', flexShrink: 0 }}>{Math.round(clampVolume(volumes[`screen:${user.id}`]) * 100)}%</span>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: 6 }}>
        {!isMe && (
          <Item icon={<IconSend width={15} height={15} />} label={t('menu.conversar')} onClick={sendMessage} />
        )}
        <Item icon={<Fa name="user" size={12} />} label={t('menu.viewProfile')} onClick={() => setViewProfileUser(user)} />
        {!isMe && isIncoming && (
          <Item icon={<IconCheck width={15} height={15} />} label={t('menu.acceptRequest')} onClick={accept} />
        )}
        {!isMe && isIncoming && (
          <Item icon={<IconClose width={15} height={15} />} label={t('menu.declineRequest')} danger onClick={decline} />
        )}
        {!isMe && isOutgoing && (
          <Item icon={<IconAdd width={15} height={15} />} label={t('menu.requestSent')} disabled />
        )}
        {!isMe && isFriend && (
          <Item icon={<IconCheck width={15} height={15} />} label={t('menu.alreadyFriends')} disabled />
        )}
        {!isMe && !isFriend && !isOutgoing && !isIncoming && (
          <Item icon={<IconAdd width={15} height={15} />} label={t('menu.sendRequest')} onClick={requestFriend} />
        )}
        {!isMe && isFriend && (
          <Item icon={<IconClose width={15} height={15} />} label={t('menu.removeFriend')} danger onClick={async () => {
            if (!rel || !currentUser) return
            await useFriendStore.getState().removeFriend(rel.id)
            await loadFriends(currentUser.id)
            close()
          }} />
        )}
        {!isMe && (
          <Item icon={<Fa name="flag" size={12} />} label="Denunciar usuario" danger onClick={() => { setReportUser(user); close() }} />
        )}
      </div>
    </div>
    {reportModal}
    </>
  )
}
