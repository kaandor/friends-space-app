import { useEffect, useMemo, useState } from 'react'
import { detectMediaKind, type MediaKind } from '../../services/mediaDetect'
import { MediaViewer } from './MediaViewer'
import { VideoPlayer } from '../ui/VideoPlayer'

interface MediaAttachmentProps {
  url: string
  name?: string
  compact?: boolean
  msgId?: string
  type?: MediaKind | string
}

function useFailed() {
  const [failed, setFailed] = useState(false)
  return { failed, markFailed: () => setFailed(true), resetFailed: () => setFailed(false) }
}

function getDriveFileId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('id')
  } catch {
    return null
  }
}

// Variantes do mesmo arquivo no Drive: tenta varios hosts/formados antes de
// declarar a midia indisponivel. Links anonimos (anyone) abrem em qualquer um.
function buildUrlVariants(url: string, kind: MediaKind): string[] {
  const variants = [url]
  const fileId = getDriveFileId(url)
  if (!fileId) return variants
  const alternates = [
    kind === 'image' || kind === 'gif' || kind === 'sticker'
      ? `https://lh3.googleusercontent.com/d/${fileId}=w1600`
      : null,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
    `https://drive.google.com/uc?export=view&id=${fileId}`,
    kind === 'image' || kind === 'gif' || kind === 'sticker'
      ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`
      : null,
  ].filter((value): value is string => typeof value === 'string')
  for (const value of alternates) {
    if (!variants.includes(value)) variants.push(value)
  }
  return variants
}

export function MediaAttachment({ url, name, compact, msgId, type }: MediaAttachmentProps) {
  const kind: MediaKind = (() => {
    if (type === 'image' || type === 'video' || type === 'gif' || type === 'sticker' || type === 'audio' || type === 'none') {
      return type as MediaKind
    }
    const fromName = detectMediaKind(name || '')
    if (fromName !== 'none') return fromName
    return detectMediaKind(url)
  })()
  const variants = useMemo(() => buildUrlVariants(url, kind), [url, kind])
  const [variantIndex, setVariantIndex] = useState(0)
  const { failed, markFailed, resetFailed } = useFailed()
  const [viewer, setViewer] = useState(false)

  useEffect(() => {
    setVariantIndex(0)
    resetFailed()
  }, [url])

  const currentUrl = variants[Math.min(variantIndex, variants.length - 1)]
  const handleError = () => {
    if (variantIndex < variants.length - 1) setVariantIndex(variantIndex + 1)
    else markFailed()
  }

  if (failed) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', padding: '8px 12px',
        fontSize: 12, color: 'var(--text-secondary)', maxWidth: 420,
      }}>
        <span>Midia indisponivel: {name || url}</span>
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div style={{ maxWidth: compact ? 220 : 'min(420px, 100%)' }}>
        <VideoPlayer src={currentUrl} maxHeight={compact ? 160 : 320} onError={handleError} onExpand={() => setViewer(true)} />
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <audio
        src={currentUrl}
        controls
        preload="metadata"
        onError={handleError}
        style={{ height: 40, maxWidth: compact ? 200 : 300, borderRadius: 'var(--radius-sm)' }}
      />
    )
  }

  if (kind === 'none') {
    return (
      <>
        <div
          onClick={() => setViewer(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', padding: '10px 14px', cursor: 'pointer',
            maxWidth: compact ? 260 : 380,
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="fa-solid fa-file-lines" style={{ fontSize: 16 }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'Arquivo'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>.txt · clique para abrir</div>
          </div>
          <i className="fa-solid fa-download" style={{ color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }} />
        </div>
        {viewer && <MediaViewer url={currentUrl} name={name} msgId={msgId} onClose={() => setViewer(false)} />}
      </>
    )
  }

  if (kind === 'sticker') {
    return (
      <>
        <img
          src={currentUrl}
          alt={name || 'figurinha'}
          loading="lazy"
          onError={handleError}
          onClick={() => setViewer(true)}
          style={{
            width: compact ? 110 : 150,
            height: compact ? 110 : 150,
            objectFit: 'contain',
            borderRadius: 'var(--radius-md)',
            display: 'block',
            cursor: 'zoom-in',
          }}
        />
        {viewer && <MediaViewer url={currentUrl} name={name} msgId={msgId} onClose={() => setViewer(false)} />}
      </>
    )
  }

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        {kind === 'gif' && (
          <span style={{
            position: 'absolute', top: 6, right: 6, zIndex: 2,
            background: 'rgba(0,0,0,0.65)', color: '#fff',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.5px',
            padding: '2px 6px', borderRadius: 4, pointerEvents: 'none',
          }}>
            GIF
          </span>
        )}
        <img
          src={currentUrl}
          alt={name || 'midia'}
          loading="lazy"
          onError={handleError}
          onClick={() => setViewer(true)}
          style={{
            maxWidth: compact ? 220 : 'min(420px, 100%)',
            maxHeight: compact ? 160 : 320,
            borderRadius: 'var(--radius-md)',
            objectFit: 'cover',
            display: 'block',
            cursor: 'zoom-in',
          }}
        />
      </div>
      {viewer && <MediaViewer url={currentUrl} name={name} msgId={msgId} onClose={() => setViewer(false)} />}
    </>
  )
}
