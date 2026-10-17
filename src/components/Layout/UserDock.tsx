import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, Copy, Headphones, HelpCircle, Languages, LogOut, Mic, Monitor, Palette, Pen, Rocket, ShieldHalf, Sparkles, UserPlus, Volume2 } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { IconMic, IconMute, IconHeadphone, IconDeafen, IconSettings } from '../../utils/icons'
import { useUserStore } from '../../stores/userStore'
import { useCallStore } from '../../stores/callStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getAudioInputDevices, getAudioOutputDevices, supportsSinkId, inputVolumePref, setInputVolume } from '../../services/antiloud'
import { loadKnownAccounts } from '../../services/knownAccounts'
import { canOpenAdminPanel } from '../../services/admin'
import { AdminPanel } from '../Admin/AdminPanel'
import { toImageUrl } from '../../services/driveService'
import './UserDock.css'

type StatusId = 'online' | 'away' | 'dnd' | 'invisible'
type MenuKind = 'profile' | 'mic' | 'output' | 'gear'
type SubKind = 'status' | 'badges' | 'accounts' | 'micDevice' | 'inputProfile' | 'outDevice'

interface MenuState { kind: MenuKind; left: number; bottom: number; width: number }
interface SubState { kind: SubKind; left: number; bottom: number }

const STATUS: Record<StatusId, { label: string; description: string; color: string }> = {
  online: { label: 'Disponível', description: 'Online e pronto para conversar', color: '#22c55e' },
  away: { label: 'Ausente', description: 'Longe do teclado', color: '#f0b232' },
  dnd: { label: 'Não perturbar', description: 'Silencia notificações e avisos', color: '#f23f43' },
  invisible: { label: 'Invisível', description: 'Aparece offline para todos', color: '#80848e' },
}

const MENU_WIDTH: Record<MenuKind, number> = { profile: 340, mic: 300, output: 300, gear: 250 }
const SUB_WIDTH = 232

function toast(message: string) {
  try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: message })) } catch { }
}

function fire(name: string, detail?: unknown) {
  try { window.dispatchEvent(detail === undefined ? new Event(name) : new CustomEvent(name, { detail })) } catch { }
}

function MenuRow({ icon, label, hint, danger, check, arrow, onClick, onMouseEnter }: {
  icon?: React.ReactNode
  label: string
  hint?: string
  danger?: boolean
  check?: boolean
  arrow?: boolean
  onClick?: (el: HTMLElement) => void
  onMouseEnter?: (el: HTMLElement) => void
}) {
  return (
    <button
      type="button"
      className={`ud-row${danger ? ' ud-row-danger' : ''}`}
      onClick={onClick ? e => onClick(e.currentTarget) : undefined}
      onMouseEnter={onMouseEnter ? e => onMouseEnter(e.currentTarget) : undefined}
    >
      {icon ? <span className="ud-row-icon">{icon}</span> : null}
      <span className="ud-row-label">{label}</span>
      {hint ? <span className="ud-row-hint">{hint}</span> : null}
      {check ? <Check size={14} strokeWidth={2.5} className="ud-row-check" /> : null}
      {arrow ? <ChevronRight size={14} strokeWidth={2.5} className="ud-row-arrow" /> : null}
    </button>
  )
}

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="ud-volume">
      <input
        type="range"
        min={0}
        max={200}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span>{value}%</span>
    </div>
  )
}

interface UserDockProps {
  floating?: boolean
  aboveDiscover?: boolean
}

