import { useState } from 'react'
import { Clapperboard, Music2, Play, Sparkles } from 'lucide-react'
import { useCallStore, type MediaPartyProvider } from '../../stores/callStore'
import { parseYouTubeId } from './WatchPartyModal'

type Mode = 'cinema' | 'music' | 'watch'

function detectParty(url: string, mode: Mode): { provider: MediaPartyProvider; url: string; videoId: string; title: string } | null {
  const value = url.trim()
  if (!value) return null
  const youtubeId = parseYouTubeId(value)
  if (youtubeId) {
    return {
      provider: 'youtube',
      url: `https://www.youtube.com/watch?v=${youtubeId}`,
      videoId: youtubeId,
      title: mode === 'music' ? 'Friends Music' : mode === 'cinema' ? 'Cinema dos pinguins' : 'YouTube Together',
    }
  }
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.replace(/^www\./, '')
    const spotifyMatch = parsed.pathname.match(/\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/)
    if (host === 'open.spotify.com' && spotifyMatch) {
      return {
        provider: 'spotify',
        url: `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}`,
        videoId: '',
        title: 'Friends Music · Spotify',
      }
    }
    const deezerMatch = parsed.pathname.match(/\/(track|album|playlist|artist)\/(\d+)/)
    if (host === 'deezer.com' && deezerMatch) {
      return {
        provider: 'deezer',
        url: `https://widget.deezer.com/widget/dark/${deezerMatch[1]}/${deezerMatch[2]}`,
        videoId: '',
        title: 'Friends Music · Deezer',
      }
    }
    if (/\.(mp4|webm|ogv|m3u8)(\?|$)/i.test(parsed.pathname)) {
      return { provider: 'video', url: value, videoId: '', title: mode === 'cinema' ? 'Cinema dos pinguins' : 'Vídeo da call' }
    }
    if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(parsed.pathname)) {
      return { provider: 'audio', url: value, videoId: '', title: 'Friends Music' }
    }
    if (/youtube\.com|youtu\.be/.test(host)) {
      return { provider: 'youtube', url: value, videoId: '', title: 'YouTube Together' }
    }
    return { provider: 'iframe', url: value, videoId: '', title: mode === 'cinema' ? 'Cinema dos pinguins' : 'Mídia da call' }
  } catch {
    return null
  }
}

const COPY: Record<Mode, { title: string; subtitle: string; placeholder: string; icon: typeof Play }> = {
  cinema: {
    title: 'Cinema dos pinguins',
    subtitle: 'Cole um vídeo, link do YouTube ou uma página com player. A call inteira entra na sala de cinema.',
    placeholder: 'https://youtube.com/watch?v=... ou https://site.com/video.mp4',
    icon: Clapperboard,
  },
  music: {
    title: 'Friends Music',
    subtitle: 'Cole um link do Spotify, Deezer, YouTube ou um áudio direto para ouvir junto.',
    placeholder: 'https://open.spotify.com/track/... ou link do YouTube',
    icon: Music2,
  },
  watch: {
    title: 'YouTube Together',
    subtitle: 'Cole o link do YouTube e todos assistem juntos, sincronizados.',
    placeholder: 'https://youtube.com/watch?v=...',
    icon: Play,
  },
}

export function MediaPartyModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const startMediaParty = useCallStore(s => s.startMediaParty)
  const copy = COPY[mode]
  const Icon = copy.icon

  const submit = () => {
    const party = detectParty(url, mode)
    if (!party) {
      setError('Link inválido. Use YouTube, Spotify, Deezer ou um link direto de vídeo/áudio.')
      return
    }
    startMediaParty({ mode, provider: party.provider, url: party.url, videoId: party.videoId, title: party.title })
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 960, background: 'rgba(0,0,0,0.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 18, padding: 22, boxShadow: '0 24px 70px rgba(0,0,0,.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: mode === 'music' ? 'rgba(30,215,96,.14)' : 'rgba(41,163,255,.14)', color: mode === 'music' ? '#1ed760' : '#29A3FF' }}>
            <Icon size={21} />
          </span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 17, color: 'var(--text-primary)' }}>{copy.title}</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>ATIVIDADE DA CALL</div>
          </div>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{copy.subtitle}</p>
        <input
          autoFocus
          value={url}
          onChange={event => { setUrl(event.target.value); setError('') }}
          onKeyDown={event => { if (event.key === 'Enter') submit() }}
          placeholder={copy.placeholder}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px', fontSize: 14, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
          {[
            { label: 'YouTube', href: 'https://www.youtube.com' },
            { label: 'Spotify', href: 'https://open.spotify.com' },
            { label: 'Deezer', href: 'https://www.deezer.com' },
          ].map(item => (
            <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textDecoration: 'none', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 11px' }}>
              Abrir {item.label}
            </a>
          ))}
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', alignSelf: 'center' }}>Copie o link e cole aqui.</span>
        </div>
        {error && <div style={{ color: '#f04747', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        {mode === 'music' && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: '10px 12px', background: 'rgba(30,215,96,.08)', border: '1px solid rgba(30,215,96,.22)', borderRadius: 10, fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
            <Sparkles size={14} style={{ color: '#1ed760', flexShrink: 0, marginTop: 1 }} />
            Spotify e Deezer abrem o player oficial dentro da call. A pessoa que colou o link escolhe a música.
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 15px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={submit} style={{ background: 'var(--accent)', color: '#04120a', border: 'none', borderRadius: 9, padding: '9px 18px', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>Abrir na call</button>
        </div>
      </div>
    </div>
  )
}
