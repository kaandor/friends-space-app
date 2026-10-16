import { Fa } from '../../utils/fa'
import { useEffect, useState, useCallback } from 'react'
import type { User, Server, WallPost } from '../../types'
import { Avatar } from './Avatar'
import { StatusIcon } from './StatusIcon'
import { IconSend } from '../../utils/icons'
import { useFriendStore } from '../../stores/friendStore'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore, isUserOnline } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'
import { requestBackend } from '../../services/backend'
import { appearanceDataAttrs, appearanceScreenStyle, parseAppearance } from '../Profile/ProfileEditor/appearance'
import { toImageUrl } from '../../services/driveService'

interface WallSectionProps {
  ownerId: string
  meId: string
  canPost: boolean
}

function WallSection({ ownerId, meId, canPost }: WallSectionProps) {
  const [posts, setPosts] = useState<WallPost[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const list = await requestBackend<WallPost[]>('loadWallPosts', { ownerId })
      setPosts(list || [])
    } catch { }
  }, [ownerId])

  useEffect(() => { void load() }, [load])

  const submit = async () => {
    const content = draft.trim()
    if (!content || busy) return
    setBusy(true)
    setNote('')
    try {
      const { post } = await requestBackend<{ post: WallPost }>('createWallPost', { ownerId, authorId: meId, content })
      if (post) setPosts(prev => [post, ...prev])
      setDraft('')
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Nao foi possivel postar')
    } finally {
      setBusy(false)
    }
  }

  const like = async (postId: string) => {
    try {
      const { post } = await requestBackend<{ post: WallPost }>('toggleWallLike', { postId, userId: meId })
      if (post) setPosts(prev => prev.map(p => p.id === post.id ? post : p))
    } catch { }
  }

  const remove = async (postId: string) => {
    try {
      await requestBackend('deleteWallPost', { postId, ownerId })
      setPosts(prev => prev.filter(p => p.id !== postId))
    } catch { }
  }

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min}min`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}h`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d`
    return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short' })
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Fa name="clipboard" size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 }}>Mural</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{posts.length}</span>
      </div>

      {canPost && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Escreva algo no mural..."
            maxLength={1000}
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => void submit()}
              disabled={busy || !draft.trim()}
              style={{ padding: '6px 14px', borderRadius: 7, background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 700, fontSize: 12.5, cursor: busy || !draft.trim() ? 'not-allowed' : 'pointer', opacity: busy || !draft.trim() ? 0.55 : 1 }}
            >
              {busy ? '...' : 'Publicar'}
            </button>
            {note && <span style={{ color: '#f23f43', fontSize: 11.5 }}>{note}</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {posts.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Nenhum post ainda.</div>
        )}
        {posts.map(post => {
          const liked = post.likes.includes(meId)
          return (
            <div key={post.id} style={{ padding: '9px 11px', background: 'var(--bg-tertiary)', borderRadius: 9, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar src={post.authorPhoto} name={post.authorName || '?'} size={26} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 12.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {post.authorName || 'usuario'}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10.5 }}>{timeAgo(post.createdAt)}</span>
                {post.authorId === meId && (
                  <button onClick={() => void remove(post.id)} title="Apagar post" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                )}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.45, marginTop: 4, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{post.content}</div>
              <div style={{ marginTop: 6 }}>
                <button
                  onClick={() => void like(post.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: liked ? 'var(--accent)' : 'var(--bg-secondary)', color: liked ? '#000' : 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}
                >
                  <Fa name="heart" size={10} style={{ color: liked ? '#000' : '#f23f43' }} /> {post.likes.length}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function FullProfileModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { currentUser } = useUserStore()
  const { friends, friendUsers } = useFriendStore()
  const { servers } = useServerStore()
  const { t } = useLangStore()

  const [mutualFriends, setMutualFriends] = useState<User[]>([])
  const [mutualServers, setMutualServers] = useState<Server[]>([])
  const [loadingExtra, setLoadingExtra] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const meId = currentUser?.id

  useEffect(() => {
    if (!meId || user.id === meId) { setMutualFriends([]); setMutualServers([]); return }
    let cancelled = false
    setLoadingExtra(true)
    const run = async () => {
      try {
        const [theirFriends, theirServers] = await Promise.all([
          requestBackend<{ friends: { id: string; userId: string; friendId: string; status: string }[] }>('loadFriends', { userId: user.id }),
          requestBackend<Server[]>('loadUserServers', { userId: user.id }),
        ])
        if (cancelled) return
        const theirAcceptedIds = (theirFriends?.friends || [])
          .filter(f => f.status === 'accepted')
          .map(f => f.userId === user.id ? f.friendId : f.userId)
        const myFriendIds = friends
          .filter(f => f.status === 'accepted')
          .map(f => f.userId === meId ? f.friendId : f.userId)
        const mutualIds = theirAcceptedIds.filter(id => myFriendIds.includes(id))
        setMutualFriends(friendUsers.filter(u => mutualIds.includes(u.id)))
        const myServerIds = new Set(servers.filter(s => Array.isArray(s.members) && s.members.includes(meId)).map(s => s.id))
        setMutualServers((theirServers || []).filter(s => myServerIds.has(s.id)))
      } catch { } finally {
        if (!cancelled) setLoadingExtra(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [meId, user.id, friends, friendUsers, servers])

  const rel = friends.find(f =>
    (f.userId === user.id && f.friendId === meId) ||
    (f.friendId === user.id && f.userId === meId)
  )
  const online = isUserOnline(user)
  const settings = (user.settings || {}) as Record<string, string | boolean | undefined>
  const statusKey = typeof settings['status'] === 'string' ? settings['status'] as string : 'online'
  const statusMessage = typeof settings['statusMessage'] === 'string' ? settings['statusMessage'] as string : ''
  const pronoun = typeof settings['pronoun'] === 'string' ? settings['pronoun'] as string : ''
  const astro = settings['astro'] === true || settings['astro'] === 'true'
  const verified = Boolean(user.googleId || user.authProvider === 'google')
  const badgeHidden = settings['showBadges'] === false
  const showJoinDate = settings['showJoinDate'] !== false
  const accent = user.accentColor || '#29A3FF'

  const sendMessage = () => {
    window.dispatchEvent(new CustomEvent('friends-space:open-dm', { detail: { user } }))
    onClose()
  }

  const appearance = parseAppearance(user.settings as Record<string, unknown> | undefined)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        {...appearanceDataAttrs(appearance)}
        style={{ ...appearanceScreenStyle(appearance), width: 'min(560px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--appearance-page-bg, var(--bg-secondary))', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.7)', fontFamily: 'var(--appearance-font, inherit)', color: 'var(--appearance-text, var(--text-primary))' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ position: 'relative', height: 180, background: user.bannerUrl ? 'var(--bg-tertiary)' : `linear-gradient(135deg, ${accent}44, ${accent}11)` }}>
          {user.bannerUrl && (
            <img src={toImageUrl(user.bannerUrl)} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: '14px 14px 0 0', background: 'var(--bg-tertiary)' }} />
          )}
          <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>

        <div style={{ marginTop: -34, padding: '0 18px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <div style={{ borderRadius: '50%', padding: 3, background: 'var(--bg-secondary)', display: 'flex' }}>
              <Avatar src={user.photoUrl} name={user.name} size={72} />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
                <StatusIcon status={statusKey} online={online} size={16} />
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>@{user.friendCode || 'sem-codigo'}</div>
            </div>
          </div>

          {statusMessage && (
            <div style={{ marginTop: 10, color: 'var(--accent)', fontSize: 13 }}>{statusMessage}</div>
          )}

          {user.bio && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>{user.bio}</p>
          )}

          <div style={{ display: 'flex', gap: 5, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {rel?.status === 'accepted' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--accent)', color: '#000', fontWeight: 700 }}>{t('menu.friend')}</span>}
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

          {/* Atividade */}
          {user.activityName && settings['showActivity'] !== false && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <Fa name="gamepad" size={14} style={{ color: 'var(--accent)' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}>{user.activityName}</div>
                {user.activityDetails && <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.activityDetails}</div>}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            {user.id !== meId && (
              <button onClick={sendMessage} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', borderRadius: 8, background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                <IconSend width={15} height={15} /> {t('menu.conversar')}
              </button>
            )}
            {user.id === meId && (
              <button onClick={() => { onClose(); window.dispatchEvent(new Event('friends-space:edit-profile')) }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', borderRadius: 8, background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                <Fa name="pen" size={12} /> Editar perfil
              </button>
            )}
          </div>

          {/* Amigos mutuos */}
          {user.id !== meId && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Fa name="user-group" size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 }}>Amigos em comum</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{mutualFriends.length}</span>
              </div>
              {loadingExtra && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Carregando...</div>}
              {!loadingExtra && mutualFriends.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Nenhum amigo em comum.</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {mutualFriends.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', background: 'var(--bg-tertiary)', borderRadius: 999, border: '1px solid var(--border)' }}>
                    <Avatar src={f.photoUrl} name={f.name} size={22} />
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Servidores mutuos */}
          {user.id !== meId && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Fa name="server" size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 }}>Servidores em comum</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{mutualServers.length}</span>
              </div>
              {loadingExtra && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Carregando...</div>}
              {!loadingExtra && mutualServers.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Nenhum servidor em comum.</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {mutualServers.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', background: 'var(--bg-tertiary)', borderRadius: 999, border: '1px solid var(--border)' }}>
                    {s.photoUrl ? (
                      <img src={toImageUrl(s.photoUrl)} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: s.accentColor || 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{s.name.charAt(0).toUpperCase()}</div>
                    )}
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mural */}
          <WallSection ownerId={user.id} meId={meId || ''} canPost={Boolean(meId)} />
        </div>
      </div>
    </div>
  )
}
