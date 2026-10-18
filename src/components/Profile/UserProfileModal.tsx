import { useState } from 'react'
import { getAstroTier, type AstroTier } from '../../utils/astro'
import type { NameEffect } from '../../utils/nameStyle'
import { toImageUrl } from '../../services/driveService'
import { requestBackend } from '../../services/backend'
import { useUserStore } from '../../stores/userStore'
import { useFriendStore } from '../../stores/friendStore'
import { PublicProfileModal, type FrameId, type MuralFieldId, type MuralState, type Plan, type ProfileActionId, type SocialStatus, EMPTY_MURAL } from './ProfileEditor/ProfileEditor'
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
  const settings = (user?.settings || {}) as Record<string, unknown>
  const tier = getAstroTier(user)
  const plan: Plan = TIER_TO_PLAN[tier]

  const socialStatus = (typeof settings.status === 'string' ? settings.status : 'online') as SocialStatus
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
  const verified = Boolean(user.googleId || user.authProvider === 'google') && settings.showBadges !== false
  const joinedAt = Number(user.createdAt || 0)
  const pronoun = typeof settings.pronoun === 'string' ? settings.pronoun : ''

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
      {!isSelf && me && (
        <div style={{ position: 'absolute', top: 80, right: 24, zIndex: 10, display: 'flex', gap: 8 }}>
          <button onClick={handleFollow} disabled={busy !== null}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--accent)', background: following ? 'var(--accent)' : 'transparent', color: following ? '#000' : 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: busy ? 'default' : 'pointer' }}>
            {busy === 'follow' ? '...' : following ? 'Seguindo' : 'Seguir'}
          </button>
          <button onClick={handleBlock} disabled={busy !== null}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ef4444', background: blocked ? '#ef4444' : 'transparent', color: blocked ? '#fff' : '#ef4444', fontWeight: 600, fontSize: 11, cursor: busy ? 'default' : 'pointer' }}>
            {busy === 'block' ? '...' : blocked ? 'Desbloquear' : 'Bloquear'}
          </button>
        </div>
      )}
      <PublicProfileModal
        plan={plan}
        displayName={user?.name || ''}
        username={user?.friendCode || ''}
        about={user?.bio || ''}
        socialStatus={socialStatus}
        statusMessage={statusMessage}
        showActivity={showActivity}
        showServers={showServers}
        showMutualFriends={showMutualFriends}
        mural={mural}
        selectedMuralFields={selectedMuralFields}
        selectedFrame={selectedFrame}
        photoUrl={user?.photoUrl ? toImageUrl(user.photoUrl, 512) : undefined}
        bannerUrl={user?.bannerUrl ? toImageUrl(user.bannerUrl, 1200) : undefined}
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
        onEdit={isSelf ? () => { onClose(); try { window.dispatchEvent(new Event('friends-space:edit-profile')) } catch { } } : undefined}
        isSelf={isSelf}
        onClose={onClose}
        onProfileAction={(action) => { if (onAction) onAction(action) }}
      />
    </div>
  )
}
