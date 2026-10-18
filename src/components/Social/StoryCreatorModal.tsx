import { useRef, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { requestBackend } from '../../services/backend'
import { useUserStore } from '../../stores/userStore'
import { toImageUrl, uploadToDrive } from '../../services/driveService'
import { EmojiPicker } from '../Chat/EmojiPicker'
import { Fa } from '../../utils/fa'
import type { Post, StoryOverlayStyle } from '../../types'

interface Props {
  mediaUrl?: string
  mediaType?: 'image' | 'video'
  initialPhotos?: { url: string; type: 'image' | 'video' }[]
  sharedPost?: Post | null
  sharedPostAuthorName?: string
  onClose: () => void
  onPublished: () => void
}

const COLORS = ['#ffffff', '#29A3FF', '#ffd400', '#ff5fa2', '#4fc3f7', '#ff6b6b', '#0a0a0a']
const FONTS = [
  { id: 'sans', label: 'Padrão', css: "Inter, system-ui, sans-serif" },
  { id: 'serif', label: 'Clássica', css: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Máquina', css: "'Courier New', monospace" },
  { id: 'fun', label: 'Pop', css: "'Comic Sans MS', 'Chalkboard SE', cursive" },
]
const BACKGROUNDS = [
  'linear-gradient(135deg, #1a0533, #7c3aed)',
  'linear-gradient(135deg, #052e2b, #14b8a6)',
  'linear-gradient(135deg, #3b0a0a, #ef4444)',
  'linear-gradient(135deg, #0a0a23, #3b82f6)',
  'linear-gradient(135deg, #2b1055, #ec4899)',
  'linear-gradient(135deg, #111111, #555555)',
]
const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: 'uppercase',
  marginBottom: 8,
}

interface PhotoItem {
  url: string
  type: 'image' | 'video'
}

export function StoryCreatorModal({ mediaUrl, mediaType, initialPhotos, sharedPost, sharedPostAuthorName, onClose, onPublished }: Props) {
  const { currentUser } = useUserStore()
  const [text, setText] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(24)
  const [bold, setBold] = useState(true)
  const [font, setFont] = useState(FONTS[0].id)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [bg, setBg] = useState(0)
  const [visibility, setVisibility] = useState<'friends' | 'global'>('friends')
  const [publishing, setPublishing] = useState(false)
  const [photos, setPhotos] = useState<PhotoItem[]>(
    initialPhotos && initialPhotos.length > 0
      ? initialPhotos
      : mediaUrl ? [{ url: mediaUrl, type: mediaType || 'image' }] : []
  )
  const [activePhoto, setActivePhoto] = useState(0)
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(false)
  const fileImgRef = useRef<HTMLInputElement>(null)
  const fileVidRef = useRef<HTMLInputElement>(null)

  const fontCss = FONTS.find((f) => f.id === font)?.css || FONTS[0].css
  const active = photos[Math.min(activePhoto, Math.max(0, photos.length - 1))] || null
  const hasMedia = Boolean(active)
  const overlayStyle: StoryOverlayStyle = {
    color,
    size,
    bold,
    position: (pos ? pos.y : 30) > 55 ? 'bottom' : 'top',
    font,
    x: pos ? Math.round(pos.x) : 50,
    y: pos ? Math.round(pos.y) : 30,
  }

  const onPreviewPointer = (e: React.PointerEvent) => {
    const el = previewRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.min(90, Math.max(10, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.min(90, Math.max(10, ((e.clientY - rect.top) / rect.height) * 100))
    setPos({ x: Math.round(x), y: Math.round(y) })
  }

  const handleAddMedia = async (f: File | undefined, kind: 'image' | 'video') => {
    if (!f || uploadingMedia) return
    setUploadingMedia(true)
    try {
      const ext = f.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')
      const url = await uploadToDrive(f, `story-${Date.now()}.${ext}`, f.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'), 'stories')
      if (url) {
        setPhotos((prev) => { setActivePhoto(prev.length); return [...prev, { url, type: kind }] })
      }
    } finally {
      setUploadingMedia(false)
    }
  }

  const publish = async () => {
    if (!currentUser || publishing) return
    if (photos.length === 0 && !sharedPost && !text.trim()) return
    setPublishing(true)
    try {
      const targets: PhotoItem[] = photos.length > 0 ? photos : [{ url: '', type: 'image' as const }]
      for (const ph of targets) {
        await requestBackend('addStory', {
          userId: currentUser.id,
          mediaUrl: ph.url,
          type: ph.type,
          sharedPostId: sharedPost?.id || '',
          overlayText: text.trim(),
          overlayStyle,
          visibility,
        })
      }
      onPublished()
    } finally {
      setPublishing(false)
    }
  }

  const canPublish = photos.length > 0 || sharedPost || text.trim().length > 0
  const textPos = pos || { x: 50, y: 30 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(4,6,10,.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 20, flexWrap: 'wrap', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }} onClick={(e) => e.stopPropagation()}>
        <div
          ref={previewRef}
          onPointerDown={(e) => {
            if (!(e.target as HTMLElement).closest('button')) {
              dragRef.current = true
              ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
              onPreviewPointer(e)
            }
          }}
          onPointerMove={(e) => {
            if (dragRef.current) onPreviewPointer(e)
          }}
          onPointerUp={() => { dragRef.current = false }}
          onPointerCancel={() => { dragRef.current = false }}
          style={{
            width: 300,
            height: 540,
            borderRadius: 24,
            overflow: 'hidden',
            position: 'relative',
            flexShrink: 0,
            background: hasMedia ? '#000' : BACKGROUNDS[bg],
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 24px 80px rgba(0,0,0,.6)',
            cursor: 'crosshair',
            touchAction: 'none',
          }}
        >
          {active ? (
            active.type === 'video' ? (
              <video src={active.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} muted playsInline loop autoPlay />
            ) : (
              <img src={toImageUrl(active.url)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
            )
          ) : null}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(0,0,0,.35), transparent 28%, transparent 68%, rgba(0,0,0,.5))', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4, padding: '0 16px' }}>
            <div style={{ flex: 1, height: 3, borderRadius: 3, background: 'rgba(255,255,255,.9)' }} />
          </div>
          <div style={{ position: 'absolute', top: 26, left: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar src={currentUser?.photoUrl || ''} name={currentUser?.name || ''} size={26} />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 12, textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>{currentUser?.name}</span>
          </div>
          {sharedPost && (
            <div style={{ position: 'absolute', top: 64, left: 16, right: 16, background: 'rgba(18,18,26,.94)', borderRadius: 14, padding: 12, border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
              <div style={{ fontSize: 10, color: '#fff', fontWeight: 800, letterSpacing: 0.5, marginBottom: 5 }}>{sharedPostAuthorName || 'Post'}</div>
              <div style={{ fontSize: 12.5, color: '#fff', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {sharedPost.content}
              </div>
              <div style={{ fontSize: 10.5, color: '#fff', marginTop: 6, fontWeight: 700 }}>Ver post →</div>
            </div>
          )}
          {text.trim() ? (
            <div
              style={{
                position: 'absolute',
                left: `${textPos.x}%`,
                top: `${textPos.y}%`,
                transform: 'translate(-50%, -50%)',
                color, fontSize: size, fontWeight: bold ? 800 : 400, fontFamily: fontCss,
                textAlign: 'center', lineHeight: 1.32, wordBreak: 'break-word', maxWidth: '90%',
                textShadow: '0 2px 12px rgba(0,0,0,.85)',
              }}
            >
              {text}
            </div>
          ) : (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 600, pointerEvents: 'none' }}>
              Arraste para posicionar o texto
            </div>
          )}
          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center', padding: '0 12px' }}>
              {photos.map((ph, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setActivePhoto(i) }}
                  style={{ width: 40, height: 60, borderRadius: 8, overflow: 'hidden', border: i === activePhoto ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,.3)', cursor: 'pointer', padding: 0, background: '#222', position: 'relative' }}
                >
                  {ph.type === 'video' ? (
                    <span style={{ color: '#fff', fontSize: 14 }}>▶</span>
                  ) : (
                    <img src={toImageUrl(ph.url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      setPhotos((prev) => {
                        const next = prev.filter((_, j) => j !== i)
                        setActivePhoto((a) => Math.max(0, Math.min(a, next.length - 1)))
                        return next
                      })
                    }}
                    style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,.7)', color: '#ef4444', fontSize: 10, width: 16, height: 16, borderRadius: '0 0 0 8px', cursor: 'pointer', lineHeight: '16px' }}
                  >
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Arraste o texto para mover · {photos.length > 1 ? `${photos.length} fotos (vira ${photos.length} stories)` : 'Prévia ao vivo'}</div>
      </div>

      <div
        style={{ width: 300, background: 'rgba(22,24,32,.96)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ color: '#fff', fontWeight: 800, fontSize: 16, margin: 0 }}>Novo story</h4>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, width: 30, height: 30, borderRadius: '50%' }}>✕</button>
        </div>

        <div>
          <div style={sectionTitle}>Texto</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 140))}
              placeholder="Escreva algo... 😀"
              maxLength={140}
              autoFocus
              style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.35)', color: '#fff', fontSize: 13.5, outline: 'none', minWidth: 0 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {['😀', '😂', '😍', '🔥', '❤️', '👽', '🚀', '🎉', '👍', '😎', '🤔', '💯'].map((e) => (
              <button key={e} onClick={() => setText((v) => (v + e).slice(0, 140))} style={{ background: 'rgba(255,255,255,.06)', border: 'none', fontSize: 18, cursor: 'pointer', padding: 5, borderRadius: 8 }}>
                {e}
              </button>
            ))}
            <button
              onClick={() => setShowEmoji((v) => !v)}
              title="Mais emojis"
              style={{ display: 'grid', placeItems: 'center', width: 33, height: 33, background: showEmoji ? 'rgba(41,163,255,.15)' : 'rgba(255,255,255,.06)', border: 'none', color: showEmoji ? 'var(--accent)' : 'rgba(255,255,255,.75)', cursor: 'pointer', borderRadius: 8 }}
            >
              <Fa name="plus" size={13} />
            </button>
          </div>
          {showEmoji && (
            <div className="fs-story-picker">
              <EmojiPicker
                onPick={(e) => { setText((v) => (v + e).slice(0, 140)); }}
                onPickMedia={(url, _name, kind) => {
                  setPhotos((prev) => { setActivePhoto(prev.length); return [...prev, { url, type: kind === 'sticker' ? 'image' : 'image' }] })
                  setShowEmoji(false)
                }}
              />
            </div>
          )}
        </div>

        <div>
          <div style={sectionTitle}>Mídia</div>
          <input ref={fileImgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void handleAddMedia(f, 'image') }} />
          <input ref={fileVidRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void handleAddMedia(f, 'video') }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => fileImgRef.current?.click()} disabled={uploadingMedia} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 0', borderRadius: 10, border: '1.5px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.3)', color: 'rgba(255,255,255,.8)', fontWeight: 700, fontSize: 12.5, cursor: uploadingMedia ? 'default' : 'pointer' }}>
              <Fa name="image" size={13} /> Foto
            </button>
            <button onClick={() => fileVidRef.current?.click()} disabled={uploadingMedia} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 0', borderRadius: 10, border: '1.5px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.3)', color: 'rgba(255,255,255,.8)', fontWeight: 700, fontSize: 12.5, cursor: uploadingMedia ? 'default' : 'pointer' }}>
              <Fa name="video" size={13} /> Vídeo
            </button>
          </div>
          {uploadingMedia && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)', marginTop: 6 }}>Enviando mídia…</div>}
          {photos.length > 0 && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)', marginTop: 6 }}>{photos.length === 1 ? '1 mídia anexada' : `${photos.length} mídias anexadas (viram ${photos.length} stories)`}</div>}
        </div>
        <div>
          <div style={sectionTitle}>Fonte</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {FONTS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFont(f.id)}
                style={{
                  padding: '9px 4px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
                  fontFamily: f.css,
                  border: font === f.id ? '1.5px solid var(--accent)' : '1.5px solid rgba(255,255,255,.1)',
                  background: font === f.id ? 'rgba(41,163,255,.08)' : 'rgba(0,0,0,.3)',
                  color: font === f.id ? 'var(--accent)' : 'rgba(255,255,255,.75)', fontWeight: 700,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={sectionTitle}>Cor</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                style={{
                  width: 30, height: 30, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
                  border: color === c ? '2.5px solid var(--accent)' : '2px solid rgba(255,255,255,.2)',
                  boxShadow: color === c ? '0 0 0 3px rgba(41,163,255,.2)' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <div style={sectionTitle}>Tamanho · {size}px</div>
          <input type="range" min={12} max={64} step={1} value={size} onChange={(e) => setSize(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,.7)', marginTop: 2 }}>
            <span style={{ fontSize: 12 }}>A</span>
            <span style={{ fontSize: 22, fontWeight: 800 }}>A</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setBold(!bold)}
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 800, border: bold ? '1.5px solid var(--accent)' : '1.5px solid rgba(255,255,255,.1)', background: bold ? 'rgba(41,163,255,.08)' : 'rgba(0,0,0,.3)', color: bold ? 'var(--accent)' : 'rgba(255,255,255,.75)' }}
          >
            Negrito
          </button>
          <button
            onClick={() => setPos(null)}
            title="Centralizar texto"
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12, border: '1.5px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.3)', color: 'rgba(255,255,255,.75)' }}
          >
            Centralizar
          </button>
        </div>

        {!hasMedia && (
          <div>
            <div style={sectionTitle}>Fundo</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {BACKGROUNDS.map((g, i) => (
                <button
                  key={g}
                  onClick={() => setBg(i)}
                  style={{
                    width: 44, height: 44, borderRadius: 12, background: g, cursor: 'pointer', padding: 0,
                    border: bg === i ? '2.5px solid var(--accent)' : '2px solid rgba(255,255,255,.15)',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={sectionTitle}>Quem vê</div>
          <div style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,.3)', borderRadius: 12, padding: 4 }}>
            {(['friends', 'global'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: visibility === v ? 'var(--accent)' : 'transparent',
                  color: visibility === v ? '#000' : 'rgba(255,255,255,.6)', fontWeight: 800, fontSize: 12.5,
                }}
              >
                {v === 'friends' ? '👥 Amigos' : '🌍 Todos'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => void publish()}
          disabled={publishing || !canPublish}
          style={{
            padding: '13px', borderRadius: 12, border: 'none', cursor: publishing || !canPublish ? 'default' : 'pointer',
            background: 'linear-gradient(135deg, #29A3FF, #00ccff)', color: '#02120a',
            fontWeight: 900, fontSize: 14, opacity: publishing || !canPublish ? 0.5 : 1,
            boxShadow: '0 8px 24px rgba(41,163,255,.25)',
          }}
        >
          {publishing ? 'Publicando...' : photos.length > 1 ? `Publicar ${photos.length} stories →` : 'Compartilhar story →'}
        </button>
        {!canPublish && (
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)', textAlign: 'center' }}>Adicione foto, texto ou post</div>
        )}
      </div>
    </div>
  )


}
