import { useEffect, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { requestBackend } from '../../services/backend'
import { useUserStore } from '../../stores/userStore'
import { useServerStore } from '../../stores/serverStore'
import { toImageUrl } from '../../services/driveService'
import { PostComments } from './PostComments'
import { Repeat2, Heart, Share2 } from 'lucide-react'
import { PollView } from './PollView'
import { VideoPlayer } from '../ui/VideoPlayer'
import { SharePostModal } from './SharePostModal'
import type { Post } from '../../types'

interface Props {
  postId: string
  onClose: () => void
  onShareStory?: (post: Post) => void
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'agora'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function PostViewModal({ postId, onClose, onShareStory }: Props) {
  const { currentUser, users } = useUserStore()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await requestBackend<{ post: Post }>('getPost', { postId })
        if (alive) setPost(res?.post || null)
      } catch {
        if (alive) setPost(null)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [postId])

  const { servers } = useServerStore()
  const author = post && post.authorKind !== 'server' ? users.find((u) => u.id === post.authorId) : undefined
  const authorServer = post && post.authorKind === 'server' ? servers.find((s) => s.id === post.authorId) : undefined
  const authorName = authorServer ? authorServer.name : author?.name || 'Desconhecido'
  const authorPhoto = authorServer ? authorServer.photoUrl : author?.photoUrl || ''
  const authorSub = authorServer ? `${authorServer.members.length} membros` : author?.friendCode ? `@${author.friendCode}` : ''
  const liked = post && currentUser ? post.likes.includes(currentUser.id) : false
  const reposted = post && currentUser ? (post.reposts || []).includes(currentUser.id) : false

  const handleLike = async () => {
    if (!currentUser || !post) return
    await requestBackend('togglePostLike', { userId: currentUser.id, postId: post.id }).catch(() => {})
    setPost({
      ...post,
      likes: liked
        ? post.likes.filter((id) => id !== currentUser.id)
        : [...post.likes, currentUser.id],
    })
  }

  const handleRepost = async () => {
    if (!currentUser || !post) return
    await requestBackend('toggleRepost', { userId: currentUser.id, postId: post.id }).catch(() => {})
    setPost({
      ...post,
      reposts: reposted
        ? (post.reposts || []).filter((id) => id !== currentUser.id)
        : [...(post.reposts || []), currentUser.id],
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        className="fs-modal-in"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>Carregando post...</div>
        ) : !post ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>Post não encontrado ou removido.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Avatar src={authorPhoto} name={authorName} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{authorName}</span>
                  {authorServer && <span style={{ fontSize: 9, fontWeight: 800, background: 'var(--accent)', color: '#000', borderRadius: 4, padding: '1px 5px' }}>SERVIDOR</span>}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{authorSub}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {formatTime(post.createdAt)}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)', marginBottom: 6, wordBreak: 'break-word' }}>{post.content}</div>
                {post.mediaUrl && (
                  post.type === 'video'
                    ? <VideoPlayer src={post.mediaUrl} maxHeight={280} />
                    : <img src={toImageUrl(post.mediaUrl)} alt="" style={{ maxWidth: 460, width: '100%', maxHeight: 280, borderRadius: 12, objectFit: 'cover', marginTop: 6, display: 'block' }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
                  <button onClick={() => void handleRepost()} title="Repostar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 7px', marginLeft: -7, borderRadius: 999, color: reposted ? '#23a55a' : 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
                    <Repeat2 size={16} strokeWidth={2} /> <span>{post.reposts?.length || 0}</span>
                  </button>
                  <button onClick={() => void handleLike()} title="Curtir"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 7px', borderRadius: 999, color: liked ? '#ef4444' : 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
                    <span key={liked ? 'l' : 'u'} className={liked ? 'fs-like-pop' : ''} style={{ display: 'inline-flex' }}>
                      <Heart size={16} strokeWidth={2} fill={liked ? 'currentColor' : 'none'} />
                    </span>
                    <span>{post.likes.length}</span>
                  </button>
                  <button onClick={() => setSharing(true)} title="Compartilhar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 7px', borderRadius: 999, color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
                    <Share2 size={16} strokeWidth={2} /> <span>{post.shares || 0}</span>
                  </button>
                </div>
                {(post.location || post.promoted) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {post.location && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📍 {post.location}</span>}
                    {post.promoted && <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--accent)', color: '#000', borderRadius: 4, padding: '1px 6px' }}>📣 DIVULGADO</span>}
                  </div>
                )}
                {post.poll && <PollView post={post} currentUserId={currentUser?.id || ''} onVoted={p => setPost(p)} />}
                <PostComments postId={post.id} initial={post.comments} users={users} currentUserId={currentUser?.id || ''} header={{ name: authorName, photo: authorPhoto, sub: authorSub, content: post.content, mediaUrl: post.mediaUrl ? (post.type === 'video' ? post.mediaUrl : toImageUrl(post.mediaUrl)) : '', mediaType: post.type }} />
              </div>
            </div>
          </>
        )}
      </div>
      {sharing && post && (
        <SharePostModal
          post={post}
          authorName={authorName}
          currentUserId={currentUser?.id || ''}
          onClose={() => setSharing(false)}
          onShareStory={(p) => {
            setSharing(false)
            if (onShareStory) onShareStory(p)
          }}
        />
      )}
    </div>
  )
}
