import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { requestBackend } from '../../services/backend'
import { uploadToDrive } from '../../services/driveService'
import { MessageCircle, ArrowDownWideNarrow, ChevronDown, ChevronUp, Image, Smile, ThumbsUp, ThumbsDown, X, Reply, Send, Link2, Rocket } from 'lucide-react'
import { klipyEnabled } from '../../services/klipy'
import { nameStyleOf, nameClassOf, hasAstroBadge } from '../../utils/nameStyle'
import { KlipyPicker } from '../Chat/KlipyPicker'
import { VideoPlayer } from '../ui/VideoPlayer'
import type { PostComment, User } from '../../types'

export interface PostHeader {
  name: string
  photo: string
  sub: string
  content: string
  mediaUrl?: string
  mediaType?: 'image' | 'video'
}

interface Props {
  postId: string
  initial: PostComment[]
  users: User[]
  currentUserId: string
  header?: PostHeader
}

export const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😎','🤔','😴','😭','😡','👍','👎','👏','🙏','💪','🔥','✨','🎉','❤️','💔','💯','👀','🤝','👋','🙌','💤','🤯','🥳','😱','🤗','🤫','🤑','🤠','🥶','🥵','🤢','🤮','👻','💀','🤖','👽','🚀','🌟','💎','🎵','🎮','⚽','🏆','📸','🎁','💡','❓','❗','✅','❌','➡️','⬅️','⬆️','⬇️','🔁','💬']

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'agora'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}d`
  return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
}

function renderRich(text: string, users: User[]) {
  const parts = text.split(/(@[\p{L}\p{N}_]+)/gu)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const code = part.slice(1).toLowerCase()
      const match = users.find((u) => (u.friendCode || '').toLowerCase() === code)
      return (
        <span key={i} title={match?.name || part} style={{ color: 'var(--accent)', fontWeight: 700 }}>
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function PostComments({ postId, initial, users, currentUserId, header }: Props) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState(initial)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)
  const [gifUrl, setGifUrl] = useState('')
  const [photo, setPhoto] = useState<{ url: string; uploading: boolean } | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [sortNewest, setSortNewest] = useState(true)
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [repliesOpen, setRepliesOpen] = useState<string[]>([])
  const topComments = comments.filter(c => !c.parentId).sort((a, b) => (sortNewest ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  const repliesOf = (id: string) => comments.filter(c => c.parentId === id).sort((a, b) => a.createdAt - b.createdAt)
  const fmtYT = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace('.', ',').replace(',0', '')} mi`
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil`
    return `${n}`
  }
  const toggleId = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  const handleRate = async (commentId: string, kind: 'like' | 'dislike') => {
    if (!currentUserId) return
    const target = comments.find(c => c.id === commentId)
    if (!target) return
    const likes = target.likes || []
    const dislikes = target.dislikes || []
    const has = kind === 'like' ? likes.includes(currentUserId) : dislikes.includes(currentUserId)
    const next: 'like' | 'dislike' | 'none' = has ? 'none' : kind
    setComments(cs => cs.map(c => {
      if (c.id !== commentId) return c
      return {
        ...c,
        likes: next === 'like' ? [...likes.filter(v => v !== currentUserId), currentUserId] : likes.filter(v => v !== currentUserId),
        dislikes: next === 'dislike' ? [...dislikes.filter(v => v !== currentUserId), currentUserId] : dislikes.filter(v => v !== currentUserId),
      }
    }))
    try {
      const res = await requestBackend<{ comments: PostComment[] }>('ratePostComment', { userId: currentUserId, postId, commentId, rate: next })
      if (res?.comments) setComments(res.comments)
    } catch { /* mantém otimista */ }
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setComments(initial)
  }, [postId, initial])

  useEffect(() => {
    if (!open) {
      setShowEmoji(false)
      setShowGif(false)
      setMentionQuery(null)
    }
  }, [open ])

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || 'usuário'
  const photoOf = (id: string) => users.find((u) => u.id === id)?.photoUrl || ''
  const codeOf = (id: string) => users.find((u) => u.id === id)?.friendCode || ''

  const onInputChange = (v: string) => {
    setInput(v)
    const m = /@([\p{L}\p{N}_]*)$/u.exec(v)
    setMentionQuery(m ? m[1].toLowerCase() : null)
  }

  const mentionOptions = mentionQuery !== null
    ? users
      .filter((u) => u.id !== currentUserId && ((u.name || '').toLowerCase().includes(mentionQuery) || (u.friendCode || '').toLowerCase().includes(mentionQuery)))
      .slice(0, 5)
    : []

  const applyMention = (code: string) => {
    setInput((v) => v.replace(/@[\p{L}\p{N}_]*$/u, `@${code} `))
    setMentionQuery(null)
    inputRef.current?.focus()
  }

  const insertEmoji = (e: string) => {
    setInput((v) => (v + e).slice(0, 280))
    inputRef.current?.focus()
  }

  const handlePhoto = async (f: File | undefined) => {
    if (!f || !currentUserId) return
    setPhoto({ url: '', uploading: true })
    try {
      const url = await uploadToDrive(f, `comment-${Date.now()}.${f.name.split('.').pop() || 'jpg'}`, f.type || 'image/jpeg', 'comentarios')
      if (url) setPhoto({ url, uploading: false })
      else setPhoto(null)
    } catch {
      setPhoto(null)
    }
  }

  const handleSend = async () => {
    if (!currentUserId || sending || photo?.uploading || (!input.trim() && !photo?.url)) return
    setSending(true)
    try {
      const res = await requestBackend<{ comments: PostComment[] }>('addPostComment', {
        userId: currentUserId,
        postId,
        content: input.trim().slice(0, 280),
        imageUrl: photo?.url || '',
        parentId: replyTo?.id || '',
      })
      if (res?.comments) {
        setComments(res.comments)
        if (replyTo) setRepliesOpen(o => o.includes(replyTo.id) ? o : [...o, replyTo.id])
      }
      setInput('')
      setPhoto(null)
      setReplyTo(null)
      setShowEmoji(false)
      setShowGif(false)
    } finally {
      setSending(false)
    }
  }

  const addGif = () => {
    const url = gifUrl.trim()
    if (!/^https?:\/\//i.test(url)) return
    setPhoto({ url, uploading: false })
    setGifUrl('')
    setShowGif(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(!open)}
        title={open ? 'Ocultar comentários' : 'Ver comentários'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          color: open ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12.5, fontWeight: 700, padding: '2px 0',
        }}
      >
        <MessageCircle size={16} strokeWidth={2} />
        {comments.length === 0 ? 'Comentar' : `${comments.length} ${comments.length === 1 ? 'comentário' : 'comentários'}`}
      </button>

      {open && (
        <>
          <style>{`.fs-comments-drawer{position:fixed;top:72px;right:16px;bottom:16px;width:400px;max-width:calc(100vw - 32px);z-index:6000;border-radius:20px;overflow:hidden}@media (max-width:700px){.fs-comments-drawer{top:auto;left:12px;right:12px;bottom:12px;width:auto;max-height:78vh;border-radius:20px !important;}}`}</style>
          <div style={{ position: 'fixed', inset: 0, zIndex: 5999, background: 'rgba(0,0,0,.45)' }} onClick={() => setOpen(false)} />
          <div className="fs-comments-drawer" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.55)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
                Comentários {comments.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>· {comments.length}</span>}
              </span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setSortNewest(!sortNewest)} title={sortNewest ? 'Mais recentes primeiro' : 'Mais antigos primeiro'} className="fs-icon-btn" style={{ color: 'var(--text-muted)', cursor: 'pointer', width: 30, height: 30 }}>
                <ArrowDownWideNarrow size={15} strokeWidth={2} />
              </button>
              <button onClick={() => setOpen(false)} className="fs-icon-btn" style={{ color: 'var(--text-muted)', cursor: 'pointer', width: 30, height: 30 }}><X size={16} strokeWidth={2} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
              {header && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                  <Avatar src={header.photo} name={header.name} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}>
                      <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{header.name}</span>
                      {header.sub && <span style={{ color: 'var(--text-muted)' }}> {header.sub}</span>}
                    </div>
                    {header.content && (
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.5, wordBreak: 'break-word', marginTop: 2 }}>
                        {header.content}
                      </div>
                    )}
                    {header.mediaUrl && (
                      header.mediaType === 'video'
                        ? <VideoPlayer src={header.mediaUrl} maxHeight={220} />
                        : <img src={header.mediaUrl} alt="" style={{ marginTop: 6, maxWidth: '100%', maxHeight: 220, borderRadius: 10, objectFit: 'cover', display: 'block' }} />
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Respondendo a <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{header.name}</span></div>
                  </div>
                </div>
              )}
              {comments.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 0 10px' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 700 }}>Nenhum comentário ainda</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Seja a primeira pessoa a comentar</div>
                </div>
              )}
              {topComments.map((c) => {
                const replies = repliesOf(c.id)
                const open = repliesOpen.includes(c.id)
                const renderRow = (r: PostComment, nested: boolean) => {
                  const rl = r.likes || []
                  const rd = r.dislikes || []
                  const rLiked = rl.includes(currentUserId)
                  const rDisliked = rd.includes(currentUserId)
                  const rExpanded = expandedIds.includes(r.id)
                  const rLong = r.content.length > 140
                  return (
                    <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <Avatar src={photoOf(r.userId)} name={nameOf(r.userId)} size={nested ? 28 : 34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {(() => {
                            const cu = users.find(u => u.id === r.userId)
                            return (
                              <>
                                <span className={nameClassOf(cu)} style={{ fontWeight: 600, color: 'var(--text-primary)', ...nameStyleOf(cu) }}>{codeOf(r.userId) ? `@${codeOf(r.userId)}` : nameOf(r.userId)}</span>
                                {hasAstroBadge(cu) && <Rocket size={11} strokeWidth={2.5} color="var(--accent)" />}
                              </>
                            )
                          })()}
                          <span style={{ color: 'var(--text-muted)' }}> · {timeAgo(r.createdAt)}</span>
                        </div>
                        {r.content && (
                          <>
                            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.55, wordBreak: 'break-word', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: !rExpanded && rLong ? 3 : 'unset', WebkitBoxOrient: 'vertical' }}>
                              {renderRich(r.content, users)}
                            </div>
                            {rLong && (
                              <button onClick={() => toggleId(expandedIds, setExpandedIds, r.id)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 0' }}>
                                {rExpanded ? 'Mostrar menos' : 'Ler mais'}
                              </button>
                            )}
                          </>
                        )}
                        {r.imageUrl && (
                          <img src={r.imageUrl} alt="" style={{ marginTop: 6, maxWidth: '100%', maxHeight: 220, borderRadius: 10, objectFit: 'cover', display: 'block' }} />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <button onClick={() => void handleRate(r.id, 'like')} title="Gostei"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 7px', marginLeft: -7, borderRadius: 999, color: rLiked ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
                            <span key={rLiked ? 'l' : 'u'} className={rLiked ? 'fs-like-pop' : ''} style={{ display: 'inline-flex' }}>
                              <ThumbsUp size={15} strokeWidth={2} fill={rLiked ? 'currentColor' : 'none'} />
                            </span>
                            {rl.length > 0 && <span>{fmtYT(rl.length)}</span>}
                          </button>
                          <button onClick={() => void handleRate(r.id, 'dislike')} title="Não gostei"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 7px', borderRadius: 999, color: rDisliked ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
                            <ThumbsDown size={15} strokeWidth={2} fill={rDisliked ? 'currentColor' : 'none'} />
                            {rd.length > 0 && <span>{fmtYT(rd.length)}</span>}
                          </button>
                          <span style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px' }} />
                          <button onClick={() => { setReplyTo({ id: c.parentId || c.id, name: nameOf(r.userId) }); inputRef.current?.focus() }} title="Responder"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 999 }}>
                            <Reply size={14} strokeWidth={2} />
                            Responder
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={c.id}>
                    {renderRow(c, false)}
                    {replies.length > 0 && (
                      <div style={{ marginLeft: 44, marginTop: 6 }}>
                        {!open ? (
                          <button onClick={() => toggleId(repliesOpen, setRepliesOpen, c.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-block', width: 20, height: 1, background: 'var(--text-muted)' }} />
                            Mostrar {replies.length === 1 ? '1 resposta' : `${replies.length} respostas`}
                            <ChevronDown size={12} strokeWidth={2.5} />
                          </button>
                        ) : (
                          <>
                            <button onClick={() => toggleId(repliesOpen, setRepliesOpen, c.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <span style={{ display: 'inline-block', width: 20, height: 1, background: 'var(--text-muted)' }} />
                              Ocultar respostas
                              <ChevronUp size={12} strokeWidth={2.5} />
                            </button>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {replies.map(r => renderRow(r, true))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', position: 'sticky', bottom: 0, background: 'var(--bg-primary)', borderRadius: '0 0 20px 20px' }}>
              {mentionQuery !== null && mentionOptions.length > 0 && (
                <div style={{ position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 -8px 30px rgba(0,0,0,.5)' }}>
                  {mentionOptions.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => u.friendCode && applyMention(u.friendCode)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <Avatar src={u.photoUrl} name={u.name} size={24} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--accent)' }}>@{u.friendCode}</span>
                    </button>
                  ))}
                </div>
              )}
              {showEmoji && (
                <div className="fs-menu-in" style={{ position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, maxHeight: 188, overflowY: 'auto', boxShadow: '0 -8px 30px rgba(0,0,0,.5)' }}>
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => insertEmoji(e)} className="fs-emoji-btn" style={{ background: 'none', border: 'none', fontSize: 20, lineHeight: 1, cursor: 'pointer', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9 }}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {showGif && (
                <div style={{ position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                  {klipyEnabled() && <KlipyPicker kind="gifs" onPick={(url) => { setPhoto({ url, uploading: false }); setGifUrl(''); setShowGif(false) }} />}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={gifUrl}
                      onChange={(e) => setGifUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGif() } }}
                      placeholder="Cole o link do GIF..."
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', minWidth: 0 }}
                    />
                    <button onClick={addGif} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      OK
                    </button>
                  </div>
                </div>
              )}
              {photo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: 'var(--bg-tertiary)', borderRadius: 8, padding: 6 }}>
                  {photo.uploading ? (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 10px' }}>Enviando foto...</span>
                  ) : (
                    <>
                      <img src={photo.url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
                      <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Foto anexada</span>
                      <button onClick={() => setPhoto(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
                    </>
                  )}
                </div>
              )}
              {replyTo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>Respondendo a <b style={{ color: 'var(--accent)' }}>{replyTo.name}</b></span>
                  <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Avatar src={photoOf(currentUserId)} name={nameOf(currentUserId)} size={30} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px 4px 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleSend()
                      }
                    }}
                  placeholder="Adicione um comentário..."
                  maxLength={280}
                  style={{ flex: 1, padding: '5px 0', border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, outline: 'none', minWidth: 0 }}
                  />
                  <button onClick={() => { setShowEmoji(!showEmoji); setShowGif(false) }} title="Emoji" className="fs-icon-btn" style={{ color: 'var(--text-secondary)', cursor: 'pointer', width: 30, height: 30, flexShrink: 0 }}>
                    <Smile size={17} strokeWidth={2} />
                  </button>
                </div>
                <button
                  onClick={handleSend}
                  disabled={sending || !!photo?.uploading || (!input.trim() && !photo?.url)}
                  title="Enviar"
                  style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', border: 'none', borderRadius: 12, color: '#000', cursor: sending ? 'default' : 'pointer', opacity: (!input.trim() && !photo?.url) ? 0.5 : 1, flexShrink: 0, boxShadow: '0 2px 12px rgba(41,163,255,.22)' }}
                >
                  <Send size={17} strokeWidth={2} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginTop: 8, paddingLeft: 38 }}>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void handlePhoto(f) }} />
                <button onClick={() => fileRef.current?.click()} title="Foto" className="fs-icon-btn" style={{ color: 'var(--text-secondary)', cursor: 'pointer', width: 32, height: 32 }}>
                  <Image size={17} strokeWidth={2} />
                </button>
                <button onClick={() => { setShowGif(!showGif); setShowEmoji(false) }} title="GIF" style={{ background: showGif ? 'var(--bg-tertiary)' : 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 900, padding: 6, borderRadius: 6 }}>
                  GIF
                </button>
                <button onClick={() => { setShowEmoji(!showEmoji); setShowGif(false) }} title="Emoji" className="fs-icon-btn" style={{ background: showEmoji ? 'var(--bg-tertiary)' : 'none', color: 'var(--text-secondary)', cursor: 'pointer', width: 32, height: 32 }}>
                  <Smile size={17} strokeWidth={2} />
                </button>
                <button onClick={() => { setShowGif(!showGif); setShowEmoji(false) }} title="Colar link de mídia" className="fs-icon-btn" style={{ color: 'var(--text-secondary)', cursor: 'pointer', width: 32, height: 32 }}>
                  <Link2 size={17} strokeWidth={2} />
                </button>
                <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 6px' }} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
