import { useEffect, useRef, useState } from 'react'
import { Music, Play, RefreshCw, Search, Users, Volume2, X } from 'lucide-react'
import { searchInstantSounds, type InstantSound } from '../../services/instantSounds'
import { getSoundboardVolume, setSoundboardVolume } from '../../services/soundboardVolume'
import { useCallStore } from '../../stores/callStore'

const RECENTS_KEY = 'friends-space:soundboard-recents'
const RECENTS_MAX = 8

const HOME_SOUNDS: Array<{ name: string; label: string }> = [
  { name: 'notification', label: 'Aviso' },
  { name: 'astro', label: 'Astro' },
  { name: 'call-join', label: 'Entrada' },
  { name: 'call-leave', label: 'Saída' },
  { name: 'screen-start', label: 'Tela' },
  { name: 'participant-add', label: 'Novo' },
  { name: 'friend-request', label: 'Amigo' },
  { name: 'mute', label: 'Mudo' },
  { name: 'unmute', label: 'Voz' },
  { name: 'dm', label: 'DM' },
  { name: 'server', label: 'Server' },
  { name: 'call-invite', label: 'Chamada' },
]

function loadRecents(): InstantSound[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((item): item is InstantSound => Boolean(
        item
        && typeof item.id === 'string'
        && typeof item.name === 'string'
        && typeof item.audioUrl === 'string',
      ))
      .slice(0, RECENTS_MAX)
  } catch {
    return []
  }
}

function saveRecents(items: InstantSound[]) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, RECENTS_MAX))) } catch { }
}

export function SoundboardModal({ onClose }: { onClose: () => void }) {
  const participants = useCallStore(state => state.participants)
  const playInstant = useCallStore(state => state.playInstant)
  const playSoundboard = useCallStore(state => state.playSoundboard)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InstantSound[]>([])
  const [recents, setRecents] = useState<InstantSound[]>(loadRecents)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState('')
  const [volume, setVolume] = useState(() => getSoundboardVolume())
  const [reloadKey, setReloadKey] = useState(0)
  const requestId = useRef(0)
  const flashTimer = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    }
  }, [])

  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    const term = query.trim()
    const timer = window.setTimeout(() => {
      searchInstantSounds(term)
        .then(sounds => {
          if (id !== requestId.current) return
          setResults(sounds)
        })
        .catch(() => {
          if (id !== requestId.current) return
          setResults([])
          setError('Não foi possível carregar os sons do MyInstants agora.')
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false)
        })
    }, term ? 350 : 0)
    return () => window.clearTimeout(timer)
  }, [query, reloadKey])

  const flash = (id: string) => {
    setPlaying(id)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setPlaying(''), 900)
  }

  const remember = (sound: InstantSound) => {
    setRecents(prev => {
      const next = [sound, ...prev.filter(item => item.audioUrl !== sound.audioUrl)].slice(0, RECENTS_MAX)
      saveRecents(next)
      return next
    })
  }

  const playFound = async (sound: InstantSound) => {
    flash(sound.id)
    remember(sound)
    const ok = await playInstant(sound.audioUrl, sound.name)
    if (!ok) {
      try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Não foi possível tocar esse som.' })) } catch { }
    }
  }

  const term = query.trim()

  return (
    <div className="act-backdrop" onClick={onClose}>
      <div className="act-modal sb-modal" onClick={event => event.stopPropagation()} role="dialog" aria-label="Soundboard">
        <div className="act-top">
          <div className="act-search">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar sons no MyInstants"
              maxLength={64}
            />
            {query ? (
              <button className="sb-clear" onClick={() => setQuery('')} title="Limpar busca"><X size={14} /></button>
            ) : null}
          </div>
          <button className="act-close" onClick={onClose} title="Fechar"><X size={18} /></button>
        </div>

        <div className="sb-head">
          <div>
            <strong>Soundboard</strong>
            <span><Users size={12} /> Todos na call escutam o som que você tocar.</span>
          </div>
          <div className="sb-head-tools">
            <label className="sb-volume" title="Volume dos efeitos">
              <Volume2 size={13} />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={event => {
                  const next = Number(event.target.value)
                  setVolume(next)
                  setSoundboardVolume(next)
                }}
                aria-label="Volume dos efeitos"
              />
              <span>{volume}%</span>
            </label>
            <span className="sb-online">{participants.length} na call</span>
          </div>
        </div>

        <div className="sb-scroll">
          {!term && recents.length > 0 ? (
            <section className="sb-section">
              <h3>Últimos tocados</h3>
              <div className="sb-recents">
                {recents.map(sound => (
                  <button key={sound.audioUrl} className={`sb-recent${playing === sound.id ? ' is-playing' : ''}`} onClick={() => { void playFound(sound) }} title={sound.name}>
                    <span className="sb-recent-icon"><Play size={12} fill="currentColor" /></span>
                    <span>{sound.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {!term ? (
            <section className="sb-section">
              <h3>Sons do Friends Space</h3>
              <div className="sb-home">
                {HOME_SOUNDS.map(sound => (
                  <button
                    key={sound.name}
                    className={`sb-chip${playing === `home:${sound.name}` ? ' is-playing' : ''}`}
                    onClick={() => {
                      flash(`home:${sound.name}`)
                      playSoundboard(sound.name)
                    }}
                    title={`Tocar ${sound.label} para a call`}
                  >
                    <Music size={13} /> {sound.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="sb-section">
            <div className="sb-section-head">
              <h3>{term ? 'Resultados' : 'Em alta no MyInstants'}</h3>
              <button className="sb-refresh" onClick={() => setReloadKey(key => key + 1)} title="Atualizar" disabled={loading}>
                <RefreshCw size={14} /> <span>{loading ? 'Carregando' : 'Atualizar'}</span>
              </button>
            </div>

            {loading ? (
              <div className="sb-loading">
                <span className="sb-spinner" /> Buscando sons...
              </div>
            ) : error ? (
              <div className="sb-empty">
                <span>{error}</span>
                <button className="sb-retry" onClick={() => setReloadKey(key => key + 1)}>Tentar de novo</button>
              </div>
            ) : results.length === 0 ? (
              <div className="sb-empty">
                <span>{term ? `Nenhum som encontrado para “${term}”.` : 'Nenhum som disponível agora.'}</span>
              </div>
            ) : (
              <div className="sb-grid">
                {results.map((sound, index) => (
                  <button
                    key={sound.audioUrl}
                    className={`sb-item sb-tone-${index % 5}${playing === sound.id ? ' is-playing' : ''}`}
                    onClick={() => { void playFound(sound) }}
                    title={`Tocar “${sound.name}” para a call`}
                  >
                    <span className="sb-item-icon">{playing === sound.id ? <span className="sb-bars"><i /><i /><i /></span> : <Play size={15} fill="currentColor" />}</span>
                    <span className="sb-item-copy">
                      <strong>{sound.name}</strong>
                      <small>MyInstants</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="sb-foot">
            Busca e áudios públicos do <a href="https://www.myinstants.com/pt/index/br/" target="_blank" rel="noreferrer">MyInstants</a>. O botão toca localmente em cada participante da call.
          </div>
        </div>
      </div>
    </div>
  )
}
