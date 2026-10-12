import { Fa } from '../../utils/fa'
import { useEffect, useRef, useState } from 'react'
import { getApiBaseUrl } from '../../services/config'

interface Props {
  src: string
  maxHeight?: number
  autoPlay?: boolean
  onError?: () => void
  onExpand?: () => void
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${r.toString().padStart(2, '0')}`
}

const SPEEDS = [1, 1.5, 2, 0.5]

// Cache dos streams transcodificados por arquivo do Drive
const streamCache = new Map<string, string[]>()

// Player de vídeo estilo X: play/pause, barra de progresso clicável,
// tempo, mudo, velocidade, picture-in-picture e tela cheia.
export function VideoPlayer({ src, maxHeight = 300, autoPlay = false, onError, onExpand }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(autoPlay)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [muted, setMuted] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [showSpeeds, setShowSpeeds] = useState(false)
  const [failed, setFailed] = useState(false)
  const [errCode, setErrCode] = useState(0)
  const [retry, setRetry] = useState(0)
  const driveId = (/[?&]id=([^&]+)/.exec(src)?.[1]) || ''
  // Normaliza URLs antigas com confirm=t (que quebrava o stream direto)
  const cleanSrc = src.includes('drive.usercontent.google.com') ? src.replace(/&confirm=t\b/, '') : src
  // Cadeia de fontes: proxy do backend (Range, sempre funciona) ->
  // streams transcodificados -> view direto -> downloads. Avança sozinho.
  const [remoteUrls, setRemoteUrls] = useState<string[] | null>(null)
  useEffect(() => {
    if (!driveId) return
    const cached = streamCache.get(driveId)
    if (cached) { setRemoteUrls(cached); return }
    let alive = true
    void (async () => {
      try {
        const [{ requestBackend }, { useUserStore }] = await Promise.all([
          import('../../services/backend'),
          import('../../stores/userStore'),
        ])
        const me = useUserStore.getState().currentUser
        const r = await requestBackend<{ urls: string[] }>('getDriveStream', { userId: me?.id || '', fileId: driveId })
        const urls = Array.isArray(r?.urls) ? r.urls.filter(u => typeof u === 'string').slice(0, 6) : []
        streamCache.set(driveId, urls)
        if (alive) setRemoteUrls(urls)
      } catch { if (alive) setRemoteUrls([]) }
    })()
    return () => { alive = false }
  }, [driveId])
  const variants = driveId
    ? [`${getApiBaseUrl()}/api/video?id=${driveId}`, ...(remoteUrls || []), cleanSrc, `https://drive.google.com/uc?export=download&id=${driveId}`, `https://drive.usercontent.google.com/download?id=${driveId}&export=download`]
    : [cleanSrc]
  const [variantIdx, setVariantIdx] = useState(0)
  const playSrc = variants[Math.min(variantIdx, variants.length - 1)]
  const reportMediaError = (code: number) => {
    try {
      import('../../services/backend').then(({ requestBackend }) => {
        requestBackend('reportClientError', {
          where: 'feed:video',
          message: `media_err=${code} variant=${variantIdx} drive=${driveId ? 'sim' : 'nao'} url=${playSrc.slice(0, 120)}`,
        }).catch(() => null)
      }).catch(() => null)
    } catch { /* ignore */ }
  }
  const handleRetry = () => {
    if (variantIdx < variants.length - 1) {
      setVariantIdx(i => i + 1)
      setFailed(false)
    } else {
      setVariantIdx(0)
      setFailed(false)
      setRetry(r => r + 1)
    }
  }

  useEffect(() => {
    const v = videoRef.current
    if (v) v.playbackRate = SPEEDS[speedIdx]
  }, [speedIdx])

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { void v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (!v || !dur) return
    const r = e.currentTarget.getBoundingClientRect()
    v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  const pip = async () => {
    const v = videoRef.current as HTMLVideoElement & { disablePictureInPicture?: boolean }
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else if (v && (v as unknown as { requestPictureInPicture?: () => Promise<void> }).requestPictureInPicture) {
        await (v as unknown as { requestPictureInPicture: () => Promise<void> }).requestPictureInPicture()
      }
    } catch { /* sem PiP */ }
  }

