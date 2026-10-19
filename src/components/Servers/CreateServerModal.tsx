import { Fa } from '../../utils/fa'
import { useState, useRef, useMemo, useEffect } from 'react'
import { Plus, Check, CalendarDays, Trash2, X, Hash, Mic, Folder, ArrowLeft, ArrowRight, Lightbulb, Sparkles } from 'lucide-react'
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
  peakTime?: string
  language?: string
  accent?: string
  minAge?: string
  requireAgeCheck?: boolean
  toggles?: {
    public: boolean
    verify: boolean
    welcome: boolean
    logs: boolean
    approval: boolean
    invites: boolean
    slowmode: boolean
  }
  moderation?: string
  automod?: { spam: boolean; links: boolean; caps: boolean }
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

const STEPS = [
  { title: 'Informações básicas', desc: 'Nome, ícone, banner e descrição', icon: 'circle-info', group: 'Identidade' },
  { title: 'Temas e categorias', desc: 'Assuntos principais do servidor', icon: 'palette', group: 'Identidade' },
  { title: 'Frequência', desc: 'Ritmo e horários da comunidade', icon: 'clock', group: 'Identidade' },
  { title: 'Configurações', desc: 'Entrada, convites e recursos', icon: 'sliders', group: 'Comunidade' },
  { title: 'Políticas do servidor', desc: 'Regras, moderação e automod', icon: 'scale-balanced', group: 'Comunidade' },
  { title: 'Idade mínima', desc: 'Faixa de idade e verificação', icon: 'user-group', group: 'Comunidade' },
  { title: 'Eventos', desc: 'Programação inicial', icon: 'calendar-days', group: 'Comunidade' },
  { title: 'Canais de chat', desc: 'Canais de texto do servidor', icon: 'hashtag', group: 'Estrutura' },
  { title: 'Canais de voz', desc: 'Salas de voz do servidor', icon: 'microphone', group: 'Estrutura' },
  { title: 'Pastas e organização', desc: 'Categorias dos canais', icon: 'folder', group: 'Estrutura' },
  { title: 'Cargos e permissões', desc: 'Funções, cores e permissões', icon: 'user-shield', group: 'Estrutura' },
  { title: 'Revisão', desc: 'Confira tudo e crie', icon: 'clipboard-list', group: 'Finalizar' },
]

const GROUPS = ['Identidade', 'Comunidade', 'Estrutura', 'Finalizar']

const THEMES = [
  'Games', 'Animes', 'Tecnologia', 'Música', 'Filmes e Séries',
  'Esportes', 'Estudos', 'Arte', 'Programação', 'Política', 'Humor', 'Outros',
]

const ACCENT_PRESETS = ['#29A3FF', '#5865F2', '#23A55A', '#F0B232', '#ED4245', '#EB459E', '#9B59B6', '#1ABC9C']

const TEXT_SUGGESTIONS = ['novidades', 'memes', 'ajuda', 'clips']
const VOICE_SUGGESTIONS = ['Resenha', 'Partida 1', 'Música']

type Channel = { name: string; type: 'Texto' | 'Voz' }

function ToggleSwitch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" className={`csw-toggle ${on ? 'is-on' : ''}`} onClick={onToggle} aria-pressed={on} aria-label={label}>
      <span className="csw-toggle-knob" />
    </button>
  )
}

function SettingRow({ icon, title, desc, on, onToggle }: {
  icon: string; title: string; desc: string; on: boolean; onToggle: () => void
}) {
  return (
    <div className="csx-setting-row">
      <Fa name={icon} size={14} />
      <div className="csx-setting-copy">
        <strong>{title}</strong>
        <small>{desc}</small>
      </div>
      <ToggleSwitch on={on} onToggle={onToggle} label={title} />
    </div>
  )
}

