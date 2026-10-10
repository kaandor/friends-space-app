// DiscoverView — interface orbital de descoberta de servidores.
// Portada de "descubra-servidores" (client/src/pages/Home.tsx) para o Friends
// Space, plugada nos dados REAIS: directoryState -> servers (verificados,
// categorias/temas, membros). Nenhum dado inventado: servidor so aparece se
// existir no backend.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Cat,
  ChevronRight,
  Clapperboard,
  Compass,
  Gamepad2,
  Landmark,
  Monitor,
  Music2,
  PenTool,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { requestBackend } from '../../services/backend'
import { toImageUrl } from '../../services/driveService'
import { assetUrl } from '../../utils/assets'
import type { Server } from '../../types'
import './discover.css'

interface Props { onClose: () => void }

type Theme = {
  name: string
  description: string
  icon: LucideIcon
  accent: string
  match: (category: string) => boolean
}

const themes: Theme[] = [
  { name: 'Política', description: 'Debates e discussões políticas.', icon: Landmark, accent: '#78f238', match: (c) => norm(c) === 'politica' },
  { name: 'Games', description: 'Jogos, novidades e comunidades.', icon: Gamepad2, accent: '#69ed42', match: (c) => norm(c) === 'games' },
  { name: 'Amizade', description: 'Faça amigos e converse.', icon: Users, accent: '#64df5e', match: (c) => norm(c) === 'amizade' || norm(c) === 'amizades' },
  { name: 'Tecnologia', description: 'Tech, programação e inovação.', icon: Monitor, accent: '#72f38a', match: (c) => norm(c) === 'tecnologia' || norm(c) === 'tech' },
  { name: 'Música', description: 'Música, artistas e playlists.', icon: Music2, accent: '#7af344', match: (c) => norm(c) === 'musica' },
  { name: 'Educação', description: 'Estudo, aprendizado e ajuda.', icon: BookOpen, accent: '#67e979', match: (c) => norm(c) === 'educacao' || norm(c) === 'educacao' },
  { name: 'Anime & Mangá', description: 'Anime, mangá e cultura otaku.', icon: Cat, accent: '#8af44d', match: (c) => norm(c).includes('anime') },
  { name: 'Entretenimento', description: 'Memes, vídeos e diversão.', icon: Clapperboard, accent: '#7ee64a', match: (c) => norm(c).includes('entreten') || norm(c).includes('filme') || norm(c).includes('series') || norm(c).includes('memes') },
  { name: 'Arte & Design', description: 'Arte, design e criatividade.', icon: PenTool, accent: '#b6f55a', match: (c) => norm(c).includes('arte') || norm(c).includes('design') },
  { name: 'Negócios', description: 'Empreendedorismo e negócios.', icon: BriefcaseBusiness, accent: '#74ec50', match: (c) => norm(c).includes('negocio') || norm(c).includes('empreend') },
  { name: 'Esportes', description: 'Futebol e esportes em geral.', icon: Activity, accent: '#a3f264', match: (c) => norm(c).includes('esporte') || norm(c).includes('futebol') },
  { name: 'Outros', description: 'Explore outros temas.', icon: Radio, accent: '#a1aab1', match: () => true },
]

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function DiscoverView({ onClose }: Props) {
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedTheme, setSelectedTheme] = useState('Todos')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState<{ title: string; kind: 'theme' | 'verified' } | null>(null)
  const [modalQuery, setModalQuery] = useState('')
  const [entering, setEntering] = useState<string | null>(null)
  const setCurrentServer = useServerStore(s => s.setCurrentServer)
  const joinServer = useServerStore(s => s.joinServer)
  const { currentUser } = useUserStore()

  useEffect(() => {
    void (async () => {
      try {
        const res = await requestBackend<{ servers: Server[] }>('directoryState', {})
        setServers(res?.servers || [])
      } catch { /* sem dados: tela mostra vazio honesto */ }
      finally { setLoading(false) }
    })()
  }, [])

  const filteredThemes = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return themes
    return themes.filter((theme) => `${theme.name} ${theme.description}`.toLowerCase().includes(search))
  }, [query])

  // Quantos servidores reais cada tema tem (o ultimo match "Outros" pega sobras)
  const themeCount = (theme: Theme) => servers.filter(s => theme.match(s.category || '')).length
  const totalMapped = themes.slice(0, -1).reduce((acc, t) => acc + themeCount(t), 0)
  const othersCount = Math.max(servers.length - totalMapped, 0)

  const verified = servers.filter(s => s.verified === true)

  const serversInTheme = (theme: Theme) => {
    const list = servers.filter(s => theme.match(s.category || ''))
    if (theme.name === 'Outros') {
      const mappedIds = new Set(themes.slice(0, -1).flatMap(t => servers.filter(s => t.match(s.category || '')).map(s => s.id)))
      return servers.filter(s => !mappedIds.has(s.id))
    }
    return list
  }

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2800)
  }

  const handleBack = () => {
    onClose()
    showNotice('Você está no início da descoberta.')
  }

  useEffect(() => {
    if (!modal) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [modal])

  useEffect(() => {
    const handleEscapeClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !modal) onClose()
    }
    document.addEventListener('keydown', handleEscapeClose)
    return () => document.removeEventListener('keydown', handleEscapeClose)
  }, [modal, onClose])

  const openThemeModal = (themeName: string) => {
    setSelectedTheme(themeName)
    setModalQuery('')
    setModal({ title: themeName, kind: 'theme' })
  }

  const openVerifiedModal = () => {
    setModalQuery('')
    setModal({ title: 'Servidores verificados', kind: 'verified' })
  }

  const handleJoin = (server: Server) => {
    if (entering || !currentUser) return
    setEntering(server.id)
    void (async () => {
      try {
        const r = await joinServer(server.inviteCode, currentUser.id)
        if (r?.ok) {
          const updated = useServerStore.getState().servers.find(s => s.id === server.id) || server
          setCurrentServer(updated)
          onClose()
        }
      } finally {
        setEntering(null)
      }
    })()
  }

  const modalServers = useMemo(() => {
    if (!modal) return []
    const base = modal.kind === 'verified'
      ? verified
      : serversInTheme(themes.find(t => t.name === modal.title) || themes[themes.length - 1])
    const q = modalQuery.trim().toLowerCase()
    return q ? base.filter(s => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)) : base
  }, [modal, modalQuery, servers, verified])

  const serverList = (list: Server[]) => (
    list.length === 0 ? (
      <div className="empty-state"><Search size={15} />Nenhum servidor neste tema ainda.</div>
    ) : list.map(server => (
      <div className="server-card" key={server.id} onClick={() => handleJoin(server)} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter') handleJoin(server) }}>
        <span className="server-avatar avatar-green">
          <img src={toImageUrl(server.photoUrl || assetUrl('Logo.png'))} alt={server.name} loading="lazy" />
        </span>
        <span className="server-copy">
          <span className="server-name-row">
            <h3>{server.name}</h3>
            {server.verified && <ShieldCheck className="verified-icon" size={12} />}
          </span>
          {server.description && <p>{server.description}</p>}
          <span className="server-stats">
            <span><Users size={10} />{(server.members || []).length}</span>
            <span><span className="online-dot" />ativo</span>
          </span>
        </span>
        <button className="join-button" type="button" onClick={e => { e.stopPropagation(); handleJoin(server) }}>
          {entering === server.id ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    ))
  )

  return (
    <div className="discover-modal" onClick={onClose}>
      <main className="discover-page" style={{ '--orbit-dust': 'none' } as CSSProperties} onClick={(event) => event.stopPropagation()}>
        <div className="discover-frame">
        <div className="discover-layout">
          <div className="discover-shell">
            <button className="back-button" type="button" onClick={handleBack} aria-label="Voltar">
              <ArrowLeft size={15} />
              <span>Voltar</span>
            </button>

            <section className="hero-panel" id="top" style={{ backgroundImage: `url(${assetUrl('astro-bg.png')})` }}>
              <div className="hero-overlay" />
              <div className="hero-scanline" />
              <img className="hero-mascots" src={assetUrl('astro-chars.png')} alt="Mascotes alienígena e astronauta da Friends Space" />
              <div className="hero-content">
                <div className="eyebrow"><span className="eyebrow-line" />SUA PRÓXIMA COMUNIDADE ESTÁ AQUI</div>
                <h1>Descubra <span>servidores</span></h1>
                <p>Conecte-se a comunidades incríveis<br className="desktop-break" /> e faça parte de algo maior.</p>
                <label className="search-field">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar temas..." aria-label="Buscar temas" />
                  {query ? <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}><span aria-hidden="true">×</span></button> : null}
                </label>
              </div>
            </section>

            <section className="explore-intro" aria-labelledby="explore-title">
              <div className="section-kicker"><Sparkles size={13} /> CURADORIA DO MOMENTO</div>
              <h2 id="explore-title">Encontre seu próximo universo.</h2>
              <p>Explore espaços feitos para conversar, aprender e encontrar pessoas com os mesmos interesses.</p>
            </section>

            <section className="verified-section" aria-labelledby="verified-title">
              <div className="column-heading verified-heading">
                <div><ShieldCheck size={14} /><span id="verified-title">SERVIDORES VERIFICADOS</span></div>
                {verified.length > 0 && (
                  <button className="data-more" type="button" onClick={openVerifiedModal}>Ver mais <ArrowUpRight size={12} /></button>
                )}
              </div>
              {loading ? (
                <div className="verified-empty"><ShieldCheck size={20} /><div><strong>Carregando servidores...</strong><span>Buscando comunidades na plataforma.</span></div></div>
              ) : verified.length === 0 ? (
                <div className="verified-empty">
                  <ShieldCheck size={20} />
                  <div><strong>Nenhum servidor verificado disponível.</strong><span>Os servidores aparecerão aqui quando a fonte de dados estiver conectada.</span></div>
                </div>
              ) : (
                <div className="server-list">{serverList(verified.slice(0, 4))}</div>
              )}
            </section>

            <section className="themes-section themes-section-primary" id="temas">
              <div className="section-heading-row themes-heading">
                <div>
                  <div className="section-kicker"><Compass size={13} /> EXPLORE POR INTERESSE</div>
                  <h2>Qual é a sua frequência?</h2>
                </div>
                {query ? <div className="search-result-label"><Sparkles size={13} /> {filteredThemes.length ? 'Temas encontrados' : 'Nenhum tema encontrado'}</div> : null}
              </div>
              <div className="theme-grid">
                {filteredThemes.length ? filteredThemes.map((theme, index) => {
                  const Icon = theme.icon
                  const isSelected = selectedTheme === theme.name
                  const count = theme.name === 'Outros' ? othersCount : themeCount(theme)
                  return (
                    <button className={isSelected ? 'theme-card selected-theme' : 'theme-card'} key={theme.name} type="button"
                      style={{ '--theme-accent': theme.accent, '--theme-delay': `${index * 35}ms` } as CSSProperties}
                      onClick={() => openThemeModal(theme.name)}>
                      <span className="theme-icon"><Icon size={20} strokeWidth={2.2} /></span>
                      <span className="theme-copy"><strong>{theme.name}</strong><small>{theme.description}</small><small className="theme-active">{count} {count === 1 ? 'servidor' : 'servidores'}</small></span>
                      <ChevronRight className="theme-arrow" size={16} />
                    </button>
                  )
                }) : <div className="theme-empty"><Search size={17} /><span>Tente buscar outro tema.</span><button type="button" onClick={() => setQuery('')}>Limpar busca</button></div>}
              </div>
            </section>
          </div>
          </div>
          </div>
          </main>
          {modal ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
            <section className="server-modal fs-modal-in" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="section-kicker"><Compass size={13} /> {modal.kind === 'verified' ? 'CATÁLOGO VERIFICADO' : 'EXPLORAR TEMA'}</div>
                  <h2 id="modal-title">{modal.title}</h2>
                  <p>{modal.kind === 'verified' ? 'Servidores verificados disponíveis na plataforma.' : `Comunidades relacionadas a ${modal.title}.`}</p>
                </div>
                <button className="modal-close" type="button" aria-label="Fechar janela" onClick={() => setModal(null)}><span aria-hidden="true">×</span></button>
              </div>
              <label className="modal-search">
                <Search size={16} />
                <input value={modalQuery} onChange={(event) => setModalQuery(event.target.value)} placeholder="Buscar servidores..." aria-label="Buscar servidores" />
              </label>
              <div style={{ maxHeight: '46vh', overflowY: 'auto', padding: '0 24px 24px' }}>
                {modalServers.length === 0 ? (
                  <div className="modal-empty">
                    <Search size={21} />
                    <strong>{modalQuery ? 'Nenhum resultado encontrado.' : 'Nenhum servidor disponível.'}</strong>
                    <span>Os servidores aparecerão aqui quando os dados do site estiverem conectados.</span>
                  </div>
                ) : serverList(modalServers)}
              </div>
            </section>
          </div>
          ) : null}
          {notice ? <div className="notice" role="status"><Sparkles size={15} />{notice}</div> : null}
          </div>
          )
          }
