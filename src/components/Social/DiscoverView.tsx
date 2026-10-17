import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Activity, BadgeCheck, BookOpen, BriefcaseBusiness, Cat, Clapperboard, Compass,
  Gamepad2, Landmark, Monitor, Music2, PenTool, Radio, Search, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requestBackend } from '../../services/backend'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { assetUrl } from '../../utils/assets'
import { toImageUrl } from '../../services/driveService'
import type { Server } from '../../types'
import './discover.css'

interface Props {
  onClose: () => void
}

type Theme = {
  name: string
  description: string
  icon: LucideIcon
  accent: string
  match: (category: string) => boolean
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const themes: Theme[] = [
  { name: 'Política', description: 'Debates e discussões políticas.', icon: Landmark, accent: '#29A3FF', match: (c) => norm(c) === 'politica' },
  { name: 'Games', description: 'Jogos, novidades e comunidades.', icon: Gamepad2, accent: '#29A3FF', match: (c) => norm(c) === 'games' },
  { name: 'Amizade', description: 'Faça amigos e converse.', icon: Users, accent: '#29A3FF', match: (c) => norm(c) === 'amizade' || norm(c) === 'amizades' },
  { name: 'Tecnologia', description: 'Tech, programação e inovação.', icon: Monitor, accent: '#29A3FF', match: (c) => norm(c) === 'tecnologia' || norm(c) === 'tech' },
  { name: 'Música', description: 'Música, artistas e playlists.', icon: Music2, accent: '#29A3FF', match: (c) => norm(c) === 'musica' },
  { name: 'Educação', description: 'Estudo, aprendizado e ajuda.', icon: BookOpen, accent: '#29A3FF', match: (c) => norm(c) === 'educacao' || norm(c) === 'educação' },
  { name: 'Anime & Mangá', description: 'Anime, mangá e cultura otaku.', icon: Cat, accent: '#29A3FF', match: (c) => norm(c).includes('anime') },
  { name: 'Entretenimento', description: 'Memes, vídeos e diversão.', icon: Clapperboard, accent: '#29A3FF', match: (c) => norm(c).includes('entreten') || norm(c).includes('filme') || norm(c).includes('series') || norm(c).includes('memes') },
  { name: 'Arte & Design', description: 'Arte, design e criatividade.', icon: PenTool, accent: '#29A3FF', match: (c) => norm(c).includes('arte') || norm(c).includes('design') },
  { name: 'Negócios', description: 'Empreendedorismo e negócios.', icon: BriefcaseBusiness, accent: '#29A3FF', match: (c) => norm(c).includes('negocio') || norm(c).includes('empreend') },
  { name: 'Esportes', description: 'Futebol e esportes em geral.', icon: Activity, accent: '#29A3FF', match: (c) => norm(c).includes('esporte') || norm(c).includes('futebol') },
  { name: 'Outros', description: 'Explore outros temas.', icon: Radio, accent: '#a1aab1', match: () => true },
]

function memberCount(server: Server) {
  return Array.isArray(server.members) ? server.members.length : 0
}

export function DiscoverView({ onClose }: Props) {
  const { currentUser } = useUserStore()
  const joinServer = useServerStore(s => s.joinServer)
  const setCurrentServer = useServerStore(s => s.setCurrentServer)
  const myServers = useServerStore(s => s.servers)
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [entering, setEntering] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await requestBackend<{ servers: Server[] }>('directoryState', {})
        if (!cancelled) setServers((res?.servers || []).filter(s => s.settings?.toggles?.public !== false))
      } catch { if (!cancelled) setServers([]) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2800)
  }

  const isMember = (server: Server) => myServers.some(s => s.id === server.id)

  const featured = useMemo(() => {
    let list = servers
    const q = norm(query.trim())
    if (q) list = list.filter(s => norm(s.name || '').includes(q) || norm(s.description || '').includes(q))
    if (verifiedOnly) list = list.filter(s => s.verified === true)
    if (category !== 'Todos') {
      const theme = themes.find(t => t.name === category)
      if (theme) list = list.filter(s => theme.match(s.category || ''))
    }
    return list.slice().sort((a, b) => memberCount(b) - memberCount(a))
  }, [servers, query, verifiedOnly, category])

  const handleJoin = (server: Server) => {
    if (entering || !currentUser) return
    if (isMember(server)) {
      const full = useServerStore.getState().servers.find(s => s.id === server.id) || server
      setCurrentServer(full)
      onClose()
      return
    }
    setEntering(server.id)
    void (async () => {
      try {
        const r = await joinServer(server.inviteCode || '', currentUser.id, server.id)
        if (r?.ok) {
          const updated = useServerStore.getState().servers.find(s => s.id === server.id) || server
          setCurrentServer(updated)
          onClose()
        } else if (r?.error) {
          showNotice(r.error)
        }
      } finally {
        setEntering(null)
      }
    })()
  }

  const activeFilterLabel = verifiedOnly ? 'Servidores verificados' : category !== 'Todos' ? category : 'Início'

  return (
    <div className="discover-modal" onClick={onClose}>
      <main className="ping-discover" onClick={e => e.stopPropagation()}>
        <aside className="ping-side">
          <div className="ping-side-brand">
            <span className="ping-side-logo"><Compass size={16} strokeWidth={2.4} /></span>
            <strong>Descubra</strong>
            <button className="ping-side-close" type="button" onClick={onClose} aria-label="Fechar">
              <X size={15} strokeWidth={2.4} />
            </button>
          </div>

          <label className="ping-side-search">
            <Search size={14} strokeWidth={2.4} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar servidores..."
              maxLength={80}
              aria-label="Buscar servidores"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca"><X size={12} strokeWidth={2.6} /></button>
            )}
          </label>

          <nav className="ping-side-nav">
            <button
              type="button"
              className={activeFilterLabel === 'Início' && !query ? 'active' : ''}
              onClick={() => { setCategory('Todos'); setVerifiedOnly(false) }}
            >
              Início
            </button>
            <button
              type="button"
              className={verifiedOnly ? 'active' : ''}
              onClick={() => setVerifiedOnly(v => !v)}
            >
              <ShieldCheck size={13} strokeWidth={2.4} /> Servidores verificados
            </button>
          </nav>

          <div className="ping-side-cats">
            <span className="ping-side-cats-title">Categorias</span>
            <div className="ping-side-cats-list">
              <button type="button" className={category === 'Todos' ? 'active' : ''} onClick={() => setCategory('Todos')}>
                <Sparkles size={13} strokeWidth={2.4} /> Todos
              </button>
              {themes.map(theme => {
                const Icon = theme.icon
                return (
                  <button
                    key={theme.name}
                    type="button"
                    className={category === theme.name ? 'active' : ''}
                    onClick={() => setCategory(theme.name)}
                    title={theme.description}
                  >
                    <Icon size={13} strokeWidth={2.4} /> {theme.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="ping-side-foot">
            <span className="ping-side-foot-dot" />
            {featured.length} {featured.length === 1 ? 'servidor' : 'servidores'} em destaque
          </div>
        </aside>

        <section className="ping-main">
          <div className="ping-hero" style={{ backgroundImage: `url(${assetUrl('astro-bg.png')})` }}>
            <div className="ping-hero-grad" />
            <img className="ping-hero-chars" src={assetUrl('astro-chars.png')} alt="" />
            <div className="ping-hero-content">
              <span className="ping-hero-eyebrow"><Sparkles size={13} /> SUA PRÓXIMA COMUNIDADE ESTÁ AQUI</span>
              <h1>ENCONTRE SUA<br />COMUNIDADE NO<br />PINGUIN</h1>
              <p>Há sempre um lugar para você: seja para jogar, ouvir música ou aprender.</p>
            </div>
          </div>

          <div className="ping-content">
            <div className="ping-content-head">
              <h2>SERVIDORES EM DESTAQUE</h2>
              <span className="ping-content-filter">
                {query.trim() ? `Busca: "${query.trim()}"` : activeFilterLabel}
              </span>
            </div>

            {loading ? (
              <div className="ping-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div className="ping-server-card ping-server-skeleton" key={i}>
                    <span className="ping-server-banner" />
                    <span className="ping-server-body">
                      <span className="ping-skeleton-line" style={{ width: '55%' }} />
                      <span className="ping-skeleton-line" style={{ width: '90%' }} />
                      <span className="ping-skeleton-line" style={{ width: '40%' }} />
                    </span>
                  </div>
                ))}
              </div>
            ) : featured.length === 0 ? (
              <div className="ping-empty">
                <Search size={22} strokeWidth={2} />
                <strong>{query.trim() ? 'Nenhum servidor encontrado.' : 'Nenhum servidor em destaque ainda.'}</strong>
                <span>
                  {query.trim()
                    ? 'Tente buscar outro nome ou explore as categorias.'
                    : 'Crie o seu servidor ou volte mais tarde — novas comunidades aparecem aqui.'}
                </span>
                {(query.trim() || category !== 'Todos' || verifiedOnly) && (
                  <button type="button" onClick={() => { setQuery(''); setCategory('Todos'); setVerifiedOnly(false) }}>
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="ping-grid">
                {featured.map(server => {
                  const member = isMember(server)
                  const count = memberCount(server)
                  return (
                    <button
                      className="ping-server-card"
                      key={server.id}
                      type="button"
                      onClick={() => handleJoin(server)}
                      disabled={entering === server.id}
                      title={member ? `Abrir ${server.name}` : `Entrar em ${server.name}`}
                    >
                      <span
                        className="ping-server-banner"
                        style={server.bannerUrl ? { backgroundImage: `url(${toImageUrl(server.bannerUrl)})` } as CSSProperties : undefined}
                      >
                        {!server.bannerUrl && <span className="ping-server-banner-fallback">{server.name.charAt(0).toUpperCase()}</span>}
                        <span className="ping-server-icon">
                          {server.photoUrl ? <img src={toImageUrl(server.photoUrl)} alt="" loading="lazy" /> : server.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="ping-server-action">{entering === server.id ? 'Entrando...' : member ? 'Abrir' : 'Entrar'}</span>
                      </span>
                      <span className="ping-server-body">
                        <span className="ping-server-name-row">
                          {server.verified && <BadgeCheck className="ping-verified" size={15} strokeWidth={2.4} />}
                          <h3>{server.name}</h3>
                        </span>
                        <p>{server.description || 'Comunidade no Friends Space.'}</p>
                        <span className="ping-server-stats">
                          <span className="ping-online-dot" />
                          {count} {count === 1 ? 'membro' : 'membros'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {notice && <div className="ping-notice" role="status"><Sparkles size={14} />{notice}</div>}
      </main>
    </div>
  )
}
