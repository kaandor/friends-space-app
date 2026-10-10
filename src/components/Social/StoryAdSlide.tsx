import { useEffect, useRef, useState } from 'react'
import { requestBackend } from '../../services/backend'
import { renderAdSlot, adUnitProps } from '../../services/adsense'

interface Ad {
  id: string
  kind: 'video' | 'image'
  mediaUrl: string
  linkUrl?: string
  title?: string
  seconds?: number
}

interface Props {
  slot: number
  onDone: () => void
}

// Intersticial de anúncio no viewer de stories: vídeo curto (com pular) ou
// card AdSense ("anúncio normal"). Duração curta por padrão (<=15s).
export function StoryAdSlide({ slot, onDone }: Props) {
  const [ad, setAd] = useState<Ad | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const insRef = useRef<HTMLModElement | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await requestBackend<{ ads: Ad[] }>('getStoryAds', {})
        const list = res?.ads || []
        if (alive && list.length > 0) {
          // Aleatorio sem repetir o ultimo exibido (sempre variando)
          let last = ''
          try { last = sessionStorage.getItem('fs:lastAd') || '' } catch { /* ignore */ }
          const pool = list.length > 1 ? list.filter(a => a.id !== last) : list
          const pick = pool[Math.floor(Math.random() * pool.length)]
          try { sessionStorage.setItem('fs:lastAd', pick.id) } catch { /* ignore */ }
          setAd(pick)
        }
      } catch { /* fallback: card AdSense */ }
      finally { if (alive) setLoaded(true) }
    })()
    return () => { alive = false }
  }, [slot])

  useEffect(() => {
    if (insRef.current) renderAdSlot(insRef.current)
  }, [loaded, ad])

  useEffect(() => {
    if (!ad || ad.kind !== 'video') return
    const t = window.setInterval(() => setElapsed(e => e + 0.25), 250)
    return () => window.clearInterval(t)
  }, [ad])

  const cap = Math.min(60, Math.max(3, ad?.seconds || 8))
  useEffect(() => {
    if (ad?.kind === 'video' && elapsed >= cap) onDone()
  }, [elapsed, cap, ad, onDone])

  const canSkip = elapsed >= 3 || ad?.kind !== 'video'
  const unit = adUnitProps()

  const openLink = () => {
    if (ad?.linkUrl) window.open(ad.linkUrl, '_blank', 'noopener')
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}
      onClick={e => e.stopPropagation()}>
      <div style={{ position: 'absolute', top: 34, left: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: '#000', background: '#fff', padding: '3px 9px', borderRadius: 999 }}>Anúncio</span>
        {ad?.kind === 'video' && <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)' }}>{Math.max(0, Math.ceil(cap - elapsed))}s</span>}
      </div>
      {ad?.kind === 'video' ? (
        <video ref={videoRef} src={ad.mediaUrl} autoPlay playsInline muted
          onTimeUpdate={() => {
            const v = videoRef.current
            if (v && v.duration && v.currentTime >= Math.min(v.duration, cap)) onDone()
          }}
          onClick={openLink}
          style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 10, objectFit: 'contain', cursor: ad.linkUrl ? 'pointer' : 'default' }}
        />
      ) : (
        <div style={{ width: '100%', maxWidth: 340, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          {unit ? (
            <div style={{ borderRadius: 10, overflow: 'hidden' }}>
              <ins ref={insRef} className="adsbygoogle" style={{ display: 'block', minHeight: 250 }} data-ad-client={unit.client} data-ad-slot={unit.slot} data-ad-format="auto" data-full-width-responsive="true" />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: ad?.linkUrl ? 'pointer' : 'default' }} onClick={openLink}>
              {ad?.mediaUrl
                ? <img src={ad.mediaUrl} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover' }} />
                : <div style={{ width: 72, height: 72, borderRadius: 10, background: 'linear-gradient(135deg, #5865f2, #a855f7)', flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)' }}>{ad?.title || 'Espaço para seu anúncio'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Patrocinado · Friends Space</div>
              </div>
            </div>
          )}
        </div>
      )}
      {canSkip ? (
        <button onClick={() => onDone()}
          style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 999, color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 22px', cursor: 'pointer' }}>
          {ad?.kind === 'video' ? 'Pular anúncio' : 'Continuar'}
        </button>
      ) : (
        <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>Aguarde para pular...</div>
      )}
    </div>
  )
}
