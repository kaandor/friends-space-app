import { useEffect, useRef, useState } from 'react'
import { useCallStore } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'
import { Fa } from '../../utils/fa'

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

let ytApiPromise: Promise<void> | null = null
function loadYTApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.YT && window.YT.Player) return Promise.resolve()
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise<void>((resolve, reject) => {
    try {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        try { if (prev) prev() } catch { }
        resolve()
      }
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.onerror = () => reject(new Error('yt'))
      document.head.appendChild(tag)
      window.setTimeout(() => reject(new Error('timeout')), 15000)
    } catch (e) { reject(e) }
  })
  return ytApiPromise
}

// Barra Assistir junto: player sincronizado (lider comanda, resto segue).
export function WatchPartyBar() {
  const watchParty = useCallStore(s => s.watchParty)
  const syncWatchParty = useCallStore(s => s.syncWatchParty)
  const stopWatchParty = useCallStore(s => s.stopWatchParty)
  const meId = useUserStore(s => s.currentUser?.id)
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const applyingRef = useRef(false)
  const [hidden, setHidden] = useState(false)
  const [failed, setFailed] = useState(false)

  const videoId = watchParty?.videoId || ''
  const isLeader = Boolean(watchParty && meId && watchParty.byUserId === meId)

  useEffect(() => { setHidden(false); setFailed(false) }, [videoId])

  useEffect(() => {
    if (!watchParty) return
    let dead = false
    let player: any = null
    void loadYTApi().then(() => {
      if (dead || !mountRef.current || !window.YT) return
      try {
        player = new window.YT.Player(mountRef.current, {
          width: '100%',
          height: '100%',
          videoId: watchParty.videoId,
          playerVars: { autoplay: 1, rel: 0 },
          events: {
            onStateChange: (e: any) => {
              if (applyingRef.current) return
              try {
                const mine = useCallStore.getState().watchParty
                if (!mine) return
                const iamLeader = mine.byUserId === useUserStore.getState().currentUser?.id
                if (!iamLeader) return
                let t = 0
                try { t = player && player.getCurrentTime ? Math.floor(player.getCurrentTime()) : 0 } catch { }
                if (e.data === window.YT.PlayerState.PLAYING) syncWatchParty({ playing: true, position: t })
                else if (e.data === window.YT.PlayerState.PAUSED) syncWatchParty({ playing: false, position: t })
              } catch { }
            },
            onError: () => { try { setFailed(true) } catch { } },
          },
        })
        playerRef.current = player
      } catch { setFailed(true) }
    }).catch(() => { if (!dead) setFailed(true) })
    return () => {
      dead = true
      try { if (player && player.destroy) player.destroy() } catch { }
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  const playing = watchParty?.playing
  const position = watchParty?.position ?? 0
  useEffect(() => {
    if (!watchParty || isLeader) return
    const p = playerRef.current
    if (!p || !p.getCurrentTime) return
    applyingRef.current = true
    try {
      if (playing) { try { p.playVideo() } catch { } } else { try { p.pauseVideo() } catch { } }
      try {
        const cur = p.getCurrentTime()
        if (typeof cur === 'number' && Math.abs(cur - position) > 3) p.seekTo(position, true)
      } catch { }
    } finally {
      window.setTimeout(() => { applyingRef.current = false }, 500)
    }
  }, [watchParty, playing, position, isLeader])

  if (!watchParty || hidden) return null
  return (
    <div style={{ margin: '0 12px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        <Fa name="play" size={12} style={{ color: '#f04747', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {watchParty.title || 'YouTube'} · {watchParty.byName || 'alguém'}
        </span>
        <button onClick={() => { if (isLeader) { try { stopWatchParty() } catch { } } else setHidden(true) }}
          title={isLeader ? 'Encerrar para todos' : 'Ocultar para mim'}
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {isLeader ? 'Encerrar' : 'Ocultar'}
        </button>
      </div>
      {failed ? (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>Não foi possível carregar o vídeo.</div>
      ) : (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
          <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
        </div>
      )}
    </div>
  )
}
