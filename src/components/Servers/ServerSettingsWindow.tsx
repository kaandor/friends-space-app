import { Fa } from '../../utils/fa'
import { useState, useMemo, useEffect, useRef } from 'react'
import type { Server, Role } from '../../types'

/* ══ PARTE 2 (UI): helpers defensivos p/ contrato Server.settings/auditLog ══ */
export function localDefaultSettings() {
  return {
    themes: [] as string[],
    frequency: 'Selecionar frequência',
    minAge: 'Selecionar idade mínima',
    moderation: 'Médio',
    toggles: { public: false, verification: false, welcome: false, log: false, rules: false },
    automod: { spam: true, links: true, ofensa: false, caps: false, words: [] as string[] },
    bots: [] as { id: string; name: string; token: string; desc: string }[],
    webhooks: [] as { id: string; name: string; url: string }[],
    emojis: [] as { id: string; name: string; detail: string }[],
    stickers: [] as { id: string; name: string; detail: string }[],
    invites: [] as { id: string; code: string; label: string; createdAt: number }[],
    widget: { title: '', channel: '', enabled: false },
    template: null as null | { name: string; detail: string; data: unknown },
    integrations: [] as { id: string; name: string; detail: string }[],
    community: {} as Record<string, boolean>,
    banned: [] as string[],
    timeouts: {} as Record<string, number>,
  }
}
export type LocalSettings = ReturnType<typeof localDefaultSettings>
function mergeSettings(raw: unknown): LocalSettings {
  const d = localDefaultSettings()
  const s = (raw || {}) as Record<string, unknown>
  const tog = (s.toggles || {}) as Record<string, boolean>
  const am = (s.automod || {}) as Record<string, unknown>
  const wg = (s.widget || {}) as Record<string, unknown>
  return {
    ...d, ...(s as object),
    themes: Array.isArray(s.themes) ? (s.themes as string[]) : d.themes,
    frequency: typeof s.frequency === 'string' ? (s.frequency as string) : d.frequency,
    minAge: typeof s.minAge === 'string' ? (s.minAge as string) : d.minAge,
    moderation: typeof s.moderation === 'string' ? (s.moderation as string) : d.moderation,
    toggles: { ...d.toggles, public: !!tog.public, verification: !!tog.verification, welcome: !!tog.welcome, log: !!tog.log, rules: !!tog.rules },
    automod: {
      spam: am.spam !== undefined ? !!am.spam : d.automod.spam,
      links: am.links !== undefined ? !!am.links : d.automod.links,
      ofensa: am.ofensa !== undefined ? !!am.ofensa : d.automod.ofensa,
      caps: am.caps !== undefined ? !!am.caps : d.automod.caps,
      words: Array.isArray(am.words) ? (am.words as string[]) : [],
    },
    bots: Array.isArray(s.bots) ? (s.bots as LocalSettings['bots']) : [],
    webhooks: Array.isArray(s.webhooks) ? (s.webhooks as LocalSettings['webhooks']) : [],
    emojis: Array.isArray(s.emojis) ? (s.emojis as LocalSettings['emojis']) : [],
    stickers: Array.isArray(s.stickers) ? (s.stickers as LocalSettings['stickers']) : [],
    invites: Array.isArray(s.invites) ? (s.invites as LocalSettings['invites']) : [],
    widget: { title: typeof wg.title === 'string' ? (wg.title as string) : '', channel: typeof wg.channel === 'string' ? (wg.channel as string) : '', enabled: !!wg.enabled },
    template: (s.template as LocalSettings['template']) ?? null,
    integrations: Array.isArray(s.integrations) ? (s.integrations as LocalSettings['integrations']) : [],
    community: (s.community || {}) as Record<string, boolean>,
    banned: Array.isArray(s.banned) ? (s.banned as string[]) : [],
    timeouts: (s.timeouts || {}) as Record<string, number>,
  }
}
function rid(): string {
  try { return crypto.randomUUID() } catch { return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
}
async function copyTextGlobal(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      const ok = document.execCommand('copy'); document.body.removeChild(el); return ok
    } catch { return false }
  }
}
function fmtTime(ts: number): string {
  try { return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { canManageServer, canDeleteServer, SERVER_PERMISSIONS, ROLE_TEMPLATES, canAccessSection, isServerOwnerOrStaff } from '../../config/permissions'
import { getAstroTier } from '../../utils/astro'
import { ServerPostModal } from '../Social/ServerPostModal'

/* ════════════════════════════════════════════════════════════════
   ServerSettingsWindow — painel de configurações do servidor
   (estilo reference: identidade, temas, frequência, eventos, canais,
   categorias, políticas, configurações, cargos, bots, estatísticas)
   Conectado ao sistema real via useServerStore + props do App.
   ════════════════════════════════════════════════════════════════ */

interface ServerSettingsWindowProps {
  server: Server | null
  activeUserId?: string | null
  /* edição (vindos do App) */
  editName: string
  setEditName: (v: string) => void
  editPhoto: string
  editBanner: string
  editDesc: string
  setEditDesc: (v: string) => void
  editColor: string
  setEditColor: (v: string) => void
  editCallAccess: 'public' | 'members' | 'staff'
  setEditCallAccess: (v: 'public' | 'members' | 'staff') => void
  editCallPassword: string
  setEditCallPassword: (v: string) => void
  editStaffIds: string
  setEditStaffIds: (v: string) => void
  /* ações */
  onSave: () => void
  onDelete: () => void
  onClose: () => void
  onRequestIcon: () => void
  onRequestBanner: () => void
  onIconFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBannerFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  iconInputRef: React.RefObject<HTMLInputElement | null>
  bannerInputRef: React.RefObject<HTMLInputElement | null>
  driveConnected: boolean
  driveBusy: boolean
  onToggleDrive: () => void
  error?: string
}

/* ── Navegação (grupos como na referência) ── */
const NAV_GROUPS: { label: string; items: { key: string; label: string; icon: string }[] }[] = [
  {
    label: 'VISÃO GERAL',
    items: [
      { key: 'visao', label: 'Visão geral', icon: 'fa-gauge-high' },
      { key: 'estatisticas', label: 'Estatísticas', icon: 'fa-chart-line' },
      { key: 'auditoria', label: 'Registro de auditoria', icon: 'fa-clipboard-list' },
    ],
  },
  {
    label: 'CONFIGURAÇÕES',
    items: [
      { key: 'config', label: 'Configurações do servidor', icon: 'fa-sliders' },
      { key: 'canais', label: 'Canais', icon: 'fa-hashtag' },
      { key: 'categorias', label: 'Categorias', icon: 'fa-folder-tree' },
      { key: 'cargos', label: 'Cargos e permissões', icon: 'fa-shield' },
      { key: 'membros', label: 'Membros', icon: 'fa-user-group' },
      { key: 'eventos', label: 'Eventos', icon: 'fa-calendar-days' },
      { key: 'emojis', label: 'Emojis', icon: 'fa-face-smile' },
      { key: 'figurinhas', label: 'Figurinhas', icon: 'fa-stamp' },
      { key: 'convites', label: 'Convites', icon: 'fa-link' },
      { key: 'widget', label: 'Widget', icon: 'fa-code' },
      { key: 'modelo', label: 'Modelo do servidor', icon: 'fa-copy' },
    ],
  },
  {
    label: 'COMUNIDADE',
    items: [
      { key: 'visao_comunidade', label: 'Visão da comunidade', icon: 'fa-globe' },
      { key: 'habilitacao', label: 'Habilitação da comunidade', icon: 'fa-check-double' },
      { key: 'descoberta', label: 'Descoberta', icon: 'fa-magnifying-glass' },
      { key: 'publicacoes', label: 'Publicações e anúncios', icon: 'fa-tower-broadcast' },
      { key: 'regras', label: 'Regras do servidor', icon: 'fa-scroll' },
      { key: 'moderacao', label: 'Moderação', icon: 'fa-gavel' },
      { key: 'automod', label: 'AutoMod', icon: 'fa-robot' },
    ],
  },
  {
    label: 'INTEGRAÇÕES & AUTOMAÇÃO',
    items: [
      { key: 'integracoes', label: 'Integrações', icon: 'fa-plug' },
      { key: 'webhooks', label: 'Webhooks', icon: 'fa-satellite-dish' },
      { key: 'bots', label: 'Bots', icon: 'fa-robot' },
    ],
  },
]

const THEMES_AVAILABLE = ['Games', 'Animes', 'Tecnologia', 'Música', 'Filmes e Séries', 'Esportes', 'Estudos', 'Arte', 'Programação', 'Política', 'Humor', 'Outros']
const DISCOVERY_CATEGORIES = ['Clube de futebol', 'Pessoa famosa', 'Jogos', 'Música', 'Filmes e Séries', 'Esportes', 'Tecnologia', 'Estudos', 'Comunidade', 'Humor', 'Outro']

function SectionTitle({ eyebrow, title, desc, action }: { eyebrow?: string; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="ssw-section-heading">
      <div>
        {eyebrow && <p className="ssw-eyebrow">{eyebrow}</p>}
        <h3>{title}</h3>
        {desc && <p className="ssw-desc">{desc}</p>}
      </div>
      {action}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" className={`ssw-toggle ${checked ? 'is-on' : ''}`} onClick={onChange} aria-pressed={checked}>
      <span className="ssw-toggle-knob" />
    </button>
  )
}

function SelectField({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="ssw-select-wrap">
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
      <Fa name="chevron-down" size={14} />
    </div>
  )
}

function SettingRow({ icon, title, desc, checked, onChange }: { icon: string; title: string; desc: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="ssw-setting-row">
      <span className="ssw-setting-icon"><Fa name={icon} size={14} /></span>
      <div className="ssw-setting-copy"><strong>{title}</strong><span>{desc}</span></div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

/* ── Modal de recurso (evento/canal/categoria) ── */
type ResourceKind = 'evento' | 'canal' | 'categoria'
function ResourceModal({ kind, onClose, onSave }: {
  kind: ResourceKind
  onClose: () => void
  onSave: (name: string, detail: string, channelKind?: 'text' | 'voice') => void
}) {
  const [name, setName] = useState('')
  const [detail, setDetail] = useState(kind === 'evento' ? 'Sábado, 20:00' : kind === 'categoria' ? 'Visível para todos' : 'Descrição do canal')
  const [channelKind, setChannelKind] = useState<'text' | 'voice'>('text')
  const title = `Criar ${kind === 'evento' ? 'evento' : kind === 'canal' ? 'canal' : 'categoria'}`
  return (
    <div className="ssw-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="ssw-modal" role="dialog" aria-modal="true">
        <div className="ssw-modal-head">
          <div>
            <p className="ssw-eyebrow">CONFIGURAÇÃO RÁPIDA</p>
            <h3>{title}</h3>
          </div>
          <button className="ssw-modal-close" onClick={onClose} aria-label="Fechar"><Fa name="xmark" size={14} /></button>
        </div>
        <label className="ssw-field"><span>{kind === 'evento' ? 'Nome do evento' : kind === 'canal' ? 'Nome da sala' : 'Nome da categoria'}</span>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'evento' ? 'Ex.: Torneio de Valorant' : kind === 'canal' ? 'Ex.: novidades' : 'Ex.: Comunidade'} />
        </label>
        {kind === 'canal' && (
          <div className="ssw-modal-choice">
            <span>Tipo de sala</span>
            <div>
              <button className={channelKind === 'text' ? 'selected' : ''} onClick={() => setChannelKind('text')}><Fa name="hashtag" size={14} /> Texto</button>
              <button className={channelKind === 'voice' ? 'selected' : ''} onClick={() => setChannelKind('voice')}><Fa name="microphone" size={14} /> Voz</button>
            </div>
          </div>
        )}
        <label className="ssw-field"><span>{kind === 'evento' ? 'Data e horário' : kind === 'categoria' ? 'Visibilidade e acesso' : 'Descrição'}</span>
          <input value={detail} onChange={e => setDetail(e.target.value)} />
        </label>
        <div className="ssw-modal-footer">
          <button className="ssw-modal-cancel" onClick={onClose}>Cancelar</button>
          <button className="ssw-primary-btn" disabled={!name.trim()} onClick={() => onSave(name.trim(), detail.trim(), kind === 'canal' ? channelKind : undefined)}>
            <Fa name="floppy-disk" size={14} /> Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

export function ServerSettingsWindow(props: ServerSettingsWindowProps) {
  const {
    server, activeUserId,
    editName, setEditName, editPhoto, editBanner,
    editDesc, setEditDesc, editColor, setEditColor,
    editCallAccess, setEditCallAccess, editCallPassword, setEditCallPassword, editStaffIds, setEditStaffIds,
    onSave, onDelete, onClose,
    onRequestIcon, onRequestBanner, onIconFile, onBannerFile,
    iconInputRef, bannerInputRef,
    driveConnected, driveBusy, onToggleDrive, error,
  } = props

  const [active, setActive] = useState('visao')
  const canManage = canManageServer(server, activeUserId)
  const canDelete = canDeleteServer(server, activeUserId)

  const currentUser = useUserStore(s => s.currentUser)
  const isFree = getAstroTier(currentUser) === 'none'
  // Seçoes basicas que contas free podem acessar (tema, calls, texto, icone, banner)
  const FREE_KEYS = new Set(['visao', 'config', 'canais', 'categorias'])
  // Se o usuario free tiver uma aba premium ativa (ex.: recarregou a pagina), mostra visao
  const effectiveActive = (isFree && !FREE_KEYS.has(active)) || !canAccessSection(server, activeUserId, active) ? 'visao' : active

  const addChannel = useServerStore(s => s.addChannel)
  const deleteChannel = useServerStore(s => s.deleteChannel)
  const addCategory = useServerStore(s => s.addCategory)
  const deleteCategory = useServerStore(s => s.deleteCategory)
  const addRole = useServerStore(s => s.addRole)
  const updateServer = useServerStore(s => s.updateServer)
  const sendStoreMessage = useServerStore(s => s.sendMessage)
  const addServerEvent = useServerStore(s => s.addServerEvent)
  const deleteServerEvent = useServerStore(s => s.deleteServerEvent)
  /* Dados ao vivo do store (não usa props que ficam desatualizadas) */
  const storeServer = useServerStore(s => (server?.id ? s.servers.find(sv => sv.id === server.id) : undefined))
  const loadServers = useServerStore(s => s.loadServers)
  const storeCount = useServerStore(s => s.servers.length)
  useEffect(() => { void loadServers().catch(() => { }) }, [server?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const propHasData = Boolean(server && (server.name || (server.channels || []).length || (server.members || []).length))
  const liveServer = storeServer || (propHasData ? server : undefined)
  const liveRoles = liveServer?.roles || []
  const liveChannels = liveServer?.channels || []
  const liveCategories = liveServer?.categories || []
  const liveEvents = liveServer?.events || []
  const liveMembers = liveServer?.members || []

  /* ══ Estados inicializados a partir de liveServer.settings (persistentes) ══ */
  const initialSettings = useMemo(() => mergeSettings((liveServer as unknown as Record<string, unknown>)?.settings), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedThemes, setSelectedThemes] = useState<string[]>(() =>
    initialSettings.themes.length > 0 ? initialSettings.themes : (liveServer?.category ? [liveServer.category] : []))
  const [frequency, setFrequency] = useState(initialSettings.frequency)
  const [minAge, setMinAge] = useState(initialSettings.minAge)
  const [moderation, setModeration] = useState(initialSettings.moderation)
  const [toggles, setToggles] = useState(initialSettings.toggles)

  /* Políticas (regras) editáveis — vivem na descrição (editDesc + onSave) */
  const [rules, setRules] = useState<string[]>(editDesc ? editDesc.split('\n').filter(Boolean) : [])
  const [editingRule, setEditingRule] = useState<number | null>(null)
  const [ruleDraft, setRuleDraft] = useState('')

  /* Modal de recurso */
  const [resourceModal, setResourceModal] = useState<ResourceKind | null>(null)

  /* Formulários */
  const [newRole, setNewRole] = useState('')
  const [newRoleColor, setNewRoleColor] = useState('#29A3FF')
  const [autoMod, setAutoMod] = useState({ spam: initialSettings.automod.spam, links: initialSettings.automod.links, ofensa: initialSettings.automod.ofensa, caps: initialSettings.automod.caps })
  const [blockedWords, setBlockedWords] = useState<string[]>(initialSettings.automod.words)
  const [newWord, setNewWord] = useState('')
  const [bots, setBots] = useState(initialSettings.bots)
  const [botName, setBotName] = useState('')
  const [botToken, setBotToken] = useState('')
  const [botDesc, setBotDesc] = useState('')
  const [webhooks, setWebhooks] = useState(initialSettings.webhooks)
  const [whName, setWhName] = useState('')
  const [whUrl, setWhUrl] = useState('')
  /* Biblioteca SEPARADA por aba (antes era um array só compartilhado) */
  const [emojiItems, setEmojiItems] = useState(initialSettings.emojis)
  const [stickerItems, setStickerItems] = useState(initialSettings.stickers)
  const [inviteItems, setInviteItems] = useState(initialSettings.invites)
  const [newInviteLabel, setNewInviteLabel] = useState('')
  const [widgetTitle, setWidgetTitle] = useState(initialSettings.widget.title)
  const [widgetChannel, setWidgetChannel] = useState(initialSettings.widget.channel)
  const [widgetEnabled, setWidgetEnabled] = useState(initialSettings.widget.enabled)
  const [tplName, setTplName] = useState('')
  const [libName, setLibName] = useState('')
  const [libDetail, setLibDetail] = useState('')
  /* Integrações */
  const [integrations, setIntegrations] = useState(initialSettings.integrations)
  const [intName, setIntName] = useState('')
  const [intDetail, setIntDetail] = useState('')
  /* Comunidade (chaves estáveis por aba) */
  const [communityValues, setCommunityValues] = useState<Record<string, boolean>>(initialSettings.community)
  const [serverPostMode, setServerPostMode] = useState<'post' | 'story' | null>(null)
  const [discoverCategory, setDiscoverCategory] = useState<string | null>(null)
  const [discoverTagsText, setDiscoverTagsText] = useState<string | null>(null)
  const saveDiscovery = async () => {
    if (!server) return
    const tags = (discoverTagsText ?? (liveServer?.tags || []).join(', '))
      .split(',').map(x => x.trim().slice(0, 40)).filter(Boolean).slice(0, 5)
    try {
      const st = useServerStore.getState() as unknown as Record<string, unknown>
      if (typeof st.updateServer === 'function') {
        await (st.updateServer as (id: string, d: unknown) => Promise<void>)(server.id, { category: discoverCategory ?? liveServer?.category ?? '', tags })
        setDiscoverCategory(null)
        setDiscoverTagsText(null)
        notify('Classificação salva')
      }
    } catch { notify('Erro ao salvar') }
  }
  const [toastMsg, setToastMsg] = useState('')
  const fileImportRef = useRef<HTMLInputElement | null>(null)

  const notify = (msg: string) => {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg(''), 2600)
  }

  /* Re-sincroniza quando troca de servidor */
  const serverIdRef = useRef(server?.id)
  useEffect(() => {
    if (serverIdRef.current === server?.id) return
    serverIdRef.current = server?.id
    const s = mergeSettings((liveServer as unknown as Record<string, unknown>)?.settings)
    setSelectedThemes(s.themes.length > 0 ? s.themes : (liveServer?.category ? [liveServer.category] : []))
    setFrequency(s.frequency); setMinAge(s.minAge); setModeration(s.moderation); setToggles(s.toggles)
    setAutoMod({ spam: s.automod.spam, links: s.automod.links, ofensa: s.automod.ofensa, caps: s.automod.caps })
    setBlockedWords(s.automod.words); setBots(s.bots); setWebhooks(s.webhooks)
    setEmojiItems(s.emojis); setStickerItems(s.stickers); setInviteItems(s.invites)
    setWidgetTitle(s.widget.title); setWidgetChannel(s.widget.channel); setWidgetEnabled(s.widget.enabled)
    setIntegrations(s.integrations); setCommunityValues(s.community)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id])

  /* Hidrata uma vez quando os dados reais chegam (prop vazia + store carrega depois) */
  const hydratedRef = useRef('')
  useEffect(() => {
    if (!liveServer || hydratedRef.current === liveServer.id) return
    const hasData = Boolean(liveServer.name || (liveServer.channels || []).length || (liveServer.members || []).length
      || Object.keys((liveServer as unknown as Record<string, unknown>).settings as Record<string, unknown> || {}).length)
    if (!hasData) return
    hydratedRef.current = liveServer.id
    const s = mergeSettings((liveServer as unknown as Record<string, unknown>)?.settings)
    setSelectedThemes(s.themes.length > 0 ? s.themes : (liveServer?.category ? [liveServer.category] : []))
    setFrequency(s.frequency); setMinAge(s.minAge); setModeration(s.moderation); setToggles(s.toggles)
    setAutoMod({ spam: s.automod.spam, links: s.automod.links, ofensa: s.automod.ofensa, caps: s.automod.caps })
    setBlockedWords(s.automod.words); setBots(s.bots); setWebhooks(s.webhooks)
    setEmojiItems(s.emojis); setStickerItems(s.stickers); setInviteItems(s.invites)
    setWidgetTitle(s.widget.title); setWidgetChannel(s.widget.channel); setWidgetEnabled(s.widget.enabled)
    setIntegrations(s.integrations); setCommunityValues(s.community)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveServer])

  /* ══ Persistência defensiva (outro agente cria saveServerSettings/logAudit; fallback p/ updateServer) ══ */
  const persist = async (patch: Partial<LocalSettings>, auditAction?: string, auditDetail?: string) => {
    if (!server) return
    try {
      const st = useServerStore.getState() as unknown as Record<string, unknown>
      if (typeof st.saveServerSettings === 'function') {
        await (st.saveServerSettings as (id: string, p: unknown) => Promise<void>)(server.id, patch)
      } else if (typeof st.updateServer === 'function') {
        const cur = ((st.servers as Server[] | undefined) || []).find(sv => sv.id === server.id) as unknown as Record<string, unknown> | undefined
        const curSettings = ((cur?.settings as Record<string, unknown>) || {})
        await (st.updateServer as (id: string, d: unknown) => Promise<void>)(server.id, { settings: { ...curSettings, ...patch } })
      }
      if (auditAction) {
        if (typeof st.logAudit === 'function') {
          await (st.logAudit as (id: string, a: string, d: string) => Promise<void>)(server.id, auditAction, auditDetail || '')
        } else if (typeof st.updateServer === 'function') {
          try {
            const cur2 = ((st.servers as Server[] | undefined) || []).find(sv => sv.id === server.id) as unknown as Record<string, unknown> | undefined
            const log = (cur2?.auditLog as unknown[] | undefined) || []
            const me = currentUser
            const entry = { id: rid(), at: Date.now(), actorId: me?.id || activeUserId || 'sistema', actorName: me?.name || 'Sistema', action: auditAction, detail: auditDetail || '' }
            await (st.updateServer as (id: string, d: unknown) => Promise<void>)(server.id, { auditLog: [...log, entry].slice(-200) })
          } catch { /* noop */ }
        }
      }
    } catch { /* backend pode falhar; store local já tenta fallback */ }
  }
  const persistToggles = (next: LocalSettings['toggles']) => { setToggles(next); void persist({ toggles: next }) }
  const persistModeration = (v: string) => { setModeration(v); void persist({ moderation: v }) }
  const persistFrequency = (v: string) => { setFrequency(v); void persist({ frequency: v }) }
  const persistMinAge = (v: string) => { setMinAge(v); void persist({ minAge: v }) }
  const persistThemes = (next: string[]) => { setSelectedThemes(next); void persist({ themes: next }) }
  const persistAutomod = (next: { spam: boolean; links: boolean; ofensa: boolean; caps: boolean }, words?: string[]) => {
    setAutoMod(next); if (words !== undefined) setBlockedWords(words)
    void persist({ automod: { ...next, words: words !== undefined ? words : blockedWords } })
  }

  const cachedMessages = useServerStore(s => s.messages)
  const allUsers = useUserStore(s => s.users)
  const auditLog = useMemo(() => {
    const raw = ((liveServer as unknown as Record<string, unknown>)?.auditLog as { id: string; at: number; actorId: string; actorName: string; action: string; detail: string }[] | undefined) || []
    return [...raw].sort((a, b) => (b.at || 0) - (a.at || 0))
  }, [liveServer])
  const bannedList: string[] = useMemo(() => {
    const s = ((liveServer as unknown as Record<string, unknown>)?.settings as Record<string, unknown> | undefined)
    return Array.isArray(s?.banned) ? (s.banned as string[]) : []
  }, [liveServer])
  const timeoutMap: Record<string, number> = useMemo(() => {
    const s = ((liveServer as unknown as Record<string, unknown>)?.settings as Record<string, unknown> | undefined)
    return ((s?.timeouts as Record<string, number>) || {})
  }, [liveServer])

  const stats = useMemo(() => {
    if (!liveServer) return { membros: 0, online: 0, canais: 0, categorias: 0, cargos: 0, eventos: 0, texto: 0, voz: 0, mensagens: 0, convites: 0, bots: 0, webhooks: 0 }
    const texto = (liveChannels).filter(c => c.type === 'text').length
    const voz = (liveChannels).filter(c => c.type === 'voice').length
    const ids = new Set((liveChannels).map(c => c.id))
    const mensagens = cachedMessages.filter(m => ids.has(m.channelId)).length
    const s = ((liveServer as unknown as Record<string, unknown>)?.settings as Record<string, unknown> | undefined) || {}
    const online = liveMembers.filter(id => {
      const u = allUsers.find(x => x.id === id)
      const last = (u as { lastSeenAt?: number } | undefined)?.lastSeenAt
      return !!last && Date.now() - last < 45000
    }).length
    return {
      membros: liveMembers.length, online,
      canais: liveChannels.length,
      categorias: liveCategories.length,
      cargos: liveRoles.length,
      eventos: liveEvents.length,
      texto, voz, mensagens,
      convites: Array.isArray(s.invites) ? (s.invites as unknown[]).length : 0,
      bots: Array.isArray(s.bots) ? (s.bots as unknown[]).length : 0,
      webhooks: Array.isArray(s.webhooks) ? (s.webhooks as unknown[]).length : 0,
    }
  }, [liveServer, liveRoles, liveChannels, liveCategories, liveEvents, liveMembers, cachedMessages, allUsers])

  const flipToggle = (key: keyof typeof toggles) => persistToggles({ ...toggles, [key]: !toggles[key] })
  const removeTheme = (t: string) => persistThemes(selectedThemes.filter(x => x !== t))
  const addTheme = () => {
    const next = THEMES_AVAILABLE.find(t => !selectedThemes.includes(t))
    if (next) persistThemes([...selectedThemes, next])
    else notify('Você já adicionou todos os temas sugeridos')
  }
  const userNameOf = (id: string) => allUsers.find(u => u.id === id)?.name || `Usuário ${id.slice(0, 6)}`

  /* ── Cargos: editor, atribuição a membros, cargo automático ── */
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [roleNameDraft, setRoleNameDraft] = useState('')
  const [roleColorDraft, setRoleColorDraft] = useState('#29A3FF')
  const [rolePermDraft, setRolePermDraft] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [addPersonQuery, setAddPersonQuery] = useState('')
  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null)
  /* ── Anúncios ── */
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annChannelId, setAnnChannelId] = useState('')
  const [annEveryone, setAnnEveryone] = useState(false)
  const [annBusy, setAnnBusy] = useState(false)

  const iAmFullManager = isServerOwnerOrStaff(server, activeUserId)
  const allowed = (key: string) => iAmFullManager || canAccessSection(server, activeUserId, key)

  const memberRolesMap: Record<string, string[]> = useMemo(() => {
    const raw = (liveServer as unknown as Record<string, unknown>)?.memberRoles
    return raw && typeof raw === 'object' ? (raw as Record<string, string[]>) : {}
  }, [liveServer])

  if (!server) return null

  const roleIdsOf = (userId: string) => (Array.isArray(memberRolesMap[userId]) ? memberRolesMap[userId] : [])
  const rolesOf = (userId: string) => liveRoles.filter(r => roleIdsOf(userId).includes(r.id))

  const persistRoles = async (nextRoles: Role[], detail: string) => {
    try {
      await updateServer(server.id, { roles: nextRoles } as Partial<Server>)
      void useServerStore.getState().logAudit(server.id, 'cargos', detail).catch(() => {})
      notify('Salvo!')
    } catch { notify('Falha ao salvar cargos') }
  }
  const persistMemberRoles = async (next: Record<string, string[]>, detail: string) => {
    try {
      await updateServer(server.id, { memberRoles: next } as Partial<Server>)
      void useServerStore.getState().logAudit(server.id, 'cargos', detail).catch(() => {})
    } catch { notify('Falha ao salvar cargo do membro') }
  }
  const openRoleEditor = (role: Role) => {
    setEditingRoleId(role.id)
    setRoleNameDraft(role.name)
    setRoleColorDraft(role.color || '#29A3FF')
    setRolePermDraft([...(role.permissions || [])])
  }
  const saveRoleEditor = async () => {
    if (!editingRoleId) return
    const name = roleNameDraft.trim() || 'Cargo'
    const nextRoles = liveRoles.map(r => r.id === editingRoleId ? { ...r, name, color: roleColorDraft, permissions: rolePermDraft } : r)
    await persistRoles(nextRoles, `Cargo "${name}" atualizado (${rolePermDraft.length} permissões)`)
    setEditingRoleId(null)
  }
  const deleteRole = async (role: Role) => {
    if (!window.confirm(`Excluir o cargo "${role.name}"?`)) return
    const nextRoles = liveRoles.filter(r => r.id !== role.id)
    const nextMR: Record<string, string[]> = {}
    for (const [uid, ids] of Object.entries(memberRolesMap)) nextMR[uid] = (ids || []).filter(id => id !== role.id)
    try {
      await updateServer(server.id, { roles: nextRoles, memberRoles: nextMR, ...(liveServer?.autoRoleId === role.id ? { autoRoleId: '' } : {}) } as Partial<Server>)
      void useServerStore.getState().logAudit(server.id, 'cargos', `Cargo "${role.name}" excluído`).catch(() => {})
      if (editingRoleId === role.id) setEditingRoleId(null)
      notify('Cargo excluído')
    } catch { notify('Falha ao excluir cargo') }
  }
  const moveRole = async (role: Role, dir: -1 | 1) => {
    const idx = liveRoles.findIndex(r => r.id === role.id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= liveRoles.length) return
    const next = [...liveRoles]
    const [item] = next.splice(idx, 1)
    next.splice(target, 0, item)
    try {
      await updateServer(server.id, { roles: next } as Partial<Server>)
    } catch { notify('Falha ao reordenar') }
  }
  const createRoleFromTemplate = async (t: { name: string; color: string; permissions: string[] }) => {
    const exists = liveRoles.some(r => r.name.toLowerCase() === t.name.toLowerCase())
    const role: Role = { id: rid(), name: exists ? `${t.name} ${liveRoles.length + 1}` : t.name, color: t.color, serverId: server.id, permissions: [...t.permissions] }
    await persistRoles([...liveRoles, role], `Cargo "${role.name}" criado (modelo)`)
  }
  const setAutoRole = async (roleId: string) => {
    const next = liveServer?.autoRoleId === roleId ? '' : roleId
    try {
      await updateServer(server.id, { autoRoleId: next } as Partial<Server>)
      notify(next ? 'Novos membros entram com este cargo' : 'Cargo automático desativado')
    } catch { notify('Falha ao salvar cargo automático') }
  }
  const toggleMemberRole = async (userId: string, roleId: string) => {
    const current = roleIdsOf(userId)
    const has = current.includes(roleId)
    const next = has ? current.filter(id => id !== roleId) : [...current, roleId]
    const name = liveRoles.find(r => r.id === roleId)?.name || 'cargo'
    await persistMemberRoles({ ...memberRolesMap, [userId]: next }, `${userNameOf(userId)} ${has ? 'perdeu' : 'recebeu'} o cargo ${name}`)
  }

  /* ── Membros: adicionar/remover/moderar ── */
  const addPerson = async (userId: string) => {
    try {
      await useServerStore.getState().addMember(server.id, userId)
      notify(`${userNameOf(userId)} entrou no servidor`)
      setAddPersonQuery('')
      void useServerStore.getState().logAudit(server.id, 'membros', `${userNameOf(userId)} adicionado`).catch(() => {})
    } catch { notify('Falha ao adicionar pessoa') }
  }
  const memberMod = async (action: 'timeout' | 'kick' | 'ban' | 'unban', userId: string) => {
    try {
      const st = useServerStore.getState()
      if (action === 'timeout') { await st.timeoutMember(server.id, userId, 10); notify('Membro silenciado por 10min') }
      else if (action === 'kick') { if (!window.confirm(`Expulsar ${userNameOf(userId)}?`)) return; await st.kickMember(server.id, userId); notify('Membro expulso') }
      else if (action === 'ban') { if (!window.confirm(`Banir ${userNameOf(userId)}?`)) return; await st.banMember(server.id, userId); notify('Membro banido') }
      else { await st.unbanMember(server.id, userId); notify('Membro desbanido') }
    } catch { notify('Ação falhou') }
  }

  /* ── Anúncios: publicar em um canal ── */
  const publishAnnouncement = async () => {
    if (!annBody.trim() || annBusy) return
    const fallbackChannel = liveChannels.find(c => c.type === 'text')?.id || ''
    const channelId = annChannelId || fallbackChannel
    if (!channelId) { notify('Crie um canal de texto primeiro'); return }
    setAnnBusy(true)
    try {
      const content = `📣 ${annTitle.trim() ? `**${annTitle.trim()}**\n` : ''}${annBody.trim()}${annEveryone ? '\n@todos' : ''}`
      await sendStoreMessage(channelId, currentUser?.id || activeUserId || '', currentUser?.name || 'Servidor', currentUser?.photoUrl || '', content, 'text')
      void useServerStore.getState().logAudit(server.id, 'anuncio', `Anúncio publicado em ${channelId}`).catch(() => {})
      setAnnTitle('')
      setAnnBody('')
      setAnnEveryone(false)
      notify('Anúncio publicado!')
    } catch { notify('Falha ao publicar anúncio') } finally { setAnnBusy(false) }
  }

  if (!liveServer) {
    const hasUser = Boolean(currentUser)
    const retryAll = () => {
      void (async () => {
        try { await loadServers() } catch { }
        if (server?.id) {
          try {
            const st = useServerStore.getState() as unknown as Record<string, unknown>
            if (typeof st.fetchServer === 'function') {
              const got = await (st.fetchServer as (id: string) => Promise<unknown>)(server.id)
              notify(got ? 'Servidor carregado!' : 'Servidor não existe no backend.')
            }
          } catch { notify('Falha de conexão. Tente de novo.') }
        }
      })()
    }
    return (
      <div className="ssw-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
        <div className="ssw-window" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <section className="ssw-workspace" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40 }}>
            <h2>Carregando servidor...</h2>
            <p className="ssw-desc">Buscando os dados mais recentes.</p>
            <p className="ssw-desc" style={{ fontSize: 11, opacity: 0.7 }}>ID {(server?.id || '—').slice(0, 8)} · {storeCount} na lista · {hasUser ? 'logado' : 'deslogado'}</p>
            {toastMsg && <p className="ssw-desc">{toastMsg}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="ssw-primary-btn" onClick={retryAll}>Tentar de novo</button>
              <button type="button" className="ssw-modal-cancel" onClick={onClose}>Fechar</button>
            </div>
          </section>
        </div>
      </div>
    )
  }

  const handleSaveResource = async (kind: ResourceKind, name: string, detail: string, channelKind?: 'text' | 'voice') => {
    if (kind === 'evento') {
      await addServerEvent(server.id, { title: name, description: detail, date: Date.now() })
      notify('Evento criado')
    } else if (kind === 'canal') {
      await addChannel(server.id, name, channelKind ?? 'text')
      notify('Canal criado')
    } else {
      await addCategory(server.id, name)
      notify('Categoria criada')
    }
    setResourceModal(null)
  }

  const handleDeleteChannel = async (id: string) => {
    if (!window.confirm('Excluir este canal?')) return
    await deleteChannel(server.id, id)
    notify('Canal excluído')
  }
  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('Excluir esta categoria?')) return
    await deleteCategory(server.id, id)
    notify('Categoria excluída')
  }
  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Excluir este evento?')) return
    await deleteServerEvent(server.id, id)
    notify('Evento excluído')
  }
  const handleAddRole = async () => {
    if (!newRole.trim()) return
    await addRole(server.id, newRole.trim(), newRoleColor)
    setNewRole('')
    notify('Cargo adicionado')
  }
  const addRule = () => {
    const newRules = [...rules, 'Nova regra do servidor']
    setRules(newRules)
    setEditingRule(newRules.length - 1)
    setRuleDraft('Nova regra do servidor')
  }
  const saveRule = () => {
    if (editingRule === null || !ruleDraft.trim()) return
    const next = [...rules]
    next[editingRule] = ruleDraft.trim()
    setRules(next)
    setEditingRule(null)
    setEditDesc(next.join('\n'))
    notify('Política atualizada')
  }
  const moveRule = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= rules.length) return
    const next = [...rules]
    ;[next[index], next[target]] = [next[target], next[index]]
    setRules(next)
    setEditDesc(next.join('\n'))
  }
  const removeRule = (index: number) => {
    const next = rules.filter((_, i) => i !== index)
    setRules(next)
    setEditingRule(null)
    setEditDesc(next.join('\n'))
    notify('Política excluída')
  }
  const addBot = () => {
    if (!botName.trim() || !botToken.trim()) { notify('Preencha nome e token do bot'); return }
    const next = [...bots, { id: rid(), name: botName.trim(), token: botToken.trim(), desc: botDesc.trim() || 'Sem descrição' }]
    setBots(next); setBotName(''); setBotToken(''); setBotDesc('')
    void persist({ bots: next }, 'bot.add', botName.trim())
    notify('Bot cadastrado')
  }
  const removeBot = (id: string) => {
    const next = bots.filter(b => b.id !== id)
    setBots(next); void persist({ bots: next }, 'bot.remove', id)
    notify('Bot excluído')
  }
  const testBot = async (botId: string) => {
    const bot = bots.find(b => b.id === botId)
    if (!bot) return
    const firstText = liveChannels.find(c => c.type === 'text')
    if (!firstText) { notify('Sem canal de texto para testar'); return }
    try {
      const st = useServerStore.getState() as unknown as Record<string, unknown>
      if (typeof st.postAsBot === 'function') {
        await (st.postAsBot as (s: string, c: string, b: string, t: string) => Promise<void>)(server.id, firstText.id, bot.id, `Olá! Sou o ${bot.name} 🤖`)
      } else if (typeof st.sendMessage === 'function') {
        await (st.sendMessage as (c: string, u: string, n: string, p: string, t: string) => Promise<void>)(firstText.id, `bot:${bot.id}`, bot.name, '', `Olá! Sou o ${bot.name} 🤖`)
      }
      notify(`Mensagem de teste enviada em #${firstText.name}`)
    } catch { notify('Falha ao testar bot') }
  }
  const addWebhook = () => {
    if (!whName.trim() || !whUrl.trim()) { notify('Preencha nome e URL do webhook'); return }
    const next = [...webhooks, { id: rid(), name: whName.trim(), url: whUrl.trim() }]
    setWebhooks(next); setWhName(''); setWhUrl('')
    void persist({ webhooks: next }, 'webhook.add', whName.trim())
    notify('Webhook cadastrado')
  }
  const removeWebhook = (id: string) => {
    const next = webhooks.filter(w => w.id !== id)
    setWebhooks(next); void persist({ webhooks: next }, 'webhook.remove', id)
    notify('Webhook excluído')
  }
  const testWebhook = async (id: string) => {
    const wh = webhooks.find(w => w.id === id)
    if (!wh) return
    try {
      const r = await fetch(wh.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `Teste do Friends Space — servidor ${liveServer?.name || ''} ✅`, username: wh.name }) })
      notify(r.ok ? 'Webhook OK ✅' : `Webhook respondeu ${r.status}`)
    } catch { notify('Falha ao chamar webhook') }
  }
  const addEmojiItem = () => {
    if (!libName.trim() || !libDetail.trim()) { notify('Preencha os dois campos'); return }
    const next = [...emojiItems, { id: rid(), name: libName.trim(), detail: libDetail.trim() }]
    setEmojiItems(next); setLibName(''); setLibDetail('')
    void persist({ emojis: next }, 'emoji.add', libName.trim())
    notify('Emoji adicionado')
  }
  const addStickerItem = () => {
    if (!libName.trim() || !libDetail.trim()) { notify('Preencha os dois campos'); return }
    const next = [...stickerItems, { id: rid(), name: libName.trim(), detail: libDetail.trim() }]
    setStickerItems(next); setLibName(''); setLibDetail('')
    void persist({ stickers: next }, 'sticker.add', libName.trim())
    notify('Figurinha adicionada')
  }
  const addIntegration = () => {
    if (!intName.trim() || !intDetail.trim()) { notify('Preencha os dois campos'); return }
    const next = [...integrations, { id: rid(), name: intName.trim(), detail: intDetail.trim() }]
    setIntegrations(next); setIntName(''); setIntDetail('')
    void persist({ integrations: next }, 'integration.add', intName.trim())
    notify('Integração cadastrada')
  }
  const toggleCommunity = (key: string) => {
    const next = { ...communityValues, [key]: !communityValues[key] }
    setCommunityValues(next); void persist({ community: next })
  }
  const addBlockedWord = () => {
    const w = newWord.trim().toLowerCase()
    if (!w) return
    if (blockedWords.includes(w)) { setNewWord(''); return }
    persistAutomod(autoMod, [...blockedWords, w]); setNewWord('')
    notify('Palavra bloqueada')
  }
  const removeBlockedWord = (w: string) => {
    persistAutomod(autoMod, blockedWords.filter(x => x !== w))
    notify('Palavra removida')
  }

  const renderContent = () => {
    /* ═══ VISÃO GERAL (dashboard completo como a referência) ═══ */
    if (effectiveActive === 'visao') {
      return (
        <div className="ssw-stack">
          {/* Identidade: ícone + banner lado a lado */}
          <section className="ssw-card ssw-identity-card">
            <div className="ssw-identity-panel">
              <div className="ssw-card-label-row"><span>IDENTIDADE</span><span className="ssw-small-index">01</span></div>
              <div className="ssw-identity-art-row">
                <div className="ssw-server-icon-frame">
                  {editPhoto ? <img src={editPhoto} alt="" /> : (
                    <div className="ssw-icon-fallback-inline" style={{ background: editColor }}>{(editName || 'S').charAt(0).toUpperCase()}</div>
                  )}
                  <button type="button" onClick={onRequestIcon} title="Enviar ícone"><Fa name="camera" size={14} /></button>
                  <input ref={iconInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onIconFile} />
                </div>
                <div className="ssw-identity-copy">
                  <strong>{editName || 'Servidor sem nome'}</strong>
                  <p>{editDesc || 'Adicione uma descrição para apresentar sua comunidade.'}</p>
                  <button type="button" className="ssw-ghost-link" onClick={onSave}><Fa name="floppy-disk" size={14} /> Salvar identidade</button>
                </div>
              </div>
            </div>
            <div className="ssw-identity-panel">
              <div className="ssw-card-label-row"><span>CAPA</span><span className="ssw-small-index">02</span></div>
              <div className="ssw-banner-frame">
                {editBanner ? <img src={editBanner} alt="" /> : (
                  <div className="ssw-banner-placeholder" style={{ background: `linear-gradient(135deg, ${editColor}, ${editColor}33)` }}>Sem banner — envie uma imagem de capa</div>
                )}
                <button type="button" className="ssw-banner-edit" onClick={onRequestBanner} title="Enviar banner"><Fa name="image" size={14} /></button>
                <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onBannerFile} />
              </div>
              <p className="ssw-asset-recommendation">Recomendado: 1920×480px · PNG ou JPG</p>
            </div>
          </section>

          {/* Nome + descrição + cor */}
          <section className="ssw-card ssw-form-card">
            <div className="ssw-form-grid ssw-two-columns">
              <label className="ssw-field"><span>Nome do servidor</span>
                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome do servidor" />
              </label>
              <label className="ssw-field"><span>Cor de destaque</span>
                <div className="ssw-color-inline">
                  <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} />
                  <code>{editColor}</code>
                  <em>Usada no ícone e no banner quando não há imagem.</em>
                </div>
              </label>
              <label className="ssw-field" style={{ gridColumn: '1 / -1' }}><span>Descrição do servidor</span>
                <textarea rows={3} value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Conte uma breve descrição sobre o seu servidor..." />
              </label>
            </div>
          </section>

          {/* Temas */}
          <section className="ssw-card ssw-themes-card">
            <SectionTitle eyebrow="SINAL DA COMUNIDADE" title="Temas do servidor" desc="Escolha até 5 temas principais para orientar descobertas e recomendações."
              action={<span className="ssw-count-badge">{selectedThemes.length} / 5</span>} />
            <div className="ssw-theme-row">
              {selectedThemes.map(t => (
                <button key={t} className="ssw-theme-chip" onClick={() => removeTheme(t)}>{t}<Fa name="xmark" size={14} /></button>
              ))}
              {selectedThemes.length < 5 && <button className="ssw-add-theme" onClick={addTheme}><Fa name="plus" size={14} /> Adicionar tema</button>}
            </div>
            <div className="ssw-theme-options">
              <span>Temas disponíveis</span>
              {THEMES_AVAILABLE.filter(t => !selectedThemes.includes(t)).map(t => (
                <button key={t} onClick={() => selectedThemes.length < 5 && persistThemes([...selectedThemes, t])}>{t}</button>
              ))}
            </div>
          </section>

          {/* Frequência + idade mínima */}
          <div className="ssw-grid-two">
            <section className="ssw-card ssw-compact-card">
              <SectionTitle eyebrow="RITMO DA COMUNIDADE" title="Qual é a sua frequência?" desc="Com que frequência você pretende interagir?" />
              <SelectField value={frequency} options={['Selecionar frequência', 'Diariamente', 'Algumas vezes por semana', 'Semanalmente', 'Mensalmente']} onChange={persistFrequency} />
              <p className="ssw-helper-text"><Fa name="clock" size={14} /> Isso nos ajuda a sugerir ferramentas e recursos úteis.</p>
            </section>
            <section className="ssw-card ssw-compact-card">
              <SectionTitle eyebrow="PORTA DE ENTRADA" title="Idade mínima para entrar" desc="Defina a idade mínima para novos membros." />
              <SelectField value={minAge} options={['Selecionar idade mínima', 'Sem restrição', '13 anos ou mais', '16 anos ou mais', '18 anos ou mais']} onChange={persistMinAge} />
              <p className="ssw-helper-text"><Fa name="shield" size={14} /> Recomendamos 13+ para segurança da comunidade.</p>
            </section>
          </div>

          {/* Eventos + Canais + Categorias */}
          <div className="ssw-grid-three">
            <section className="ssw-card">
              <SectionTitle eyebrow="ATIVAÇÕES" title="Eventos" desc="Organize eventos." action={<button className="ssw-mini-action" onClick={() => setResourceModal('evento')}><Fa name="plus" size={14} /> Criar evento</button>} />
              <div className="ssw-resource-list">
                {(liveEvents || []).map(ev => (
                  <div className="ssw-resource-row" key={ev.id}>
                    <span className="ssw-resource-leading ssw-event-leading"><Fa name="calendar-days" size={14} /></span>
                    <div><strong>{ev.title}</strong><small>{fmtDate(ev.date)}</small></div>
                    {canManage && <button className="ssw-row-del" onClick={() => handleDeleteEvent(ev.id)} title="Excluir"><Fa name="trash" size={14} /></button>}
                  </div>
                ))}
                {(liveEvents || []).length === 0 && (
                  <div className="ssw-empty-event"><div className="ssw-empty-icon"><Fa name="calendar-days" size={14} /></div><strong>Nenhum evento criado ainda.</strong><span>Crie um evento para engajar sua comunidade.</span></div>
                )}
              </div>
            </section>
            <section className="ssw-card">
              <SectionTitle eyebrow="ESTRUTURA" title="Salas e canais" desc="Crie espaços do servidor." action={<button className="ssw-mini-action" onClick={() => setResourceModal('canal')}><Fa name="plus" size={14} /> Nova sala</button>} />
              <div className="ssw-resource-list ssw-compact-resource-list">
                {(liveChannels || []).map(ch => (
                  <div className="ssw-resource-row" key={ch.id}>
                    <span className="ssw-resource-leading"><Fa name={ch.type === 'voice' ? 'microphone' : 'hashtag'} size={13} /></span>
                    <div><strong>{ch.type === 'text' ? `# ${ch.name}` : ch.name}</strong><small>{ch.type === 'voice' ? 'Voz' : 'Texto'}</small></div>
                    {canManage && <button className="ssw-row-del" onClick={() => handleDeleteChannel(ch.id)} title="Excluir"><Fa name="trash" size={14} /></button>}
                  </div>
                ))}
                {(liveChannels || []).length === 0 && <div className="ssw-empty-event"><strong>Nenhum canal.</strong><span>Clique em Nova sala para criar.</span></div>}
              </div>
            </section>
            <section className="ssw-card">
              <SectionTitle eyebrow="ORGANIZAÇÃO" title="Categorias" desc="Agrupe canais." action={<button className="ssw-mini-action" onClick={() => setResourceModal('categoria')}><Fa name="plus" size={14} /> Nova categoria</button>} />
              <div className="ssw-resource-list ssw-compact-resource-list">
                {(liveCategories || []).map(cat => (
                  <div className="ssw-resource-row" key={cat.id}>
                    <span className="ssw-resource-leading ssw-category-leading"><Fa name="folder" size={14} /></span>
                    <div><strong>{cat.name}</strong><small>Visível para todos</small></div>
                    {canManage && <button className="ssw-row-del" onClick={() => handleDeleteCategory(cat.id)} title="Excluir"><Fa name="trash" size={14} /></button>}
                  </div>
                ))}
                {(liveCategories || []).length === 0 && <div className="ssw-empty-event"><strong>Nenhuma categoria.</strong><span>Clique em Nova categoria para criar.</span></div>}
              </div>
            </section>
          </div>

          {/* Políticas + Configurações principais */}
          <div className="ssw-grid-two ssw-lower-grid">
            <section className="ssw-card ssw-policy-card">
              <SectionTitle eyebrow="CÓDIGO DE CONDUTA" title="Políticas do servidor" desc="Defina as regras e o aceite obrigatório." action={<span className="ssw-count-badge">{rules.length} regras</span>} />
              <div className="ssw-policy-list">
                {rules.map((policy, i) => (
                  <div className="ssw-policy-row" key={`${policy}-${i}`}>
                    <span className="ssw-drag-handle">⋮⋮</span>
                    {editingRule === i ? (
                      <input className="ssw-inline-rule" value={ruleDraft} onChange={e => setRuleDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveRule()} autoFocus />
                    ) : (
                      <button className="ssw-policy-text" onClick={() => { setEditingRule(i); setRuleDraft(policy) }}>{policy}</button>
                    )}
                    <div className="ssw-policy-actions">
                      {editingRule === i ? <button onClick={saveRule} aria-label="Salvar"><Fa name="check" size={14} /></button>
                        : <button onClick={() => { setEditingRule(i); setRuleDraft(policy) }} aria-label="Editar"><Fa name="pen" size={14} /></button>}
                      <button onClick={() => moveRule(i, -1)} disabled={i === 0} aria-label="Subir"><Fa name="chevron-up" size={14} /></button>
                      <button onClick={() => moveRule(i, 1)} disabled={i === rules.length - 1} aria-label="Descer"><Fa name="chevron-down" size={14} /></button>
                      <button className="ssw-danger-icon" onClick={() => removeRule(i)} aria-label="Excluir"><Fa name="trash" size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="ssw-add-rule" onClick={addRule}><Fa name="plus" size={14} /> Adicionar regra</button>
              <div className="ssw-policy-footer">
                <div><strong>Aceite obrigatório</strong><span>Membros devem aceitar as regras para entrar.</span></div>
                <Toggle checked={toggles.rules} onChange={() => flipToggle('rules')} />
              </div>
            </section>
            <section className="ssw-card ssw-main-settings-card">
              <SectionTitle eyebrow="CONTROLES PRINCIPAIS" title="Configurações principais" desc="Ative ou desative recursos críticos." />
              <div className="ssw-setting-list">
                <SettingRow icon="fa-globe" title="Servidor público" desc="Qualquer pessoa pode encontrar e entrar." checked={toggles.public} onChange={() => flipToggle('public')} />
                <SettingRow icon="fa-shield" title="Verificação de membros" desc="Novos membros precisam de verificação." checked={toggles.verification} onChange={() => flipToggle('verification')} />
                <SettingRow icon="fa-message" title="Chat de boas-vindas" desc="Enviar mensagem automática de boas-vindas." checked={toggles.welcome} onChange={() => flipToggle('welcome')} />
                <SettingRow icon="fa-clipboard-list" title="Registro de membros" desc="Manter registro de entradas e saídas." checked={toggles.log} onChange={() => flipToggle('log')} />
                <div className="ssw-moderation-row">
                  <div className="ssw-setting-icon"><Fa name="gauge" size={14} /></div>
                  <div className="ssw-setting-copy"><strong>Nível de moderação</strong><span>Defina a intensidade dos filtros automáticos.</span></div>
                  <div className="ssw-moderation-select"><SelectField value={moderation} options={['Baixo', 'Médio', 'Alto', 'Máximo']} onChange={persistModeration} /></div>
                </div>
              </div>
            </section>
          </div>

          {/* Ideias */}
          <section className="ssw-card ssw-ideas-card">
            <SectionTitle eyebrow="PRÓXIMOS PASSOS" title="Ideias para o seu servidor" desc="Inspire-se para engajar sua comunidade." />
            <div className="ssw-ideas-grid">
              {[['🎉', 'Crie eventos semanais', 'para engajar sua comunidade'], ['🏆', 'Realize torneios', 'para premiar membros ativos'], ['💬', 'Crie canais temáticos', 'para diversos assuntos'], ['🤖', 'Use bots para automação', 'e diversão'], ['🌈', 'Personalize cargos', 'para destacar membros'], ['📣', 'Crie anúncios', 'para manter todos informados']].map(([e, t, s]) => (
                <button className="ssw-idea-card" key={t} onClick={() => notify(`${t} ${s}.`)}>
                  <span className="ssw-idea-emoji">{e}</span>
                  <span><strong>{t}</strong><small>{s}</small></span>
                  <Fa name="arrow-up-right-from-square" size={14} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ ESTATÍSTICAS (contadores reais) ═══ */
    if (effectiveActive === 'estatisticas') {
      const bar = (v: number, total: number) => `${total ? Math.round((v / total) * 100) : 0}%`
      return (
        <div className="ssw-stack">
          <div className="ssw-metric-grid">
            <div className="ssw-metric-card"><span>MEMBROS</span><strong>{stats.membros}</strong><small>{stats.online} online agora</small></div>
            <div className="ssw-metric-card"><span>MENSAGENS</span><strong>{stats.mensagens}</strong><small>no cache local do servidor</small></div>
            <div className="ssw-metric-card"><span>CANAIS</span><strong>{stats.canais}</strong><small>{stats.texto} texto · {stats.voz} voz</small></div>
            <div className="ssw-metric-card"><span>CATEGORIAS</span><strong>{stats.categorias}</strong><small>organizadas</small></div>
          </div>
          <div className="ssw-metric-grid">
            <div className="ssw-metric-card"><span>CARGOS</span><strong>{stats.cargos}</strong><small>grupos de acesso</small></div>
            <div className="ssw-metric-card"><span>EVENTOS</span><strong>{stats.eventos}</strong><small>agendados</small></div>
            <div className="ssw-metric-card"><span>CONVITES</span><strong>{stats.convites + 1}</strong><small>código principal + extras</small></div>
            <div className="ssw-metric-card"><span>BOTS / WEBHOOKS</span><strong>{stats.bots}/{stats.webhooks}</strong><small>automações</small></div>
          </div>
          <div className="ssw-metric-grid">
            <div className="ssw-metric-card"><span>CONVITE</span><strong>/{liveServer?.inviteCode}</strong><small>código público</small></div>
            <div className="ssw-metric-card"><span>CRIAÇÃO</span><strong>{fmtDate(liveServer?.createdAt ?? 0).split(' ')[0]}</strong><small>data de início</small></div>
            <div className="ssw-metric-card"><span>CATEGORIA</span><strong>{liveServer?.category || '—'}</strong><small>tema principal</small></div>
            <div className="ssw-metric-card"><span>ONLINE</span><strong>{stats.online}</strong><small>membros ativos</small></div>
          </div>
          <section className="ssw-card">
            <SectionTitle eyebrow="ESTRUTURA" title="Distribuição de canais" desc="Proporção de texto e voz." />
            <div className="ssw-bar-row"><span>Canais de texto</span><div className="ssw-bar"><span style={{ width: bar(stats.texto, stats.canais) }} /></div><strong>{stats.texto}</strong></div>
            <div className="ssw-bar-row"><span>Canais de voz</span><div className="ssw-bar"><span style={{ width: bar(stats.voz, stats.canais) }} /></div><strong>{stats.voz}</strong></div>
            <div className="ssw-bar-row"><span>Membros online</span><div className="ssw-bar"><span style={{ width: bar(stats.online, Math.max(stats.membros, 1)) }} /></div><strong>{stats.online}/{stats.membros}</strong></div>
          </section>
        </div>
      )
    }

    /* ═══ CONFIGURAÇÕES DO SERVIDOR (acesso + drive + apagar) ═══ */
    if (effectiveActive === 'config') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="CONTROLES PRINCIPAIS" title="Acesso às calls" desc="Controle quem participa das chamadas." />
            <div className="ssw-form-grid ssw-two-columns">
              <label className="ssw-field"><span>Acesso às calls</span>
                <SelectField value={editCallAccess} options={['public', 'members', 'staff']} onChange={v => setEditCallAccess(v as 'public' | 'members' | 'staff')} />
              </label>
              <label className="ssw-field"><span>Senha da call (opcional)</span>
                <input type="password" value={editCallPassword} onChange={e => setEditCallPassword(e.target.value)} placeholder="Senha da call" />
              </label>
              <label className="ssw-field" style={{ gridColumn: '1 / -1' }}><span>IDs da staff (separados por vírgula)</span>
                <input value={editStaffIds} onChange={e => setEditStaffIds(e.target.value)} placeholder="ID1, ID2, ID3" />
              </label>
            </div>
          </section>
          <section className="ssw-card">
            <SectionTitle eyebrow="ARMAZENAMENTO" title="Google Drive" desc="Mídias e mods deste servidor ficam no Google Drive." />
            <div className="ssw-drive-row">
              <span className={`ssw-drive-dot ${driveConnected ? 'on' : ''}`} />
              <span>{driveConnected ? 'Conectado ao Drive' : 'Drive não conectado'}</span>
              <button type="button" className="ssw-small-btn" onClick={onToggleDrive} disabled={driveBusy}>
                {driveBusy ? 'Conectando...' : driveConnected ? 'Desconectar' : 'Conectar'}
              </button>
            </div>
            <p className="ssw-helper-text" style={{ marginTop: 10 }}><Fa name="circle-info" size={14} /> Mídias e mods ficam na pasta <b>friends-space</b> do seu Drive.</p>
          </section>
          {canDelete && (
            <section className="ssw-card ssw-danger-card">
              <SectionTitle eyebrow="ZONA DE PERIGO" title="Apagar servidor" desc="Esta ação é permanente e não pode ser desfeita." />
              <button type="button" className="ssw-danger-btn" onClick={onDelete}><Fa name="trash" size={14} /> Apagar servidor</button>
            </section>
          )}
        </div>
      )
    }

    /* ═══ CANAIS ═══ */
    if (effectiveActive === 'canais') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="ESTRUTURA" title="Canais do servidor" desc={`${stats.texto} texto · ${stats.voz} voz`} action={<button className="ssw-primary-btn" onClick={() => setResourceModal('canal')}><Fa name="plus" size={14} /> Nova sala</button>} />
            <div className="ssw-list">
              {(liveChannels || []).map(ch => (
                <div className="ssw-list-row" key={ch.id}>
                  <Fa name={ch.type === 'voice' ? 'microphone' : 'hashtag'} size={13} />
                  <span>{ch.type === 'text' ? `# ${ch.name}` : ch.name}</span>
                  <small>{ch.type === 'voice' ? 'Voz' : 'Texto'}</small>
                  {allowed('canais') && <button className="ssw-row-del" onClick={() => handleDeleteChannel(ch.id)} title="Excluir"><Fa name="trash" size={14} /></button>}
                </div>
              ))}
              {(liveChannels || []).length === 0 && <div className="ssw-empty">Nenhum canal criado ainda.</div>}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ CATEGORIAS ═══ */
    if (effectiveActive === 'categorias') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="ORGANIZAÇÃO" title="Categorias" desc="Agrupe seus canais." action={<button className="ssw-primary-btn" onClick={() => setResourceModal('categoria')}><Fa name="plus" size={14} /> Nova categoria</button>} />
            <div className="ssw-list">
              {(liveCategories || []).map(cat => (
                <div className="ssw-list-row" key={cat.id}>
                  <Fa name="folder" size={14} />
                  <span>{cat.name}</span>
                  <small>Visível para todos</small>
                  {allowed('categorias') && <button className="ssw-row-del" onClick={() => handleDeleteCategory(cat.id)} title="Excluir"><Fa name="trash" size={14} /></button>}
                </div>
              ))}
              {(liveCategories || []).length === 0 && <div className="ssw-empty">Nenhuma categoria criada ainda.</div>}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ CARGOS ═══ */
    if (effectiveActive === 'cargos') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="MODELOS" title="Cargos prontos" desc="Um clique cria um cargo já com as permissões certas." />
            <div className="ssw-role-templates">
              {ROLE_TEMPLATES.map(t => (
                <button key={t.name} type="button" className="ssw-template-chip" onClick={() => void createRoleFromTemplate(t)} title={`Criar cargo ${t.name}`}>
                  <span className="ssw-role-dot" style={{ background: t.color }} />
                  {t.name}
                </button>
              ))}
            </div>
          </section>
          <section className="ssw-card">
            <SectionTitle eyebrow="HIERARQUIA" title="Cargos e permissões" desc={`${stats.cargos} cargos · escolha o que cada cargo pode ver e fazer`} />
            <div className="ssw-add-row">
              <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Nome do cargo (ex: Moderador)" onKeyDown={e => e.key === 'Enter' && handleAddRole()} />
              <input type="color" value={newRoleColor} onChange={e => setNewRoleColor(e.target.value)} className="ssw-color-input" title="Cor do cargo" />
              <button className="ssw-primary-btn" onClick={handleAddRole} disabled={!newRole.trim()}><Fa name="plus" size={14} /> Criar</button>
            </div>
            <div className="ssw-list">
              {liveRoles.map((role, idx) => {
                const assignedCount = Object.values(memberRolesMap).filter(ids => (ids || []).includes(role.id)).length
                const isAuto = liveServer?.autoRoleId === role.id
                const editing = editingRoleId === role.id
                return (
                  <div key={role.id} className="ssw-role-item">
                    <div className="ssw-list-row">
                      <span className="ssw-role-dot" style={{ background: role.color }} />
                      <span style={{ fontWeight: 700 }}>{role.name}</span>
                      {isAuto && <small className="ssw-role-auto-tag">entrada automática</small>}
                      <small>{role.permissions?.length || 0} permissões · {assignedCount} membros</small>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button className="ssw-small-btn" onClick={() => void moveRole(role, -1)} disabled={idx === 0} title="Subir"><Fa name="arrow-up" size={13} /></button>
                        <button className="ssw-small-btn" onClick={() => void moveRole(role, 1)} disabled={idx === liveRoles.length - 1} title="Descer"><Fa name="arrow-down" size={13} /></button>
                        <button className={`ssw-small-btn ${isAuto ? 'is-active' : ''}`} onClick={() => void setAutoRole(role.id)} title="Novos membros entram com este cargo"><Fa name="star" size={13} /></button>
                        <button className="ssw-small-btn" onClick={() => editing ? setEditingRoleId(null) : openRoleEditor(role)} title="Editar cargo e permissões"><Fa name="pen" size={13} /></button>
                        <button className="ssw-row-del" onClick={() => void deleteRole(role)} title="Excluir"><Fa name="trash" size={13} /></button>
                      </span>
                    </div>
                    {editing && (
                      <div className="ssw-role-editor">
                        <div className="ssw-add-row">
                          <input value={roleNameDraft} onChange={e => setRoleNameDraft(e.target.value)} placeholder="Nome do cargo" />
                          <input type="color" value={roleColorDraft} onChange={e => setRoleColorDraft(e.target.value)} className="ssw-color-input" title="Cor do cargo" />
                          <button className="ssw-primary-btn" onClick={() => void saveRoleEditor()}><Fa name="check" size={14} /> Salvar</button>
                        </div>
                        <p className="ssw-helper-text" style={{ marginTop: 8 }}>Permissões deste cargo — limitam o que ele pode ver e fazer nas configurações:</p>
                        {Array.from(new Set(SERVER_PERMISSIONS.map(p => p.group))).map(group => (
                          <div key={group} className="ssw-perm-group">
                            <strong>{group}</strong>
                            <div className="ssw-perm-grid">
                              {SERVER_PERMISSIONS.filter(p => p.group === group).map(p => (
                                <label key={p.key} className="ssw-perm-item" title={p.desc}>
                                  <input type="checkbox" checked={rolePermDraft.includes(p.key)} onChange={() => setRolePermDraft(prev => prev.includes(p.key) ? prev.filter(k => k !== p.key) : [...prev, p.key])} />
                                  <span><strong>{p.label}</strong><small>{p.desc}</small></span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {liveRoles.length === 0 && <div className="ssw-empty">Nenhum cargo criado ainda. Use um modelo acima ou crie do zero.</div>}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ MEMBROS ═══ */
    if (effectiveActive === 'membros') {
      const q = memberSearch.trim().toLowerCase()
      const visibleMembers = liveMembers.filter(id => !q || userNameOf(id).toLowerCase().includes(q))
      const candidates = addPersonQuery.trim() ? allUsers.filter(u => !liveMembers.includes(u.id) && u.name.toLowerCase().includes(addPersonQuery.trim().toLowerCase())).slice(0, 8) : []
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="PESSOAS" title="Adicionar pessoa" desc="Adicione ao servidor alguém que já usa o Friends Space." />
            <div className="ssw-add-row">
              <input value={addPersonQuery} onChange={e => setAddPersonQuery(e.target.value)} placeholder="Buscar pessoa pelo nome..." />
            </div>
            {candidates.length > 0 && (
              <div className="ssw-list" style={{ marginTop: 10 }}>
                {candidates.map(u => (
                  <div className="ssw-list-row" key={u.id}>
                    <Fa name="user-plus" size={14} />
                    <span>{u.name}</span>
                    <button className="ssw-primary-btn" onClick={() => void addPerson(u.id)}><Fa name="plus" size={13} /> Adicionar</button>
                  </div>
                ))}
              </div>
            )}
            {addPersonQuery.trim() && candidates.length === 0 && <div className="ssw-empty" style={{ marginTop: 10 }}>Ninguém encontrado com esse nome (ou já está no servidor).</div>}
          </section>
          <section className="ssw-card">
            <SectionTitle eyebrow="MEMBROS" title="Gerenciar membros" desc={`${liveMembers.length} membros · clique num cargo para tirar, ou em + cargo para dar`} />
            <div className="ssw-add-row">
              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Buscar membro..." />
            </div>
            <div className="ssw-list">
              {visibleMembers.map(id => {
                const mRoles = rolesOf(id)
                const isOwnerRow = liveServer?.ownerId === id
                const open = rolePickerFor === id
                const available = liveRoles.filter(r => !mRoles.some(mr => mr.id === r.id))
                return (
                  <div key={id} className="ssw-member-item">
                    <div className="ssw-list-row">
                      <Fa name={isOwnerRow ? 'star' : 'user'} size={14} />
                      <span>{userNameOf(id)}{isOwnerRow ? ' (dono)' : ''}</span>
                      <span className="ssw-member-roles">
                        {mRoles.map(r => (
                          <button key={r.id} type="button" className="ssw-role-badge" style={{ borderColor: r.color, color: r.color }} onClick={() => void toggleMemberRole(id, r.id)} title="Clique para remover este cargo">
                            {r.name}<Fa name="xmark" size={10} />
                          </button>
                        ))}
                        <button type="button" className="ssw-role-badge ssw-role-badge-add" onClick={() => setRolePickerFor(open ? null : id)} title="Dar cargo">
                          <Fa name="plus" size={10} /> cargo
                        </button>
                      </span>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button className="ssw-small-btn" onClick={() => void memberMod('timeout', id)} title="Silenciar 10min"><Fa name="volume-xmark" size={13} /></button>
                        <button className="ssw-small-btn" onClick={() => void memberMod('kick', id)} title="Expulsar"><Fa name="door-open" size={13} /></button>
                        {bannedList.includes(id)
                          ? <button className="ssw-small-btn" onClick={() => void memberMod('unban', id)} title="Desbanir"><Fa name="check" size={13} /></button>
                          : <button className="ssw-row-del" onClick={() => void memberMod('ban', id)} title="Banir"><Fa name="gavel" size={13} /></button>}
                      </span>
                    </div>
                    {open && (
                      <div className="ssw-role-picker">
                        {available.map(r => (
                          <button key={r.id} type="button" className="ssw-role-badge" style={{ borderColor: r.color, color: r.color }} onClick={() => { void toggleMemberRole(id, r.id); setRolePickerFor(null) }}>
                            <span className="ssw-role-dot" style={{ background: r.color }} />{r.name}
                          </button>
                        ))}
                        {available.length === 0 && <span className="ssw-empty">Sem cargos disponíveis — crie na aba Cargos.</span>}
                      </div>
                    )}
                  </div>
                )
              })}
              {visibleMembers.length === 0 && <div className="ssw-empty">Nenhum membro encontrado.</div>}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ EVENTOS ═══ */
    if (effectiveActive === 'eventos') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="ATIVAÇÕES" title="Eventos" desc="Organize eventos para sua comunidade." action={<button className="ssw-primary-btn" onClick={() => setResourceModal('evento')}><Fa name="plus" size={14} /> Criar evento</button>} />
            <div className="ssw-list">
              {(liveEvents || []).map(ev => (
                <div className="ssw-list-row" key={ev.id}>
                  <Fa name="calendar-days" size={14} />
                  <span>{ev.title}</span>
                  <small>{fmtDate(ev.date)}</small>
                  {allowed('eventos') && <button className="ssw-row-del" onClick={() => handleDeleteEvent(ev.id)} title="Excluir"><Fa name="trash" size={14} /></button>}
                </div>
              ))}
              {(liveEvents || []).length === 0 && <div className="ssw-empty">Nenhum evento criado ainda.</div>}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ REGRAS ═══ */
    if (effectiveActive === 'regras') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card ssw-policy-card">
            <SectionTitle eyebrow="CÓDIGO DE CONDUTA" title="Regras do servidor" desc="Defina as regras que sua comunidade deve seguir." action={<span className="ssw-count-badge">{rules.length} regras</span>} />
            <div className="ssw-policy-list">
              {rules.map((policy, i) => (
                <div className="ssw-policy-row" key={`${policy}-${i}`}>
                  <span className="ssw-drag-handle">⋮⋮</span>
                  {editingRule === i ? (
                    <input className="ssw-inline-rule" value={ruleDraft} onChange={e => setRuleDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveRule()} autoFocus />
                  ) : (
                    <button className="ssw-policy-text" onClick={() => { setEditingRule(i); setRuleDraft(policy) }}>{policy}</button>
                  )}
                  <div className="ssw-policy-actions">
                    {editingRule === i ? <button onClick={saveRule} aria-label="Salvar"><Fa name="check" size={14} /></button>
                      : <button onClick={() => { setEditingRule(i); setRuleDraft(policy) }} aria-label="Editar"><Fa name="pen" size={14} /></button>}
                    <button onClick={() => moveRule(i, -1)} disabled={i === 0} aria-label="Subir"><Fa name="chevron-up" size={14} /></button>
                    <button onClick={() => moveRule(i, 1)} disabled={i === rules.length - 1} aria-label="Descer"><Fa name="chevron-down" size={14} /></button>
                    <button className="ssw-danger-icon" onClick={() => removeRule(i)} aria-label="Excluir"><Fa name="trash" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <button className="ssw-add-rule" onClick={addRule}><Fa name="plus" size={14} /> Adicionar regra</button>
            <div className="ssw-policy-footer">
              <div><strong>Aceite obrigatório</strong><span>Membros devem aceitar as regras para entrar.</span></div>
              <Toggle checked={toggles.rules} onChange={() => flipToggle('rules')} />
            </div>
            <p className="ssw-helper-text" style={{ marginTop: 12 }}><Fa name="circle-info" size={14} /> As regras são salvas na descrição do servidor ao clicar em Salvar alterações.</p>
          </section>
        </div>
      )
    }

    /* ═══ MODERAÇÃO (persiste + ações em membros) ═══ */
    if (effectiveActive === 'moderacao') {
      const doTimeout = async (userId: string) => {
        try {
          const st = useServerStore.getState() as unknown as Record<string, unknown>
          if (typeof st.timeoutMember === 'function') await (st.timeoutMember as (s: string, u: string, m: number) => Promise<void>)(server.id, userId, 10)
          else {
            const next = { ...timeoutMap, [userId]: Date.now() + 10 * 60 * 1000 }
            await persist({ timeouts: next }, 'member.timeout', `${userNameOf(userId)} · 10min`)
          }
          notify(`${userNameOf(userId)} silenciado por 10min`)
        } catch { notify('Falha ao silenciar') }
      }
      const doKick = async (userId: string) => {
        if (!window.confirm(`Expulsar ${userNameOf(userId)}?`)) return
        try {
          const st = useServerStore.getState() as unknown as Record<string, unknown>
          if (typeof st.kickMember === 'function') await (st.kickMember as (s: string, u: string) => Promise<void>)(server.id, userId)
          else if (typeof st.leaveServer === 'function') await (st.leaveServer as (s: string, u: string) => Promise<void>)(server.id, userId)
          await persist({}, 'member.kick', userNameOf(userId))
          notify('Membro expulso')
        } catch { notify('Falha ao expulsar') }
      }
      const doBan = async (userId: string) => {
        if (!window.confirm(`Banir ${userNameOf(userId)}?`)) return
        try {
          const st = useServerStore.getState() as unknown as Record<string, unknown>
          if (typeof st.banMember === 'function') await (st.banMember as (s: string, u: string) => Promise<void>)(server.id, userId)
          const next = bannedList.includes(userId) ? bannedList : [...bannedList, userId]
          await persist({ banned: next }, 'member.ban', userNameOf(userId))
          notify('Membro banido')
        } catch { notify('Falha ao banir') }
      }
      const doUnban = async (userId: string) => {
        try {
          const st = useServerStore.getState() as unknown as Record<string, unknown>
          if (typeof st.unbanMember === 'function') await (st.unbanMember as (s: string, u: string) => Promise<void>)(server.id, userId)
          await persist({ banned: bannedList.filter(id => id !== userId) }, 'member.unban', userNameOf(userId))
          notify('Membro desbanido')
        } catch { notify('Falha ao desbanir') }
      }
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="PROTEÇÃO" title="Nível de moderação" desc="Defina a intensidade dos filtros automáticos." />
            <div className="ssw-moderation-select" style={{ maxWidth: 220 }}>
              <SelectField value={moderation} options={['Baixo', 'Médio', 'Alto', 'Máximo']} onChange={persistModeration} />
            </div>
          </section>
          <section className="ssw-card">
            <SectionTitle eyebrow="FILTROS" title="AutoMod" desc="Filtros automáticos de conteúdo (salvos de verdade)." />
            <div className="ssw-setting-list">
              <SettingRow icon="fa-bug" title="Spam e flood" desc="Bloquear mensagens repetidas" checked={autoMod.spam} onChange={() => persistAutomod({ ...autoMod, spam: !autoMod.spam })} />
              <SettingRow icon="fa-link" title="Links suspeitos" desc="Sinalizar domínios perigosos" checked={autoMod.links} onChange={() => persistAutomod({ ...autoMod, links: !autoMod.links })} />
              <SettingRow icon="fa-face-angry" title="Linguagem ofensiva" desc="Bloquear xingamentos" checked={autoMod.ofensa} onChange={() => persistAutomod({ ...autoMod, ofensa: !autoMod.ofensa })} />
              <SettingRow icon="fa-arrow-up-wide-short" title="CAPS LOCK" desc="Bloquear mensagens em caixa alta" checked={autoMod.caps} onChange={() => persistAutomod({ ...autoMod, caps: !autoMod.caps })} />
            </div>
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Palavras bloqueadas ({blockedWords.length})</strong>
              <div className="ssw-add-row" style={{ marginTop: 8 }}>
                <input value={newWord} onChange={e => setNewWord(e.target.value)} placeholder="Ex: spam" onKeyDown={e => e.key === 'Enter' && addBlockedWord()} />
                <button className="ssw-primary-btn" onClick={addBlockedWord} disabled={!newWord.trim()}><Fa name="plus" size={14} /> Adicionar</button>
              </div>
              <div className="ssw-theme-row" style={{ marginTop: 8 }}>
                {blockedWords.map(w => (
                  <button key={w} className="ssw-theme-chip" onClick={() => removeBlockedWord(w)} title="Remover">{w}<Fa name="xmark" size={14} /></button>
                ))}
                {blockedWords.length === 0 && <span className="ssw-empty">Nenhuma palavra bloqueada.</span>}
              </div>
            </div>
          </section>
          <section className="ssw-card">
            <SectionTitle eyebrow="MEMBROS" title="Moderar membros" desc={`${liveMembers.length} membros`} />
            <div className="ssw-list">
              {liveMembers.map(id => {
                const banned = bannedList.includes(id)
                const until = timeoutMap[id] || 0
                const silenced = until > Date.now()
                return (
                  <div className="ssw-list-row" key={id}>
                    <Fa name="user" size={14} />
                    <span>{userNameOf(id)}</span>
                    <small>{banned ? 'banido' : silenced ? `silenciado até ${fmtTime(until)}` : 'ativo'}</small>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button className="ssw-small-btn" onClick={() => void doTimeout(id)} title="Silenciar 10min"><Fa name="volume-xmark" size={14} /></button>
                      <button className="ssw-small-btn" onClick={() => void doKick(id)} title="Expulsar"><Fa name="door-open" size={14} /></button>
                      {banned
                        ? <button className="ssw-small-btn" onClick={() => void doUnban(id)} title="Desbanir"><Fa name="check" size={14} /></button>
                        : <button className="ssw-row-del" onClick={() => void doBan(id)} title="Banir"><Fa name="gavel" size={14} /></button>}
                    </span>
                  </div>
                )
              })}
              {liveMembers.length === 0 && <div className="ssw-empty">Nenhum membro.</div>}
            </div>
            {bannedList.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 13 }}>Banidos ({bannedList.length})</strong>
                <div className="ssw-list" style={{ marginTop: 8 }}>
                  {bannedList.map(id => (
                    <div className="ssw-list-row" key={id}>
                      <Fa name="gavel" size={14} />
                      <span>{userNameOf(id)}</span>
                      <small>banido</small>
                      <button className="ssw-small-btn" onClick={() => void doUnban(id)}>Desbanir</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )
    }

    /* ═══ BOTS ═══ */
    if (effectiveActive === 'bots') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="AUTOMAÇÃO" title="Bots" desc="Cadastre bots para operar na sua comunidade." />
            <div className="ssw-bot-form">
              <div className="ssw-form-grid ssw-two-columns">
                <label className="ssw-field"><span>Nome do bot</span><input value={botName} onChange={e => setBotName(e.target.value)} placeholder="Ex: Meu Bot" /></label>
                <label className="ssw-field"><span>Token ou identificador</span><input type="password" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="Token do bot" /></label>
                <label className="ssw-field" style={{ gridColumn: '1 / -1' }}><span>Descrição</span><input value={botDesc} onChange={e => setBotDesc(e.target.value)} placeholder="O que este bot faz?" /></label>
              </div>
              <button className="ssw-primary-btn" onClick={addBot}><Fa name="plus" size={14} /> Adicionar bot</button>
            </div>
            <div className="ssw-list" style={{ marginTop: 14 }}>
              {bots.map(bot => (
                <div className="ssw-list-row" key={bot.id}>
                  <Fa name="robot" size={14} />
                  <span>{bot.name}</span>
                  <small>{bot.desc}</small>
                  <button className="ssw-small-btn" onClick={() => void testBot(bot.id)} title="Testar bot"><Fa name="paper-plane" size={14} /> Testar</button>
                  <button className="ssw-row-del" onClick={() => removeBot(bot.id)} title="Remover"><Fa name="trash" size={14} /></button>
                </div>
              ))}
              {bots.length === 0 && <div className="ssw-empty">Nenhum bot cadastrado.</div>}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ WEBHOOKS ═══ */
    if (effectiveActive === 'webhooks') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="CONEXÕES" title="Webhooks" desc="Envie eventos do servidor para endpoints." />
            <div className="ssw-bot-form">
              <div className="ssw-form-grid ssw-two-columns">
                <label className="ssw-field"><span>Nome do webhook</span><input value={whName} onChange={e => setWhName(e.target.value)} placeholder="Ex: Webhook de anúncios" /></label>
                <label className="ssw-field"><span>Endpoint HTTPS</span><input value={whUrl} onChange={e => setWhUrl(e.target.value)} placeholder="https://..." /></label>
              </div>
              <button className="ssw-primary-btn" onClick={addWebhook}><Fa name="plus" size={14} /> Adicionar webhook</button>
            </div>
            <div className="ssw-list" style={{ marginTop: 14 }}>
              {webhooks.map(wh => (
                <div className="ssw-list-row" key={wh.id}>
                  <Fa name="satellite-dish" size={14} />
                  <span>{wh.name}</span>
                  <small>{wh.url}</small>
                  <button className="ssw-small-btn" onClick={() => void testWebhook(wh.id)} title="Testar webhook"><Fa name="paper-plane" size={14} /> Testar</button>
                  <button className="ssw-row-del" onClick={() => removeWebhook(wh.id)} title="Remover"><Fa name="trash" size={14} /></button>
                </div>
              ))}
              {webhooks.length === 0 && <div className="ssw-empty">Nenhum webhook cadastrado.</div>}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ AUDITORIA (log real) ═══ */
    if (effectiveActive === 'auditoria') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="SEGURANÇA" title="Registro de auditoria" desc={`${auditLog.length} eventos`} />
            <div className="ssw-list">
              {auditLog.map(e => (
                <div className="ssw-list-row" key={e.id}>
                  <Fa name="clipboard-list" size={14} />
                  <span>{e.action}</span>
                  <small>{new Date(e.at).toLocaleString('pt-BR')} · {e.actorName} · {e.detail}</small>
                </div>
              ))}
              {auditLog.length === 0 && <div className="ssw-empty">Nenhuma atividade registrada ainda.</div>}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ BIBLIOTECA SEPARADA POR ABA ═══ */
    if (effectiveActive === 'emojis') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="BIBLIOTECA" title="Emojis personalizados" desc="Use :nome: no chat para renderizar." />
            <div className="ssw-bot-form">
              <div className="ssw-form-grid ssw-two-columns">
                <label className="ssw-field"><span>Nome do emoji</span><input value={libName} onChange={e => setLibName(e.target.value)} placeholder="Ex.: coracao_verde" /></label>
                <label className="ssw-field"><span>URL do arquivo</span><input value={libDetail} onChange={e => setLibDetail(e.target.value)} placeholder="Cole a URL do arquivo" /></label>
              </div>
              <button className="ssw-primary-btn" onClick={addEmojiItem}><Fa name="plus" size={14} /> Adicionar</button>
            </div>
            <div className="ssw-list" style={{ marginTop: 14 }}>
              {emojiItems.map(item => (
                <div className="ssw-list-row" key={item.id}>
                  {item.detail.startsWith('http') ? <img src={item.detail} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} /> : <Fa name="face-smile" size={14} />}
                  <span>:{item.name}:</span><small>{item.detail}</small>
                  <button className="ssw-row-del" onClick={() => { const next = emojiItems.filter(i => i.id !== item.id); setEmojiItems(next); void persist({ emojis: next }, 'emoji.remove', item.name) }}><Fa name="trash" size={14} /></button>
                </div>
              ))}
              {emojiItems.length === 0 && <div className="ssw-empty">Nenhum emoji cadastrado.</div>}
            </div>
          </section>
        </div>
      )
    }
    if (effectiveActive === 'figurinhas') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="BIBLIOTECA" title="Figurinhas personalizadas" desc="Figurinhas do servidor." />
            <div className="ssw-bot-form">
              <div className="ssw-form-grid ssw-two-columns">
                <label className="ssw-field"><span>Nome da figurinha</span><input value={libName} onChange={e => setLibName(e.target.value)} placeholder="Ex.: reacao_aplausos" /></label>
                <label className="ssw-field"><span>URL do arquivo</span><input value={libDetail} onChange={e => setLibDetail(e.target.value)} placeholder="Cole a URL do arquivo" /></label>
              </div>
              <button className="ssw-primary-btn" onClick={addStickerItem}><Fa name="plus" size={14} /> Adicionar</button>
            </div>
            <div className="ssw-list" style={{ marginTop: 14 }}>
              {stickerItems.map(item => (
                <div className="ssw-list-row" key={item.id}>
                  {item.detail.startsWith('http') ? <img src={item.detail} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <Fa name="stamp" size={14} />}
                  <span>{item.name}</span><small>{item.detail}</small>
                  <button className="ssw-row-del" onClick={() => { const next = stickerItems.filter(i => i.id !== item.id); setStickerItems(next); void persist({ stickers: next }, 'sticker.remove', item.name) }}><Fa name="trash" size={14} /></button>
                </div>
              ))}
              {stickerItems.length === 0 && <div className="ssw-empty">Nenhuma figurinha cadastrada.</div>}
            </div>
          </section>
        </div>
      )
    }
    if (effectiveActive === 'convites') {
      const regenMain = async () => {
        try {
          const st = useServerStore.getState() as unknown as Record<string, unknown>
          if (typeof st.regenerateInvite === 'function') {
            const code = await (st.regenerateInvite as (s: string) => Promise<string>)(server.id)
            notify(`Novo código: ${code}`)
          } else {
            const code = Math.random().toString(36).substring(2, 10)
            if (typeof st.updateServer === 'function') await (st.updateServer as (id: string, d: unknown) => Promise<void>)(server.id, { inviteCode: code })
            notify(`Novo código: ${code}`)
          }
        } catch { notify('Falha ao regenerar') }
      }
      const createExtra = async () => {
        const label = newInviteLabel.trim() || 'Convite'
        try {
          const st = useServerStore.getState() as unknown as Record<string, unknown>
          if (typeof st.createInvite === 'function') {
            const code = await (st.createInvite as (s: string, l: string) => Promise<string>)(server.id, label)
            setInviteItems(prev => { const next = [...prev, { id: rid(), code: String(code), label, createdAt: Date.now() }]; return next })
            notify(`Convite criado: ${code}`)
          } else {
            const code = Math.random().toString(36).substring(2, 10)
            const next = [...inviteItems, { id: rid(), code, label, createdAt: Date.now() }]
            setInviteItems(next)
            await persist({ invites: next }, 'invite.create', `${label} · ${code}`)
            notify(`Convite criado: ${code}`)
          }
          setNewInviteLabel('')
        } catch { notify('Falha ao criar convite') }
      }
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="CONVITES" title="Código principal" desc="Compartilhe para trazer membros." />
            <div className="ssw-add-row">
              <input readOnly value={liveServer?.inviteCode || ''} />
              <button className="ssw-small-btn" onClick={() => { void copyTextGlobal(liveServer?.inviteCode || '').then(ok => notify(ok ? 'Código copiado' : 'Falha ao copiar')) }}>Copiar</button>
              <button className="ssw-small-btn" onClick={() => void regenMain()}>Regenerar</button>
            </div>
          </section>
          <section className="ssw-card">
            <SectionTitle eyebrow="CONVITES" title="Convites extras" desc={`${inviteItems.length} convites`} />
            <div className="ssw-add-row">
              <input value={newInviteLabel} onChange={e => setNewInviteLabel(e.target.value)} placeholder="Rótulo (ex: amigos)" onKeyDown={e => e.key === 'Enter' && void createExtra()} />
              <button className="ssw-primary-btn" onClick={() => void createExtra()}><Fa name="plus" size={14} /> Criar</button>
            </div>
            <div className="ssw-list" style={{ marginTop: 14 }}>
              {inviteItems.map(inv => (
                <div className="ssw-list-row" key={inv.id}>
                  <Fa name="link" size={14} /><span>{inv.code}</span><small>{inv.label} · {fmtDate(inv.createdAt)}</small>
                  <button className="ssw-small-btn" onClick={() => { void copyTextGlobal(inv.code).then(ok => notify(ok ? 'Copiado' : 'Falha ao copiar')) }}>Copiar</button>
                  <button className="ssw-row-del" onClick={() => { const next = inviteItems.filter(i => i.id !== inv.id); setInviteItems(next); void persist({ invites: next }, 'invite.remove', inv.code) }}><Fa name="trash" size={14} /></button>
                </div>
              ))}
              {inviteItems.length === 0 && <div className="ssw-empty">Nenhum convite extra.</div>}
            </div>
          </section>
        </div>
      )
    }
    if (effectiveActive === 'widget') {
      const textCh = liveChannels.filter(c => c.type === 'text')
      const invite = liveServer?.inviteCode || ''
      const widgetHtml = `<div style="font-family:sans-serif;border:1px solid #333;border-radius:12px;padding:16px;max-width:320px;background:#111;color:#fff"><strong>${(widgetTitle || liveServer?.name || 'Servidor').replace(/</g, '&lt;')}</strong><p>${stats.membros} membros · ${stats.online} online</p><p>${stats.texto} canais de texto · ${stats.voz} de voz</p><a href="${typeof location !== 'undefined' ? location.origin : ''}/#/convite/${invite}" style="display:inline-block;margin-top:8px;padding:8px 14px;border-radius:8px;background:#4ade80;color:#000;font-weight:700;text-decoration:none">Entrar no servidor</a></div>`
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="WIDGET" title="Widget da comunidade" desc="Mostre seu servidor em sites." />
            <div className="ssw-setting-list">
              <div className="ssw-setting-row">
                <span className="ssw-setting-icon"><Fa name="code" size={14} /></span>
                <div className="ssw-setting-copy"><strong>Ativar widget</strong><span>Exibir preview público</span></div>
                <Toggle checked={widgetEnabled} onChange={() => { const v = !widgetEnabled; setWidgetEnabled(v); void persist({ widget: { title: widgetTitle, channel: widgetChannel, enabled: v } }) }} />
              </div>
            </div>
            <div className="ssw-form-grid ssw-two-columns" style={{ marginTop: 12 }}>
              <label className="ssw-field"><span>Título</span><input value={widgetTitle} onChange={e => setWidgetTitle(e.target.value)} placeholder={liveServer?.name || 'Título'} /></label>
              <label className="ssw-field"><span>Canal destino</span>
                <select value={widgetChannel} onChange={e => setWidgetChannel(e.target.value)}>
                  <option value="">Selecione</option>
                  {textCh.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                </select>
              </label>
            </div>
            <div className="ssw-add-row" style={{ marginTop: 12 }}>
              <button className="ssw-primary-btn" onClick={() => { void persist({ widget: { title: widgetTitle, channel: widgetChannel, enabled: widgetEnabled } }, 'widget.save', widgetTitle); notify('Widget salvo') }}><Fa name="floppy-disk" size={14} /> Salvar widget</button>
              <button className="ssw-small-btn" onClick={() => { void copyTextGlobal(widgetHtml).then(ok => notify(ok ? 'HTML copiado' : 'Falha ao copiar')) }}>Copiar HTML</button>
            </div>
          </section>
          <section className="ssw-card">
            <SectionTitle eyebrow="PREVIEW AO VIVO" title={widgetTitle || liveServer?.name || 'Servidor'} desc={liveServer?.description || 'Sem descrição'} />
            <p style={{ fontSize: 13 }}>{stats.membros} membros · {stats.online} online · {stats.texto} texto · {stats.voz} voz</p>
            <div className="ssw-list" style={{ marginTop: 8 }}>
              {textCh.slice(0, 5).map(c => <div className="ssw-list-row" key={c.id}><Fa name="hashtag" size={14} /><span># {c.name}</span></div>)}
            </div>
          </section>
        </div>
      )
    }
    if (effectiveActive === 'modelo') {
      const savedTpl = ((liveServer as unknown as Record<string, unknown>)?.settings as Record<string, unknown> | undefined)?.template as { name: string; detail: string; data?: unknown } | null | undefined
      const snapshot = () => ({
        channels: liveChannels.map(c => ({ name: c.name, type: c.type, categoryId: c.categoryId })),
        categories: liveCategories.map(c => ({ name: c.name })),
        roles: liveRoles.map(r => ({ name: r.name, color: r.color })),
        rules: editDesc,
      })
      const saveTpl = async () => {
        const name = tplName.trim() || `Modelo ${fmtDate(Date.now())}`
        const tpl = { name, detail: `${liveChannels.length} canais · ${liveCategories.length} categorias · ${liveRoles.length} cargos`, data: snapshot() }
        await persist({ template: tpl }, 'template.save', name)
        setTplName(''); notify('Modelo salvo')
      }
      const exportTpl = () => {
        const blob = new Blob([JSON.stringify({ name: savedTpl?.name || tplName || 'modelo', exportedAt: Date.now(), data: savedTpl?.data || snapshot() }, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob); a.download = 'modelo-servidor.json'; a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      }
      const applyData = async (data: { channels?: { name: string; type: 'text' | 'voice'; categoryId?: string }[]; categories?: { name: string }[]; roles?: { name: string; color: string }[] }) => {
        for (const c of data.categories || []) { try { await addCategory(server.id, c.name) } catch { /* noop */ } }
        for (const ch of data.channels || []) { try { await addChannel(server.id, ch.name, ch.type === 'voice' ? 'voice' : 'text', ch.categoryId) } catch { /* noop */ } }
        for (const r of data.roles || []) { try { await addRole(server.id, r.name, r.color || '#29A3FF') } catch { /* noop */ } }
        notify('Modelo aplicado')
      }
      const applySaved = () => {
        const d = savedTpl?.data as { channels?: { name: string; type: 'text' | 'voice'; categoryId?: string }[]; categories?: { name: string }[]; roles?: { name: string; color: string }[] } | undefined
        if (!d) { notify('Nenhum modelo salvo'); return }
        void applyData(d)
      }
      const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (!f) return
        try {
          const json = JSON.parse(await f.text()) as { data?: { channels?: { name: string; type: 'text' | 'voice'; categoryId?: string }[]; categories?: { name: string }[]; roles?: { name: string; color: string }[] }; channels?: { name: string; type: 'text' | 'voice'; categoryId?: string }[]; categories?: { name: string }[]; roles?: { name: string; color: string }[] }
          const data = json.data || json
          await applyData(data)
          await persist({ template: { name: f.name.replace(/\.json$/i, ''), detail: 'Importado de arquivo', data } }, 'template.import', f.name)
        } catch { notify('Arquivo inválido') }
        e.target.value = ''
      }
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="MODELO" title="Modelo do servidor" desc={savedTpl ? `Salvo: ${savedTpl.name} · ${savedTpl.detail}` : 'Nenhum modelo salvo'} />
            <div className="ssw-add-row">
              <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Nome do modelo" />
              <button className="ssw-primary-btn" onClick={() => void saveTpl()}><Fa name="floppy-disk" size={14} /> Salvar estrutura atual</button>
            </div>
            <div className="ssw-add-row" style={{ marginTop: 8 }}>
              <button className="ssw-small-btn" onClick={exportTpl}>Exportar JSON</button>
              <button className="ssw-small-btn" onClick={() => fileImportRef.current?.click()}>Importar JSON</button>
              <input ref={fileImportRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onImportFile} />
              <button className="ssw-small-btn" onClick={applySaved} disabled={!savedTpl}>Aplicar modelo salvo</button>
            </div>
          </section>
        </div>
      )
    }

    /* ═══ INTEGRAÇÕES ═══ */
    if (effectiveActive === 'integracoes') {
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="CONEXÕES" title="Integrações" desc="Cadastre serviços externos manualmente." />
            <div className="ssw-bot-form">
              <div className="ssw-form-grid ssw-two-columns">
                <label className="ssw-field"><span>Nome da integração</span><input value={intName} onChange={e => setIntName(e.target.value)} placeholder="Ex.: Twitch" /></label>
                <label className="ssw-field"><span>Chave, URL ou identificador</span><input value={intDetail} onChange={e => setIntDetail(e.target.value)} placeholder="Informe o valor manualmente" /></label>
              </div>
              <button className="ssw-primary-btn" onClick={addIntegration}><Fa name="plus" size={14} /> Adicionar integração</button>
            </div>
            <div className="ssw-list" style={{ marginTop: 14 }}>
              {integrations.map(int => (
                <div className="ssw-list-row" key={int.id}>
                  <Fa name="plug" size={14} /><span>{int.name}</span><small>{int.detail}</small>
                  <button className="ssw-row-del" onClick={() => { const next = integrations.filter(i => i.id !== int.id); setIntegrations(next); void persist({ integrations: next }, 'integration.remove', int.name) }}><Fa name="trash" size={14} /></button>
                </div>
              ))}
              {integrations.length === 0 && <div className="ssw-empty">Nenhuma integração cadastrada.</div>}
            </div>
          </section>
        </div>
      )
    }

    /* ═══ PUBLICAÇÕES (anúncios + feed + stories do servidor) ═══ */
    if (effectiveActive === 'publicacoes') {
      const srv = liveServer || server
      const textChannels = liveChannels.filter(c => c.type === 'text')
      return (
        <div className="ssw-stack">
          <section className="ssw-card">
            <SectionTitle eyebrow="ANÚNCIOS" title="Publicar anúncio" desc="Envie um aviso destacado direto para um canal de texto do servidor." />
            <div className="ssw-ann-grid">
              <input value={annTitle} onChange={e => setAnnTitle(e.target.value)} placeholder="Título (opcional)" maxLength={80} />
              <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} placeholder="Escreva o anúncio..." rows={3} className="ssw-ann-body" maxLength={1800} />
              {textChannels.length > 0 && (
                <select value={annChannelId || textChannels[0].id} onChange={e => setAnnChannelId(e.target.value)}>
                  {textChannels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                </select>
              )}
              <label className="ssw-perm-item" style={{ maxWidth: 260 }}>
                <input type="checkbox" checked={annEveryone} onChange={() => setAnnEveryone(v => !v)} />
                <span><strong>Chamar @todos</strong><small>Adiciona @todos no fim do anúncio</small></span>
              </label>
              <div>
                <button type="button" className="ssw-primary-btn" disabled={!annBody.trim() || annBusy || textChannels.length === 0} onClick={() => void publishAnnouncement()}>
                  <Fa name="tower-broadcast" size={14} /> {annBusy ? 'Publicando...' : 'Publicar anúncio'}
                </button>
                {textChannels.length === 0 && <span className="ssw-helper-text" style={{ marginLeft: 10 }}>Crie um canal de texto primeiro.</span>}
              </div>
            </div>
          </section>
          <section className="ssw-card">
            <SectionTitle eyebrow="COMUNIDADE" title="Publicações do servidor" desc="Dono e staff postam no feed e nos stories como o servidor. Os seguidores veem no feed e nas histórias." />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setServerPostMode('post')}
                style={{ flex: 1, minWidth: 180, padding: '14px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>📰 Post no feed</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Novidade fixada como {srv?.name || 'o servidor'}</div>
              </button>
              <button type="button" onClick={() => setServerPostMode('story')}
                style={{ flex: 1, minWidth: 180, padding: '14px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>⏱️ Story (24h)</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Aparece na barra de stories dos seguidores</div>
              </button>
            </div>
          </section>
          {serverPostMode && srv && (
            <ServerPostModal server={srv} initialMode={serverPostMode} onClose={() => setServerPostMode(null)} onPublished={() => setServerPostMode(null)} />
          )}
        </div>
      )
    }

    /* ═══ COMUNIDADE (visão, habilitação, descoberta, automod) ═══ */
    if (['visao_comunidade', 'habilitacao', 'descoberta', 'automod'].includes(effectiveActive)) {
      const communityConfigs: Record<string, { sections: { title: string; items: string[] }[] }> = {
        visao_comunidade: { sections: [{ title: 'Perfil público', items: ['Exibir em recomendações', 'Permitir entrada por convite', 'Mostrar contador de membros'] }, { title: 'Experiência de entrada', items: ['Exibir boas-vindas', 'Mostrar regras antes de entrar', 'Solicitar escolha de cargos'] }] },
        habilitacao: { sections: [{ title: 'Requisitos de segurança', items: ['Canal de regras configurado', 'Canal de atualizações configurado', 'Nível de verificação definido'] }, { title: 'Recursos da comunidade', items: ['Comunidade habilitada', 'Onboarding de membros', 'Canais de fórum'] }] },
        descoberta: { sections: [{ title: 'Informações de descoberta', items: ['Listar em recomendações', 'Permitir pesquisa pública', 'Aceitar novos membros'] }, { title: 'Classificação', items: ['Categoria principal', 'Temas públicos', 'Idioma da listagem'] }] },
        automod: { sections: [{ title: 'Regras personalizadas', items: ['Palavras bloqueadas', 'Expressões regulares', 'Domínios permitidos'] }, { title: 'Escalonamento', items: ['Registrar ocorrência', 'Enviar alerta', 'Aplicar ação'] }] },
      }
      const cfg = communityConfigs[effectiveActive]
      return (
        <div className="ssw-stack">
          {effectiveActive === 'descoberta' && (
            <section className="ssw-card">
              <SectionTitle eyebrow="PERFIL PÚBLICO" title="Classificação do servidor" desc="Categoria e temas aparecem na busca do feed — capriche para ser achado (ex.: Flamengo, Neymar)." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Categoria principal</label>
                <SelectField value={discoverCategory ?? liveServer?.category ?? ''} options={['', ...DISCOVERY_CATEGORIES]} onChange={v => setDiscoverCategory(v)} />
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Temas (até 5, separados por vírgula)</label>
                <input value={discoverTagsText ?? (liveServer?.tags || []).join(', ')} onChange={e => setDiscoverTagsText(e.target.value)} maxLength={200} placeholder="ex.: flamengo, futebol, neymar"
                  style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
                <div>
                  <button type="button" onClick={() => void saveDiscovery()} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                    Salvar classificação
                  </button>
                </div>
              </div>
            </section>
          )}
          {cfg.sections.map((section, si) => (
            <section className="ssw-card" key={section.title}>
              <SectionTitle eyebrow="CONFIGURAÇÃO" title={section.title} desc="Ative ou desative manualmente." />
              <div className="ssw-setting-list">
                {section.items.map((item, ii) => {
                  const key = `${effectiveActive}:${si}-${ii}`
                  return (
                    <div className="ssw-setting-row" key={item}>
                      <span className="ssw-setting-icon"><Fa name="shield" size={14} /></span>
                      <div className="ssw-setting-copy"><strong>{item}</strong><span>{communityValues[key] ? 'Ativado' : 'Não configurado'}</span></div>
                      <Toggle checked={communityValues[key] ?? false} onChange={() => toggleCommunity(key)} />
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )
    }

    return null
  }

  const activeItem = NAV_GROUPS.flatMap(g => g.items).find(i => i.key === effectiveActive)

  return (
    <div className="ssw-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="ssw-window" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        {/* ── Sidebar ── */}
        <aside className="ssw-sidebar">
          <div className="ssw-sidebar-top">
            <div className="ssw-server-head">
              {editPhoto ? <img src={editPhoto} alt="" className="ssw-server-avatar" /> : (
                <div className="ssw-server-avatar ssw-server-avatar-fallback" style={{ background: editColor }}>{(editName || 'S').charAt(0).toUpperCase()}</div>
              )}
              <div className="ssw-server-identity">
                <strong>{editName || 'Servidor'}</strong>
                <span>Configurações</span>
              </div>
            </div>
            <button type="button" className="ssw-icon-btn" onClick={onClose} aria-label="Fechar"><Fa name="xmark" size={14} /></button>
          </div>

          <nav className="ssw-sidebar-nav">
            {NAV_GROUPS.map(group => (
              <div className="ssw-nav-group" key={group.label}>
                <p className="ssw-nav-group-label">{group.label}</p>
                {group.items.map(item => {
                  const isLocked = isFree && !FREE_KEYS.has(item.key)
                  const noPerm = !allowed(item.key)
                  if (isLocked || noPerm) {
                    // Recurso premium: banner comum com cadeado — NAO e um botao.
                    return (
                      <div key={item.key} className="ssw-nav-item ssw-nav-locked" title={isLocked ? 'Exclusivo ASTRO' : 'Seu cargo não permite esta seção'}>
                        <Fa name={item.icon} size={14} />
                        <span>{item.label}</span>
                        <Fa name="lock" size={12} className="ssw-nav-lock-icon" />
                      </div>
                    )
                  }
                  return (
                    <button key={item.key} type="button" className={`ssw-nav-item ${effectiveActive === item.key ? 'active' : ''}`}
                      onClick={() => setActive(item.key)}>
                      <Fa name={item.icon} size={14} />
                      <span>{item.label}</span>
                      {effectiveActive === item.key && <span className="ssw-active-pip" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          <div className="ssw-sidebar-bottom">
            <div className="ssw-tip-card">
              <Fa name="lightbulb" size={14} />
              <div>
                <strong>Dica</strong>
                <p>Suas alterações são salvas ao clicar em Salvar alterações.</p>
              </div>
            </div>
            <button className="ssw-delete-button" onClick={onDelete} disabled={!canDelete} title={canDelete ? 'Excluir servidor' : 'Somente o dono do servidor pode excluir'}>
              <Fa name="trash" size={14} /> Excluir servidor
            </button>
          </div>
        </aside>

        {/* ── Workspace ── */}
        <section className="ssw-workspace">
          <header className="ssw-workspace-header">
            <div>
              <span className="ssw-kicker">SERVER CONTROL / 01</span>
              <h2>{activeItem?.label || 'Configurações'}</h2>
              <p className="ssw-header-desc">
                {effectiveActive === 'visao' ? 'Gerencie os recursos e a experiência da comunidade.' : `Gerencie o módulo ${(activeItem?.label || '').toLowerCase()} da comunidade.`}
              </p>
            </div>
            <div className="ssw-header-actions">
              <span className="ssw-status-badge"><span className="ssw-status-dot" /> {driveConnected ? 'Drive conectado' : 'Modo manual'}</span>
              <button type="button" className="ssw-save-btn" onClick={onSave}><Fa name="floppy-disk" size={14} /> Salvar alterações</button>
            </div>
          </header>

          <div className="ssw-workspace-scroll">{renderContent()}</div>

          <footer className="ssw-workspace-footer">
            <span>ORBIT CONTROL CENTER · Configurações sincronizadas</span>
            <span className="ssw-footer-status">
              {error && <em className="ssw-error">{error}</em>}
              {toastMsg && <span className="ssw-toast">{toastMsg}</span>}
            </span>
          </footer>
        </section>
      </div>

      {resourceModal && (
        <ResourceModal
          kind={resourceModal}
          onClose={() => setResourceModal(null)}
          onSave={(name, detail, kind) => { void handleSaveResource(resourceModal, name, detail, kind) }}
        />
      )}
    </div>
  )
}
