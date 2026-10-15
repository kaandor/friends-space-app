import { Fa } from '../../utils/fa'
import { useState, useRef, useMemo } from 'react'
import { Plus, Check, CalendarDays, Trash2, Hash, X, Mic, Folder, Lightbulb, ArrowLeft, ArrowRight } from 'lucide-react'
import { ImageCropper } from '../ui/ImageCropper'

export interface CreateServerRoleDraft { name: string; color: string }
export interface CreateServerEventDraft { title: string; date: string; description: string }

export interface CreateServerData {
  name: string
  photoUrl?: string
  bannerUrl?: string
  description?: string
  category?: string
  themes?: string[]
  frequency?: string
  minAge?: string
  toggles?: { public: boolean; verify: boolean; welcome: boolean; logs: boolean }
  rules?: string
  events?: CreateServerEventDraft[]
  textChannels?: string[]
  voiceChannels?: string[]
  categories?: string[]
  roles?: CreateServerRoleDraft[]
}

interface CreateServerModalProps {
  open: boolean
  onClose: () => void
  onCreate: (data: CreateServerData) => void
}

/* ── Etapas da sidebar ── */
const SIDEBAR_ITEMS = [
  { title: 'Informações básicas', desc: 'Nome, ícone e descrição', icon: 'fa-circle-info' },
  { title: 'Temas e categorias', desc: 'Escolha os temas principais', icon: 'fa-palette' },
  { title: 'Frequência', desc: 'Qual sua frequência no servidor?', icon: 'fa-clock' },
  { title: 'Configurações', desc: 'Permissões e recursos', icon: 'fa-sliders' },
  { title: 'Políticas do servidor', desc: 'Regras e conduta', icon: 'fa-scroll' },
  { title: 'Idade mínima', desc: 'Idade para participar', icon: 'fa-user-group' },
  { title: 'Eventos', desc: 'Configure eventos', icon: 'fa-calendar-days' },
  { title: 'Canais de chat', desc: 'Crie canais de texto', icon: 'fa-message' },
  { title: 'Canais de voz', desc: 'Crie canais de voz', icon: 'fa-microphone' },
  { title: 'Pastas e organização', desc: 'Organize seus canais', icon: 'fa-folder' },
  { title: 'Cargos e permissões', desc: 'Gerencie funções', icon: 'fa-shield' },
  { title: 'Revisão', desc: 'Revise antes de criar', icon: 'fa-clipboard-check' },
]

const THEMES = [
  'Games', 'Animes', 'Tecnologia', 'Música', 'Filmes e Séries',
  'Esportes', 'Estudos', 'Arte', 'Programação', 'Política', 'Humor', 'Outros',
]

type Channel = { name: string; type: 'Texto' | 'Voz' }

/* ── Componente Toggle ── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" className={`csw-toggle ${checked ? 'is-on' : ''}`} onClick={onChange} aria-pressed={checked}>
      <span className="csw-toggle-knob" />
    </button>
  )
}

/* ── Miniatura de upload ── */
function UploadBox({ banner = false, onClick }: { banner?: boolean; onClick: () => void }) {
  return (
    <button className={`csw-upload-box ${banner ? 'csw-banner-upload' : 'csw-icon-upload'}`} type="button" onClick={onClick}>
      <span className="csw-upload-icon"><Fa name={banner ? 'image' : 'camera'} size={16} /></span>
      <span className="csw-upload-add"><Plus size={14} strokeWidth={2.5} /></span>
    </button>
  )
}

/* ── SectionTitle ── */
function SectionTitle({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="csw-section-heading">
      <div>
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      {action}
    </div>
  )
}

