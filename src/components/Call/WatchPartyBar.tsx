import { useEffect, useMemo, useRef, useState } from 'react'
import { useCallStore, type WatchPartyState } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'
import { Fa } from '../../utils/fa'
import { parseYouTubeId } from './WatchPartyModal'

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
    } catch (error) { reject(error) }
  })
  return ytApiPromise
}

function YouTubePlayer({ party, big }: { party: WatchPartyState; big?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const applyingRef = useRef(false)
  const syncWatchParty = useCallStore(s => s.syncWatchParty)
  const meId = useUserStore(s => s.currentUser?.id)
  const [failed, setFailed] = useState(false)
  const videoId = party.videoId || parseYouTubeId(party.url || '') || ''
  const isLeader = Boolean(meId && party.byUserId === meId)

  useEffect(() => {
    if (!videoId) { setFailed(true); return }
    let dead = false
    let player: any = null
    setFailed(false)
    void loadYTApi().then(() => {
      if (dead || !mountRef.current || !window.YT) return
      try {
        player = new window.YT.Player(mountRef.current, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: { autoplay: 1, rel: 0 },
          events: {
            onStateChange: (event: any) => {
              if (applyingRef.current) return
              const mine = useCallStore.getState().watchParty
              if (!mine || mine.byUserId !== useUserStore.getState().currentUser?.id) return
              let time = 0
              try { time = player?.getCurrentTime ? Math.floor(player.getCurrentTime()) : 0 } catch { }
              if (event.data === window.YT.PlayerState.PLAYING) syncWatchParty({ playing: true, position: time })
              else if (event.data === window.YT.PlayerState.PAUSED) syncWatchParty({ playing: false, position: time })
            },
            onError: () => setFailed(true),
          },
        })
        playerRef.current = player
      } catch { setFailed(true) }
    }).catch(() => { if (!dead) setFailed(true) })
    return () => {
      dead = true
      try { if (player?.destroy) player.destroy() } catch { }
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  useEffect(() => {
    if (isLeader) return
    const player = playerRef.current
    if (!player?.getCurrentTime) return
    applyingRef.current = true
    try {
      if (party.playing) { try { player.playVideo() } catch { } } else { try { player.pauseVideo() } catch { } }
      const current = player.getCurrentTime()
      if (typeof current === 'number' && Math.abs(current - party.position) > 3) player.seekTo(party.position, true)
    } finally {
      window.setTimeout(() => { applyingRef.current = false }, 500)
    }
  }, [party.playing, party.position, isLeader])

  return (
    <div style={{ position: 'relative', width: '100%', height: big ? '100%' : undefined, aspectRatio: big ? undefined : '16 / 9', background: '#000' }}>
      {failed ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>
          Não foi possível carregar este vídeo do YouTube.
        </div>
      ) : null}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}

function DirectMediaPlayer({ party, big }: { party: WatchPartyState; big?: boolean }) {
  const ref = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const syncWatchParty = useCallStore(s => s.syncWatchParty)
  const meId = useUserStore(s => s.currentUser?.id)
  const isLeader = Boolean(meId && party.byUserId === meId)
  const lastPush = useRef(0)
  const isVideo = party.provider !== 'audio'

  useEffect(() => {
    const media = ref.current
    if (!media) return
    if (Math.abs((media.currentTime || 0) - party.position) > 3) {
      try { media.currentTime = Math.max(0, party.position) } catch { }
    }
    if (party.playing) void media.play().catch(() => { })
    else media.pause()
  }, [party.position, party.playing])

  const push = (force = false) => {
    if (!isLeader) return
    const media = ref.current
    if (!media) return
    const now = Date.now()
    if (!force && now - lastPush.current < 3500) return
    lastPush.current = now
    syncWatchParty({ playing: !media.paused, position: Math.floor(media.currentTime || 0) })
  }

  if (!isVideo) {
    return (
      <div style={{ padding: big ? 28 : 14, background: 'linear-gradient(135deg, #10151f, #071019)', minHeight: big ? '100%' : 118, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ width: big ? 180 : 84, height: big ? 180 : 84, borderRadius: '50%', background: 'radial-gradient(circle at 32% 28%, #28415d, #0b1220 62%)', border: '1px solid rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1ed760', boxShadow: '0 22px 50px rgba(0,0,0,.45)' }}>
          <Fa name="music" size={big ? 54 : 28} />
        </div>
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <div style={{ fontSize: big ? 22 : 14, fontWeight: 900, color: '#fff' }}>{party.title}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 4 }}>Áudio compartilhado com a call</div>
        </div>
        <audio ref={ref as React.RefObject<HTMLAudioElement>} src={party.url} controls onPlay={() => push(true)} onPause={() => push(true)} onSeeked={() => push(true)} style={{ width: 'min(100%, 520px)' }} />
      </div>
    )
  }

  return (
    <video
      ref={ref as React.RefObject<HTMLVideoElement>}
      src={party.url}
      controls
      playsInline
      onPlay={() => push(true)}
      onPause={() => push(true)}
      onSeeked={() => push(true)}
      onTimeUpdate={() => push(false)}
      style={{ width: '100%', height: big ? '100%' : undefined, aspectRatio: big ? undefined : '16 / 9', objectFit: 'contain', background: '#000', display: 'block' }}
    />
  )
}

function EmbedPlayer({ party, big }: { party: WatchPartyState; big?: boolean }) {
  const isMusic = party.provider === 'spotify' || party.provider === 'deezer'
  return (
    <iframe
      title={party.title}
      src={party.url}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      style={{ width: '100%', height: big ? '100%' : (isMusic ? 152 : undefined), aspectRatio: big || isMusic ? undefined : '16 / 9', border: 0, display: 'block', background: '#000' }}
    />
  )
}

export function MediaPartyPlayer({ party, big = false }: { party: WatchPartyState; big?: boolean }) {
  if (party.provider === 'spotify' || party.provider === 'deezer' || party.provider === 'iframe') return <EmbedPlayer party={party} big={big} />
  if (party.provider === 'video' || party.provider === 'audio') return <DirectMediaPlayer party={party} big={big} />
  return <YouTubePlayer party={party} big={big} />
}

export function WatchPartyBar() {
  const watchParty = useCallStore(s => s.watchParty)
  const stopWatchParty = useCallStore(s => s.stopWatchParty)
  const meId = useUserStore(s => s.currentUser?.id)
  const [hidden, setHidden] = useState(false)

  useEffect(() => { setHidden(false) }, [watchParty?.videoId, watchParty?.url])

  const isLeader = Boolean(watchParty && meId && watchParty.byUserId === meId)
  const mode = watchParty?.mode || 'watch'
  const label = mode === 'music' ? 'Friends Music' : mode === 'cinema' ? 'Cinema' : 'Assistir junto'
  const icon = mode === 'music' ? 'music' : 'play'
  const accent = mode === 'music' ? '#1ed760' : mode === 'cinema' ? '#f6c453' : '#f04747'
  const title = useMemo(() => watchParty?.title || 'YouTube', [watchParty?.title])

  if (!watchParty || hidden || mode === 'cinema') return null

  return (
    <div style={{ margin: '0 12px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        <Fa name={icon} size={12} style={{ color: accent, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label} · {title} · {watchParty.byName || 'alguém'}
        </span>
        <button
          onClick={() => { if (isLeader) stopWatchParty(); else setHidden(true) }}
          title={isLeader ? 'Encerrar para todos' : 'Ocultar para mim'}
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
        >
          {isLeader ? 'Encerrar' : 'Ocultar'}
        </button>
      </div>
      <MediaPartyPlayer party={watchParty} />
    </div>
  )
}
