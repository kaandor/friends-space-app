import { useEffect, useRef, useState } from 'react'
import { detectMediaKind, driveFolderFor } from '../../services/mediaDetect'
import { isDriveConnected, uploadToDriveWithProgress } from '../../services/driveService'
import { useFriendStore } from '../../stores/friendStore'
import { useUserStore } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'
import { Avatar } from '../ui/Avatar'
import { VideoPlayer } from '../ui/VideoPlayer'

interface MediaViewerProps {
  url: string
  name?: string
  msgId?: string
  onClose: () => void
}

export function MediaViewer({ url, name, msgId, onClose }: MediaViewerProps) {
  const kind = detectMediaKind(url)
  const { t } = useLangStore()
  const [zoom, setZoom] = useState(false)
  const [showForward, setShowForward] = useState(false)
  const [forwardMsg, setForwardMsg] = useState('')
  const [copied, setCopied] = useState<'link' | 'id' | null>(null)
  const { friendUsers, sendDirectMessage } = useFriendStore()
  const { currentUser } = useUserStore()
  const imgRef = useRef<HTMLImageElement>(null)
  const imgFit: React.CSSProperties = { maxWidth: '90vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8 }
  const imgZoom: React.CSSProperties = { width: 'auto', height: 'auto', maxWidth: 'none', maxHeight: 'none', objectFit: 'contain', borderRadius: 8, cursor: 'zoom-out' }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(null), 1500)
    return () => window.clearTimeout(t)
  }, [copied])

  const copyLink = () => {
    navigator.clipboard.writeText(url).catch(() => { })
    setCopied('link')
  }

  const copyId = () => {
    if (msgId) navigator.clipboard.writeText(msgId).catch(() => { })
    setCopied('id')
  }

  const [downloading, setDownloading] = useState(false)
  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      // Drive: força o endpoint de download direto (export=view só visualiza)
      let dlUrl = url
      try {
        const id = new URL(url).searchParams.get('id')
        if (id && /drive|googleusercontent/.test(url)) dlUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download`
      } catch { }
      const res = await fetch(dlUrl)
      if (!res.ok) throw new Error('http ' + res.status)
      const blob = await res.blob()
      // Guarda cópia em "Arquivos recebidos" no Drive de quem baixou
      try {
        if (isDriveConnected()) {
          const folder = kind === 'none' ? 'mensagens' : driveFolderFor(kind)
          void uploadToDriveWithProgress(blob, name || 'arquivo', blob.type || 'application/octet-stream', folder, undefined, undefined, 'Arquivos recebidos').catch(() => { })
        }
      } catch { }
      const obj = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = obj
      a.download = name || 'arquivo'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(obj), 5000)
    } catch {
      window.open(url, '_blank', 'noopener')
    }
    setDownloading(false)
  }

  const forwardTo = async (friendId: string, friendName: string) => {
    if (!currentUser) return
    setShowForward(false)
    await sendDirectMessage(currentUser.id, friendId, '', 'text', undefined, url, name || 'midia', kind)
    setForwardMsg(`${t('media.forwardedTo')} ${friendName}`)
    window.setTimeout(() => setForwardMsg(''), 2000)
  }

  const toolBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => setZoom(false)}
    >
      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 13, zIndex: 2 }}>
        <span style={{ fontWeight: 700 }}>{name || t('media.viewer')}</span>
        {kind && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.14)', fontWeight: 800, letterSpacing: '0.5px' }}>{kind.toUpperCase()}</span>}
        {msgId && (
          <button onClick={copyId} title="Copiar ID do anexo" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            {copied === 'id' ? t('media.copiedId') : 'ID: ' + msgId.slice(0, 8) + '…'}
          </button>
        )}
      </div>

      <button
        onClick={onClose}
        aria-label="Fechar"
        style={{ position: 'absolute', top: 10, right: 14, zIndex: 2, background: 'none', border: 'none', color: '#fff', fontSize: 30, cursor: 'pointer', width: 44, height: 44 }}
      >
        ×
      </button>

      {forwardMsg && (
        <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 3, background: '#23a55a', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          {forwardMsg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%', overflow: 'auto', padding: '0 0 64px' }} onClick={e => e.stopPropagation()}>
        {kind === 'video' ? (
          <div style={{ width: 'min(880px, 90vw)' }}><VideoPlayer src={url} maxHeight={520} autoPlay /></div>
        ) : kind === 'audio' ? (
          <audio src={url} controls autoPlay style={{ width: 'min(520px, 90vw)' }} />
        ) : kind === 'none' ? (
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>
              <i className="fa-solid fa-file-lines" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{name || 'Arquivo'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20, wordBreak: 'break-all', maxWidth: '70vw' }}>{url}</div>
            <button onClick={() => void handleDownload()} disabled={downloading} style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, opacity: downloading ? 0.6 : 1 }}>
              <i className="fa-solid fa-download" /> {downloading ? 'Baixando...' : 'Baixar arquivo'}
            </button>
          </div>
        ) : (
          <img
            ref={imgRef}
            src={url}
            alt={name || 'midia'}
            onClick={e => { e.stopPropagation(); setZoom(z => !z) }}
            style={zoom ? imgZoom : imgFit}
            title={zoom ? 'Diminuir' : 'Ampliar'}
          />
        )}
      </div>

      <div
        style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 2, flexWrap: 'wrap', justifyContent: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        {kind !== 'audio' && (
          <button onClick={() => setZoom(z => !z)} style={toolBtn}>
            <i className={zoom ? 'fa-solid fa-magnifying-glass-minus' : 'fa-solid fa-magnifying-glass-plus'} /> {zoom ? t('media.zoomOut') : t('media.zoomIn')}
          </button>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" style={toolBtn}>
          <i className="fa-solid fa-arrow-up-right-from-square" /> {t('media.openBrowser')}
        </a>
        <button onClick={() => void handleDownload()} disabled={downloading} style={{ ...toolBtn, opacity: downloading ? 0.6 : 1 }}>
          <i className="fa-solid fa-download" /> {downloading ? '...' : t('media.download')}
        </button>
        <button onClick={copyLink} style={toolBtn}>
          <i className="fa-solid fa-link" /> {copied === 'link' ? t('media.linkCopied') : t('media.copyLink')}
        </button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowForward(s => !s)} style={toolBtn}>
            <i className="fa-solid fa-share" /> {t('media.forward')}
          </button>
          {showForward && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 4 }} onClick={() => setShowForward(false)} />
              <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 5, width: 240, maxHeight: 260, overflowY: 'auto', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 6, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
                {friendUsers.length === 0 && (
                  <div style={{ padding: 12, fontSize: 12, color: 'var(--text-secondary)' }}>{t('media.noFriends')}</div>
                )}
                {friendUsers.map(f => (
                  <button
                    key={f.id}
                    onClick={() => void forwardTo(f.id, f.name)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, background: 'transparent', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Avatar src={f.photoUrl} name={f.name} size={26} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