/* ── SettingRow ── */
function SettingRow({ icon, title, desc, checked, onChange }: {
  icon: string; title: string; desc: string; checked: boolean; onChange: () => void
}) {
  return (
    <div className="csw-setting-row">
      <span className="csw-setting-icon"><Fa name={icon} size={15} /></span>
      <div>
        <strong>{title}</strong>
        <small>{desc}</small>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

/* ── Componente principal ── */
export function CreateServerModal({ open, onClose, onCreate }: CreateServerModalProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [cropImage, setCropImage] = useState<string | null>(null)
  const [cropMode, setCropMode] = useState<'icon' | 'banner'>('icon')
  const [selectedThemes, setSelectedThemes] = useState<string[]>(['Games', 'Tecnologia'])
  const [frequency, setFrequency] = useState('')
  const [settings, setSettings] = useState({ public: true, verify: true, welcome: true, logs: false })
  const [rules, setRules] = useState('1.  Respeite todos os membros\n2.  Proibido spam e flood\n3.  Sem discurso de ódio ou preconceito\n4.  Conteúdo NSFW não é permitido')
  const [minAge, setMinAge] = useState('')
  const [events, setEvents] = useState<CreateServerEventDraft[]>([])
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [textChannels, setTextChannels] = useState<Channel[]>([{ name: 'chat-geral', type: 'Texto' }, { name: 'regras', type: 'Texto' }])
  const [newTextChannel, setNewTextChannel] = useState('')
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([{ name: 'Geral', type: 'Voz' }, { name: 'Música', type: 'Voz' }])
  const [newVoiceChannel, setNewVoiceChannel] = useState('')
  const [folders, setFolders] = useState(['Canais de Texto', 'Canais de Voz'])
  const [newFolder, setNewFolder] = useState('')
  const [roles, setRoles] = useState<CreateServerRoleDraft[]>([
    { name: 'Admin', color: '#00ff88' },
    { name: 'Moderador', color: '#5865f2' },
    { name: 'Membro', color: '#99aab5' },
  ])
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleColor, setNewRoleColor] = useState('#00ff88')
  const [error, setError] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const themeCount = useMemo(() => selectedThemes.length, [selectedThemes])
  const totalSteps = SIDEBAR_ITEMS.length

  const toggleSetting = (key: keyof typeof settings) => setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleTheme = (label: string) => {
    setSelectedThemes(prev =>
      prev.includes(label) ? prev.filter(t => t !== label) : prev.length < 5 ? [...prev, label] : prev
    )
  }

  const slugify = (v: string) =>
    v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'canal'

  const addTextChannel = () => {
    const raw = newTextChannel.trim().slice(0, 40)
    if (!raw) return
    setTextChannels(prev => [...prev, { name: slugify(raw), type: 'Texto' }])
    setNewTextChannel('')
  }
  const addVoiceChannel = () => {
    const raw = newVoiceChannel.trim().slice(0, 40)
    if (!raw) return
    setVoiceChannels(prev => [...prev, { name: raw, type: 'Voz' }])
    setNewVoiceChannel('')
  }
  const addFolder = () => {
    const raw = newFolder.trim().slice(0, 40)
    if (!raw) return
    if (folders.some(f => f.toLowerCase() === raw.toLowerCase())) return
    setFolders(prev => [...prev, raw])
    setNewFolder('')
  }
  const addEvent = () => {
    const raw = newEventTitle.trim().slice(0, 80)
    if (!raw) return
    setEvents(prev => [...prev, { title: raw, date: newEventDate, description: '' }])
    setNewEventTitle('')
    setNewEventDate('')
  }
  const addRoleDraft = () => {
    const raw = newRoleName.trim().slice(0, 30)
    if (!raw) return
    if (roles.some(r => r.name.toLowerCase() === raw.toLowerCase())) return
    setRoles(prev => [...prev, { name: raw, color: newRoleColor }])
    setNewRoleName('')
  }

  if (!open) return null

  /* ── Upload handler ── */
  const handleFile = async (mode: 'icon' | 'banner', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result as string)
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      if (file.type === 'image/gif' || mode === 'banner') {
        if (mode === 'icon') { setPhotoUrl(dataUrl); return }
        setBannerUrl(dataUrl)
        return
      }
      setCropMode(mode)
      setCropImage(dataUrl)
    } catch { /* ignore */ }
  }

  const handleCropDone = (dataUrl: string) => {
    if (cropMode === 'icon') setPhotoUrl(dataUrl)
    else setBannerUrl(dataUrl)
    setCropImage(null)
  }

  const handleCreate = () => {
    if (!name.trim()) { setError(true); return }
    const category = selectedThemes.length > 0 ? selectedThemes[0] : undefined
    onCreate({
      name: name.trim(),
      photoUrl: photoUrl || undefined,
      bannerUrl: bannerUrl || undefined,
      description: desc.trim() || undefined,
      category,
      themes: selectedThemes,
      frequency: frequency || undefined,
      minAge: minAge || undefined,
      toggles: settings,
      rules: rules || undefined,
      events,
      textChannels: textChannels.map(c => c.name.trim()).filter(Boolean),
      voiceChannels: voiceChannels.map(c => c.name.trim()).filter(Boolean),
      categories: folders.map(f => f.trim()).filter(Boolean),
      roles: roles.map(r => ({ name: r.name.trim(), color: r.color })).filter(r => r.name),
    })
  }

  const handleClose = () => {
    setName(''); setPhotoUrl(''); setBannerUrl(''); setDesc('')
    setSelectedThemes([]); setFrequency(''); setRules('')
    setMinAge(''); setEvents([]); setNewEventTitle(''); setNewEventDate(''); setError(false)
    setTextChannels([{ name: 'chat-geral', type: 'Texto' }, { name: 'regras', type: 'Texto' }])
    setNewTextChannel('')
    setVoiceChannels([{ name: 'Geral', type: 'Voz' }, { name: 'Música', type: 'Voz' }])
    setNewVoiceChannel('')
    setFolders(['Canais de Texto', 'Canais de Voz'])
    setNewFolder('')
    setRoles([
      { name: 'Admin', color: '#00ff88' },
      { name: 'Moderador', color: '#5865f2' },
      { name: 'Membro', color: '#99aab5' },
    ])
    setNewRoleName(''); setNewRoleColor('#00ff88')
    setSettings({ public: true, verify: true, welcome: true, logs: false })
    setActiveStep(0)
    onClose()
  }

  /* ── Render de cada etapa ── */
  const renderStep = () => {
    switch (activeStep) {
      /* ── 1. Informações básicas ── */
      case 0:
        return (
          <section className="csw-panel csw-identity-panel">
            <div className="csw-upload-grid">
              <div className="csw-upload-field">
                <label>Ícone do servidor</label>
                <div className="csw-icon-upload-wrap">
                  {photoUrl ? (
                    <div className="csw-icon-preview" onClick={() => iconInputRef.current?.click()}>
                      <img src={photoUrl} alt="" />
                    </div>
                  ) : (
                    <UploadBox onClick={() => iconInputRef.current?.click()} />
                  )}
                </div>
                <p>Recomendado: 512×512px<br />PNG, JPG ou GIF</p>
              </div>
              <div className="csw-upload-field">
                <label>Banner do servidor</label>
                {bannerUrl ? (
                  <div className="csw-banner-preview" onClick={() => bannerInputRef.current?.click()}>
                    <img src={bannerUrl} alt="" />
                  </div>
                ) : (
                  <UploadBox banner onClick={() => bannerInputRef.current?.click()} />
                )}
                <p>Recomendado: 1920×480px<br />PNG ou JPG</p>
              </div>
            </div>
            <input
              ref={iconInputRef} type="file" accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { e.target.value = ''; handleFile('icon', e) }}
            />
            <input
              ref={bannerInputRef} type="file" accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { e.target.value = ''; handleFile('banner', e) }}
            />
            <div className="csw-identity-fields">
              <label className="csw-field">
                <span>Nome do servidor <span className="csw-required">*</span></span>
                <input
                  type="text" value={name}
                  onChange={e => { setName(e.target.value); setError(false) }}
                  placeholder="Ex: Comunidade Gamer"
                  className={error ? 'error' : ''}
                  autoFocus
                />
              </label>
              <label className="csw-field">
                <span>Descrição do servidor</span>
                <textarea maxLength={120} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Conte uma breve descrição..." />
                <em>{desc.length}/120</em>
              </label>
            </div>
          </section>
        )

      /* ── 2. Temas e categorias ── */
      case 1:
        return (
          <section className="csw-panel csw-themes-panel">
            <SectionTitle
              title="Temas do servidor"
              desc={`Escolha os principais assuntos (máx. 5${themeCount ? ` · ${themeCount} selecionados` : ''})`}
            />
            <div className="csw-theme-list">
              {THEMES.map(t => (
                <button
                  key={t} type="button"
                  className={`csw-theme-chip ${selectedThemes.includes(t) ? 'selected' : ''}`}
                  onClick={() => toggleTheme(t)}
                >
                  {t}
                  {selectedThemes.includes(t) && <Check size={14} strokeWidth={2.5} />}
                </button>
              ))}
            </div>
          </section>
        )

      /* ── 3. Frequência ── */
      case 2:
        return (
          <div className="csw-split-grid">
            <section className="csw-panel csw-compact-panel">
              <SectionTitle title="Qual sua frequência?" desc="Com que frequência você pretende interagir?" />
              <select value={frequency} onChange={e => setFrequency(e.target.value)}>
                <option value="" disabled>Selecione uma opção</option>
                <option>Todos os dias</option>
                <option>Algumas vezes por semana</option>
                <option>De vez em quando</option>
              </select>
              <p className="csw-helper-text">Isso nos ajuda a sugerir ferramentas e recursos úteis!</p>
            </section>
          </div>
        )

      /* ── 4. Configurações ── */
      case 3:
        return (
          <div className="csw-split-grid">
            <section className="csw-panel csw-settings-panel">
              <SectionTitle title="Configurações principais" />
              <div className="csw-setting-list">
                <SettingRow icon="fa-user-group" title="Servidor público" desc="Qualquer pessoa pode encontrar e entrar." checked={settings.public} onChange={() => toggleSetting('public')} />
                <SettingRow icon="fa-lock" title="Verificação de membros" desc="Novos membros precisam de verificação." checked={settings.verify} onChange={() => toggleSetting('verify')} />
                <SettingRow icon="fa-bell" title="Chat de boas-vindas" desc="Mensagem automática de boas-vindas." checked={settings.welcome} onChange={() => toggleSetting('welcome')} />
                <SettingRow icon="fa-shield" title="Registro de membros" desc="Manter registro de entradas e saídas." checked={settings.logs} onChange={() => toggleSetting('logs')} />
              </div>
            </section>
          </div>
        )

      /* ── 5. Políticas ── */
      case 4:
        return (
          <div className="csw-split-grid">
            <section className="csw-panel csw-policies-panel">
              <SectionTitle title="Políticas do servidor" desc="Defina as regras da sua comunidade." />
              <label className="csw-field">
                <span>Regras do servidor</span>
                <textarea className="csw-rules-area" value={rules} onChange={e => setRules(e.target.value)} />
              </label>
              <button type="button" className="csw-add-rule" onClick={() => setRules(prev => prev + `\n${prev.split('\n').length + 1}.  `)}>
                <Plus size={14} strokeWidth={2.5} /> Adicionar regra
              </button>
            </section>
          </div>
        )

      /* ── 6. Idade mínima ── */
      case 5:
        return (
          <div className="csw-split-grid">
            <section className="csw-panel csw-compact-panel">
              <SectionTitle title="Idade mínima para entrar" desc="Defina a idade mínima para novos membros." />
              <select value={minAge} onChange={e => setMinAge(e.target.value)}>
                <option value="" disabled>Selecione a idade</option>
                <option>13+</option>
                <option>16+</option>
                <option>18+</option>
              </select>
              <p className="csw-helper-text">Recomendamos 13+ para segurança da comunidade.</p>
            </section>
          </div>
        )

      /* ── 7. Eventos ── */
      case 6:
        return (
          <section className="csw-panel csw-event-panel">
            <SectionTitle
              title="Eventos"
              desc="Dê um nome para cada evento. Eles serão salvos no servidor."
              action={
                <button type="button" className="csw-small-primary" onClick={addEvent} disabled={!newEventTitle.trim()}>
                  <Plus size={14} strokeWidth={2.5} /> Criar evento
                </button>
              }
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                type="text" value={newEventTitle}
                onChange={e => setNewEventTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addEvent() }}
                placeholder="Nome do evento — Ex: Torneio de Valorant"
                maxLength={80}
                style={{ flex: '2 1 200px', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <input
                type="datetime-local" value={newEventDate}
                onChange={e => setNewEventDate(e.target.value)}
                style={{ flex: '1 1 160px', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
            </div>
            {events.length === 0 ? (
              <div className="csw-empty-event">
                <CalendarDays size={14} strokeWidth={2} />
                <strong>Nenhum evento criado ainda.</strong>
                <span>Digite o nome acima e clique em Criar evento!</span>
              </div>
            ) : (
              events.map((ev, i) => (
                <div className="csw-event-created" key={i} style={{ gap: 8 }}>
                  <div className="csw-event-date"><span>EVT</span><strong>{String(i + 1).padStart(2, '0')}</strong></div>
                  <input
                    value={ev.title}
                    onChange={e => setEvents(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value.slice(0, 80) } : x))}
                    placeholder="Nome do evento"
                    style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  />
                  <button type="button" onClick={() => setEvents(prev => prev.filter((_, j) => j !== i))} title="Remover">
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              ))
            )}
          </section>
        )

      /* ── 8. Canais de chat ── */
      case 7:
        return (
          <section className="csw-panel csw-channels-panel">
            <SectionTitle title="Canais de texto" desc="Digite o nome que você quiser e adicione." />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text" value={newTextChannel}
                onChange={e => setNewTextChannel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTextChannel() }}
                placeholder="Nome do canal — Ex: novidades, clips, ajuda"
                maxLength={40}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <button type="button" className="csw-small-primary" onClick={addTextChannel} disabled={!newTextChannel.trim()}>
                <Plus size={14} strokeWidth={2.5} /> Adicionar
              </button>
            </div>
            <div className="csw-channel-list">
              {textChannels.map((ch, i) => (
                <div className="csw-channel-row" key={i} style={{ gap: 8 }}>
                  <Hash size={14} strokeWidth={2} />
                  <input
                    value={ch.name}
                    onChange={e => setTextChannels(prev => prev.map((c, j) => j === i ? { ...c, name: e.target.value.slice(0, 40) } : c))}
                    placeholder="nome-do-canal"
                    style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  />
                  <small>{ch.type}</small>
                  <button type="button" onClick={() => setTextChannels(prev => prev.filter((_, j) => j !== i))} title="Remover">
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
            {textChannels.length === 0 && <p className="csw-helper-text">Adicione pelo menos 1 canal de texto.</p>}
          </section>
        )

      /* ── 9. Canais de voz ── */
      case 8:
        return (
          <section className="csw-panel csw-channels-panel">
            <SectionTitle title="Canais de voz" desc="Digite o nome que você quiser e adicione." />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text" value={newVoiceChannel}
                onChange={e => setNewVoiceChannel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addVoiceChannel() }}
                placeholder="Nome do canal — Ex: Resenha, Partida 1"
                maxLength={40}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <button type="button" className="csw-small-primary" onClick={addVoiceChannel} disabled={!newVoiceChannel.trim()}>
                <Plus size={14} strokeWidth={2.5} /> Adicionar
              </button>
            </div>
            <div className="csw-channel-list">
              {voiceChannels.map((ch, i) => (
                <div className="csw-channel-row" key={i} style={{ gap: 8 }}>
                  <Mic size={14} strokeWidth={2} />
                  <input
                    value={ch.name}
                    onChange={e => setVoiceChannels(prev => prev.map((c, j) => j === i ? { ...c, name: e.target.value.slice(0, 40) } : c))}
                    placeholder="Nome do canal de voz"
                    style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  />
                  <small>{ch.type}</small>
                  <button type="button" onClick={() => setVoiceChannels(prev => prev.filter((_, j) => j !== i))} title="Remover">
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
            {voiceChannels.length === 0 && <p className="csw-helper-text">Adicione pelo menos 1 canal de voz.</p>}
          </section>
        )

      /* ── 10. Pastas ── */
      case 9:
        return (
          <section className="csw-panel csw-folders-panel">
            <SectionTitle
              title="Pastas de agrupamento"
              desc="Dê nome às pastas. Elas viram categorias dentro do servidor."
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text" value={newFolder}
                onChange={e => setNewFolder(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addFolder() }}
                placeholder="Nome da pasta — Ex: Comunidade, Jogos, Estudos"
                maxLength={40}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <button type="button" className="csw-small-primary" onClick={addFolder} disabled={!newFolder.trim()}>
                <Plus size={14} strokeWidth={2.5} /> Nova pasta
              </button>
            </div>
            <div className="csw-folder-list">
              {folders.map((f, i) => (
                <div className="csw-folder-row" key={i} style={{ gap: 8 }}>
                  <Folder size={14} strokeWidth={2} />
                  <input
                    value={f}
                    onChange={e => setFolders(prev => prev.map((x, j) => j === i ? e.target.value.slice(0, 40) : x))}
                    placeholder="Nome da pasta"
                    style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  />
                  <button type="button" onClick={() => setFolders(prev => prev.filter((_, j) => j !== i))} title="Remover">
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
            {folders.length === 0 && <p className="csw-helper-text">Nenhuma pasta — os canais ficarão soltos. Adicione se quiser organizar.</p>}
          </section>
        )

      /* ── 11. Cargos ── */
      case 10:
        return (
          <section className="csw-panel csw-compact-panel">
            <SectionTitle title="Cargos e permissões" desc="Crie os cargos com o nome e a cor que você quiser. Eles já nascem no servidor." />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                type="text" value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addRoleDraft() }}
                placeholder="Nome do cargo — Ex: Fundador, VIP"
                maxLength={30}
                style={{ flex: '1 1 160px', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <input
                type="color" value={newRoleColor}
                onChange={e => setNewRoleColor(e.target.value)}
                title="Cor do cargo"
                style={{ width: 44, height: 40, padding: 4, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
              />
              <button type="button" className="csw-small-primary" onClick={addRoleDraft} disabled={!newRoleName.trim()}>
                <Plus size={14} strokeWidth={2.5} /> Adicionar cargo
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {roles.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  <input
                    type="color" value={r.color}
                    onChange={e => setRoles(prev => prev.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                    title="Cor"
                    style={{ width: 36, height: 32, padding: 2, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }}
                  />
                  <input
                    value={r.name}
                    onChange={e => setRoles(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value.slice(0, 30) } : x))}
                    placeholder="Nome do cargo"
                    style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  />
                  <button type="button" onClick={() => setRoles(prev => prev.filter((_, j) => j !== i))} title="Remover cargo">
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
            {roles.length === 0 && <p className="csw-helper-text">Sem cargos — adicione pelo menos 1 (ex: Admin).</p>}
          </section>
        )

      /* ── 12. Revisão ── */
      case 11:
        return (
          <section className="csw-panel csw-compact-panel">
            <SectionTitle title="Revisão" desc="Tudo abaixo será criado junto com o servidor." />
            <div className="csw-review-list">
              <div><span>Nome</span><strong>{name || '—'}</strong></div>
              <div><span>Descrição</span><strong>{desc || '—'}</strong></div>
              <div><span>Categoria</span><strong>{selectedThemes[0] || '—'}</strong></div>
              <div><span>Temas</span><strong>{selectedThemes.join(', ') || '—'}</strong></div>
              <div><span>Frequência</span><strong>{frequency || '—'}</strong></div>
              <div><span>Idade mínima</span><strong>{minAge || '—'}</strong></div>
              <div><span>Canais de texto ({textChannels.length})</span><strong>{textChannels.map(c => c.name).join(', ') || '—'}</strong></div>
              <div><span>Canais de voz ({voiceChannels.length})</span><strong>{voiceChannels.map(c => c.name).join(', ') || '—'}</strong></div>
              <div><span>Pastas / categorias ({folders.length})</span><strong>{folders.join(', ') || '—'}</strong></div>
              <div><span>Cargos ({roles.length})</span><strong>{roles.map(r => r.name).join(', ') || '—'}</strong></div>
              <div><span>Eventos ({events.length})</span><strong>{events.map(e => e.title).join(', ') || '—'}</strong></div>
            </div>
          </section>
        )
    }
  }

  return (
    <>
      {cropImage && (
        <ImageCropper
          image={cropImage}
          shape={cropMode === 'icon' ? 'circle' : 'rect'}
          aspectRatio={cropMode === 'icon' ? 1 : 16 / 5}
          onCrop={handleCropDone}
          onCancel={() => setCropImage(null)}
        />
      )}

      <div className="csw-overlay" onMouseDown={e => e.target === e.currentTarget && handleClose()}>
        <div className="csw-window" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          {/* ── Sidebar ── */}
          <aside className="csw-sidebar">
            <div className="csw-sidebar-top">
              <div className="csw-sidebar-title-row">
                <div>
                  <h2>Criar servidor</h2>
                  <span>{activeStep + 1} de {totalSteps}</span>
                </div>
                <button type="button" className="csw-icon-btn" onClick={handleClose} aria-label="Fechar">
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
              <div className="csw-progress-track">
                <span style={{ width: `${((activeStep + 1) / totalSteps) * 100}%` }} />
              </div>
            </div>

            <nav className="csw-sidebar-nav">
              {SIDEBAR_ITEMS.map((item, i) => (
                <button
                  key={item.title} type="button"
                  className={`csw-nav-item ${activeStep === i ? 'active' : ''}`}
                  onClick={() => setActiveStep(i)}
                >
                  <span className="csw-nav-icon"><Fa name={item.icon} size={15} /></span>
                  <span className="csw-nav-copy">
                    <strong>{item.title}</strong>
                    <small>{item.desc}</small>
                  </span>
                </button>
              ))}
            </nav>

            <div className="csw-tip-card">
              <span className="csw-tip-icon"><Lightbulb size={14} strokeWidth={2} /></span>
              <div>
                <strong>Dica</strong>
                <p>Você pode ajustar tudo depois nas configurações do servidor.</p>
              </div>
            </div>
          </aside>

          {/* ── Workspace ── */}
          <section className="csw-workspace">
            <header className="csw-workspace-header">
              <div>
                <h2>{SIDEBAR_ITEMS[activeStep].title}</h2>
                <p>{SIDEBAR_ITEMS[activeStep].desc}</p>
              </div>
              <span className="csw-header-status">
                <span className="csw-status-dot" /> Rascunho salvo
              </span>
            </header>

            <div className="csw-workspace-scroll">
              {renderStep()}
            </div>

            <footer className="csw-workspace-footer">
              <span>Você pode editar tudo depois nas configurações do servidor.</span>
              <div className="csw-footer-actions">
                {activeStep > 0 && (
                  <button type="button" className="csw-back-btn" onClick={() => setActiveStep(s => s - 1)}>
                    <ArrowLeft size={14} strokeWidth={2.5} /> Voltar
                  </button>
                )}
                {activeStep < totalSteps - 1 ? (
                  <button
                    type="button"
                    className="csw-create-btn"
                    onClick={() => setActiveStep(s => s + 1)}
                    disabled={activeStep === 0 && !name.trim()}
                  >
                    Próximo <ArrowRight size={14} strokeWidth={2.5} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="csw-create-btn csw-ready-btn"
                    onClick={handleCreate}
                    disabled={!name.trim()}
                  >
                    <Check size={14} strokeWidth={2.5} /> Pronto
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>
      </div>
    </>
  )
}