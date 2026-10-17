import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { useUserStore } from '../../stores/userStore'
import { useFriendStore } from '../../stores/friendStore'
import { requestBackend } from '../../services/backend'
import { getAstroTier } from '../../utils/astro'
import { Heart, Repeat2, Send, VolumeX, Volume2 } from 'lucide-react'
import { StoryAdSlide } from './StoryAdSlide'
import type { Post, Story } from '../../types'

interface Props {
  group: { user: { id: string; name: string; photoUrl: string }; items: Story[] }
  onClose: () => void
  onDelete: (storyId: string) => void
  onMessage?: (user: { id: string; name: string; photoUrl: string }) => void
  onOpenPost?: (postId: string) => void
  onReposted?: () => void
}

// Player de stories no padrao Instagram: barra de progresso animada, toque
// esquerda=voltar / direita=avancar, mute no video, legenda e exclusao.
export function StoryViewer({ group, onClose, onDelete, onMessage, onOpenPost, onReposted }: Props) {
  const { currentUser } = useUserStore()
  const [idx, setIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [muted, setMuted] = useState(true)
  const [videoProgress, setVideoProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const item = group.items[Math.min(idx, Math.max(0, group.items.length - 1))] ?? group.items[0]
  const isOwner = currentUser?.id === group.user.id
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [sharedPost, setSharedPost] = useState<Post | null>(null)
  const [reposting, setReposting] = useState(false)
  const friends = useFriendStore((s) => s.friends)
  const isFriend = friends.some(
    (f) => f.status === 'accepted' &&
      ((f.userId === currentUser?.id && f.friendId === group.user.id) ||
        (f.friendId === currentUser?.id && f.userId === group.user.id))
  )
  const isLast = idx === group.items.length - 1
  const isVideo = item.type === 'video'

  // Anuncios: gratis = 1 a cada 5 videos; Astro normal = 1 a cada 10; Plus/Ultimate = sem ads.
  // O contador vive no sessionStorage: antes zerava ao fechar o viewer e o
  // anuncio quase nunca aparecia (precisava 5 videos de UMA pessoa sem fechar).
  const tier = getAstroTier(currentUser)
  const adEvery = tier === 'none' ? 5 : tier === 'astro' ? 10 : 0
  const readSeen = () => {
    try { return Number(sessionStorage.getItem('fs:storyVideosSeen')) || 0 } catch { return 0 }
  }
  const videosSeenRef = useRef(readSeen())
  const adSlotRef = useRef(0)
  const [showAd, setShowAd] = useState(false)

  const goNext = useCallback(() => { if (!isLast) setIdx(i => i + 1); else onClose() }, [isLast, onClose])
  const goPrev = useCallback(() => { if (idx > 0) setIdx(i => i - 1) }, [idx])
  const advance = useCallback(() => {
    if (showAd) return
    if (item.type === 'video' && adEvery > 0) {
      videosSeenRef.current += 1
      try { sessionStorage.setItem('fs:storyVideosSeen', String(videosSeenRef.current)) } catch { /* ignore */ }
      if (videosSeenRef.current % adEvery === 0) {
        adSlotRef.current = videosSeenRef.current
        setShowAd(true)
        return
      }
    }
    goNext()
  }, [item.type, adEvery, goNext, showAd])

  // Imagem: avanca sozinha em 5s com barra animada
  useEffect(() => {
    setVideoProgress(0)
    if (!isVideo && !showAd) {
      timerRef.current = window.setTimeout(advance, 5000)
    }
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
  }, [idx, isVideo, advance, showAd])

  const handleVideoEnded = () => advance()

  useEffect(() => {
    setLiked(Array.isArray(item.likes) && currentUser ? item.likes.includes(currentUser.id) : false)
    setLikeCount(Array.isArray(item.likes) ? item.likes.length : 0)
    setSharedPost(null)
    if (item.sharedPostId) {
      let alive = true
      void (async () => {
        try {
          const res = await requestBackend<{ post: Post }>('getPost', { postId: item.sharedPostId })
          if (alive) setSharedPost(res?.post || null)
        } catch {}
      })()
      return () => { alive = false }
    }
  }, [item.id])

  useEffect(() => {
    if (!currentUser || isOwner) return
    void requestBackend('viewStory', { userId: currentUser.id, storyId: item.id }).catch(() => {})
  }, [item.id])

  const handleLike = async () => {
    if (!currentUser) return
    const res = await requestBackend<{ likes: string[] }>('toggleStoryLike', { userId: currentUser.id, storyId: item.id }).catch(() => null)
    if (res?.likes) {
      setLiked(res.likes.includes(currentUser.id))
      setLikeCount(res.likes.length)
    } else {
      setLiked(!liked)
      setLikeCount((c) => c + (liked ? -1 : 1))
    }
  }

  const handleRepostStory = async () => {
    if (!currentUser || reposting) return
    setReposting(true)
    try {
      await requestBackend('addStory', {
        userId: currentUser.id,
        mediaUrl: item.mediaUrl || '',
        type: item.type,
        sharedPostId: item.sharedPostId || '',
        overlayText: item.overlayText || '',
        overlayStyle: item.overlayStyle || { color: '#ffffff', size: 24, bold: true, position: 'top' },
        visibility: 'friends',
      })
      onReposted?.()
    } finally {
      setReposting(false)
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await requestBackend('deleteStory', { userId: currentUser?.id, storyId: item.id })
      onDelete(item.id)
    } finally { setDeleting(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}>
      <style>{`@keyframes fsStoryBar{from{width:0%}to{width:100%}}`}</style>

      {/* Barra de progresso (estilo Instagram) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', gap: 3, padding: '8px 12px', zIndex: 10 }}>
        {group.items.map((s, i) => {
          const done = i < idx
          const active = i === idx
          return (
            <div key={s.id} style={{ flex: 1, height: 2, borderRadius: 2, background: 'rgba(255,255,255,.25)', overflow: 'hidden' }}>
              {done && <div style={{ height: '100%', background: '#fff' }} />}
              {active && (
                isVideo
                  ? <div style={{ height: '100%', background: '#fff', width: `${videoProgress}%`, transition: 'width .2s linear' }} />
                  : <div style={{ height: '100%', background: '#fff', animation: 'fsStoryBar 5s linear forwards' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Topo: autor + tempo + acoes */}
      <div style={{ position: 'absolute', top: 18, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <Avatar src={group.user.photoUrl} name={group.user.name} size={28} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.user.name}</span>
          <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>
            {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isOwner && (
            <button onClick={e => { e.stopPropagation(); void handleDelete() }} disabled={deleting}
              style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#ef4444', fontWeight: 700, fontSize: 11, cursor: deleting ? 'default' : 'pointer' }}>
              {deleting ? '...' : 'Excluir'}
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onClose() }}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
      </div>

      {/* Midia */}
      <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isVideo ? (
          <video ref={videoRef} src={item.mediaUrl} autoPlay playsInline muted={muted}
            onEnded={handleVideoEnded}
            onTimeUpdate={() => {
              const v = videoRef.current
              if (v && v.duration) setVideoProgress((v.currentTime / v.duration) * 100)
            }}
            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, objectFit: 'contain' }}
          />
        ) : (
          <img src={item.mediaUrl} alt="" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, objectFit: 'contain' }} />
        )}
      </div>

      {/* Legenda */}
      {item.caption && (
        <p style={{ color: 'rgba(255,255,255,.85)', fontSize: 14, margin: '12px 16px 0', textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>
          {item.caption}
        </p>
      )}

      {/* Post compartilhado */}
      {item.sharedPostId && (
        <button
          onClick={(e) => { e.stopPropagation(); if (item.sharedPostId && onOpenPost) onOpenPost(item.sharedPostId) }}
          style={{ margin: '10px 16px 0', background: 'rgba(20,20,28,.92)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 10, cursor: 'pointer', textAlign: 'left', maxWidth: 400, width: 'calc(100% - 32px)', color: '#fff' }}
        >
          <div style={{ fontSize: 11, color: '#fff', fontWeight: 700, marginBottom: 4 }}>Post compartilhado · ver e comentar</div>
          <div style={{ fontSize: 12, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {sharedPost ? sharedPost.content : 'Carregando post...'}
          </div>
          {sharedPost && (
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>♥ {sharedPost.likes.length} · 💬 {sharedPost.comments.length}</div>
          )}
        </button>
      )}

      {/* Texto sobre a mídia (mini photoshop) */}
      {item.overlayText && (
          <div
            style={{
              position: 'absolute',
              left: item.overlayStyle?.x !== undefined ? `${item.overlayStyle.x}%` : 0,
              right: item.overlayStyle?.x !== undefined ? undefined : 0,
              top: item.overlayStyle?.y !== undefined
                ? `${item.overlayStyle.y}%`
                : ((item.overlayStyle?.position || 'top') === 'top' ? 64 : undefined),
              bottom: item.overlayStyle?.y !== undefined
                ? undefined
                : ((item.overlayStyle?.position || 'top') === 'bottom' ? 96 : undefined),
              transform: item.overlayStyle?.x !== undefined ? 'translate(-50%, -50%)' : undefined,
              textAlign: 'center',
              color: item.overlayStyle?.color || '#fff',
              fontSize: item.overlayStyle?.size || 24,
              fontWeight: item.overlayStyle?.bold === false ? 400 : 800,
              lineHeight: 1.3,
              padding: '0 20px',
              wordBreak: 'break-word',
              textShadow: '0 2px 8px rgba(0,0,0,.8)',
              pointerEvents: 'none',
              zIndex: 6,
            }}
          >
            {item.overlayText}
          </div>
      )}

      {/* Barra de ações: like, repost, mensagem, ver post */}
      <div style={{ position: 'absolute', bottom: 24, left: 20, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={(e) => { e.stopPropagation(); void handleLike() }} title="Curtir"
          style={{ background: 'rgba(0,0,0,.45)', border: 'none', borderRadius: 999, padding: '8px 12px', color: liked ? '#ef4444' : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Heart size={15} strokeWidth={2} fill={liked ? 'currentColor' : 'none'} /> {likeCount}
        </button>
        <button onClick={(e) => { e.stopPropagation(); void handleRepostStory() }} title="Repostar no seu story" disabled={reposting}
          style={{ background: 'rgba(0,0,0,.45)', border: 'none', borderRadius: 999, padding: '8px 12px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: reposting ? 0.6 : 1 }}>
          <Repeat2 size={15} strokeWidth={2} /> Repostar
        </button>
        {!isOwner && isFriend && onMessage && (
          <button onClick={(e) => { e.stopPropagation(); onMessage(group.user) }} title="Mandar mensagem"
            style={{ background: 'rgba(0,0,0,.45)', border: 'none', borderRadius: 999, padding: '8px 12px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Send size={15} strokeWidth={2} /> Conversar
          </button>
        )}
        {item.sharedPostId && onOpenPost && (
          <button onClick={(e) => { e.stopPropagation(); if (item.sharedPostId) onOpenPost(item.sharedPostId) }} title="Ver post"
            style={{ background: 'rgba(0,0,0,.45)', border: 'none', borderRadius: 999, padding: '8px 12px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Ver post
          </button>
        )}
      </div>

      {/* Zonas de toque: esquerda volta, direita avanca */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 5 }}>
        <div style={{ flex: '0 0 38%', height: '100%' }} onClick={goPrev} />
        <div style={{ flex: 1, height: '100%' }} onClick={advance} />
      </div>

      {/* Intersticial de anuncio */}
      {showAd && <StoryAdSlide slot={adSlotRef.current} onDone={() => { setShowAd(false); goNext() }} />}

      {/* Mute (video) */}
      {isVideo && (
        <button onClick={() => setMuted(m => !m)} title={muted ? 'Ativar som' : 'Silenciar'}
          style={{ position: 'absolute', bottom: 24, right: 20, zIndex: 10, background: 'rgba(0,0,0,.45)', border: 'none', borderRadius: '50%', width: 40, height: 40, color: '#fff', fontSize: 16, cursor: 'pointer' }}>
          {muted ? <VolumeX size={16} strokeWidth={2} /> : <Volume2 size={16} strokeWidth={2} />}
        </button>
      )}
    </div>
  )
}