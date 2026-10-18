import { Fa } from '../../utils/fa'
import { useEffect, useState } from 'react'
import { StatusIcon } from './StatusIcon'
import { UserProfileModal } from '../Profile/UserProfileModal'
import { IconSend, IconAdd, IconCheck, IconClose } from '../../utils/icons'
import { useFriendStore } from '../../stores/friendStore'
import { useUserStore, isUserOnline } from '../../stores/userStore'
import { useUserMenuStore } from '../../stores/userMenuStore'
import { useLangStore } from '../../stores/langStore'
import { useCallStore } from '../../stores/callStore'
import { ReportModal } from '../Chat/ReportModal'
import { getAstroTier } from '../../utils/astro'
import { nameStyleOf, nameClassOf } from '../../utils/nameStyle'
import { toImageUrl } from '../../services/driveService'
import { skinClass } from '../Profile/ProfileEditor/astroCatalog'
import { cn } from '../Profile/ProfileEditor/cn'
import './UserContextMenu.css'

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
      className={cn('ucm-item', danger && 'is-danger')}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
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

  const tier = isMe ? getAstroTier(currentUser) : getAstroTier(user)
  const paid = tier !== 'none'
  const frameClass = paid ? skinClass('avatar', typeof settings['frame'] === 'string' ? settings['frame'] : 'none') : ''
  const plateClass = paid ? skinClass('nameplate', typeof settings['nameplate'] === 'string' ? settings['nameplate'] : 'none') : ''
  const effectClass = paid ? skinClass('effect', typeof settings['profileEffect'] === 'string' ? settings['profileEffect'] : 'none') : ''
  const namePreview = nameStyleOf(user)
  const nameClass = nameClassOf(user)

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

  const menuWidth = 320
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - menuWidth - 8),
    top: Math.max(8, Math.min(y, window.innerHeight - 460)),
    width: menuWidth,
    maxWidth: 'calc(100vw - 16px)',
  }

  return (
    <>
    <div id="user-context-menu" className="ucm-card" style={style}>
      <div className="ucm-banner">
        {user.bannerUrl
          ? <img src={toImageUrl(user.bannerUrl, 680)} alt="Banner" />
          : <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${user.accentColor || '#29A3FF'}33, transparent)` }} />}
        {effectClass && <div className={cn('ape-effect-layer', effectClass)} />}
      </div>
      <div className="ucm-body">
        <div className={cn('ape-avatar', 'ucm-avatar', frameClass)}>
          {user.photoUrl
            ? <img src={toImageUrl(user.photoUrl, 128)} alt="" />
            : <div className="ucm-avatar-fallback">{(user.name || '?').charAt(0).toUpperCase()}</div>}
        </div>
        <div className="ucm-name-row">
          <span className={cn('ape-plate', plateClass, nameClass, 'ucm-name')} style={namePreview}>{user.name}</span>
          <StatusIcon status={statusKey} online={online} size={14} />
          {!badgeHidden && astro && (
            <span className="ape-badge-astro" style={{ display: 'inline-flex', flexShrink: 0 }}><Fa name="rocket" size={11} /></span>
          )}
        </div>
        <div className="ucm-handle">@{user.friendCode || 'sem-codigo'}</div>
        {statusMessage && <div className="ucm-status-message">{statusMessage}</div>}
        <div className="ucm-badges">
          {isFriend && <span className="ucm-chip is-friend">{t('menu.friend')}</span>}
          {!badgeHidden && verified && (
            <span className="ucm-chip is-verified"><Fa name="check" size={9} /> {t('menu.verified')}</span>
          )}
          {pronoun && <span className="ucm-chip">{pronoun}</span>}
          {showJoinDate && user.createdAt > 0 && (
            <span className="ucm-chip">
              {t('menu.joinedOn')} {new Date(user.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        {user.bio && <p className="ucm-bio">{user.bio}</p>}
        {user.activityName && settings['showActivity'] !== false && user.activityPrivacy !== 'private' && (
          <div className="ucm-activity">
            <Fa name="gamepad" size={12} style={{ color: 'var(--text-primary)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div className="ucm-activity-name">{user.activityName}</div>
              {user.activityDetails && <div className="ucm-activity-details">{user.activityDetails}</div>}
            </div>
          </div>
        )}
      </div>

      {activeCall && !isMe && participants.some(p => p.userId === user.id) && (
        <div className="ucm-volume">
          <div className="ucm-volume-title"><Fa name="volume-high" size={10} /> Volume na chamada</div>
          <div className="ucm-volume-row">
            <Fa name="microphone" size={12} style={{ color: 'var(--text-muted)', width: 16, flexShrink: 0 }} />
            <VolumeSlider value={clampVolume(volumes[user.id])} onChange={v => setVolume(user.id, v)} />
            <span className="ucm-volume-value">{Math.round(clampVolume(volumes[user.id]) * 100)}%</span>
          </div>
          {remoteScreenStreams[user.id] && (
            <div className="ucm-volume-row">
              <Fa name="display" size={12} style={{ color: 'var(--text-muted)', width: 16, flexShrink: 0 }} />
              <VolumeSlider value={clampVolume(volumes[`screen:${user.id}`])} onChange={v => setVolume(`screen:${user.id}`, v)} />
              <span className="ucm-volume-value">{Math.round(clampVolume(volumes[`screen:${user.id}`]) * 100)}%</span>
            </div>
          )}
        </div>
      )}

      <div className="ucm-menu">
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
