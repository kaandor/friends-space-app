import { Fa } from '../../utils/fa'
import { useState } from 'react'
import { requestBackend } from '../../services/backend'
import { CirclePlay } from 'lucide-react'
import type { Post } from '../../types'

interface Props {
  post: Post
  authorName: string
  currentUserId: string
  onClose: () => void
  onShareStory: (post: Post) => void
}

export function SharePostModal({ post, authorName, currentUserId, onClose, onShareStory }: Props) {
  const [copied, setCopied] = useState(false)
  const postUrl = `${window.location.origin}/#/post/${post.id}`
  const shareText = `${authorName} no Friends Space: ${(post.content || '').slice(0, 100)}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = postUrl
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {}
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
    try {
      await requestBackend('sharePost', { userId: currentUserId, postId: post.id })
    } catch {}
  }

  const openShare = (url: string) => {
    try {
      window.open(url, '_blank', 'noopener,width=600,height=540')
    } catch {}
    try {
      void requestBackend('sharePost', { userId: currentUserId, postId: post.id }).catch(() => {})
    } catch {}
  }

  const networks = [
    {
      name: 'X',
      color: '#000',
      icon: <span style={{ fontWeight: 900, fontSize: 16 }}>𝕏</span>,
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(postUrl)}`,
    },
    {
      name: 'Facebook',
      color: '#1877f2',
      icon: <Fa name="facebook-f" size={16} />,
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`,
    },
    {
      name: 'WhatsApp',
      color: '#25d366',
      icon: <Fa name="whatsapp" size={16} />,
      url: `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + postUrl)}`,
    },
    {
      name: 'Telegram',
      color: '#229ed9',
      icon: <Fa name="telegram" size={16} />,
      url: `https://t.me/share/url?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(shareText)}`,
    },
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        className="fs-modal-in"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 380, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h4 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, margin: 0 }}>Compartilhar post</h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 14px' }}>Mande para amigos dentro ou fora do Friends Space.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginBottom: 16 }}>
          {networks.map((n) => (
            <button
              key={n.name}
              onClick={() => openShare(n.url)}
              title={n.name}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 4px', cursor: 'pointer', color: 'var(--text-primary)' }}
            >
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: n.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                {n.icon}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{n.name}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            value={postUrl}
            readOnly
            onFocus={(e) => e.target.select()}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 12, outline: 'none', minWidth: 0 }}
          />
          <button
            onClick={() => void copyLink()}
            style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: copied ? '#23a55a' : 'var(--accent)', color: copied ? '#fff' : '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
        <button
          onClick={() => onShareStory(post)}
          style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <CirclePlay size={15} strokeWidth={2} /> Postar no story
        </button>
      </div>
    </div>
  )
}
