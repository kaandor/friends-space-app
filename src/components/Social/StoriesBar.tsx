import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { useUserStore } from '../../stores/userStore'
import { Ban } from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'
import { requestBackend } from '../../services/backend'
import { uploadToDrive, isDriveConnected } from '../../services/driveService'
import { StoryViewer } from './StoryViewer'
import { StoryCreatorModal } from './StoryCreatorModal'
import { PostViewModal } from './PostViewModal'
import type { Story } from '../../types'

interface Props {
  onDriveRequired: () => void
  // Incrementado pela FriendsView quando o Google Drive conecta: reenvia o
  // story que estava pendente (escolhido antes do login do Drive).
  driveConnectedSignal?: number
}

export function StoriesBar({ onDriveRequired, driveConnectedSignal = 0 }: Props) {
  const { currentUser, users } = useUserStore()
  const [stories, setStories] = useState<Story[]>([])
  const [viewerGroup, setViewerGroup] = useState<{ group: Array<{ user: { id: string; name: string; photoUrl: string }; items: Story[] }>; index: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [needsRefresh, setNeedsRefresh] = useState(0)
  const contentRestricted = Boolean(currentUser?.flags?.contentRestricted)
  const pendingFileRef = useRef<File[]>([])
  const [creatorMedia, setCreatorMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null)
  const [creatorPhotos, setCreatorPhotos] = useState<{ url: string; type: 'image' | 'video' }[] | null>(null)
  const [postModalId, setPostModalId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!currentUser) return
    try {
      const res = await requestBackend<{ stories: Story[] }>('getStories', { userId: currentUser.id })
      setStories(res?.stories || [])
    } catch { /* ignore */ }
  }, [currentUser])

  useEffect(() => { void refresh() }, [refresh, needsRefresh])
  // refresh periódico (stories expiram em 24h)
  useEffect(() => {
    const t = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(t)
  }, [refresh])

  const userById = (id: string) => users.find(u => u.id === id) || null
  const { servers } = useServerStore()

  // agrupa por autor (usuário ou servidor), ordenado pelo mais recente
  const grouped = stories.reduce<Array<{ user: { id: string; name: string; photoUrl: string }; items: Story[] }>>((acc, s) => {
    if (s.authorKind === 'server') {
      const srv = servers.find(x => x.id === s.userId)
      if (!srv) return acc
      const existing = acc.find(g => g.user.id === srv.id)
      if (existing) existing.items.push(s)
      else acc.push({ user: { id: srv.id, name: srv.name, photoUrl: srv.photoUrl }, items: [s] })
      return acc
    }
    const u = userById(s.userId)
    if (!u) return acc
    const existing = acc.find(g => g.user.id === u.id)
    if (existing) existing.items.push(s)
    else acc.push({ user: { id: u.id, name: u.name, photoUrl: u.photoUrl }, items: [s] })
    return acc
  }, [])
  grouped.sort((a, b) => b.items[0].createdAt - a.items[0].createdAt)

  const hasOwn = grouped.some(g => g.user.id === currentUser?.id)

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 5)
    e.target.value = ''
    if (files.length === 0 || !currentUser) return
    if (!isDriveConnected()) {
      pendingFileRef.current = files
      onDriveRequired()
      return
    }
    setUploading(true)
    try {
      const uploaded: { url: string; type: 'image' | 'video' }[] = []
      for (const file of files) {
        const mime = file.type || (file.name.match(/\.(mp4|mov|webm|mkv)$/i) ? 'video/mp4' : 'image/jpeg')
        const url = await uploadToDrive(file, `story-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`, mime, 'stories')
        if (url) uploaded.push({ url, type: mime.startsWith('video') ? 'video' : 'image' })
      }
      if (uploaded.length > 0) setCreatorPhotos(uploaded)
    } finally {
      setUploading(false)
    }
  }

  // Quando o Drive conectar, reenvia os stories pendentes automaticamente
  // (todos os arquivos, pelo fluxo multi de creatorPhotos).
  useEffect(() => {
    if (driveConnectedSignal && pendingFileRef.current.length > 0) {
      const files = pendingFileRef.current
      pendingFileRef.current = []
      void (async () => {
        setUploading(true)
        try {
          const uploaded: { url: string; type: 'image' | 'video' }[] = []
          for (const file of files) {
            const mime = file.type || (file.name.match(/\.(mp4|mov|webm|mkv)$/i) ? 'video/mp4' : 'image/jpeg')
            const url = await uploadToDrive(file, `story-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`, mime, 'stories')
            if (url) uploaded.push({ url, type: mime.startsWith('video') ? 'video' : 'image' })
          }
          if (uploaded.length > 0) setCreatorPhotos(uploaded)
        } finally {
          setUploading(false)
        }
      })()
    }
  }, [driveConnectedSignal])

  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 14px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handlePick} />
      {contentRestricted ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, opacity: 0.45 }} title="Conta em restrição de conteúdo — stories bloqueadas">
          <div style={{ position: 'relative', width: 48, height: 48 }}>
            <div className="fs-story-ring" style={{ width: 48, height: 48, borderRadius: '50%', padding: 2, background: 'var(--bg-tertiary)' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--bg-secondary)' }}>
                <Avatar src={currentUser?.photoUrl || ''} name={currentUser?.name || 'U'} size={44} />
              </div>
            </div>
            <span style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: '#ed4245', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-secondary)' }}><Ban size={9} strokeWidth={3} /></span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Bloqueado</span>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: uploading ? 'default' : 'pointer', flexShrink: 0, opacity: uploading ? 0.5 : 1 }}
          title={uploading ? 'Enviando...' : 'Adicionar story'}
        >
          <div style={{ position: 'relative', width: 48, height: 48 }}>
            <div className="fs-story-ring" style={{ width: 48, height: 48, borderRadius: '50%', padding: 2, background: hasOwn ? 'linear-gradient(135deg, #f58529, #dd2a7b, #8134af)' : 'var(--bg-tertiary)' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--bg-secondary)' }}>
                <Avatar src={currentUser?.photoUrl || ''} name={currentUser?.name || 'U'} size={44} />
              </div>
            </div>
            <span style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-secondary)' }}>
              {uploading ? <span className="inline-spinner" style={{ width: 10, height: 10 }} /> : '+'}
            </span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hasOwn ? 'Seu story' : uploading ? '...' : 'Novo'}</span>
        </button>
      )}
      {grouped.map((g, idx) => (
        <button
          key={g.user.id}
          onClick={() => setViewerGroup({ group: grouped, index: idx })}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
        >
          <div className="fs-story-ring" style={{ width: 48, height: 48, borderRadius: '50%', padding: 2, background: g.user.id === currentUser?.id ? 'transparent' : 'linear-gradient(135deg, #f58529, #dd2a7b, #8134af)' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--bg-secondary)' }}>
              <Avatar src={g.user.photoUrl} name={g.user.name} size={44} />
            </div>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.user.name}</span>
        </button>
      ))}
      {viewerGroup && (
        <StoryViewer
          group={viewerGroup.group[viewerGroup.index]}
          onClose={() => setViewerGroup(null)}
          onDelete={() => {
            setViewerGroup(null)
            setNeedsRefresh(n => n + 1)
          }}
          onMessage={(user) => {
            try {
              const full = users.find((u) => u.id === user.id)
              window.dispatchEvent(new CustomEvent('friends-space:open-dm', { detail: { user: full || { ...user, friendCode: '', photoUrl: user.photoUrl } } }))
            } catch {}
            setViewerGroup(null)
          }}
          onOpenPost={(postId) => setPostModalId(postId)}
          onReposted={() => setNeedsRefresh((n) => n + 1)}
        />
      )}
      {(creatorMedia || creatorPhotos) && (
        <StoryCreatorModal
          mediaUrl={creatorMedia?.url}
          mediaType={creatorMedia?.type}
          initialPhotos={creatorPhotos || undefined}
          onClose={() => { setCreatorMedia(null); setCreatorPhotos(null) }}
          onPublished={() => { setCreatorMedia(null); setCreatorPhotos(null); setNeedsRefresh((n) => n + 1) }}
        />
      )}
      {postModalId && (
        <PostViewModal postId={postModalId} onClose={() => setPostModalId(null)} />
      )}
    </div>
  )
}