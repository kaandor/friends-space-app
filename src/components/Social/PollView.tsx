import { useState } from 'react'
import { requestBackend } from '../../services/backend'
import type { Post } from '../../types'

interface Props {
  post: Post
  currentUserId: string
  onVoted?: (post: Post) => void
}

export function PollView({ post, currentUserId, onVoted }: Props) {
  const [voting, setVoting] = useState(false)
  const poll = post.poll
  if (!poll) return null
  const total = poll.options.reduce((n, o) => n + (o.votes?.length || 0), 0)
  const mine = poll.options.findIndex(o => (o.votes || []).includes(currentUserId))
  const closed = Date.now() > (poll.endsAt || 0)

  const vote = async (i: number) => {
    if (!currentUserId || voting || closed) return
    setVoting(true)
    try {
      const res = await requestBackend<{ poll: Post['poll'] }>('votePoll', { userId: currentUserId, postId: post.id, option: i })
      if (res?.poll && onVoted) onVoted({ ...post, poll: res.poll })
    } finally { setVoting(false) }
  }

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {poll.options.map((o, i) => {
        const pct = total > 0 ? Math.round(((o.votes?.length || 0) / total) * 100) : 0
        const voted = mine === i
        return (
          <button key={i} onClick={() => void vote(i)} disabled={voting || closed}
            style={{ position: 'relative', overflow: 'hidden', textAlign: 'left', border: voted ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius: 999, background: 'var(--bg-tertiary)', cursor: closed ? 'default' : 'pointer', padding: '8px 12px' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: voted ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'color-mix(in srgb, var(--accent) 15%, transparent)' }} />
            <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              <span>{voted && '✓ '}{o.text}</span>
              <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
            </span>
          </button>
        )
      })}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total} voto{total === 1 ? '' : 's'} · {closed ? 'Enquete encerrada' : `Encerra ${new Date(poll.endsAt).toLocaleDateString([], { day: '2-digit', month: 'short' })}`}</div>
    </div>
  )
}