export function UserDock({ floating = false, aboveDiscover = false }: UserDockProps) {
  const currentUser = useUserStore(s => s.currentUser)
  const updateUser = useUserStore(s => s.updateUser)
  const muted = useCallStore(s => s.muted)
  const deafened = useCallStore(s => s.deafened)
  const settingsOpen = useSettingsStore(s => s.open)
  const openSettings = useSettingsStore(s => s.openSettings)

  const dockRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const closeTimer = useRef<number | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [sub, setSub] = useState<SubState | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [micDevices, setMicDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [outDevices, setOutDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [accounts, setAccounts] = useState<{ googleId: string; name: string; email: string; photoUrl: string }[]>([])
  const [volumeIn, setVolumeIn] = useState(() => inputVolumePref())
  const [volumeOut, setVolumeOut] = useState(() => {
    try { return Number(localStorage.getItem('friends-space:vol-out') || '80') } catch { return 80 }
  })

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (dockRef.current?.contains(t) || popupRef.current?.contains(t)) return
      setMenu(null)
      setSub(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setSub(null) } }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])

  if (!currentUser) return null
  if (settingsOpen) return null

  const settings = (currentUser.settings || {}) as Record<string, unknown>
  const status: StatusId = typeof settings.status === 'string' && settings.status in STATUS ? settings.status as StatusId : 'online'
  const statusMessage = typeof settings.statusMessage === 'string' ? settings.statusMessage : ''
  const micPref = (() => { try { return localStorage.getItem('friends-space:mic') || '' } catch { return '' } })()
  const outPref = (() => { try { return localStorage.getItem('friends-space:output') || '' } catch { return '' } })()
  const inputDefault = (() => {
    try {
      return localStorage.getItem('friends-space:echo') !== '0'
        && localStorage.getItem('friends-space:noise') !== '0'
        && localStorage.getItem('friends-space:agc') !== '0'
    } catch { return true }
  })()

  const openMenu = (kind: MenuKind, el: HTMLElement) => {
    if (menu?.kind === kind) { setMenu(null); setSub(null); return }
    const rect = el.getBoundingClientRect()
    const width = MENU_WIDTH[kind]
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    const bottom = Math.max(8, Math.min(window.innerHeight - rect.top + 8, window.innerHeight - 120))
    setMenu({ kind, left, bottom, width })
    setSub(null)
    if (kind === 'mic') void getAudioInputDevices().then(setMicDevices)
    if (kind === 'output') void getAudioOutputDevices().then(setOutDevices)
  }

  const closeAll = () => { setMenu(null); setSub(null) }

  const openSub = (kind: SubKind, el?: HTMLElement) => {
    if (!menu) return
    if (sub?.kind === kind) { setSub(null); return }
    let left = menu.left + menu.width + 4
    if (left + SUB_WIDTH > window.innerWidth - 8) left = menu.left - SUB_WIDTH - 4
    let bottom = window.innerHeight - 120
    if (el) bottom = Math.max(8, window.innerHeight - el.getBoundingClientRect().bottom)
    setSub({ kind, left: Math.max(8, left), bottom })
    if (kind === 'accounts') setAccounts(loadKnownAccounts())
  }

  const scheduleCloseSub = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setSub(null), 200)
  }
  const cancelCloseSub = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  const hoverSub = (kind: SubKind) => (el: HTMLElement) => { cancelCloseSub(); openSub(kind, el) }

  const saveStatus = (id: StatusId) => {
    const nextSettings = { ...settings, status: id }
    void updateUser({ settings: nextSettings })
    closeAll()
    toast(`Status: ${STATUS[id].label}`)
  }

  const savePref = (key: string, value: string) => {
    try { localStorage.setItem(key, value) } catch { }
  }

  const chooseMic = (deviceId: string) => {
    savePref('friends-space:mic', deviceId)
    useCallStore.getState().switchMicDevice(deviceId).catch(() => { })
    closeAll()
    toast('Microfone atualizado')
  }

  const chooseOutput = (deviceId: string) => {
    savePref('friends-space:output', deviceId)
    fire('friends-space:output-changed')
    closeAll()
    toast('Saída de áudio atualizada')
  }

  const setInputProfile = (isDefault: boolean) => {
    if (!isDefault) { closeAll(); openSettings('voz'); return }
    savePref('friends-space:echo', '1')
    savePref('friends-space:noise', '1')
    savePref('friends-space:agc', '1')
    closeAll()
    toast('Perfil de entrada: Padrão')
  }

  const changeVolumeIn = (v: number) => {
    setVolumeIn(v)
    savePref('friends-space:vol-in', String(v))
    setInputVolume(v)
  }

  const changeVolumeOut = (v: number) => {
    setVolumeOut(v)
    savePref('friends-space:vol-out', String(v))
    useCallStore.getState().setVolumeForAll(v / 100)
  }

  const copyId = () => {
    try {
      void navigator.clipboard.writeText(currentUser.id).then(() => toast('ID copiado'), () => toast(currentUser.id))
    } catch {
      toast(currentUser.id)
    }
    closeAll()
  }

  const dockClass = `ud-dock${floating ? ' ud-dock-floating' : ''}${aboveDiscover ? ' ud-dock-above' : ''}`

  const banner = currentUser.bannerUrl ? toImageUrl(currentUser.bannerUrl, 680) : ''

  return (
    <>
      <div className={dockClass} ref={dockRef}>
        <button
          type="button"
          className="ud-user"
          title="Perfil"
          onClick={e => openMenu('profile', e.currentTarget)}
          onContextMenu={e => { e.preventDefault(); openMenu('profile', e.currentTarget) }}
        >
          <span className="ud-avatar">
            <Avatar src={currentUser.photoUrl || ''} name={currentUser.name || 'U'} size={32} />
            <span className="ud-dot" style={{ background: STATUS[status].color }} />
          </span>
          <span className="ud-identity">
            <span className="ud-name">{currentUser.name || 'Usuário'}</span>
            <span className="ud-sub">{statusMessage || STATUS[status].label}</span>
          </span>
        </button>
        <div className="ud-actions">
          <button
            type="button"
            className={`ud-btn${muted ? ' ud-btn-danger' : ''}`}
            title={muted ? 'Ativar microfone' : 'Desativar microfone'}
            onClick={() => useCallStore.getState().toggleMute()}
            onContextMenu={e => { e.preventDefault(); openMenu('mic', e.currentTarget) }}
          >
            {muted ? <IconMute width={18} height={18} /> : <IconMic width={18} height={18} />}
          </button>
          <button
            type="button"
            className={`ud-btn${deafened ? ' ud-btn-danger' : ''}`}
            title={deafened ? 'Ativar som' : 'Desativar som'}
            onClick={() => useCallStore.getState().toggleDeafen()}
            onContextMenu={e => { e.preventDefault(); openMenu('output', e.currentTarget) }}
          >
            {deafened ? <IconDeafen width={18} height={18} /> : <IconHeadphone width={18} height={18} />}
          </button>
          <button
            type="button"
            className="ud-btn"
            title="Configurações"
            onClick={() => openSettings()}
            onContextMenu={e => { e.preventDefault(); openMenu('gear', e.currentTarget) }}
          >
            <IconSettings width={18} height={18} />
          </button>
        </div>
      </div>

      {menu && createPortal(
        <div ref={popupRef} className="ud-portal" style={{ left: menu.left, bottom: menu.bottom, width: menu.width }}>
          {menu.kind === 'profile' && (
            <>
              <div className="ud-profile-head">
                <div className="ud-banner" style={banner ? { backgroundImage: `url(${banner})` } : undefined} />
                <span className="ud-profile-avatar">
                  <Avatar src={currentUser.photoUrl || ''} name={currentUser.name || 'U'} size={54} />
                  <span className="ud-dot ud-dot-lg" style={{ background: STATUS[status].color }} />
                </span>
                <div className="ud-profile-names">
                  <strong>{currentUser.name || 'Usuário'}</strong>
                  <span>@{currentUser.friendCode || 'usuario'}</span>
                </div>
                {statusMessage ? <p className="ud-profile-message">{statusMessage}</p> : null}
              </div>
              <div className="ud-divider" />
              <MenuRow icon={<Pen size={14} strokeWidth={2} />} label="Editar perfil" onClick={() => { closeAll(); fire('friends-space:edit-profile') }} />
              <MenuRow icon={<span className="ud-dot" style={{ background: STATUS[status].color }} />} label="Status" hint={STATUS[status].label} arrow onMouseEnter={hoverSub('status')} onClick={() => openSub('status')} />
              <MenuRow icon={<Sparkles size={14} strokeWidth={2} />} label="Insígnias" arrow onMouseEnter={hoverSub('badges')} onClick={() => openSub('badges')} />
              <MenuRow icon={<Rocket size={14} strokeWidth={2} />} label="ASTRO" onClick={() => { closeAll(); fire('friends-space:open-astro') }} />
              <MenuRow icon={<HelpCircle size={14} strokeWidth={2} />} label="Ajuda" onClick={() => { closeAll(); fire('friends-space:open-help') }} />
              <MenuRow icon={<UserPlus size={14} strokeWidth={2} />} label="Mudar de conta" arrow onMouseEnter={hoverSub('accounts')} onClick={() => openSub('accounts')} />
              <MenuRow icon={<Copy size={14} strokeWidth={2} />} label="Copiar ID" onClick={copyId} />
              <div className="ud-divider" />
              <MenuRow icon={<LogOut size={14} strokeWidth={2} />} label="Sair" danger onClick={() => { closeAll(); fire('friends-space:sign-out') }} />
            </>
          )}

          {menu.kind === 'mic' && (
            <>
              <div className="ud-title">Microfone</div>
              <MenuRow icon={<Mic size={15} strokeWidth={2} />} label="Dispositivo de entrada" hint={micDevices.find(d => d.deviceId === micPref)?.label || 'Padrão'} arrow onMouseEnter={hoverSub('micDevice')} onClick={() => openSub('micDevice')} />
              <MenuRow icon={<SlidersIcon />} label="Perfil de entrada" hint={inputDefault ? 'Padrão' : 'Personalizado'} arrow onMouseEnter={hoverSub('inputProfile')} onClick={() => openSub('inputProfile')} />
              <div className="ud-volume-row">
                <span className="ud-volume-label">Volume de entrada</span>
                <VolumeSlider value={volumeIn} onChange={changeVolumeIn} />
              </div>
              <div className="ud-divider" />
              <MenuRow icon={<IconSettings width={14} height={14} />} label="Configurações de voz" onClick={() => { closeAll(); openSettings('voz') }} />
            </>
          )}

          {menu.kind === 'output' && (
            <>
              <div className="ud-title">Saída de áudio</div>
              <MenuRow icon={<Headphones size={15} strokeWidth={2} />} label="Dispositivo de saída" hint={outDevices.find(d => d.deviceId === outPref)?.label || 'Padrão'} arrow onMouseEnter={hoverSub('outDevice')} onClick={() => openSub('outDevice')} />
              <div className="ud-volume-row">
                <span className="ud-volume-label">Volume de saída</span>
                <VolumeSlider value={volumeOut} onChange={changeVolumeOut} />
              </div>
              <div className="ud-divider" />
              <MenuRow icon={<IconSettings width={14} height={14} />} label="Configurações de voz" onClick={() => { closeAll(); openSettings('voz') }} />
            </>
          )}

          {menu.kind === 'gear' && (
            <>
              <MenuRow icon={<Pen size={14} strokeWidth={2} />} label="Perfil" onClick={() => { closeAll(); fire('friends-space:open-profile', 'perfil') }} />
              <MenuRow icon={<ShieldHalf size={14} strokeWidth={2} />} label="Conta" onClick={() => { closeAll(); openSettings('perfil') }} />
              <MenuRow icon={<ShieldHalf size={14} strokeWidth={2} />} label="Dados e privacidade" onClick={() => { closeAll(); fire('friends-space:open-privacy') }} />
              <MenuRow icon={<Sparkles size={14} strokeWidth={2} />} label="Notificações" onClick={() => { closeAll(); openSettings('notificacoes') }} />
              <MenuRow icon={<Rocket size={14} strokeWidth={2} />} label="ASTRO" onClick={() => { closeAll(); fire('friends-space:open-astro') }} />
              <MenuRow icon={<Monitor size={14} strokeWidth={2} />} label="Voz e vídeo" onClick={() => { closeAll(); openSettings('voz') }} />
              <MenuRow icon={<Palette size={14} strokeWidth={2} />} label="Aparência" onClick={() => { closeAll(); openSettings('aparencia') }} />
              <MenuRow icon={<Languages size={14} strokeWidth={2} />} label="Idioma" onClick={() => { closeAll(); openSettings('idioma') }} />
              {canOpenAdminPanel(currentUser) && (
                <MenuRow icon={<ShieldHalf size={14} strokeWidth={2} />} label={`Painel ${currentUser.flags?.dev ? 'Dev' : currentUser.flags?.support ? 'Suporte' : 'Conta'}`} onClick={() => { closeAll(); setAdminOpen(true) }} />
              )}
              <div className="ud-divider" />
              <MenuRow icon={<LogOut size={14} strokeWidth={2} />} label="Sair" danger onClick={() => { closeAll(); fire('friends-space:sign-out') }} />
            </>
          )}
        </div>,
        document.body,
      )}

      {menu && sub && createPortal(
        <div
          className="ud-portal ud-submenu"
          style={{ left: sub.left, bottom: sub.bottom, width: SUB_WIDTH }}
          onMouseEnter={cancelCloseSub}
          onMouseLeave={scheduleCloseSub}
        >
          {sub.kind === 'status' && (
            <>
              {(Object.keys(STATUS) as StatusId[]).map(id => (
                <button key={id} type="button" className="ud-row ud-status-row" onClick={() => saveStatus(id)}>
                  <span className="ud-dot" style={{ background: STATUS[id].color }} />
                  <span className="ud-status-text">
                    <span className="ud-row-label">{STATUS[id].label}</span>
                    <span className="ud-status-desc">{STATUS[id].description}</span>
                  </span>
                  {status === id ? <Check size={14} strokeWidth={2.5} className="ud-row-check" /> : null}
                </button>
              ))}
            </>
          )}

          {sub.kind === 'badges' && (() => {
            const flags = currentUser.flags || {}
            const astro = settings.astro === true || settings.astro === 'true'
            const items: { label: string; icon: React.ReactNode }[] = []
            if (astro) items.push({ label: 'ASTRO', icon: <Rocket size={14} strokeWidth={2} /> })
            if (flags.verified) items.push({ label: 'Verificado', icon: <Check size={14} strokeWidth={2.5} /> })
            if (flags.dev) items.push({ label: 'Desenvolvedor', icon: <Sparkles size={14} strokeWidth={2} /> })
            if (flags.support) items.push({ label: 'Suporte', icon: <ShieldHalf size={14} strokeWidth={2} /> })
            return items.length === 0
              ? <div className="ud-empty">Nenhuma insígnia ainda</div>
              : <>{items.map(item => <div key={item.label} className="ud-row ud-row-static"><span className="ud-row-icon">{item.icon}</span><span className="ud-row-label">{item.label}</span></div>)}</>
          })()}

          {sub.kind === 'accounts' && (
            <>
              {accounts.length === 0 && <div className="ud-empty">Nenhuma conta salva neste dispositivo</div>}
              {accounts.map(acc => (
                <button key={acc.googleId} type="button" className="ud-row" onClick={() => { closeAll(); fire('friends-space:sign-out') }}>
                  <Avatar src={acc.photoUrl} name={acc.name} size={24} />
                  <span className="ud-account-text">
                    <span className="ud-row-label">{acc.name}</span>
                    <span className="ud-status-desc">{acc.email}</span>
                  </span>
                </button>
              ))}
              <div className="ud-divider" />
              <MenuRow icon={<UserPlus size={14} strokeWidth={2} />} label="Adicionar conta" onClick={() => { closeAll(); fire('friends-space:sign-out') }} />
            </>
          )}

          {sub.kind === 'micDevice' && (
            <>
              {[{ deviceId: '', label: 'Padrão do sistema' }, ...micDevices].map(dev => (
                <MenuRow key={dev.deviceId || 'default'} label={dev.label || 'Microfone'} check={micPref === dev.deviceId} onClick={() => chooseMic(dev.deviceId)} />
              ))}
            </>
          )}

          {sub.kind === 'inputProfile' && (
            <>
              <MenuRow label="Padrão" hint="Eco, ruído e ganho automático ligados" check={inputDefault} onClick={() => setInputProfile(true)} />
              <MenuRow label="Personalizado" hint="Ajuste manual em Configurações de voz" check={!inputDefault} onClick={() => setInputProfile(false)} />
            </>
          )}

          {sub.kind === 'outDevice' && (
            <>
              {!supportsSinkId() && <div className="ud-empty">Troca de saída não suportada neste navegador</div>}
              {[{ deviceId: '', label: 'Padrão do sistema' }, ...outDevices].map(dev => (
                <MenuRow key={dev.deviceId || 'default'} label={dev.label || 'Saída'} check={outPref === dev.deviceId} onClick={() => chooseOutput(dev.deviceId)} />
              ))}
            </>
          )}
        </div>,
        document.body,
      )}

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} initialTab="overview" />
    </>
  )
}

function SlidersIcon() {
  return <Volume2 size={15} strokeWidth={2} />
}
