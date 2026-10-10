import { useEffect, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { useUserStore } from '../../stores/userStore'
import { useServerStore } from '../../stores/serverStore'
import { requestBackend } from '../../services/backend'
import { PostViewModal } from './PostViewModal'
import type { Post } from '../../types'

interface Props { onClose: () => void }

type Tab = 'bookmarked' | 'liked' | 'reposted'

export function UserHistoryModal({ onClose }: Props) {
  const { currentUser, users } = useUserStore()
  const { servers } = useServerStore()
  const [tab, setTab] = useState<Tab>('bookmarked')
  const [data, setData] = useState<{ liked: Post[]; reposted: Post[]; bookmarked: Post[] } | null>(null)
  const [openPostId, setOpenPostId] = useState<string | null>(null)

  useEffect(() => {
    if (!currentUser) return
    void (async () => {
      try {
        const res = await requestBackend<{ liked: Post[]; reposted: Post[]; bookmarked: Post[] }>('getUserHistory', { userId: currentUser.id })
        setData({ liked: res?.liked || [], reposted: res?.reposted || [], bookmarked: res?.bookmarked || [] })
      } catch { /* ignore */ }
    })()
  }, [currentUser])

  const authorName = (post: Post) =>
    post.authorKind === 'server'
      ? (servers.find(s => s.id === post.authorId)?.name || 'Servidor')
      : (users.find(u => u.id === post.authorId)?.name || 'Desconhecido')
  const authorPhoto = (post: Post) =>
    post.authorKind === 'server'
      ? (servers.find(s => s.id === post.authorId)?.photoUrl || '')
      : (users.find(u => u.id === post.authorId)?.photoUrl || '')

  const list = !data ? [] : tab === 'bookmarked' ? data.bookmarked : tab === 'liked' ? data.liked : data.reposted
  const tabs: Array<[Tab, string]> = [['bookmarked', 'Favoritos'], ['liked', 'Curtidas'], ['reposted', 'Reposts']]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="fs-modal-in" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 0' }}>
          <h4 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, margin: 0, flex: 1 }}>Seu histórico</h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
          {tabs.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: tab === t ? 'var(--accent)' : 'var(--bg-tertiary)', color: tab === t ? '#000' : 'var(--text-secondary)' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!data && <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>Carregando...</div>}
          {data && list.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>Nada por aqui ainda.</div>}
          {list.map(post => (
            <div key={post.id} onClick={() => setOpenPostId(post.id)} style={{ display: 'flex', gap: 10, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, cursor: 'pointer' }}>
              <Avatar src={authorPhoto(post)} name={authorName(post)} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>{authorName(post)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{post.content}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {openPostId && <PostViewModal postId={openPostId} onClose={() => setOpenPostId(null)} />}
    </div>
  )
}
