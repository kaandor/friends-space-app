import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Activity, BadgeCheck, BookOpen, BriefcaseBusiness, Cat, Clapperboard, Compass,
  Gamepad2, Landmark, Monitor, Music2, PenTool, Radio, Search, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requestBackend } from '../../services/backend'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
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
  match: (category: string) => boolean
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const themes: Theme[] = [
  { name: 'Política', description: 'Debates e discussões políticas.', icon: Landmark, match: (c) => norm(c) === 'politica' },
  { name: 'Games', description: 'Jogos, novidades e comunidades.', icon: Gamepad2, match: (c) => norm(c) === 'games' },
  { name: 'Amizade', description: 'Faça amigos e converse.', icon: Users, match: (c) => norm(c) === 'amizade' || norm(c) === 'amizades' },
  { name: 'Tecnologia', description: 'Tech, programação e inovação.', icon: Monitor, match: (c) => norm(c) === 'tecnologia' || norm(c) === 'tech' },
  { name: 'Música', description: 'Música, artistas e playlists.', icon: Music2, match: (c) => norm(c) === 'musica' },
  { name: 'Educação', description: 'Estudo, aprendizado e ajuda.', icon: BookOpen, match: (c) => norm(c) === 'educacao' },
  { name: 'Anime & Mangá', description: 'Anime, mangá e cultura otaku.', icon: Cat, match: (c) => norm(c).includes('anime') },
  { name: 'Entretenimento', description: 'Memes, vídeos e diversão.', icon: Clapperboard, match: (c) => norm(c).includes('entreten') || norm(c).includes('filme') || norm(c).includes('series') || norm(c).includes('memes') },
  { name: 'Arte & Design', description: 'Arte, design e criatividade.', icon: PenTool, match: (c) => norm(c).includes('arte') || norm(c).includes('design') },
  { name: 'Negócios', description: 'Empreendedorismo e negócios.', icon: BriefcaseBusiness, match: (c) => norm(c).includes('negocio') || norm(c).includes('empreend') },
  { name: 'Esportes', description: 'Futebol e esportes em geral.', icon: Activity, match: (c) => norm(c).includes('esporte') || norm(c).includes('futebol') },
  { name: 'Outros', description: 'Explore outros temas.', icon: Radio, match: (c) => !themes.some(t => t.name !== 'Outros' && t.match(c)) },
]

function memberCount(server: Server) {
  return Array.isArray(server.members) ? server.members.length : 0
}

export function DiscoverView({ onClose }: Props) {
  const currentUser = useUserStore(s => s.currentUser)
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
  const tabsRef = useRef<HTMLDivElement>(null)
  const tabsDrag = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0 })

  const onTabsPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = tabsRef.current
    if (!el) return
    tabsDrag.current = { active: true, moved: false, startX: e.clientX, scrollLeft: el.scrollLeft }
    const move = (ev: PointerEvent) => {
      if (!tabsDrag.current.active) return
      const dx = ev.clientX - tabsDrag.current.startX
      if (Math.abs(dx) > 4) tabsDrag.current.moved = true
      el.scrollLeft = tabsDrag.current.scrollLeft - dx
    }
    const up = () => {
      tabsDrag.current.active = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const pickTab = (name: string) => {
    if (tabsDrag.current.moved) return
    setCategory(name)
  }

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

  return (
    <div className="discover-modal" onClick={onClose}>
      <main className="ping-discover" onClick={e => e.stopPropagation()}>
        <aside className="ping-side">
          <div className="ping-side-brand">
            <strong>Descubra</strong>
            <button className="ping-side-close" type="button" onClick={onClose} aria-label="Fechar">
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>

          <nav className="ping-side-nav">
            <button
              type="button"
              className={category === 'Todos' && !verifiedOnly ? 'active' : ''}
              onClick={() => { setCategory('Todos'); setVerifiedOnly(false) }}
            >
              <Compass size={16} strokeWidth={2.2} /> Início
            </button>
            <button
              type="button"
              className={verifiedOnly ? 'active' : ''}
              onClick={() => setVerifiedOnly(v => !v)}
            >
              <ShieldCheck size={16} strokeWidth={2.2} /> Servidores verificados
            </button>
          </nav>

          <div className="ping-side-spacer" />

          {currentUser && (
            <div className="ping-user">
              {currentUser.photoUrl ? (
                <img src={toImageUrl(currentUser.photoUrl)} alt="" />
              ) : (
                <span className="ping-user-char">{currentUser.name.charAt(0).toUpperCase()}</span>
              )}
              <div className="ping-user-info">
                <strong>{currentUser.name}</strong>
                <span className="ping-user-status"><i /> Disponível</span>
              </div>
            </div>
          )}
        </aside>

        <section className="ping-main">
          <div className="ping-topbar">
            <div className="ping-tabs" ref={tabsRef} onPointerDown={onTabsPointerDown}>
              <button
                type="button"
                className={category === 'Todos' ? 'active' : ''}
                onClick={() => pickTab('Todos')}
              >
                Início
              </button>
              {themes.map(theme => (
                <button
                  key={theme.name}
                  type="button"
                  className={category === theme.name ? 'active' : ''}
                  onClick={() => pickTab(theme.name)}
                  title={theme.description}
                >
                  {theme.name}
                </button>
              ))}
            </div>
            <label className="ping-topsearch">
              <Search size={15} strokeWidth={2.2} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Busca"
                maxLength={80}
                aria-label="Busca de servidores"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca">
                  <X size={13} strokeWidth={2.6} />
                </button>
              )}
            </label>
          </div>

          <div className="ping-scroll">
            <div className="ping-hero">
              <h1>ENCONTRE SUA<br />COMUNIDADE NO<br />PINGUIN</h1>
              <p>Há sempre um lugar para você: seja para jogar, ouvir música ou aprender.</p>
            </div>

            <div className="ping-content">
              <div className="ping-content-head">
                <h2>Servidores em Destaque</h2>
                {(query.trim() || category !== 'Todos' || verifiedOnly) && (
                  <span className="ping-content-filter">
                    {query.trim() ? `Busca: "${query.trim()}"` : verifiedOnly ? 'Servidores verificados' : category}
                  </span>
                )}
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
                        </span>
                        <span className="ping-server-body">
                          <span className="ping-server-name-row">
                            {server.verified && <BadgeCheck className="ping-verified" size={16} strokeWidth={2.4} />}
                            <h3>{server.name}</h3>
                          </span>
                          <p>{server.description || 'Comunidade no Friends Space.'}</p>
                          <span className="ping-server-stats">
                            <span className="ping-online-dot" />
                            {count.toLocaleString('pt-BR')} {count === 1 ? 'membro' : 'membros'}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {notice && <div className="ping-notice" role="status"><Sparkles size={14} />{notice}</div>}
      </main>
    </div>
  )
}
