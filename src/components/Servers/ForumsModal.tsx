import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Lock, MessageSquare, Plus, Send, Trash2, X } from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'
import { isServerOwnerOrStaff } from '../../config/permissions'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import type { ServerForumThread } from '../../types'

function formatWhen(ts: number, translate: (key: string) => string): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return translate('time.now')
  if (diff < 3600000) return `${Math.floor(diff / 60000)} ${translate('time.min')}`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${translate('time.hour')}`
  return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

export function ForumsModal({ onClose }: { onClose: () => void }) {
  const currentServer = useServerStore(s => s.currentServer)
  const currentUser = useUserStore(s => s.currentUser)
  const t = useLangStore(s => s.t)
  const addForumThread = useServerStore(s => s.addForumThread)
  const addForumReply = useServerStore(s => s.addForumReply)
  const deleteForumThread = useServerStore(s => s.deleteForumThread)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setThreadId(null)
    setCreating(false)
    setError('')
  }, [currentServer?.id])

  const threads = useMemo(() => {
    return [...(currentServer?.forums || [])].sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1
      return b.updatedAt - a.updatedAt
    })
  }, [currentServer])

  const thread = threads.find(item => item.id === threadId) || null
  const isStaff = isServerOwnerOrStaff(currentServer, currentUser?.id)
  const replyCount = (count: number) => `${count} ${count === 1 ? t('forums.reply') : t('forums.replies')}`

  async function submitThread() {
    if (!currentUser || !currentServer || busy) return
    if (title.trim().length < 3 || body.trim().length < 3) {
      setError(t('forums.createError'))
      return
    }
    setBusy(true)
    setError('')
    const result = await addForumThread(currentServer.id, title.trim(), body.trim())
    setBusy(false)
    if (!result.ok) {
      setError(result.error || t('forums.publishError'))
      return
    }
    setTitle('')
    setBody('')
    setCreating(false)
  }

  async function submitReply() {
    if (!currentUser || !currentServer || !thread || busy) return
    if (!reply.trim()) return
    setBusy(true)
    setError('')
    const result = await addForumReply(currentServer.id, thread.id, reply.trim())
    setBusy(false)
    if (!result.ok) {
      setError(result.error || t('forums.replyError'))
      return
    }
    setReply('')
  }

  async function removeThread(target: ServerForumThread) {
    if (!currentServer || busy) return
    if (!window.confirm(`${t('forums.confirmDelete')} “${target.title}”?`)) return
    setBusy(true)
    setError('')
    const result = await deleteForumThread(currentServer.id, target.id)
    setBusy(false)
    if (!result.ok) {
      setError(result.error || t('forums.deleteError'))
      return
    }
    setThreadId(null)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={onClose}>
      <div className="fs-modal-in" onMouseDown={event => event.stopPropagation()} style={{ width: 'min(680px, 100%)', height: 'min(720px, calc(100vh - 40px))', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          {thread ? (
            <button onClick={() => setThreadId(null)} title={t('modal.back')} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowLeft size={16} /></button>
          ) : (
            <span style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--accent)' }}><MessageSquare size={17} /></span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread ? thread.title : t('forums.title')}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 2 }}>{thread ? `${thread.authorName} · ${formatWhen(thread.createdAt, t)}` : currentServer?.name || t('forums.noServerTitle')}</div>
          </div>
          {!thread && currentServer && (
            <Button size="sm" onClick={() => { setCreating(value => !value); setError('') }}><Plus size={14} /> {t('forums.newTopic')}</Button>
          )}
          <button onClick={onClose} title={t('modal.close')} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 20px' }}>
          {!currentServer ? (
            <EmptyState icon={<MessageSquare size={21} />} title={t('forums.noServerTitle')} description={t('forums.noServerBody')} />
          ) : creating ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={120}
                placeholder={t('forums.titlePlaceholder')}
                autoFocus
                style={{ width: '100%', padding: '11px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
              />
              <textarea
                value={body}
                onChange={event => setBody(event.target.value)}
                maxLength={5000}
                rows={8}
                placeholder={t('forums.bodyPlaceholder')}
                style={{ width: '100%', padding: '11px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12.5, lineHeight: 1.55, resize: 'vertical', outline: 'none' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <small style={{ color: 'var(--text-dim)', fontSize: 10.5 }}>{body.length}/5000</small>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="secondary" onClick={() => setCreating(false)} disabled={busy}>{t('forums.cancel')}</Button>
                  <Button size="sm" onClick={() => { void submitThread() }} disabled={busy}>{busy ? t('forums.publishing') : t('forums.publish')}</Button>
                </div>
              </div>
            </div>
          ) : thread ? (
            <div>
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.65, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                {thread.body}
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>{replyCount(thread.replies.length)}</div>
                {thread.replies.map(item => (
                  <div key={item.id} className="fs-forum-reply">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.authorPhoto ? <img src={item.authorPhoto} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} /> : null}
                      <strong style={{ color: 'var(--text-primary)', fontSize: 11.5 }}>{item.authorName}</strong>
                      <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{formatWhen(item.createdAt, t)}</span>
                    </div>
                    <div style={{ marginTop: 5, color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{item.content}</div>
                  </div>
                ))}
                {thread.replies.length === 0 && <div style={{ padding: '14px 0', color: 'var(--text-muted)', fontSize: 12 }}>{t('forums.firstReply')}</div>}
              </div>
              {thread.locked && !isStaff ? (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: 11.5 }}><Lock size={13} /> {t('forums.locked')}</div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    value={reply}
                    onChange={event => setReply(event.target.value)}
                    maxLength={3000}
                    rows={3}
                    placeholder={t('forums.replyPlaceholder')}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 7 }}>
                    <Button size="sm" onClick={() => { void submitReply() }} disabled={busy || !reply.trim()}><Send size={13} /> {busy ? t('forums.sending') : t('forums.replyBtn')}</Button>
                  </div>
                </div>
              )}
              {(isStaff || thread.authorId === currentUser?.id) && (
                <button
                  type="button"
                  onClick={() => { void removeThread(thread) }}
                  disabled={busy}
                  style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer', padding: 0 }}
                >
                  <Trash2 size={12} /> {t('forums.delete')}
                </button>
              )}
            </div>
          ) : threads.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={21} />}
              title={t('forums.emptyTitle')}
              description={t('forums.emptyBody')}
              action={<Button size="sm" onClick={() => setCreating(true)}><Plus size={14} /> {t('forums.emptyAction')}</Button>}
            />
          ) : (
            <div>
              {threads.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="fs-forum-thread"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => setThreadId(item.id)}
                >
                  <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.pinned ? <span style={{ color: 'var(--accent)', fontSize: 10 }}>{t('forums.pinned')}</span> : null}
                    {item.title}
                    {item.locked ? <Lock size={12} /> : null}
                  </strong>
                  <p>{item.body}</p>
                  <div className="fs-forum-meta">
                    <span>{item.authorName}</span>
                    <span>·</span>
                    <span>{formatWhen(item.updatedAt, t)}</span>
                    <span>·</span>
                    <span>{replyCount(item.replies.length)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {error && <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', color: '#fca5a5', fontSize: 11.5 }}>{error}</div>}
        </div>
      </div>
    </div>
  )
}