  const full = () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.fullscreenElement) void document.exitFullscreen()
      else if (v.requestFullscreen) void v.requestFullscreen()
      else if ((v as unknown as { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen) {
        (v as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen()
      }
    } catch { /* ignore */ }
  }

  const pct = dur > 0 ? (time / dur) * 100 : 0

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 460, borderRadius: 12, overflow: 'hidden', background: '#000', marginTop: 6 }}>
      <video
        ref={videoRef}
        key={`${playSrc}#${retry}#${variantIdx}`}
        src={playSrc}
        playsInline
        onClick={toggle}
          onLoadedData={() => { setFailed(false); setVariantIdx(0) }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            const code = videoRef.current?.error?.code || 0
            if (code !== 4 && variantIdx < variants.length - 1 && driveId) {
              setVariantIdx(i => i + 1)
              return
            }
            setErrCode(code)
            reportMediaError(code)
            setFailed(true)
            onError?.()
          }}
        onLoadedMetadata={() => { const v = videoRef.current; if (v) setDur(v.duration || 0) }}
        onTimeUpdate={() => { const v = videoRef.current; if (v) setTime(v.currentTime || 0) }}
        style={{ width: '100%', maxHeight, objectFit: 'contain', display: 'block', cursor: 'pointer' }}
      />
      {failed && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(0,0,0,.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Vídeo não carregou</div>
          <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 11 }}>
            {errCode === 4
              ? 'O navegador não conseguiu ler o arquivo. Tente de novo ou abra no Drive.'
              : 'Pode estar processando no Drive — aguarde e tente de novo.'}
          </div>
          <button onClick={handleRetry}
            style={{ background: '#fff', border: 'none', borderRadius: 999, color: '#000', fontWeight: 800, fontSize: 12, padding: '7px 18px', cursor: 'pointer' }}>
            Tentar de novo
          </button>
          {driveId && (
            <a href={`https://drive.google.com/file/d/${driveId}/view`} target="_blank" rel="noopener"
              style={{ color: 'rgba(255,255,255,.75)', fontSize: 11, fontWeight: 600 }}>
              Abrir no Drive
            </a>
          )}
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '6px 10px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,.75))', display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
        <button onClick={toggle} title={playing ? 'Pausar' : 'Reproduzir'}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 15, cursor: 'pointer', padding: 2, width: 24 }}>
          <Fa name={playing ? 'pause' : 'play'} size={14} />
        </button>
        <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(time)} / {fmt(dur)}</span>
        <div onClick={seek} title="Buscar"
          style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.3)', cursor: 'pointer', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 2, background: '#fff' }} />
        </div>
        <button onClick={() => void pip()} title="Miniplayer"
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', padding: 2 }}>
          <Fa name="window-restore" size={14} />
        </button>
        <button onClick={toggleMute} title={muted ? 'Ativar som' : 'Silenciar'}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', padding: 2, width: 24 }}>
          <Fa name={muted ? 'volume-xmark' : 'volume-high'} size={14} />
        </button>
        <span style={{ position: 'relative' }}>
          <button onClick={() => setShowSpeeds(s => !s)} title="Velocidade"
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', padding: 2 }}>
            <Fa name="gear" size={14} />
          </button>
          {showSpeeds && (
            <span style={{ position: 'absolute', bottom: 28, right: 0, background: 'rgba(10,10,14,.95)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 5 }}>
              {SPEEDS.map((s, i) => (
                <button key={s} onClick={() => { setSpeedIdx(i); setShowSpeeds(false) }}
                  style={{ background: i === speedIdx ? 'rgba(255,255,255,.15)' : 'none', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {s}x
                </button>
              ))}
            </span>
          )}
        </span>
        <button onClick={full} title="Tela cheia"
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', padding: 2 }}>
          <Fa name="expand" size={14} />
        </button>
        {onExpand && (
          <button onClick={onExpand} title="Ampliar"
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', padding: 2 }}>
            <Fa name="up-right-and-down-left-from-center" size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
