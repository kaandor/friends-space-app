import { Fa } from '../../utils/fa'
import { useEffect, useState } from 'react'
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
import { ProfileCardView } from '../Profile/ProfileCardView'
import { cn } from '../Profile/ProfileEditor/cn'
import './UserContextMenu.css'

const clampVolume = (v?: number) => (typeof v === 'number' && !Number.isNaN(v) ? Math.min(2, Math.max(0, v)) : 1)

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      min={0}
      max={200}
      value={Math.round(value * 100)}
      onChange={event => onChange(Number(event.target.value) / 100)}
      style={{ flex: 1, accentColor: 'var(--accent)' }}
      title="Volume (até 200%)"
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
      {icon && <span className="ucm-item-icon">{icon}</span>}
      <span className="ucm-item-label">{label}</span>
    </button>
  )
}

export function UserContextMenu() {
  const { currentUser } = useUserStore()
  const { friends, loadFriends, addFriendById, respondFriend } = useFriendStore()
  const { user: menu, x, y, close, profileUser, openProfile, closeProfile } = useUserMenuStore()
  const { t } = useLangStore()
  const activeCall = useCallStore(s => s.activeCall)
  const participants = useCallStore(s => s.participants)
  const inviteToCall = useCallStore(s => s.inviteToCall)
  const remoteScreenStreams = useCallStore(s => s.remoteScreenStreams)
  const volumes = useCallStore(s => s.volumes)
  const setVolume = useCallStore(s => s.setVolume)
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

  if (profileUser) {
    const viewUser = profileUser
    return (
      <UserProfileModal
        user={viewUser}
        isSelf={viewUser.id === currentUser?.id}
        onClose={closeProfile}
        onAction={(action) => {
          if (action === 'message') {
            closeProfile()
            window.dispatchEvent(new CustomEvent('friends-space:open-dm', { detail: { user: viewUser } }))
            close()
          } else if (action === 'request') {
            closeProfile()
            if (currentUser) {
              void addFriendById(currentUser.id, viewUser.id).then(async (added) => {
                if (added.ok) await loadFriends(currentUser.id)
              })
            }
            close()
          } else if (action === 'report') {
            closeProfile()
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
  const settings = (user.settings || {}) as Record<string, string | boolean | undefined>
  const pronoun = typeof settings['pronoun'] === 'string' ? settings['pronoun'] as string : ''
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

  const menuWidth = 340
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - menuWidth - 8),
    top: Math.max(8, Math.min(y, window.innerHeight - 520)),
    width: menuWidth,
    maxWidth: 'calc(100vw - 16px)',
  }

  return (
    <>
    <div id="user-context-menu" className="ucm-card fs-menu-in" style={style}>
      <ProfileCardView
        displayName={user.name || ''}
        username={user.friendCode || ''}
        about={user.bio || ''}
        emptyAbout="Este usuário ainda não escreveu uma apresentação."
        statusMessage={statusMessage}
        avatarSrc={user.photoUrl ? toImageUrl(user.photoUrl, 512) : undefined}
        avatarFallback={user.name}
        bannerStyle={user.bannerUrl ? { backgroundImage: `url("${toImageUrl(user.bannerUrl, 680)}")` } : undefined}
        memberSince={showJoinDate && user.createdAt > 0 ? new Date(user.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined}
        pronoun={pronoun || undefined}
        verified={!badgeHidden && verified}
        paid={paid}
        showAstroBadge={!badgeHidden && astro}
        plateClass={plateClass}
        nameClass={nameClass}
        nameStyle={namePreview}
        avatarClass={frameClass}
        cardClass={paid ? skinClass('frame', typeof settings['profileFrame'] === 'string' ? settings['profileFrame'] : 'none') : ''}
        effectClass={effectClass}
        className="ucm-profile-preview"
      />

      {isUserOnline(user) && user.activityName && settings['showActivity'] !== false && user.activityPrivacy !== 'private' && (
        <div className="ucm-activity">
          <Fa name="gamepad" size={12} style={{ color: 'var(--text-primary)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div className="ucm-activity-name">{user.activityName}</div>
            {user.activityDetails && <div className="ucm-activity-details">{user.activityDetails}</div>}
          </div>
        </div>
      )}

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
        {!isMe && activeCall && !participants.some(p => p.userId === user.id) && (
          <Item icon={<Fa name="user-plus" size={12} />} label="Convidar para a call" onClick={() => { void inviteToCall(user.id); close() }} />
        )}
        <Item icon={<Fa name="user" size={12} />} label={t('menu.viewProfile')} onClick={() => openProfile(user)} />
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
