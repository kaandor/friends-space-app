import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { Avatar } from '../ui/Avatar'
import { useUserStore } from '../../stores/userStore'
import { useServerStore } from '../../stores/serverStore'
import { requestBackend } from '../../services/backend'
import { uploadToDriveWithProgress, toImageUrl, isDriveConnected } from '../../services/driveService'
import { getAstroTier, assertUploadLimit } from '../../utils/astro'
import { Image, ListChecks, Smile, Calendar, MapPin, Flag, Paperclip, Repeat2, Heart, BarChart3, Bookmark, Upload, Search, Newspaper, X, Trash2, Rocket } from 'lucide-react'
import { klipyEnabled } from '../../services/klipy'
import { KlipyPicker } from '../Chat/KlipyPicker'
import { uiEnabled } from '../Profile/InterfaceTab'
import { nameStyleOf, nameClassOf, hasAstroBadge } from '../../utils/nameStyle'
import { PostComments, EMOJIS } from './PostComments'
import { PollView } from './PollView'
import { VideoPlayer } from '../ui/VideoPlayer'
import { SharePostModal } from './SharePostModal'
import { StoryCreatorModal } from './StoryCreatorModal'
import { renderAdSlot, adUnitProps } from '../../services/adsense'
import type { Post } from '../../types'

interface Props { onDriveRequired: () => void }

const HIGHLIGHT_RE = /((?:#[\p{L}\p{N}_]+))/gu
  const URL_RE = /https?:\/\/[^\s]+/

// Detecta o primeiro link no texto
function firstUrl(text: string): string | null {
  const m = text.match(URL_RE)
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null
}

// AdSlot: anúncio estilo X, escondido para usuários ASTRO (só plano grátis vê).
// Com ID do AdSense configurado (VITE_ADSENSE_CLIENT + VITE_ADSENSE_SLOT),
// renderiza o anúncio REAL do Google; sem ID, mostra o placeholder visual.
function AdSlot() {
  const { currentUser } = useUserStore()
  const insRef = useRef<HTMLModElement | null>(null)
  useEffect(() => {
    if (insRef.current) renderAdSlot(insRef.current)
  }, [])
  if (getAstroTier(currentUser) !== 'none') return null
  const ad = adUnitProps()
  return (
    <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 999 }}>Anúncio</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Patrocinado</span>
      </div>
      {ad ? (
        <div style={{ borderRadius: 10, overflow: 'hidden' }}>
          <ins
            ref={insRef}
            className="adsbygoogle"
            style={{ display: 'block', minHeight: 120 }}
            data-ad-client={ad.client}
            data-ad-slot={ad.slot}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 72, height: 72, borderRadius: 10, background: 'linear-gradient(135deg, #5865f2, #a855f7)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Espaço para seu anúncio</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>Este espaço usa Google AdSense — o anúncio aparece aqui no estilo do X para usuários do plano gratuito.</div>
          </div>
        </div>
      )}
    </div>
  )
}

// Player de link — YouTube iframe, TikTok card, ou OG card genérico
function LinkPlayer({ post }: { post: Post }) {
  if (!post.linkUrl) return null
  if (post.embedType === 'youtube' && post.linkUrl) {
    const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i.exec(post.linkUrl)
    const videoId = yt?.[1]
    if (videoId) {
      return (
        <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', maxWidth: 460, background: '#000' }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title={post.linkTitle || 'YouTube'}
            allowFullScreen
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        </div>
      )
    }
  }
  // Card genérico (TikTok, notícias, etc.)
  return (
    <a href={post.linkUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', marginTop: 8 }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', maxWidth: 460, background: 'var(--bg-tertiary)', transition: 'box-shadow .15s' }}
        onMouseOver={e => (e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)')}
        onMouseOut={e => (e.currentTarget.style.boxShadow = 'none')}>
        {post.linkImage && (
          <div style={{ width: '100%', height: 160, background: `url(${post.linkImage}) center/cover no-repeat`, backgroundSize: 'cover' }} />
        )}
        <div style={{ padding: '8px 10px' }}>
          {post.linkTitle && <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 2, lineHeight: 1.3 }}>{post.linkTitle}</div>}
          {post.linkDescription && <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 4 }}>{post.linkDescription}</div>}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{post.embedType === 'tiktok' ? 'TikTok' : post.linkUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</div>
        </div>
      </div>
    </a>
  )
}

