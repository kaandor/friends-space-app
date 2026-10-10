import { useRef, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { useUserStore } from '../../stores/userStore'
import { requestBackend } from '../../services/backend'
import { uploadToDrive, isDriveConnected } from '../../services/driveService'
import { Image } from 'lucide-react'
import { DriveRequiredModal } from '../Chat/DriveRequiredModal'
import type { Server } from '../../types'

interface Props {
  server: Server
  initialMode?: 'post' | 'story'
  onClose: () => void
  onPublished: () => void
}

export function ServerPostModal({ server, initialMode = 'post', onClose, onPublished }: Props) {
  const { currentUser } = useUserStore()
  const [mode, setMode] = useState<'post' | 'story'>(initialMode)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [driveOpen, setDriveOpen] = useState(false)
  const [attachedFile, setAttachedFile] = useState<{ file: Blob; name: string; type: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const publish = async () => {
    if (!currentUser || (!text.trim() && !attachedFile)) return
    if (attachedFile && !isDriveConnected()) { setDriveOpen(true); return }
    setPosting(true)
    try {
      let mediaUrl = ''
      let mediaType: 'image' | 'video' = 'image'
      if (attachedFile) {
        const u = await uploadToDrive(attachedFile.file, attachedFile.name, attachedFile.type, mode === 'story' ? 'stories' : 'posts')
        if (u) { mediaUrl = u; mediaType = attachedFile.type.startsWith('video') ? 'video' : 'image' }
      }
      if (mode === 'post') {
        await requestBackend('createPost', { userId: server.id, authorKind: 'server', content: text.trim(), mediaUrl, type: mediaType })
      } else {
        if (!mediaUrl) return
        await requestBackend('addStory', { userId: server.id, authorKind: 'server', mediaUrl, type: mediaType, caption: text.trim().slice(0, 200), visibility: 'global' })
      }
      onPublished()
    } finally { setPosting(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="fs-modal-in" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 460, padding: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Avatar src={server.photoUrl || ''} name={server.name} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{server.members.length} membro{server.members.length === 1 ? '' : 's'} · postando como servidor</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['post', 'story'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: mode === m ? 'var(--accent)' : 'var(--bg-tertiary)', color: mode === m ? '#000' : 'var(--text-secondary)' }}>
              {m === 'post' ? 'Post no feed' : 'Story (24h)'}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={500} rows={3}
          placeholder={mode === 'post' ? `Novidade de ${server.name}...` : 'Legenda do story...'}
          style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', outline: 'none', resize: 'none', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5, padding: 10, boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => {
              const f = e.target.files?.[0]; if (f) setAttachedFile({ file: f, name: `server-${Date.now()}.${f.name.split('.').pop()}`, type: f.type })
              e.target.value = ''
            }} />
            <button onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 18, padding: '4px 6px' }} title="Anexar mídia">
              <Image size={17} strokeWidth={2} />
            </button>
            {attachedFile && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{attachedFile.name.slice(0, 25)} <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button></span>
            )}
          </div>
          <DriveRequiredModal open={driveOpen} onClose={() => setDriveOpen(false)} onConnected={() => setDriveOpen(false)} />
          <button onClick={() => void publish()} disabled={posting || (!text.trim() && !attachedFile) || (mode === 'story' && !attachedFile)}
            style={{ padding: '8px 20px', background: 'var(--accent)', border: 'none', borderRadius: 999, color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: posting || (!text.trim() && !attachedFile) ? 0.5 : 1 }}>
            {posting ? 'Publicando...' : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
