import { useEffect, useState } from 'react'
import { getAstroTier, type AstroTier } from '../../utils/astro'
import type { NameEffect } from '../../utils/nameStyle'
import { toImageUrl } from '../../services/driveService'
import { requestBackend } from '../../services/backend'
import { useUserStore, isUserOnline } from '../../stores/userStore'
import { useFriendStore } from '../../stores/friendStore'
import { PublicProfileModal, type FrameId, type MuralFieldId, type MuralState, type Plan, type ProfileActionId, type MutualProfileUser, type MutualProfileServer, EMPTY_MURAL } from './ProfileEditor/ProfileEditor'
import { statusFromSettings } from '../../utils/userStatus'
import type { User } from '../../types'
import './ProfileEditor/ProfileEditor.css'
import './ProfileEditor/AstroProfileEditor.css'

// Perfil publico NOVO (mesmo preview do Editar Perfil), alimentado por um User
// real. Usado em: "Meu perfil" (isSelf) e no preview de botao direito.
// ATENCAO: todo o CSS do modal e escopado por `.fs-profile-editor ...`, entao
// o wrapper PRECISA dessa classe para o modal nao aparecer sem estilo.
const TIER_TO_PLAN: Record<AstroTier | 'none', Plan> = {
  none: 'free',
  astro: 'astro',
  astro_plus: 'astroPlus',
  astro_ultimate: 'astroPlusGold',
}

const MURAL_IDS: MuralFieldId[] = ['games', 'completedGames', 'recentGames', 'series', 'movies', 'music', 'albums', 'artists', 'actors']