export function FeedView({ onDriveRequired }: Props) {
  const { currentUser, users } = useUserStore()
  const [posts, setPosts] = useState<Post[]>([])
  const [trending, setTrending] = useState<Array<{ tag: string; count: number }>>([])
  const [news, setNews] = useState<Array<{ title: string; link: string; source: string; category: string; image: string; pubDate: string }>>([])
  const [newsOpen, setNewsOpen] = useState(false)
  const [showAllNews, setShowAllNews] = useState(false)
  const [hiddenNews, setHiddenNews] = useState<string[]>([])
  const [activeHashtag, setActiveHashtag] = useState('')
  const [composer, setComposer] = useState('')
  const [posting, setPosting] = useState(false)
  const [attachedFile, setAttachedFile] = useState<{ file: Blob; name: string; type: string } | null>(null)
  const [pollOpen, setPollOpen] = useState(false)
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [pollDays, setPollDays] = useState('1')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const [gifUrl, setGifUrl] = useState('')
  const [schedOpen, setSchedOpen] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [locOpen, setLocOpen] = useState(false)
  const [location, setLocation] = useState('')
  const [promoted, setPromoted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const [reportPostId, setReportPostId] = useState<string | null>(null)
  const [menuPostId, setMenuPostId] = useState<string | null>(null)
  const [view, setView] = useState<'recentes' | 'amigos' | 'mencoes'>('recentes')
  const scope: 'global' | 'amigos' = view === 'amigos' ? 'amigos' : 'global'
  const mentionsMe = (p: Post): boolean => {
    try {
      const hay = `${p.content || ''} ${(p.comments || []).map(c => (c as { content?: string }).content || '').join(' ')}`.toLowerCase()
      const names = [currentUser?.name || '', currentUser?.friendCode || ''].map(x => String(x).toLowerCase()).filter(Boolean)
      return names.some(n => hay.includes('@' + n))
    } catch { return false }
  }
  const listedPosts = view === 'mencoes' ? posts.filter(mentionsMe) : posts
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTab, setSearchTab] = useState<'principal' | 'recente' | 'pessoas' | 'midia' | 'servidores'>('principal')
  const [foundServers, setFoundServers] = useState<Array<{ id: string; name: string; photoUrl: string; members: number; inviteCode: string; verified: boolean; member: boolean; category: string; tags: string[]; description: string }>>([])
  const { servers, joinServer } = useServerStore()
  const [suggested, setSuggested] = useState<Array<{ id: string; name: string; photoUrl: string; members: number; inviteCode: string; verified: boolean; member: boolean; category: string; tags: string[]; description: string }>>([])
  const [showAllSug, setShowAllSug] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const isMobileFeed = useIsMobile(900)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  useEffect(() => {
    if (!currentUser) return
    void (async () => {
      try {
        const r = await requestBackend<{ servers: Array<{ id: string; name: string; photoUrl: string; members: number; inviteCode: string; verified: boolean; member: boolean; category: string; tags: string[]; description: string }> }>('getSuggestedServers', { userId: currentUser.id })
        setSuggested(r?.servers || [])
      } catch { /* ignore */ }
    })()
  }, [currentUser])
  const handleFollow = async (s: { id: string; inviteCode: string }) => {
    if (!currentUser || joiningId) return
    setJoiningId(s.id)
    try {
      const r = await joinServer(s.inviteCode || '', currentUser.id, s.id)
      if (r?.ok) {
        setSuggested(list => list.map(x => x.id === s.id ? { ...x, member: true, members: x.members + 1 } : x))
      } else if (r?.error) {
        try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: r.error })) } catch { }
      }
    } finally { setJoiningId(null) }
  }
  const [sharePost, setSharePost] = useState<Post | null>(null)
  const [storyPost, setStoryPost] = useState<Post | null>(null)
  const contentRestricted = Boolean(currentUser?.flags?.contentRestricted)

  const refreshFeed = useCallback(async (append = false, tag = activeHashtag) => {
    if (!currentUser) return
    setLoading(true)
    try {
      const last = append && posts.length > 0 ? posts[posts.length - 1] as Post & { score?: number } : null
      const res = await requestBackend<{ posts: Post[] }>('getFeed', { userId: currentUser?.id || '', limit: 25, beforeScore: last && typeof last.score === 'number' ? last.score : undefined, beforeId: last?.id, hashtag: tag || undefined, scope, search: searchQuery || undefined, sort: searchTab === 'recente' ? 'recent' : undefined, mediaOnly: searchTab === 'midia' ? true : undefined, kind: searchTab === 'pessoas' ? 'user' : undefined })
      const newPosts = res?.posts || []
      setPosts(p => append ? [...p, ...newPosts] : newPosts)
      if (newPosts.length < 25) setHasMore(false)
      else setHasMore(true)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [currentUser, activeHashtag, scope, searchQuery, searchTab])

  useEffect(() => {
    if (searchQuery && searchTab === 'servidores') return
    setPosts([]); setHasMore(true); void refreshFeed(false)
  }, [activeHashtag, scope, searchQuery, searchTab])
  // Refresh automatico do feed a cada 5s (silencioso: sem skeleton, sem
  // pulo de scroll). Pausa com busca, postando ou aba oculta.
  useEffect(() => {
    const t = window.setInterval(() => {
      try {
        if (document.visibilityState !== 'visible') return
        if (searchQuery || posting) return
        if (searchTab === 'pessoas' || searchTab === 'servidores') return
        void (async () => {
          try {
            const res = await requestBackend<{ posts: Post[] }>('getFeed', { userId: currentUser?.id || '', limit: 25, scope, sort: searchTab === 'recente' ? 'recent' : undefined, mediaOnly: searchTab === 'midia' ? true : undefined })
            const fresh = res?.posts || []
            if (fresh.length > 0) setPosts(fresh)
          } catch { /* mantem lista atual */ }
        })()
      } catch { }
    }, 5000)
    return () => window.clearInterval(t)
  }, [searchQuery, posting, searchTab, scope, currentUser])
  useEffect(() => {
    if (!currentUser || !searchQuery) return
    if (searchTab === 'servidores') {
      void (async () => {
        try {
          const r = await requestBackend<{ servers: Array<{ id: string; name: string; photoUrl: string; members: number; inviteCode: string; verified: boolean; member: boolean; category: string; tags: string[]; description: string }> }>('searchServers', { userId: currentUser.id, q: searchQuery })
          setFoundServers(r?.servers || [])
        } catch { /* ignore */ }
      })()
    }
  }, [currentUser, searchQuery, searchTab])

  const refreshTrending = useCallback(async () => {
    try {
      const res = await requestBackend<{ trending: Array<{ tag: string; count: number }> }>('getTrending', {})
      setTrending(res?.trending || [])
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { void refreshTrending() }, [refreshTrending])
  useEffect(() => {
    void (async () => {
      try {
        const res = await requestBackend<{ news: Array<{ title: string; link: string; source: string; category: string; image: string; pubDate: string }> }>('getNews', {})
        setNews(res?.news || [])
      } catch { /* sem noticias: mantem hashtags */ }
    })()
  }, [])
  const visibleNews = news.filter(n => !hiddenNews.includes(n.link))

  const handlePost = async () => {
    if (posting) return
    const pollOpts = pollOpen ? pollOptions.map(o => o.trim()).filter(Boolean) : []
    if (!currentUser || (!composer.trim() && !attachedFile && !gifUrl.trim() && !genericFile && pollOpts.length < 2)) return
    let text = composer.trim()
    const url = firstUrl(text) || ''

    // Se tem mídia anexada e precisa do Drive, abre o gate
    if ((attachedFile || genericFile) && !isDriveConnected()) { onDriveRequired(); return }

    // Limite do plano (Astro) antes de subir: gratis 25MB, ASTRO 250MB, ASTRO+ 1GB, Plus 5GB.
    for (const f of [attachedFile, genericFile]) {
      if (!f) continue
      const blocked = assertUploadLimit(currentUser, f.file.size)
      if (blocked) {
        try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: blocked })) } catch { }
        setPosting(false)
        return
      }
    }
    setPosting(true)
    setUploadPct(null)
    const upProgress = (pct: number) => setUploadPct(pct)
    try {
      let mediaUrl = gifUrl.trim()
      let mediaType: 'image' | 'video' = 'image'
      if (attachedFile) {
        const u = await uploadToDriveWithProgress(attachedFile.file, attachedFile.name, attachedFile.type, 'posts', undefined, upProgress)
        if (u) { mediaUrl = u; mediaType = attachedFile.type.startsWith('video') ? 'video' : 'image' }
      }
      if (genericFile) {
        const isMedia = genericFile.type.startsWith('image/') || genericFile.type.startsWith('video/')
        const u = await uploadToDriveWithProgress(genericFile.file, genericFile.name, isMedia ? genericFile.type : 'application/octet-stream', 'posts', undefined, upProgress)
        if (u) {
          if (genericFile.type.startsWith('video/')) { mediaUrl = u; mediaType = 'video' }
          else if (genericFile.type.startsWith('image/')) { if (!mediaUrl) mediaUrl = u }
          else text = `${text}
${u}`.trim().slice(0, 500)
        }
      }

      // Preview do link (se houver URL no texto)
      let linkData: Record<string, unknown> = {}
      if (url) {
        try {
          const preview = await requestBackend<{ preview: Record<string, unknown> | null }>('getLinkPreview', { url })
          if (preview?.preview) {
            linkData = {
              linkUrl: preview.preview.url,
              linkTitle: preview.preview.title,
              linkImage: preview.preview.image,
              linkDescription: preview.preview.description,
              embedType: preview.preview.embedType,
            }
          }
        } catch { /* fallback: sem preview */ }
      }

      const sched = scheduledAt ? new Date(scheduledAt).getTime() : 0
      await requestBackend('createPost', {
        userId: currentUser.id, content: text, mediaUrl, type: mediaType,
        pollOptions: pollOpts.length >= 2 ? pollOpts : undefined,
        pollDays: Number(pollDays) || 1,
        scheduledFor: sched > Date.now() ? sched : 0,
        location: location.trim(),
        promoted,
        ...linkData,
      })
      setComposer('')
      setAttachedFile(null)
      setGenericFile(null)
      setUploadPct(null)
      setGifUrl('')
      setPollOpen(false)
      setPollOptions(['', ''])
      setScheduledAt('')
      setLocation('')
      setPromoted(false)
      setEmojiOpen(false)
      setGifOpen(false)
      setSchedOpen(false)
      setLocOpen(false)
      await refreshFeed(false, activeHashtag)
      void refreshTrending()
    } finally { setPosting(false); setUploadPct(null) }
  }

  const pendingVotes = useRef(new Set<string>())
  const handleLike = async (postId: string) => {
    if (!currentUser || pendingVotes.current.has(postId)) return
    pendingVotes.current.add(postId)
    try {
      await requestBackend('togglePostLike', { userId: currentUser.id, postId })
      setPosts(p => p.map(post => {
        if (post.id !== postId) return post
        const likes = post.likes.includes(currentUser.id)
          ? post.likes.filter(id => id !== currentUser.id)
          : [...post.likes, currentUser.id]
        return { ...post, likes }
      }))
    } finally {
      pendingVotes.current.delete(postId)
    }
  }

  const handleRepost = async (postId: string) => {
    if (!currentUser || pendingVotes.current.has(postId)) return
    pendingVotes.current.add(postId)
    try {
      await requestBackend('toggleRepost', { userId: currentUser.id, postId })
      setPosts(p => p.map(post => {
        if (post.id !== postId) return post
        const reposts = post.reposts?.includes(currentUser.id)
          ? post.reposts.filter(id => id !== currentUser.id)
          : [...(post.reposts || []), currentUser.id]
        return { ...post, reposts }
      }))
    } finally {
      pendingVotes.current.delete(postId)
    }
  }

  const fmtCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace('.', ',').replace(',0', '')}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil`
    return `${n}`
  }
  const toolBtn = (active: boolean) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: active ? 'var(--bg-tertiary)' : 'none', border: 'none', cursor: 'pointer', color: active ? 'var(--accent)' : 'var(--text-muted)', borderRadius: 999 }) as const
  const actionBtn = (color: string) => ({ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 7px', marginLeft: -7, borderRadius: 999, color, fontSize: 12, fontWeight: 500 }) as const
  const [genericFile, setGenericFile] = useState<{ file: Blob; name: string; type: string } | null>(null)
  const VIDEO_URL_RE = /https?:\/\/[^\s]+?\.(mp4|webm|mov|m4v)(\?[^\s]*)?/gi
  const videoUrlsIn = (text: string, exclude?: string) => {
    const out: string[] = []
    for (const m of text.matchAll(VIDEO_URL_RE)) {
      const u = m[0]
      if (u !== exclude && !out.includes(u) && out.length < 2) out.push(u)
    }
    return out
  }
  const fileAnyRef = useRef<HTMLInputElement>(null)
  const trackedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!currentUser || posts.length === 0) return
    const fresh = posts.map(p => p.id).filter(id => !trackedRef.current.has(id))
    if (fresh.length === 0) return
    fresh.forEach(id => trackedRef.current.add(id))
    void (async () => {
      try {
        const res = await requestBackend<{ views: Record<string, number> }>('trackPostViews', { userId: currentUser.id, ids: fresh })
        if (res?.views) setPosts(ps => ps.map(p => res.views[p.id] !== undefined ? { ...p, views: res.views[p.id] } : p))
      } catch { /* ignore */ }
    })()
  }, [posts, currentUser])
  const userById = (id: string) => users.find(u => u.id === id)
  const serverById = (id: string) => servers.find(s => s.id === id)
  const authorOf = (post: Post) => {
    if (post.authorKind === 'server') {
      const s = serverById(post.authorId)
      return { name: s?.name || 'Servidor', photo: s?.photoUrl || '', sub: s ? `${s.members.length} membro${s.members.length === 1 ? '' : 's'}` : '', isServer: true }
    }
    const u = userById(post.authorId)
    return { name: u?.name || 'Desconhecido', photo: u?.photoUrl || '', sub: u?.friendCode ? `@${u.friendCode}` : '', isServer: false }
  }
  const handleBookmark = async (postId: string) => {
    if (!currentUser) return
    const res = await requestBackend<{ bookmarked: boolean }>('toggleBookmark', { userId: currentUser.id, postId })
    const marked = res?.bookmarked
    useUserStore.setState(s => s.currentUser ? { currentUser: { ...s.currentUser, bookmarks: marked ? [...(s.currentUser.bookmarks || []), postId] : (s.currentUser.bookmarks || []).filter(b => b !== postId) } } : s)
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts); const diff = Date.now() - ts
    if (diff < 60000) return 'agora'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const renderContent = (text: string) => {
    if (!text) return null
    const parts = text.split(HIGHLIGHT_RE)
    return parts.map((part, i) => {
      if (part.startsWith('#')) {
        const tag = part.toLowerCase()
        return <button key={i} onClick={() => setActiveHashtag(activeHashtag === tag ? '' : tag)}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' }}>{part}</button>
      }
      // URL inline
      if (URL_RE.test(part)) {
        return <span key={i} style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{part}</span>
      }
      return <span key={i}>{part}</span>
    })
  }


  return (
    <div style={{ display: 'flex', gap: 16, padding: '10px 16px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Feed central */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minHeight: 0 }}>
        {searchQuery ? (
          <div style={{ background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
              <button onClick={() => { setSearchQuery(''); setSearchInput(''); setSearchTab('principal') }} title="Voltar ao feed"
                style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 15, padding: 4 }}>←</button>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{searchQuery}</span>
              <button onClick={() => { setSearchQuery(''); setSearchInput(''); setSearchTab('principal') }} title="Limpar busca"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 8px', borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
              {([['principal', 'Principal'], ['recente', 'Mais recente'], ['pessoas', 'Pessoas'], ['midia', 'Mídia'], ['servidores', 'Servidores']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setSearchTab(k)}
                  style={{ padding: '10px 12px', background: 'none', border: 'none', borderBottom: searchTab === k ? '2px solid var(--accent)' : '2px solid transparent', color: searchTab === k ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', padding: '4px 12px 0' }}>
            {([['recentes', 'Recentes'], ['amigos', 'Amigos'], ['mencoes', 'Menções']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '10px 4px 8px', background: 'none', border: 'none', borderBottom: view === v ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', fontWeight: 800, fontSize: 13, color: view === v ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {label}
              </button>
            ))}
          </div>
        )}
        {!searchQuery && isMobileFeed && (
          <div style={{ background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px 8px', fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>O que está acontecendo</div>
            {visibleNews.slice(0, 3).map(n => (
              <button key={n.link || n.title} onClick={() => { if (n.link) window.open(n.link, '_blank', 'noopener') }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: n.link ? 'pointer' : 'default', padding: '8px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{n.source || n.category || 'Notícias'}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.35 }}>{n.title}</div>
              </button>
            ))}
            {trending.slice(0, 3).map(t => (
              <button key={t.tag} onClick={() => setActiveHashtag(activeHashtag === t.tag ? '' : t.tag)}
                style={{ display: 'flex', width: '100%', alignItems: 'baseline', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', textAlign: 'left' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>{t.tag}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t.count} posts</span>
              </button>
            ))}
            {visibleNews.length === 0 && trending.length === 0 && (
              <div style={{ padding: '4px 14px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Nenhum assunto em alta ainda.</div>
            )}
          </div>
        )}
        {!searchQuery && isMobileFeed && (
          <div style={{ background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px 4px', fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Quem seguir</div>
            {suggested.filter(s => !s.member).slice(0, 3).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px' }}>
                <Avatar src={s.photoUrl} name={s.name} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.members} membros</div>
                </div>
                <button onClick={() => void handleFollow(s)} disabled={joiningId === s.id}
                  style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)', fontWeight: 800, fontSize: 12, cursor: 'pointer', opacity: joiningId === s.id ? 0.5 : 1 }}>
                  {joiningId === s.id ? '...' : 'Seguir'}
                </button>
              </div>
            ))}
            {suggested.filter(s => !s.member).length === 0 && (
              <div style={{ padding: '4px 14px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Você já segue tudo por aqui.</div>
            )}
            <div style={{ height: 8 }} />
          </div>
        )}
        {!searchQuery && (
        <>
        {/* Composer */}
        <div style={{ background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', padding: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Avatar src={currentUser?.photoUrl || ''} name={currentUser?.name || ''} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea value={composer} onChange={e => setComposer(e.target.value)} maxLength={500} rows={2}
                placeholder="O que está acontecendo?"
                style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', resize: 'none', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5 }} />
              {firstUrl(composer) && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '3px 8px', borderRadius: 999, background: 'var(--bg-tertiary)', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                  🔗 Link detectado
                </div>
              )}
              {pollOpen && (
                <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg-tertiary)' }}>
                  {pollOptions.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input value={opt} onChange={e => setPollOptions(o => o.map((x, j) => j === i ? e.target.value : x))} maxLength={100} placeholder={`Opção ${i + 1}`}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions(o => o.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
                      )}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {pollOptions.length < 4 && (
                      <button onClick={() => setPollOptions(o => [...o, ''])} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+ Adicionar opção</button>
                    )}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Duração:</span>
                    <select value={pollDays} onChange={e => setPollDays(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12 }}>
                      <option value="1">1 dia</option>
                      <option value="3">3 dias</option>
                      <option value="7">7 dias</option>
                    </select>
                    <button onClick={() => { setPollOpen(false); setPollOptions(['', '']) }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Remover</button>
                  </div>
                </div>
              )}
              {gifUrl.trim() && (
                <div style={{ position: 'relative', display: 'inline-block', marginTop: 8 }}>
                  <img src={gifUrl.trim()} alt="GIF" style={{ maxWidth: 220, maxHeight: 160, borderRadius: 10, objectFit: 'cover', display: 'block' }} />
                  <button onClick={() => setGifUrl('')} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.7)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              )}
              {(scheduledAt || location.trim() || promoted) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {scheduledAt && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--bg-tertiary)', borderRadius: 999, padding: '4px 10px' }}>
                      🕒 {new Date(scheduledAt).toLocaleDateString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      <button onClick={() => setScheduledAt('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', marginLeft: 4 }}>✕</button>
                    </span>
                  )}
                  {location.trim() && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--bg-tertiary)', borderRadius: 999, padding: '4px 10px' }}>
                      📍 {location.trim().slice(0, 30)}
                      <button onClick={() => setLocation('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', marginLeft: 4 }}>✕</button>
                    </span>
                  )}
                  {promoted && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#000', background: 'var(--accent)', borderRadius: 999, padding: '4px 10px' }}>
                      📣 Divulgado
                      <button onClick={() => setPromoted(false)} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', marginLeft: 4 }}>✕</button>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 0, marginTop: 8, paddingLeft: 46 }}>
            <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => {
              const f = e.target.files?.[0]; if (f) { setAttachedFile({ file: f, name: `post-${Date.now()}.${f.name.split('.').pop()}`, type: f.type }); setGifUrl('') }
              e.target.value = ''
            }} />
            <button onClick={() => { if (contentRestricted) return; fileRef.current?.click() }} title={contentRestricted ? 'Mídia bloqueada (restrição de conteúdo)' : 'Foto ou vídeo'} style={{ ...toolBtn(false), opacity: contentRestricted ? 0.4 : 1 }}>
              <Image size={17} strokeWidth={2} />
            </button>
            <input ref={fileAnyRef} type="file" style={{ display: 'none' }} onChange={e => {
              const f = e.target.files?.[0]; if (f) setGenericFile({ file: f, name: `arquivo-${Date.now()}.${f.name.split('.').pop()}`, type: f.type || '' })
              e.target.value = ''
            }} />
            <button onClick={() => fileAnyRef.current?.click()} title="Anexar arquivo" style={toolBtn(false)}>
              <Paperclip size={17} strokeWidth={2} />
            </button>
            <button onClick={() => { setGifOpen(g => !g); setEmojiOpen(false); setSchedOpen(false); setLocOpen(false) }} title="GIF" style={{ background: gifOpen ? 'var(--bg-tertiary)' : 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 900, padding: 6, color: 'var(--text-muted)', borderRadius: 6 }}>
              GIF
            </button>
            <button onClick={() => setPollOpen(p => !p)} title="Enquete" style={toolBtn(pollOpen)}>
              <ListChecks size={17} strokeWidth={2} />
            </button>
            <button onClick={() => { setEmojiOpen(e => !e); setGifOpen(false); setSchedOpen(false); setLocOpen(false) }} title="Emoji" style={toolBtn(emojiOpen)}>
              <Smile size={17} strokeWidth={2} />
            </button>
            <button onClick={() => { setSchedOpen(s => !s); setEmojiOpen(false); setGifOpen(false); setLocOpen(false) }} title="Agendar post" style={toolBtn(Boolean(schedOpen || scheduledAt))}>
              <Calendar size={17} strokeWidth={2} />
            </button>
            <button onClick={() => { setLocOpen(l => !l); setEmojiOpen(false); setGifOpen(false); setSchedOpen(false) }} title="Localização" style={toolBtn(Boolean(locOpen || location.trim()))}>
              <MapPin size={17} strokeWidth={2} />
            </button>
            <button onClick={() => setPromoted(p => !p)} title="Divulgar conteúdo" style={toolBtn(promoted)}>
              <Flag size={17} strokeWidth={2} />
            </button>
            {attachedFile && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{attachedFile.name.slice(0, 18)} <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button></span>
            )}
            {uploadPct !== null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                <span style={{ display: 'inline-block', width: 90, height: 5, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden', verticalAlign: 'middle' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.min(100, uploadPct)}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 0.2s' }} />
                </span>
                {Math.min(100, uploadPct)}%
              </span>
            )}
            {genericFile && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>📎 {genericFile.name.slice(0, 18)} <button onClick={() => setGenericFile(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button></span>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: composer.length > 450 ? '#ef4444' : 'var(--text-muted)', fontWeight: 600, marginRight: 8 }}>{composer.length}/500</span>
            <select value={view === 'amigos' ? 'amigos' : 'recentes'} onChange={e => setView(e.target.value === 'amigos' ? 'amigos' : 'recentes')}
              title="Quem pode ver"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none', marginRight: 8 }}>
              <option value="recentes">🌐 Todos</option>
              <option value="amigos">🔒 Amigos</option>
            </select>
            <button onClick={handlePost} disabled={posting || (!composer.trim() && !attachedFile && !gifUrl.trim() && !genericFile && pollOptions.filter(o => o.trim()).length < 2)}
              style={{ padding: '9px 22px', background: 'var(--accent)', border: 'none', borderRadius: 999, color: '#000', fontWeight: 800, fontSize: 13, letterSpacing: '0.01em', cursor: 'pointer', boxShadow: '0 2px 14px rgba(41,163,255,.22)', opacity: posting || (!composer.trim() && !attachedFile && !gifUrl.trim() && !genericFile && pollOptions.filter(o => o.trim()).length < 2) ? 0.5 : 1 }}>
              {posting ? 'Postando...' : scheduledAt ? 'Agendar' : 'Postar'}
            </button>
            {emojiOpen && (
              <div className="fs-menu-in" style={{ position: 'absolute', top: '100%', left: 40, zIndex: 30, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, maxHeight: 208, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.5)' }}>
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setComposer(c => (c + e).slice(0, 500))} className="fs-emoji-btn" style={{ background: 'none', border: 'none', fontSize: 20, lineHeight: 1, cursor: 'pointer', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9 }}>{e}</button>
                ))}
              </div>
            )}
            {gifOpen && (
              <div className="fs-menu-in" style={{ position: 'absolute', top: '100%', left: 40, zIndex: 30, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, width: 300, maxHeight: 320, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.5)' }}>
                {klipyEnabled() && <KlipyPicker kind="gifs" onPick={(url) => { setGifUrl(url); setAttachedFile(null); setGifOpen(false) }} />}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={gifUrl} onChange={e => setGifUrl(e.target.value)} placeholder="Cole o link do GIF..." style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', minWidth: 0 }} />
                  <button onClick={() => { if (gifUrl.trim()) setAttachedFile(null); setGifOpen(false) }} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>OK</button>
                </div>
              </div>
            )}
            {schedOpen && (
              <div className="fs-menu-in" style={{ position: 'absolute', top: '100%', left: 40, zIndex: 30, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, display: 'flex', gap: 6, alignItems: 'center', boxShadow: '0 12px 40px rgba(0,0,0,.5)' }}>
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                <button onClick={() => setSchedOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>OK</button>
              </div>
            )}
            {locOpen && (
              <div className="fs-menu-in" style={{ position: 'absolute', top: '100%', left: 40, zIndex: 30, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, display: 'flex', gap: 6, width: 280, boxShadow: '0 12px 40px rgba(0,0,0,.5)' }}>
                <input value={location} onChange={e => setLocation(e.target.value)} maxLength={100} placeholder="Onde você está?" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none', minWidth: 0 }} />
                <button onClick={() => setLocOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>OK</button>
              </div>
            )}
          </div>
        </div>
        </>
        )}

        {/* Posts + Ads (ou resultados da busca) */}
        {!uiEnabled(currentUser, 'feed') && !searchQuery && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 32, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12 }}>
            Feed desativado. Ative em Perfil → Interface.
          </div>
        )}
        {(uiEnabled(currentUser, 'feed') || searchQuery) && (<>
        {searchQuery && searchTab === 'pessoas' && posts.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>Ninguém opinou sobre “{searchQuery}” ainda.</div>
        )}
        {searchQuery && searchTab === 'servidores' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {foundServers.length === 0 && !loading && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>Nenhum servidor encontrado para “{searchQuery}”.</div>
            )}
            {foundServers.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', padding: 12 }}>
                <Avatar src={s.photoUrl} name={s.name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name} {s.verified && <span style={{ color: 'var(--accent)' }}>✔</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                    {s.category && <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--accent)', color: '#000', borderRadius: 4, padding: '1px 6px' }}>{s.category}</span>}
                    {(s.tags || []).slice(0, 3).map(tag => (
                      <span key={tag} style={{ fontSize: 10, color: 'var(--accent)' }}>#{tag}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.members} membro{s.members === 1 ? '' : 's'}{s.description ? ` · ${s.description.slice(0, 60)}` : ''}</div>
                </div>
                {s.member ? (
                  <span style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 800, fontSize: 12 }}>Seguindo</span>
                ) : (
                  <button onClick={() => void (async () => {
                    if (!currentUser || joiningId) return
                    setJoiningId(s.id)
                    try {
                      const r = await joinServer(s.inviteCode || '', currentUser.id, s.id)
                      if (r?.ok) setFoundServers(list => list.map(x => x.id === s.id ? { ...x, member: true, members: x.members + 1 } : x))
                      else if (r?.error) {
                        try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: r.error })) } catch { }
                      }
                    } finally { setJoiningId(null) }
                  })()} disabled={joiningId === s.id}
                    style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)', fontWeight: 800, fontSize: 12, cursor: 'pointer', opacity: joiningId === s.id ? 0.5 : 1 }}>
                    {joiningId === s.id ? '...' : 'Seguir'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : listedPosts.map((post, i) => (
          <div key={post.id}>
            {i > 0 && i % 5 === 0 && <AdSlot />}
            <div style={{ background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', padding: 12, transition: 'background .15s', position: 'relative' }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseOut={e => e.currentTarget.style.background = 'var(--bg-primary)'}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Avatar src={authorOf(post).photo} name={authorOf(post).name} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {(() => {
                      const au = post.authorKind === 'server' ? undefined : userById(post.authorId)
                      return (
                        <>
                          <span className={nameClassOf(au)} style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)', letterSpacing: '-0.005em', ...nameStyleOf(au) }}>{authorOf(post).name}</span>
                          {hasAstroBadge(au) && <Rocket size={12} strokeWidth={2.5} color="var(--accent)" style={{ flexShrink: 0 }} />}
                        </>
                      )
                    })()}
                    {authorOf(post).isServer && <span style={{ fontSize: 9, fontWeight: 800, background: 'var(--accent)', color: '#000', borderRadius: 4, padding: '1px 5px' }}>SERVIDOR</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{authorOf(post).sub}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {formatTime(post.createdAt)}</span>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => setMenuPostId(menuPostId === post.id ? null : post.id)} title="Mais opções"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: '2px 6px', lineHeight: 1 }}>
                      ⋯
                    </button>
                  </div>
                  {menuPostId === post.id && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setMenuPostId(null)} />
                      <div className="fs-menu-in" style={{ position: 'absolute', top: 34, right: 8, zIndex: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.5)', minWidth: 160, overflow: 'hidden' }}>
                        {post.authorId === currentUser?.id && (
                          <button onClick={() => void (async () => {
                            setMenuPostId(null)
                            if (!currentUser || !window.confirm('Apagar esta postagem?')) return
                            setPosts(ps => ps.filter(p => p.id !== post.id))
                            await requestBackend('deletePost', { userId: currentUser.id, postId: post.id }).catch(() => null)
                            void refreshFeed(false, activeHashtag)
                          })()}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                            <Trash2 size={13} strokeWidth={2} /> Apagar postagem
                          </button>
                        )}
                        <button onClick={() => { setMenuPostId(null); setReportPostId(post.id) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                          <Flag size={13} strokeWidth={2} /> Denunciar post
                        </button>
                      </div>
                    </>
                  )}
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)', marginBottom: 6 }}>{renderContent(post.content)}</div>
                  {/* Link embed (YouTube iframe ou card genérico) */}
                  <LinkPlayer post={post} />
                  {/* Mídia anexada (Drive) */}
                  {post.mediaUrl && (
                    post.type === 'video'
                      ? <VideoPlayer src={post.mediaUrl} maxHeight={280} />
                      : <img src={toImageUrl(post.mediaUrl)} alt="" style={{ maxWidth: 460, width: '100%', maxHeight: 280, borderRadius: 12, objectFit: 'cover', marginTop: 6, display: 'block' }} />
                  )}
                  {videoUrlsIn(post.content || '', post.mediaUrl).map(u => (
                    <VideoPlayer key={u} src={u} maxHeight={280} />
                  ))}
                  {(post.location || post.promoted || (post.scheduledFor || 0) > Date.now()) && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {post.location && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📍 {post.location}</span>}
                      {post.promoted && <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--accent)', color: '#000', borderRadius: 4, padding: '1px 6px' }}>📣 DIVULGADO</span>}
                      {(post.scheduledFor || 0) > Date.now() && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)' }}>🕒 AGENDADO</span>}
                    </div>
                  )}
                  {post.poll && <PollView post={post} currentUserId={currentUser?.id || ''} onVoted={p => setPosts(ps => ps.map(x => x.id === p.id ? p : x))} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
                    <PostComments postId={post.id} initial={post.comments} users={users} currentUserId={currentUser?.id || ''} header={{ name: authorOf(post).name, photo: authorOf(post).photo, sub: authorOf(post).sub, content: post.content, mediaUrl: post.mediaUrl, mediaType: post.type }} />
                    <button onClick={() => void handleRepost(post.id)} title="Repostar" style={actionBtn(post.reposts?.includes(currentUser?.id || '') ? '#23a55a' : 'var(--text-muted)')}>
                      <Repeat2 size={16} strokeWidth={2} /> <span>{fmtCount(post.reposts?.length || 0)}</span>
                    </button>
                    <button onClick={() => void handleLike(post.id)} title="Curtir" style={actionBtn(post.likes.includes(currentUser?.id || '') ? '#ef4444' : 'var(--text-muted)')}>
                      <span key={post.likes.includes(currentUser?.id || '') ? 'liked' : 'unliked'} className={post.likes.includes(currentUser?.id || '') ? 'fs-like-pop' : ''} style={{ display: 'inline-flex' }}>
                        <Heart size={16} strokeWidth={2} fill={post.likes.includes(currentUser?.id || '') ? 'currentColor' : 'none'} />
                      </span>
                      <span>{fmtCount(post.likes.length)}</span>
                    </button>
                    <span title="Visualizações" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
                      <BarChart3 size={16} strokeWidth={2} /> <span>{fmtCount(post.views || 0)}</span>
                    </span>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => void handleBookmark(post.id)} title="Favoritar" style={actionBtn((currentUser?.bookmarks || []).includes(post.id) ? 'var(--accent)' : 'var(--text-muted)')}>
                      <Bookmark size={16} strokeWidth={2} fill={(currentUser?.bookmarks || []).includes(post.id) ? 'currentColor' : 'none'} />
                    </button>
                    <button onClick={() => setSharePost(post)} title="Compartilhar" style={actionBtn('var(--text-muted)')}>
                      <Upload size={16} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
        {searchQuery && searchTab !== 'servidores' && searchTab !== 'pessoas' && posts.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>Nenhum post encontrado para “{searchQuery}”.</div>
        )}
        {!searchQuery && posts.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '36px 20px', border: '1px dashed var(--border)', borderRadius: 14, marginTop: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Feed tranquilo por aqui</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 14px' }}>Entre num servidor público para ver movimento e chamar gente pra call.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => window.dispatchEvent(new CustomEvent('friends-space:open-discover'))} style={{ background: 'var(--accent)', color: '#04120a', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                Explorar servidores
              </button>
              <button onClick={() => {
                const target = suggested.find(s => !s.member && s.inviteCode) || suggested[0]
                if (!target || !currentUser) return
                setJoiningId(target.id)
                void joinServer(target.inviteCode || '', currentUser.id, target.id).finally(() => setJoiningId(null))
              }} disabled={joiningId !== null} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Entrar na Praça
              </button>
            </div>
          </div>
        )}
        {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>Carregando...</div>}
        {!searchQuery && view === 'mencoes' && listedPosts.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 28 }}>Nenhuma menção a você ainda.</div>
        )}
        {hasMore && !loading && listedPosts.length > 0 && !(searchQuery && searchTab === 'servidores') && view !== 'mencoes' && (
          <button onClick={() => void refreshFeed(true, activeHashtag)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 0', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%' }}>
            Carregar mais
          </button>
        )}
        </>)}
      </div>

      {newsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px 16px' }} onClick={() => setNewsOpen(false)}>
          <div className="fs-modal-in" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '75vh', overflowY: 'auto', padding: '16px 18px', boxShadow: '0 24px 80px rgba(0,0,0,.55)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Today's News</h3>
              <button onClick={() => setNewsOpen(false)} className="fs-icon-btn" style={{ color: 'var(--text-muted)', cursor: 'pointer', width: 30, height: 30 }}><X size={16} strokeWidth={2} /></button>
            </div>
            {news.slice(0, 5).map(n => {
              const ts = Date.parse(n.pubDate || '')
              return (
                <div key={n.link} onClick={() => { if (n.link) window.open(n.link, '_blank', 'noopener') }}
                  style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: n.link ? 'pointer' : 'default' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.4, color: 'var(--text-primary)' }}>{n.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <Avatar src="" name={n.source || 'N'} size={18} />
                    <span>{!isNaN(ts) ? formatTime(ts) : n.source}</span>
                    {n.category && <span>· {n.category}</span>}
                    {n.source && !isNaN(ts) && <span>· {n.source}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {sharePost && (
        <SharePostModal
          post={sharePost}
          authorName={sharePost.authorKind === 'server' ? (serverById(sharePost.authorId)?.name || 'Servidor') : (users.find(u => u.id === sharePost.authorId)?.name || 'Alguém')}
          currentUserId={currentUser?.id || ''}
          onClose={() => setSharePost(null)}
          onShareStory={(post) => { setSharePost(null); setStoryPost(post) }}
        />
      )}
      {storyPost && (
        <StoryCreatorModal
          sharedPost={storyPost}
          sharedPostAuthorName={storyPost.authorKind === 'server' ? serverById(storyPost.authorId)?.name : users.find(u => u.id === storyPost.authorId)?.name}
          onClose={() => setStoryPost(null)}
          onPublished={() => { setStoryPost(null); void refreshFeed(false, activeHashtag) }}
        />
      )}

      {/* Modal de denúncia */}
      {reportPostId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setReportPostId(null)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 380, padding: 20 }} onClick={e => e.stopPropagation()}>
            <h4 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, margin: '0 0 4px' }}>Denunciar post</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 14px' }}>Selecione o motivo. Duas denúncias em conteúdos do mesmo perfil ativam a restrição de mídia.</p>
            {['Spam', 'Conteúdo inapropriado', 'Desinformação', 'Assédio', 'Outro'].map(reason => (
              <button key={reason} onClick={() => void (async () => {
                if (currentUser) await requestBackend('reportPost', { userId: currentUser.id, postId: reportPostId, reason })
                setReportPostId(null)
              })()}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}>
                {reason}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trending — "O que está acontecendo" (estilo X: notícias + hashtags) */}
      <style>{`.fs-feed-trending{display:block}@media (max-width:900px){.fs-feed-trending{display:none}}`}</style>
      <div style={{ width: 260, flexShrink: 0, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 16 }} className="fs-feed-trending">
      {/* Pesquisa do feed (estilo X) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', borderRadius: 999, border: '1px solid var(--border)', padding: '4px 6px 4px 12px' }}>
        <span style={{ color: 'var(--text-muted)', display: 'inline-flex', flexShrink: 0 }}><Search size={14} strokeWidth={2} /></span>
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && searchInput.trim().length >= 2) { setSearchQuery(searchInput.trim()); setSearchTab('principal') } }}
          placeholder="Pesquisar" maxLength={80}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13 }} />
        {searchInput && (
          <button onClick={() => { setSearchInput(''); setSearchQuery(''); setSearchTab('principal') }} title="Limpar"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: '6px 8px', flexShrink: 0 }}>✕</button>
        )}
        <button onClick={() => { if (searchInput.trim().length >= 2) { setSearchQuery(searchInput.trim()); setSearchTab('principal') } }} title="Buscar"
          style={{ border: 'none', borderRadius: 999, background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 12, padding: '7px 14px', cursor: 'pointer', flexShrink: 0 }}>
          Buscar
        </button>
      </div>
      {uiEnabled(currentUser, 'trending') && (
      <div style={{ background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <h4 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, margin: '0', padding: '12px 14px 8px', borderBottom: '1px solid var(--border)' }}>
          O que está acontecendo
        </h4>
        {trending.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, padding: '12px 14px' }}>Nenhum assunto em alta ainda. Seja o primeiro a postar!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {trending.map((t, idx) => (
              <button key={t.tag} onClick={() => setActiveHashtag(activeHashtag === t.tag ? '' : t.tag)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)', transition: 'background .15s' }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, minWidth: 16 }}>{idx + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: activeHashtag === t.tag ? 'var(--accent)' : 'var(--text-primary)', fontWeight: 700, fontSize: 13 }}>{t.tag}</span>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{t.count} posts</div>
                </div>
              </button>
            ))}
            {activeHashtag && (
              <button onClick={() => setActiveHashtag('')} style={{ padding: '10px 14px', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left' }}>
                Limpar filtro
              </button>
            )}
          </div>
        )}
      </div>
      )}
      {uiEnabled(currentUser, 'news') && visibleNews.length > 0 && (
        <div style={{ background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 4px' }}>
            <h4 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, margin: 0, flex: 1 }}>
              Notícias do dia
            </h4>
            <button onClick={() => setNewsOpen(true)} title="Today's News — resumo das notícias" className="fs-icon-btn"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', width: 28, height: 28 }}>
              <Newspaper size={14} strokeWidth={2} />
            </button>
          </div>
          {(showAllNews ? visibleNews : visibleNews.slice(0, 5)).map(n => (
            <div key={n.link} onClick={() => { if (n.link) window.open(n.link, '_blank', 'noopener') }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', cursor: n.link ? 'pointer' : 'default', borderBottom: '1px solid var(--border)', transition: 'background .15s' }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{[n.category, n.source].filter(Boolean).join(' · ') || 'Notícias'}</div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13, lineHeight: 1.35, marginTop: 1 }}>{n.title}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); setHiddenNews(h => [...h, n.link]) }} title="Ver menos"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}>⋯</button>
            </div>
          ))}
          {visibleNews.length > 5 && (
            <button onClick={() => setShowAllNews(s => !s)} style={{ padding: '10px 14px', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left' }}>
              {showAllNews ? 'Ver menos' : 'Ver mais'}
            </button>
          )}
        </div>
      )}
      {uiEnabled(currentUser, 'suggested') && (
      <div style={{ background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <h4 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, margin: 0, padding: '12px 14px 4px' }}>
          Quem seguir
        </h4>
        {suggested.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, padding: '4px 14px 12px' }}>Nenhum servidor por aqui ainda.</p>
        )}
        {(showAllSug ? suggested : suggested.slice(0, 3)).map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
            <Avatar src={s.photoUrl} name={s.name} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name} {s.verified && <span style={{ color: 'var(--accent)' }}>✔</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.category ? `${s.category} · ` : ''}{s.members} membro{s.members === 1 ? '' : 's'}</div>
            </div>
            {s.member ? (
              <span style={{ padding: '6px 14px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 800, fontSize: 12 }}>
                Seguindo
              </span>
            ) : (
              <button onClick={() => void handleFollow(s)} disabled={joiningId === s.id}
                style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)', fontWeight: 800, fontSize: 12, cursor: 'pointer', opacity: joiningId === s.id ? 0.5 : 1 }}>
                {joiningId === s.id ? '...' : 'Seguir'}
              </button>
            )}
          </div>
        ))}
        {suggested.length > 3 && (
          <button onClick={() => setShowAllSug(v => !v)} style={{ padding: '10px 14px', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left' }}>
            {showAllSug ? 'Ver menos' : 'Mostrar mais'}
          </button>
        )}
      </div>
      )}
      </div>
    </div>
  )
}