function CardHead({ eyebrow, title, desc, action }: {
  eyebrow?: string; title: string; desc?: string; action?: React.ReactNode
}) {
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

export function CreateServerModal({ open, onClose, onCreate }: CreateServerModalProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [accent, setAccent] = useState('#29A3FF')
  const [language, setLanguage] = useState('Português (Brasil)')
  const [cropImage, setCropImage] = useState<string | null>(null)
  const [cropMode, setCropMode] = useState<'icon' | 'banner'>('icon')
  const [selectedThemes, setSelectedThemes] = useState<string[]>(['Games', 'Tecnologia'])
  const [customTheme, setCustomTheme] = useState('')
  const [frequency, setFrequency] = useState('')
  const [peakTime, setPeakTime] = useState('')
  const [settings, setSettings] = useState({ public: true, verify: true, welcome: true, logs: false, approval: false, invites: true, slowmode: false })
  const [moderation, setModeration] = useState('Médio')
  const [automod, setAutomod] = useState({ spam: true, links: true, caps: false })
  const [rules, setRules] = useState('1.  Respeite todos os membros\n2.  Proibido spam e flood\n3.  Sem discurso de ódio ou preconceito\n4.  Conteúdo NSFW não é permitido')
  const [minAge, setMinAge] = useState('')
  const [requireAgeCheck, setRequireAgeCheck] = useState(true)
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
    { name: 'Admin', color: '#29A3FF' },
    { name: 'Moderador', color: '#5865f2' },
    { name: 'Membro', color: '#99aab5' },
  ])
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleColor, setNewRoleColor] = useState('#29A3FF')
  const [error, setError] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const totalSteps = STEPS.length
  const step = STEPS[activeStep]
  const themeList = useMemo(() => {
    const extra = selectedThemes.filter(t => !THEMES.includes(t))
    return [...THEMES, ...extra]
  }, [selectedThemes])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const toggleSetting = (key: keyof typeof settings) => setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleAutomod = (key: keyof typeof automod) => setAutomod(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleTheme = (label: string) => {
    setSelectedThemes(prev =>
      prev.includes(label) ? prev.filter(t => t !== label) : prev.length < 5 ? [...prev, label] : prev
    )
  }
  const addCustomTheme = () => {
    const raw = customTheme.trim().slice(0, 24)
    if (!raw) return
    const exists = themeList.some(t => t.toLowerCase() === raw.toLowerCase())
    if (!exists) setSelectedThemes(prev => prev.includes(raw) ? prev : prev.length < 5 ? [...prev, raw] : prev)
    setCustomTheme('')
  }

  const slugify = (v: string) =>
    v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'canal'

  const addTextChannel = (rawName?: string) => {
    const raw = String(rawName ?? newTextChannel).trim().slice(0, 40)
    if (!raw) return
    setTextChannels(prev => prev.some(c => c.name === slugify(raw)) ? prev : [...prev, { name: slugify(raw), type: 'Texto' }])
    setNewTextChannel('')
  }
  const addVoiceChannel = (rawName?: string) => {
    const raw = String(rawName ?? newVoiceChannel).trim().slice(0, 40)
    if (!raw) return
    setVoiceChannels(prev => prev.some(c => c.name.toLowerCase() === raw.toLowerCase()) ? prev : [...prev, { name: raw, type: 'Voz' }])
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

  const handleFile = async (mode: 'icon' | 'banner', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
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
    if (!name.trim()) { setError(true); setActiveStep(0); return }
    const category = selectedThemes.length > 0 ? selectedThemes[0] : undefined
    onCreate({
      name: name.trim(),
      photoUrl: photoUrl || undefined,
      bannerUrl: bannerUrl || undefined,
      description: desc.trim() || undefined,
      category,
      themes: selectedThemes,
      frequency: frequency || undefined,
      peakTime: peakTime || undefined,
      language,
      accent,
      minAge: minAge || undefined,
      requireAgeCheck,
      toggles: settings,
      moderation,
      automod,
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
    setAccent('#29A3FF'); setLanguage('Português (Brasil)')
    setSelectedThemes([]); setCustomTheme(''); setFrequency(''); setPeakTime(''); setRules('')
    setModeration('Médio'); setAutomod({ spam: true, links: true, caps: false })
    setMinAge(''); setRequireAgeCheck(true)
    setEvents([]); setNewEventTitle(''); setNewEventDate(''); setError(false)
    setTextChannels([{ name: 'chat-geral', type: 'Texto' }, { name: 'regras', type: 'Texto' }])
    setNewTextChannel('')
    setVoiceChannels([{ name: 'Geral', type: 'Voz' }, { name: 'Música', type: 'Voz' }])
    setNewVoiceChannel('')
    setFolders(['Canais de Texto', 'Canais de Voz'])
    setNewFolder('')
    setRoles([
      { name: 'Admin', color: '#29A3FF' },
      { name: 'Moderador', color: '#5865f2' },
      { name: 'Membro', color: '#99aab5' },
    ])
    setNewRoleName(''); setNewRoleColor('#29A3FF')
    setSettings({ public: true, verify: true, welcome: true, logs: false, approval: false, invites: true, slowmode: false })
    setActiveStep(0)
    setCropImage(null)
    onClose()
  }

  if (!open) return null

  const canCreate = name.trim().length > 0

  const renderStep = () => {
    switch (activeStep) {
      case 0:
        return (
          <>
            <section className="ssw-card csx-identity-card">
              <div
                className="ssw-banner csx-banner"
                style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: `linear-gradient(135deg, ${accent}33, transparent 65%), var(--bg-tertiary)` }}
              >
                <span className="ssw-banner-hint">{bannerUrl ? '' : 'Banner do servidor'}</span>
                <button type="button" className="ssw-upload-pill" onClick={() => bannerInputRef.current?.click()}>
                  <Fa name="image" size={12} /> {bannerUrl ? 'Trocar banner' : 'Enviar banner'}
                </button>
              </div>
              <div className="ssw-identity-row">
                <div className="ssw-icon-wrap">
                  {photoUrl ? (
                    <img src={photoUrl} alt="" className="ssw-icon-img" onClick={() => iconInputRef.current?.click()} />
                  ) : (
                    <div className="ssw-icon-fallback" style={{ background: accent }}>{name.trim().charAt(0).toUpperCase() || 'S'}</div>
                  )}
                  <button type="button" className="ssw-icon-camera" onClick={() => iconInputRef.current?.click()} title="Enviar ícone">
                    <Fa name="camera" size={12} />
                  </button>
                </div>
                <div className="ssw-identity-fields">
                  <label className="ssw-field">
                    <span>Nome do servidor <span className="csx-required">*</span></span>
                    <input
                      type="text" value={name} autoFocus
                      onChange={e => { setName(e.target.value); setError(false) }}
                      placeholder="Ex: Comunidade Gamer"
                      style={error && !name.trim() ? { borderColor: 'var(--danger)' } : undefined}
                    />
                  </label>
                </div>
              </div>
              <div className="csx-desc-wrap">
                <label className="ssw-field">
                  <span>Descrição do servidor</span>
                  <textarea maxLength={120} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Conte em uma linha o que acontece por aqui..." />
                  <em className="csx-count">{desc.length}/120</em>
                </label>
              </div>
              <input ref={iconInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { void handleFile('icon', e) }} />
              <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { void handleFile('banner', e) }} />
            </section>

            <section className="ssw-card">
              <CardHead eyebrow="IDENTIDADE VISUAL" title="Cor de destaque" desc="Aparece no ícone padrão, nos destaques e nos convites do servidor." />
              <div className="csx-swatch-row">
                {ACCENT_PRESETS.map(c => (
                  <button
                    key={c} type="button" title={c}
                    className={`csx-swatch ${accent.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
                    style={{ background: c }}
                    onClick={() => setAccent(c)}
                  />
                ))}
                <label className="csx-swatch csx-swatch-custom" title="Cor personalizada">
                  <input type="color" value={accent} onChange={e => setAccent(e.target.value)} />
                </label>
              </div>
            </section>

            <section className="ssw-card">
              <CardHead eyebrow="PÚBLICO" title="Idioma principal" desc="Idioma usado nos textos padrão de canais, cargos e boas-vindas." />
              <label className="ssw-field">
                <span>Idioma</span>
                <select value={language} onChange={e => setLanguage(e.target.value)}>
                  <option>Português (Brasil)</option>
                  <option>English (US)</option>
                  <option>Español</option>
                </select>
              </label>
            </section>
          </>
        )

      case 1:
        return (
          <>
            <section className="ssw-card">
              <CardHead
                eyebrow="ASSUNTOS"
                title="Temas do servidor"
                desc={`Escolha de 1 a 5 temas principais${selectedThemes.length ? ` · ${selectedThemes.length} selecionados` : ''}`}
              />
              <div className="csx-chip-row">
                {themeList.map(t => (
                  <button
                    key={t} type="button"
                    className={`csx-chip ${selectedThemes.includes(t) ? 'on' : ''}`}
                    onClick={() => toggleTheme(t)}
                  >
                    {t}
                    {selectedThemes.includes(t) && <Check size={13} strokeWidth={2.5} />}
                  </button>
                ))}
              </div>
            </section>
            <section className="ssw-card">
              <CardHead eyebrow="PERSONALIZADO" title="Tema próprio" desc="Não achou o seu? Crie um tema personalizado." />
              <div className="csx-toolbar">
                <input
                  type="text" value={customTheme}
                  onChange={e => setCustomTheme(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomTheme() }}
                  placeholder="Ex: Speedrun, Bordado, Airsoft"
                  maxLength={24}
                />
                <button type="button" className="csx-btn csx-btn-ghost" onClick={addCustomTheme} disabled={!customTheme.trim() || selectedThemes.length >= 5}>
                  <Plus size={14} strokeWidth={2.5} /> Adicionar
                </button>
              </div>
            </section>
          </>
        )

      case 2:
        return (
          <>
            <section className="ssw-card">
              <CardHead eyebrow="RITMO" title="Qual sua frequência?" desc="Com que frequência você pretende movimentar o servidor?" />
              <label className="ssw-field">
                <span>Frequência</span>
                <select value={frequency} onChange={e => setFrequency(e.target.value)}>
                  <option value="" disabled>Selecione uma opção</option>
                  <option>Todos os dias</option>
                  <option>Algumas vezes por semana</option>
                  <option>De vez em quando</option>
                </select>
              </label>
              <label className="ssw-field csx-mt">
                <span>Horário de pico</span>
                <select value={peakTime} onChange={e => setPeakTime(e.target.value)}>
                  <option value="" disabled>Quando tem mais gente?</option>
                  <option>Manhã</option>
                  <option>Tarde</option>
                  <option>Noite</option>
                  <option>Madrugada</option>
                  <option>Varia muito</option>
                </select>
              </label>
              <p className="csx-hint">Isso ajuda a sugerir horários de eventos e canais de voz ativos.</p>
            </section>
          </>
        )

      case 3:
        return (
          <section className="ssw-card">
            <CardHead eyebrow="ENTRADA E RECURSOS" title="Configurações principais" desc="Ligue e desligue os recursos que quer desde o dia 1." />
            <div className="csx-setting-list">
              <SettingRow icon="user-group" title="Servidor público" desc="Qualquer pessoa pode encontrar e entrar pelo Descubra." on={settings.public} onToggle={() => toggleSetting('public')} />
              <SettingRow icon="badge-check" title="Verificação de membros" desc="Novos membros passam por uma verificação antes de falar." on={settings.verify} onToggle={() => toggleSetting('verify')} />
              <SettingRow icon="door-open" title="Aprovar entrada" desc="Você aprova manualmente cada pedido de entrada." on={settings.approval} onToggle={() => toggleSetting('approval')} />
              <SettingRow icon="qrcode" title="Membros podem convidar" desc="Qualquer membro pode gerar convites do servidor." on={settings.invites} onToggle={() => toggleSetting('invites')} />
              <SettingRow icon="bell" title="Chat de boas-vindas" desc="Mensagem automática quando alguém entra." on={settings.welcome} onToggle={() => toggleSetting('welcome')} />
              <SettingRow icon="clock" title="Modo lento (5s)" desc="Limita a frequência de mensagens em canais de texto." on={settings.slowmode} onToggle={() => toggleSetting('slowmode')} />
              <SettingRow icon="shield" title="Registro de membros" desc="Mantém histórico de entradas e saídas." on={settings.logs} onToggle={() => toggleSetting('logs')} />
            </div>
          </section>
        )

      case 4:
        return (
          <>
            <section className="ssw-card">
              <CardHead eyebrow="MODERAÇÃO" title="Nível de moderação" desc="O quanto o sistema segura o tranco por você." />
              <label className="ssw-field">
                <span>Moderação</span>
                <select value={moderation} onChange={e => setModeration(e.target.value)}>
                  <option>Leve</option>
                  <option>Médio</option>
                  <option>Estrito</option>
                </select>
              </label>
              <div className="csx-setting-list csx-mt">
                <SettingRow icon="bolt" title="Anti-spam" desc="Bloqueia flood e mensagens repetidas." on={automod.spam} onToggle={() => toggleAutomod('spam')} />
                <SettingRow icon="link" title="Bloquear links suspeitos" desc="Links fora da lista de confiança são retidos." on={automod.links} onToggle={() => toggleAutomod('links')} />
                <SettingRow icon="keyboard" title="Anti-CAPS" desc="Acalma mensagens escritas SÓ GRITANDO." on={automod.caps} onToggle={() => toggleAutomod('caps')} />
              </div>
            </section>
            <section className="ssw-card">
              <CardHead
                eyebrow="REGRAS"
                title="Políticas do servidor"
                desc="Essas regras vão fixadas no canal de regras."
                action={
                  <button type="button" className="csx-btn csx-btn-ghost" onClick={() => setRules(prev => prev + `\n${prev.split('\n').length + 1}.  `)}>
                    <Plus size={14} strokeWidth={2.5} /> Nova regra
                  </button>
                }
              />
              <label className="ssw-field">
                <textarea className="csx-rules" value={rules} onChange={e => setRules(e.target.value)} />
              </label>
            </section>
          </>
        )

      case 5:
        return (
          <section className="ssw-card">
            <CardHead eyebrow="SEGURANÇA" title="Idade mínima para entrar" desc="Defina a faixa de idade da comunidade." />
            <label className="ssw-field">
              <span>Idade mínima</span>
              <select value={minAge} onChange={e => setMinAge(e.target.value)}>
                <option value="" disabled>Selecione a idade</option>
                <option>13+</option>
                <option>16+</option>
                <option>18+</option>
              </select>
            </label>
            <div className="csx-setting-list csx-mt">
              <SettingRow icon="badge-check" title="Exigir confirmação na entrada" desc="Novo membro confirma a idade ao entrar no servidor." on={requireAgeCheck} onToggle={() => setRequireAgeCheck(v => !v)} />
            </div>
            <p className="csx-hint">Recomendamos 13+ para segurança da comunidade.</p>
          </section>
        )

      case 6:
        return (
          <section className="ssw-card">
            <CardHead
              eyebrow="AGENDA"
              title="Eventos iniciais"
              desc="Programe já o primeiro evento — ele aparecerá no calendário do servidor."
              action={
                <button type="button" className="csx-btn csx-btn-ghost" onClick={addEvent} disabled={!newEventTitle.trim()}>
                  <Plus size={14} strokeWidth={2.5} /> Criar evento
                </button>
              }
            />
            <div className="csx-toolbar">
              <input
                type="text" value={newEventTitle}
                onChange={e => setNewEventTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addEvent() }}
                placeholder="Nome do evento — Ex: Torneio de Valorant"
                maxLength={80}
              />
              <input
                type="datetime-local" value={newEventDate}
                onChange={e => setNewEventDate(e.target.value)}
                className="csx-date-input"
              />
            </div>
            {events.length === 0 ? (
              <div className="csx-empty">
                <CalendarDays size={15} strokeWidth={2} />
                <strong>Nenhum evento criado ainda.</strong>
                <span>Digite o nome acima e clique em Criar evento.</span>
              </div>
            ) : (
              <div className="csx-list">
                {events.map((ev, i) => (
                  <div className="csx-row" key={i}>
                    <span className="csx-row-badge">{String(i + 1).padStart(2, '0')}</span>
                    <input
                      type="text" value={ev.title}
                      onChange={e => setEvents(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value.slice(0, 80) } : x))}
                      placeholder="Nome do evento"
                    />
                    <button type="button" className="csx-icon-action" onClick={() => setEvents(prev => prev.filter((_, j) => j !== i))} title="Remover">
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )

      case 7:
        return (
          <section className="ssw-card">
            <CardHead eyebrow="TEXTO" title="Canais de chat" desc="Adicione os canais de texto — os nomes viram #canais." />
            <div className="csx-toolbar">
              <input
                type="text" value={newTextChannel}
                onChange={e => setNewTextChannel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTextChannel() }}
                placeholder="Nome do canal — Ex: novidades, clips, ajuda"
                maxLength={40}
              />
              <button type="button" className="csx-btn csx-btn-ghost" onClick={() => addTextChannel()} disabled={!newTextChannel.trim()}>
                <Plus size={14} strokeWidth={2.5} /> Adicionar
              </button>
            </div>
            <div className="csx-chip-row csx-suggest-row">
              {TEXT_SUGGESTIONS.filter(s => !textChannels.some(c => c.name === s)).map(s => (
                <button key={s} type="button" className="csx-chip" onClick={() => addTextChannel(s)}>
                  <Hash size={12} strokeWidth={2} /> {s}
                </button>
              ))}
            </div>
            <div className="csx-list">
              {textChannels.map((ch, i) => (
                <div className="csx-row" key={i}>
                  <Hash size={14} strokeWidth={2} className="csx-row-icon" />
                  <input
                    type="text" value={ch.name}
                    onChange={e => setTextChannels(prev => prev.map((c, j) => j === i ? { ...c, name: e.target.value.slice(0, 40) } : c))}
                    placeholder="nome-do-canal"
                  />
                  <small className="csx-row-tag">{ch.type}</small>
                  <button type="button" className="csx-icon-action" onClick={() => setTextChannels(prev => prev.filter((_, j) => j !== i))} title="Remover">
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
            {textChannels.length === 0 && <p className="csx-hint">Adicione pelo menos 1 canal de texto.</p>}
          </section>
        )

      case 8:
        return (
          <section className="ssw-card">
            <CardHead eyebrow="VOZ" title="Canais de voz" desc="Salas para call — resenha, jogos, música." />
            <div className="csx-toolbar">
              <input
                type="text" value={newVoiceChannel}
                onChange={e => setNewVoiceChannel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addVoiceChannel() }}
                placeholder="Nome do canal — Ex: Resenha, Partida 1"
                maxLength={40}
              />
              <button type="button" className="csx-btn csx-btn-ghost" onClick={() => addVoiceChannel()} disabled={!newVoiceChannel.trim()}>
                <Plus size={14} strokeWidth={2.5} /> Adicionar
              </button>
            </div>
            <div className="csx-chip-row csx-suggest-row">
              {VOICE_SUGGESTIONS.filter(s => !voiceChannels.some(c => c.name.toLowerCase() === s.toLowerCase())).map(s => (
                <button key={s} type="button" className="csx-chip" onClick={() => addVoiceChannel(s)}>
                  <Mic size={12} strokeWidth={2} /> {s}
                </button>
              ))}
            </div>
            <div className="csx-list">
              {voiceChannels.map((ch, i) => (
                <div className="csx-row" key={i}>
                  <Mic size={14} strokeWidth={2} className="csx-row-icon" />
                  <input
                    type="text" value={ch.name}
                    onChange={e => setVoiceChannels(prev => prev.map((c, j) => j === i ? { ...c, name: e.target.value.slice(0, 40) } : c))}
                    placeholder="Nome do canal de voz"
                  />
                  <small className="csx-row-tag">{ch.type}</small>
                  <button type="button" className="csx-icon-action" onClick={() => setVoiceChannels(prev => prev.filter((_, j) => j !== i))} title="Remover">
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
            {voiceChannels.length === 0 && <p className="csx-hint">Adicione pelo menos 1 canal de voz.</p>}
          </section>
        )

      case 9:
        return (
          <section className="ssw-card">
            <CardHead eyebrow="ORGANIZAÇÃO" title="Pastas de agrupamento" desc="Pastas viram categorias na barra lateral de canais." />
            <div className="csx-toolbar">
              <input
                type="text" value={newFolder}
                onChange={e => setNewFolder(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addFolder() }}
                placeholder="Nome da pasta — Ex: Comunidade, Jogos, Estudos"
                maxLength={40}
              />
              <button type="button" className="csx-btn csx-btn-ghost" onClick={addFolder} disabled={!newFolder.trim()}>
                <Plus size={14} strokeWidth={2.5} /> Nova pasta
              </button>
            </div>
            <div className="csx-list">
              {folders.map((f, i) => (
                <div className="csx-row" key={i}>
                  <Folder size={14} strokeWidth={2} className="csx-row-icon" />
                  <input
                    type="text" value={f}
                    onChange={e => setFolders(prev => prev.map((x, j) => j === i ? e.target.value.slice(0, 40) : x))}
                    placeholder="Nome da pasta"
                  />
                  <button type="button" className="csx-icon-action" onClick={() => setFolders(prev => prev.filter((_, j) => j !== i))} title="Remover">
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
            {folders.length === 0 && <p className="csx-hint">Nenhuma pasta — os canais ficarão soltos. Adicione se quiser organizar.</p>}
          </section>
        )

      case 10:
        return (
          <section className="ssw-card">
            <CardHead eyebrow="PERMISSÕES" title="Cargos e permissões" desc="Cargos já nascem prontos no servidor. Cargo Admin recebe todas as permissões." />
            <div className="csx-toolbar">
              <input
                type="text" value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addRoleDraft() }}
                placeholder="Nome do cargo — Ex: Fundador, VIP"
                maxLength={30}
              />
              <input
                type="color" value={newRoleColor}
                onChange={e => setNewRoleColor(e.target.value)}
                title="Cor do cargo"
                className="csx-color-input"
              />
              <button type="button" className="csx-btn csx-btn-ghost" onClick={addRoleDraft} disabled={!newRoleName.trim()}>
                <Plus size={14} strokeWidth={2.5} /> Adicionar cargo
              </button>
            </div>
            <div className="csx-list">
              {roles.map((r, i) => (
                <div className="csx-row" key={i}>
                  <input
                    type="color" value={r.color}
                    onChange={e => setRoles(prev => prev.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                    title="Cor"
                    className="csx-color-input"
                  />
                  <input
                    type="text" value={r.name}
                    onChange={e => setRoles(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value.slice(0, 30) } : x))}
                    placeholder="Nome do cargo"
                  />
                  <button type="button" className="csx-icon-action" onClick={() => setRoles(prev => prev.filter((_, j) => j !== i))} title="Remover cargo">
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
            {roles.length === 0 && <p className="csx-hint">Sem cargos — adicione pelo menos 1 (ex: Admin).</p>}
          </section>
        )

      case 11:
        return (
          <section className="ssw-card">
            <CardHead eyebrow="ÚLTIMA ETAPA" title="Revisão" desc="Tudo abaixo será criado junto com o servidor." />
            <div className="csx-review">
              <div><span>Nome</span><strong>{name || '—'}</strong></div>
              <div><span>Descrição</span><strong>{desc || '—'}</strong></div>
              <div><span>Cor de destaque</span><strong><span className="csx-color-dot" style={{ background: accent }} /> {accent}</strong></div>
              <div><span>Idioma</span><strong>{language}</strong></div>
              <div><span>Temas</span><strong>{selectedThemes.join(', ') || '—'}</strong></div>
              <div><span>Frequência</span><strong>{frequency || '—'}{peakTime ? ` · pico: ${peakTime}` : ''}</strong></div>
              <div><span>Moderação</span><strong>{moderation} · {[automod.spam && 'anti-spam', automod.links && 'links', automod.caps && 'anti-caps'].filter(Boolean).join(', ') || 'sem automod'}</strong></div>
              <div><span>Idade mínima</span><strong>{minAge || '—'}{requireAgeCheck ? ' · confirmação na entrada' : ''}</strong></div>
              <div><span>Recursos ativos</span><strong>{[settings.public && 'público', settings.verify && 'verificação', settings.approval && 'aprovação', settings.invites && 'convites livres', settings.welcome && 'boas-vindas', settings.slowmode && 'modo lento', settings.logs && 'registro'].filter(Boolean).join(', ') || '—'}</strong></div>
              <div><span>Canais de texto ({textChannels.length})</span><strong>{textChannels.map(c => c.name).join(', ') || '—'}</strong></div>
              <div><span>Canais de voz ({voiceChannels.length})</span><strong>{voiceChannels.map(c => c.name).join(', ') || '—'}</strong></div>
              <div><span>Pastas ({folders.length})</span><strong>{folders.join(', ') || '—'}</strong></div>
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

      <div className="ssw-overlay csx-overlay" onMouseDown={e => e.target === e.currentTarget && handleClose()}>
        <div className="ssw-window csx-window" onMouseDown={e => e.stopPropagation()}>
          <aside className="ssw-sidebar">
            <div className="csx-sidebar-head">
              <div className="ssw-server-head csx-server-head">
                <div className="csx-avatar" style={{ borderColor: accent, background: `${accent}22` }}>
                  {photoUrl ? <img src={photoUrl} alt="" /> : (name.trim().charAt(0).toUpperCase() || 'S')}
                </div>
                <div className="ssw-server-identity">
                  <strong>{name.trim() || 'Novo servidor'}</strong>
                  <span>Etapa {activeStep + 1} de {totalSteps} · rascunho</span>
                </div>
                <button type="button" className="csx-close" onClick={handleClose} aria-label="Fechar">
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
              <div className="csx-progress">
                <span style={{ width: `${((activeStep + 1) / totalSteps) * 100}%` }} />
              </div>
            </div>

            <nav className="ssw-sidebar-nav">
              {GROUPS.map(group => (
                <div className="ssw-nav-group" key={group}>
                  <p className="ssw-nav-group-label">{group.toUpperCase()}</p>
                  {STEPS.map((s, i) => s.group !== group ? null : (
                    <button
                      key={s.title} type="button"
                      className={`ssw-nav-item ${activeStep === i ? 'active' : ''}`}
                      onClick={() => setActiveStep(i)}
                    >
                      <Fa name={s.icon} size={13} />
                      {s.title}
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            <div className="ssw-sidebar-bottom">
              <div className="ssw-tip-card">
                <Lightbulb size={14} strokeWidth={2} />
                <div>
                  <strong>Dica</strong>
                  <p>Você pode ajustar tudo depois nas configurações do servidor.</p>
                </div>
              </div>
            </div>
          </aside>

          <section className="ssw-workspace">
            <header className="ssw-workspace-header">
              <div>
                <p className="ssw-kicker">CRIAR SERVIDOR</p>
                <h2>{step.title}</h2>
              </div>
              <div className="ssw-header-actions">
                <span className="ssw-status-badge">
                  <span className="ssw-status-dot" />
                  {step.desc}
                </span>
              </div>
            </header>

            <div className="ssw-workspace-scroll">
              <div className="ssw-stack">
                {renderStep()}
              </div>
            </div>

            <footer className="csx-footer">
              <span className="csx-footer-hint">
                {activeStep === totalSteps - 1
                  ? 'Ao criar, o servidor nasce com canais, pastas e cargos prontos.'
                  : 'Você pode editar tudo depois nas configurações do servidor.'}
              </span>
              <div className="csx-footer-actions">
                {activeStep > 0 && (
                  <button type="button" className="csx-btn csx-btn-ghost" onClick={() => setActiveStep(s => s - 1)}>
                    <ArrowLeft size={14} strokeWidth={2.5} /> Voltar
                  </button>
                )}
                {activeStep < totalSteps - 1 && (
                  <button
                    type="button" className="csx-btn csx-btn-ghost"
                    onClick={() => setActiveStep(s => s + 1)}
                    disabled={activeStep === 0 && !name.trim()}
                  >
                    Próximo <ArrowRight size={14} strokeWidth={2.5} />
                  </button>
                )}
                <button
                  type="button"
                  className={`csx-btn csx-btn-primary ${activeStep === totalSteps - 1 ? 'csx-ready' : ''}`}
                  onClick={handleCreate}
                  disabled={!canCreate}
                  title={canCreate ? 'Criar servidor' : 'Dê um nome ao servidor primeiro'}
                >
                  {activeStep === totalSteps - 1 ? <Sparkles size={14} strokeWidth={2.2} /> : <Check size={14} strokeWidth={2.5} />}
                  Criar servidor
                </button>
              </div>
            </footer>
          </section>
        </div>
      </div>
    </>
  )
}