export function UserProfileModal({ user, isSelf, onAction, onClose }: {
  user: User
  isSelf?: boolean
  onAction?: (action: ProfileActionId) => void
  onClose: () => void
}) {
  const { currentUser: me } = useUserStore()
  const { friends } = useFriendStore()
  const [following, setFollowing] = useState(me?.following?.includes(user.id) || false)
  const [blocked, setBlocked] = useState(me?.blocked?.includes(user.id) || false)
  const [busy, setBusy] = useState<'follow' | 'block' | null>(null)
  const [mutualFriends, setMutualFriends] = useState<MutualProfileUser[] | undefined>(undefined)
  const [mutualServers, setMutualServers] = useState<MutualProfileServer[] | undefined>(undefined)
  const [mutualLoading, setMutualLoading] = useState(false)
  const [freshUser, setFreshUser] = useState<User | null>(null)
  const viewUser = freshUser && freshUser.id === user?.id ? { ...user, ...freshUser } : user
  const settings = (viewUser?.settings || {}) as Record<string, unknown>
  const profileUserId = user?.id || ''

  useEffect(() => {
    if (!profileUserId) return
    let cancelled = false
    const loadFreshUser = () => {
      void requestBackend<User | undefined>('getUser', { id: profileUserId }).then(found => {
        if (!cancelled && found?.id === profileUserId) setFreshUser(found)
      }).catch(() => { })
    }
    loadFreshUser()
    const timer = window.setInterval(loadFreshUser, 15000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [profileUserId])
  const tier = getAstroTier(viewUser)
  const plan: Plan = TIER_TO_PLAN[tier]

  const socialStatus = statusFromSettings(settings)
  const statusMessage = typeof settings.statusMessage === 'string' ? settings.statusMessage : ''
  const showActivity = settings.showActivity !== false
  const showServers = settings.showServers !== false
  const showMutualFriends = settings.showFriends !== false

  const mural: MuralState = (() => {
    const raw = settings.mural
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const out = {} as MuralState
      for (const id of MURAL_IDS) {
        const items = (raw as Record<string, unknown>)[id]
        out[id] = Array.isArray(items) ? items as MuralState[MuralFieldId] : []
      }
      return out
    }
    return { ...EMPTY_MURAL }
  })()

  const selectedMuralFields = (() => {
    const raw = settings.muralFields
    if (Array.isArray(raw)) return raw.filter((id): id is MuralFieldId => MURAL_IDS.includes(id as MuralFieldId))
    // Se o usuario salvou muralFields antes do mural existir, retorna vazio em vez
    // de crashar em mural[id].map no PublicProfileModal.
    return []
  })()

  const selectedFrame = (typeof settings.frame === 'string' ? settings.frame : 'none') as FrameId
  const nameplateId = typeof settings.nameplate === 'string' ? settings.nameplate : 'none'
  const profileFrameId = typeof settings.profileFrame === 'string' ? settings.profileFrame : 'none'
  const profileEffectId = typeof settings.profileEffect === 'string' ? settings.profileEffect : 'none'
  const nameColorId = typeof settings.nameColor === 'string' ? settings.nameColor : 'default'
  const nameEffectId = (typeof settings.nameEffect === 'string' ? settings.nameEffect : 'none') as NameEffect
  const showAstroBadge = tier !== 'none' && settings.astroBadge !== false

  const rel = friends.find(f =>
    (f.userId === user.id && f.friendId === me?.id) ||
    (f.friendId === user.id && f.userId === me?.id)
  )
  const isFriend = !isSelf && rel?.status === 'accepted'
  const verified = Boolean(viewUser?.googleId || viewUser?.authProvider === 'google') && settings.showBadges !== false
  const joinedAt = Number(viewUser?.createdAt || 0)
  const pronoun = typeof settings.pronoun === 'string' ? settings.pronoun : ''
  const myId = me?.id || ''

  const activityAllowed = viewUser?.activityEnabled !== false
    && viewUser?.activityPrivacy !== 'private'
    && (viewUser?.activityPrivacy !== 'friends' || isFriend || Boolean(isSelf))
  const publicActivity = showActivity && activityAllowed && viewUser?.activityName
    ? { name: viewUser.activityName, details: viewUser.activityDetails, startedAt: viewUser.activityStartedAt, online: isSelf || isUserOnline(viewUser) }
    : undefined

  useEffect(() => {
    if (isSelf || !myId || !profileUserId || (!showMutualFriends && !showServers)) {
      setMutualFriends(undefined)
      setMutualServers(undefined)
      setMutualLoading(false)
      return
    }

    let cancelled = false
    setMutualLoading(true)
    void (async () => {
      try {
        const result = await requestBackend<{
          friends: Array<{ id: string; name: string; username?: string; photoUrl?: string }>
          servers: Array<{ id: string; name: string; photoUrl?: string; members?: number }>
        }>('loadMutuals', { targetId: profileUserId })
        if (cancelled) return
        setMutualFriends(showMutualFriends
          ? (result?.friends || []).map(friend => ({
            id: friend.id,
            name: friend.name || 'Usuário',
            username: friend.username || '',
            photoUrl: friend.photoUrl ? toImageUrl(friend.photoUrl, 128) : undefined,
          }))
          : undefined)
        setMutualServers(showServers
          ? (result?.servers || []).map(server => ({
            id: server.id,
            name: server.name || 'Servidor',
            photoUrl: server.photoUrl ? toImageUrl(server.photoUrl, 128) : undefined,
            members: server.members,
          }))
          : undefined)
      } catch {
        if (!cancelled) {
          setMutualFriends(showMutualFriends ? [] : undefined)
          setMutualServers(showServers ? [] : undefined)
        }
      } finally {
        if (!cancelled) setMutualLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isSelf, myId, profileUserId, showMutualFriends, showServers])

  const handleFollow = async () => {
    if (!me || busy) return
    setBusy('follow')
    try {
      const res = await requestBackend<{ following: boolean }>('toggleFollow', { userId: me.id, targetId: user.id })
      if (res) setFollowing(res.following)
    } finally { setBusy(null) }
  }

  const handleBlock = async () => {
    if (!me || busy) return
    setBusy('block')
    try {
      const res = await requestBackend<{ blocked: boolean }>('toggleBlock', { userId: me.id, targetId: user.id })
      if (res) setBlocked(res.blocked)
    } finally { setBusy(null) }
  }

  return (
    <div className="fs-profile-editor" style={{ position: 'relative' }}>
      <PublicProfileModal
        plan={plan}
        displayName={viewUser?.name || ''}
        username={viewUser?.friendCode || ''}
        about={viewUser?.bio || ''}
        socialStatus={socialStatus}
        statusMessage={statusMessage}
        showActivity={showActivity}
        showServers={showServers}
        showMutualFriends={showMutualFriends}
        mural={mural}
        selectedMuralFields={selectedMuralFields}
        selectedFrame={selectedFrame}
        photoUrl={viewUser?.photoUrl ? toImageUrl(viewUser.photoUrl, 512) : undefined}
        bannerUrl={viewUser?.bannerUrl ? toImageUrl(viewUser.bannerUrl, 1200) : undefined}
        nameplateId={nameplateId}
        profileFrameId={profileFrameId}
        profileEffectId={profileEffectId}
        nameColorId={nameColorId}
        nameEffectId={nameEffectId}
        showAstroBadge={showAstroBadge}
        verified={verified}
        isFriend={isFriend}
        joinedAt={joinedAt}
        pronoun={pronoun}
        friendsSince={isFriend ? rel?.createdAt : undefined}
        activity={publicActivity}
        mutualFriends={mutualFriends}
        mutualServers={mutualServers}
        mutualLoading={mutualLoading}
        targetUserId={profileUserId}
        following={following}
        blocked={blocked}
        busy={busy !== null}
        onFollow={isSelf ? undefined : handleFollow}
        onBlock={isSelf ? undefined : handleBlock}
        onEdit={isSelf ? () => { onClose(); try { window.dispatchEvent(new Event('friends-space:edit-profile')) } catch { } } : undefined}
        isSelf={isSelf}
        onClose={onClose}
        onProfileAction={(action) => { if (onAction) onAction(action) }}
      />
    </div>
  )
}
