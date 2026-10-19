import { Fa } from '../../utils/fa'
import { useEffect, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { useUserStore } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'
import { useSettingsStore, type SettingsTabId } from '../../stores/settingsStore'
import { useNotificationStore, NOTIF_DEFAULT_OFF_SETTINGS } from '../../stores/notificationStore'
import { getAudioInputDevices, getAudioOutputDevices, supportsSinkId, inputVolumePref, setInputVolume } from '../../services/antiloud'
import { connectDrive, disconnectDrive, getDriveStorage, isDriveConnected, type DriveStorageInfo } from '../../services/driveService'
import { pingBackend } from '../../services/backend'
import { useCallStore } from '../../stores/callStore'
import { getStreamPlanLabel, isQualityBlocked, getMaxStreamQuality, isFpsBlocked, isBitrateBlocked } from '../../utils/astro'
import { canOpenAdminPanel } from '../../services/admin'
import { AdminPanel } from '../Admin/AdminPanel'
import { PrivacySettings } from '../Privacy/PrivacySettings'
import { AppearanceModal } from '../Profile/AppearanceModal'
import { ThemeWorkshopModal } from '../Profile/ThemeWorkshopModal'
import { enablePushNotifications, disablePushNotifications, pushEnabledLocally, pushSupported } from '../../services/pushService'

const THEME_KEY = 'friends-space:theme'

const TOP_TABS: { key: SettingsTabId; icon: string; label: string }[] = [
  { key: 'notificacoes', icon: 'bell', label: 'Notificações' },
]

const BOTTOM_TABS: { key: SettingsTabId; icon: string; label: string }[] = [
  { key: 'perfil', icon: 'user', label: 'Perfil' },
  { key: 'voz', icon: 'microphone', label: 'Voz e Áudio' },
  { key: 'aparencia', icon: 'palette', label: 'Aparência' },
  { key: 'privacidade', icon: 'shield-halved', label: 'Privacidade' },
  { key: 'armazenamento', icon: 'hard-drive', label: 'Armazenamento' },
  { key: 'idioma', icon: 'globe', label: 'Idioma' },
  { key: 'historico', icon: 'clock-rotate-left', label: 'Histórico' },
  { key: 'sobre', icon: 'circle-info', label: 'Sobre' },
  { key: 'ajuda', icon: 'circle-question', label: 'Ajuda' },
]

const TAB_LABELS: Record<SettingsTabId, string> = {
  notificacoes: 'Notificações',
  perfil: 'Perfil',
  voz: 'Voz e Áudio',
  aparencia: 'Aparência',
  privacidade: 'Privacidade',
  armazenamento: 'Armazenamento',
  idioma: 'Idioma',
  historico: 'Histórico',
  sobre: 'Sobre',
  ajuda: 'Ajuda',
}

const NOTIF_TOGGLES: { key: string; label: string; description: string }[] = [
  { key: 'notifMentions', label: 'Menções (@)', description: 'Notificação quando alguém te mencionar em um chat.' },
  { key: 'notifDm', label: 'Mensagens diretas', description: 'Notificações de novas mensagens diretas.' },
  { key: 'notifFriendRequests', label: 'Solicitações de amizade', description: 'Pedidos e aceites de amizade.' },
  { key: 'notifFriendAlerts', label: 'Amigos online e status', description: 'Quando amigos ficarem online ou mudarem de status.' },
  { key: 'notifFeed', label: 'Feed e mural', description: 'Comentários no seu post do feed.' },
  { key: 'notifCallInvites', label: 'Convites para calls', description: 'Notificações de convites para chamadas.' },
  { key: 'notifServerMessages', label: 'Mensagens em servidores', description: 'Notificações de mensagens nos servidores.' },
  { key: 'notifServerEvents', label: 'Eventos de servidores', description: 'Notificações de eventos dos servidores.' },
  { key: 'notifCallAlerts', label: 'Atividade em calls', description: 'Avisos de atividade em chamadas (entrou/saiu, tela).' },
  { key: 'notifAstro', label: 'Novidades do ASTRO', description: 'Atualizações e novidades do plano ASTRO.' },
]

function fire(name: string, detail?: string) {
  try { window.dispatchEvent(detail === undefined ? new Event(name) : new CustomEvent(name, { detail })) } catch { }
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      <label className="profile-toggle" style={{ margin: 0 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="profile-toggle-slider" />
      </label>
    </label>
  )
}

export function SettingsModal() {
  const { open, closeSettings, tab, openSettings } = useSettingsStore()
  const { currentUser, updateUser } = useUserStore()
  const { t, lang, setLang } = useLangStore()
  const unread = useNotificationStore(s => s.unread)
  const preferredQuality = useCallStore(s => s.preferredQuality)
  const preferredFps = useCallStore(s => s.preferredFps)
  const preferredBitrate = useCallStore(s => s.preferredBitrate)
  const [micDevices, setMicDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [outDevices, setOutDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [selectedMic, setSelectedMic] = useState(() => { try { return localStorage.getItem('friends-space:mic') || '' } catch { return '' } })
  const [selectedOutput, setSelectedOutput] = useState(() => { try { return localStorage.getItem('friends-space:output') || '' } catch { return '' } })
  const [echo, setEcho] = useState(() => { try { return localStorage.getItem('friends-space:echo') !== '0' } catch { return true } })
  const [noise, setNoise] = useState(() => { try { return localStorage.getItem('friends-space:noise') !== '0' } catch { return true } })
  const [agc, setAgc] = useState(() => { try { return localStorage.getItem('friends-space:agc') !== '0' } catch { return true } })
  const [volumeIn, setVolumeIn] = useState(() => inputVolumePref())
  const [volumeOut, setVolumeOut] = useState(() => { try { return Number(localStorage.getItem('friends-space:vol-out') || '80') } catch { return 80 } })
  const [drive, setDrive] = useState(isDriveConnected())
  const [driveBusy, setDriveBusy] = useState(false)
  const [driveStorage, setDriveStorage] = useState<DriveStorageInfo | null>(null)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [pushOn, setPushOn] = useState(() => pushEnabledLocally())
  const [pushBusy, setPushBusy] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showWorkshop, setShowWorkshop] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })

  useEffect(() => {
    if (!open) return
    if (tab === 'voz') {
      void getAudioInputDevices().then(setMicDevices)
      void getAudioOutputDevices().then(setOutDevices)
    }
    void pingBackend().then(setBackendOnline)
    void refreshStorage()
  }, [open, tab, currentUser])

  if (!open || !currentUser) return null

  const settings = (currentUser.settings || {}) as Record<string, unknown>

  const savePref = (key: string, value: string) => {
    try { localStorage.setItem(key, value) } catch { }
  }

  const selectMic = (deviceId: string) => {
    setSelectedMic(deviceId)
    savePref('friends-space:mic', deviceId)
    useCallStore.getState().switchMicDevice(deviceId).catch(() => { })
  }

  const notifOn = (key: string) => {
    const v = settings[key]
    if (v === true || v === 'on') return true
    if (v === false || v === 'off') return false
    // Nasce desligado: só notifica se o usuário ligar (mesmo padrão do store).
    return !NOTIF_DEFAULT_OFF_SETTINGS.includes(key)
  }

  const toggleNotif = (key: string) => {
    const next = !notifOn(key)
    void updateUser({ settings: { ...settings, [key]: next } })
  }

  const togglePush = async () => {
    if (pushBusy) return
    setPushBusy(true)
    try {
      if (pushOn) {
        await disablePushNotifications(currentUser.id)
        setPushOn(false)
      } else {
        const ok = await enablePushNotifications(currentUser.id)
        setPushOn(ok)
        if (!ok) fire('friends-space:toast', 'Não foi possível ativar as notificações push neste navegador')
      }
    } finally { setPushBusy(false) }
  }

  const selectTheme = (value: 'dark' | 'light') => {
    setTheme(value)
    savePref(THEME_KEY, value)
    fire('friends-space:set-theme', value)
  }

  const toggleDrive = async () => {
    if (driveBusy) return
    setDriveBusy(true)
    try {
      if (drive) { disconnectDrive(); setDrive(false); setDriveStorage(null) }
      else {
        const ok = await connectDrive()
        if (ok) { setDrive(true); await refreshStorage() }
      }
    } finally { setDriveBusy(false) }
  }

  const refreshStorage = async () => {
    if (!isDriveConnected()) { setDriveStorage(null); return }
    const info = await getDriveStorage()
    setDriveStorage(info)
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = bytes
    let i = 0
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
    return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
  }

  const select: React.CSSProperties = {
    width: '100%', padding: '9px 10px', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', fontSize: 13, outline: 'none',
  }

  const tabButton = (tb: { key: SettingsTabId; icon: string; label: string }) => (
    <button
      key={tb.key}
      onClick={() => openSettings(tb.key)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8,
        background: tab === tb.key ? 'var(--bg-hover)' : 'transparent', border: 'none',
        color: tab === tb.key ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 13, fontWeight: tab === tb.key ? 700 : 500, cursor: 'pointer', textAlign: 'left',
      }}
    >
      <Fa name={tb.icon} size={13} style={{ width: 16 }} />
      {tb.label}
    </button>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} onClick={closeSettings}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(760px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 64px))',
          background: 'var(--bg-primary)', border: '1px solid var(--border)',
          borderRadius: 14, display: 'flex', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Sidebar */}
        <div style={{ width: 212, flexShrink: 0, background: 'var(--bg-secondary)', padding: '18px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', padding: '0 8px 12px' }}>{t('settings.title')}</div>
          {TOP_TABS.map(tabButton)}
          <div style={{ height: 1, background: 'var(--border)', margin: '8px 6px' }} />
          {BOTTOM_TABS.map(tabButton)}
          <div style={{ marginTop: 'auto', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderRadius: 8, background: 'var(--bg-tertiary)' }}>
              <Avatar src={currentUser.photoUrl} name={currentUser.name || '?'} size={32} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>@{currentUser.friendCode}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
              {TAB_LABELS[tab]}
            </h2>
            <button onClick={closeSettings} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          {tab === 'notificacoes' && (
            <div>
              {NOTIF_TOGGLES.map(item => (
                <Row key={item.key} label={item.label} hint={item.description}>
                  <Toggle checked={notifOn(item.key)} onChange={() => toggleNotif(item.key)} label={item.label} />
                </Row>
              ))}
              {pushSupported() && (
                <Row label="Notificações push" hint="Receba notificações mesmo com o app fechado (navegador/desktop).">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: pushOn ? '#23a55a' : '#80848e' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{pushOn ? 'Ativadas' : 'Desativadas'}</span>
                    <Button size="sm" variant={pushOn ? 'danger' : 'primary'} onClick={() => void togglePush()} disabled={pushBusy}>
                      {pushBusy ? t('settings.wait') : pushOn ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </Row>
              )}
              <Row label="Histórico e menções" hint="Não lidas, menções e histórico completo ficam na Caixa de Entrada.">
                <Button size="sm" variant="secondary" onClick={() => openSettings('historico')}>Abrir Histórico ({unread} não lidas)</Button>
              </Row>
              {canOpenAdminPanel(currentUser) && (
                <Row label={`Painel ${currentUser.flags?.dev ? 'Dev' : currentUser.flags?.support ? 'Suporte' : 'Conta'}`} hint="Ferramentas de moderação disponíveis para a sua conta.">
                  <Button size="sm" variant="secondary" onClick={() => setShowAdmin(true)}>
                    <Fa name="shield-halved" size={13} /> Abrir painel
                  </Button>
                </Row>
              )}
            </div>
          )}

          {tab === 'perfil' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0 16px', borderBottom: '1px solid var(--border)' }}>
                <Avatar src={currentUser.photoUrl} name={currentUser.name || '?'} size={64} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{currentUser.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>@{currentUser.friendCode}</div>
                  {currentUser.bio ? <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.bio}</div> : null}
                </div>
              </div>
              <Row label="Editar perfil" hint="Nome, bio, mural, lista de desejos e privacidade do perfil no editor completo.">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button size="sm" onClick={() => fire('friends-space:edit-profile')}>Abrir editor de perfil</Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowAppearance(true)}>Editar aparência do perfil</Button>
                </div>
              </Row>
              <Row label="ID da conta" hint="Use para suporte e para compartilhar seu perfil.">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontSize: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-secondary)' }}>{currentUser.id}</code>
                  <Button size="sm" variant="secondary" onClick={() => { try { void navigator.clipboard.writeText(currentUser.id) } catch { } }}>Copiar</Button>
                </div>
              </Row>
              <Row label="Conta" hint="Trocar de conta ou sair neste dispositivo.">
                <Button size="sm" variant="danger" onClick={() => { closeSettings(); fire('friends-space:sign-out') }}>Sair / Trocar de conta</Button>
              </Row>
            </div>
          )}

          {tab === 'voz' && (
            <div>
              <Row label={t('settings.mic')} hint={t('settings.micHint')}>
                <select value={selectedMic} onChange={e => selectMic(e.target.value)} style={select}>
                  <option value="">{t('settings.systemDefault')}</option>
                  {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </Row>
              <Row label="Volume de entrada" hint="Ganho do microfone. Aplicado ao entrar em call; muda ao vivo durante a chamada.">
                <input
                  type="range" min={0} max={200} value={volumeIn}
                  onChange={e => { const v = Number(e.target.value); setVolumeIn(v); savePref('friends-space:vol-in', String(v)); setInputVolume(v) }}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{volumeIn}%</div>
              </Row>
              <Row label={t('settings.output')} hint={supportsSinkId() ? t('settings.outputHint') : t('settings.outputUnsupported')}>
                <select value={selectedOutput} onChange={e => { setSelectedOutput(e.target.value); savePref('friends-space:output', e.target.value); fire('friends-space:output-changed') }} style={select} disabled={!supportsSinkId()}>
                  <option value="">{t('settings.systemDefault')}</option>
                  {outDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </Row>
              <Row label={t('settings.outputVolume')} hint={t('settings.outputVolumeHint')}>
                <input
                  type="range" min={0} max={200} value={volumeOut}
                  onChange={e => { const v = Number(e.target.value); setVolumeOut(v); savePref('friends-space:vol-out', String(v)) }}
                  onMouseUp={() => { useCallStore.getState().setVolumeForAll(volumeOut / 100) }}
                  onTouchEnd={() => { useCallStore.getState().setVolumeForAll(volumeOut / 100) }}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{volumeOut}%</div>
              </Row>
              <Row label={t('settings.audioProcessing')}>
                <Toggle checked={echo} onChange={v => { setEcho(v); savePref('friends-space:echo', v ? '1' : '0') }} label={t('settings.echo')} />
                <Toggle checked={noise} onChange={v => { setNoise(v); savePref('friends-space:noise', v ? '1' : '0') }} label={t('settings.noise')} />
                <Toggle checked={agc} onChange={v => { setAgc(v); savePref('friends-space:agc', v ? '1' : '0') }} label={t('settings.agc')} />
              </Row>
              <Row label="Qualidade de transmissão (vídeo)" hint="De acordo com o seu plano. Qualidades acima aparecem com cadeado — assine ASTRO, ASTRO+ ou Plus para liberar as superiores. Aplicado na próxima entrada em call e trocado ao vivo durante a chamada.">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-secondary)', color: getStreamPlanLabel(currentUser).color, border: `1px solid ${getStreamPlanLabel(currentUser).color}55` }}>{getStreamPlanLabel(currentUser).label}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Liberado até <b style={{ color: 'var(--text-primary)' }}>{isQualityBlocked(currentUser, preferredQuality) ? `${getMaxStreamQuality(currentUser)} (atual acima do plano)` : preferredQuality}</b></span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {(['480p', '720p', '1080p', '2k', '4k'] as const).map(q => {
                    const blocked = isQualityBlocked(currentUser, q)
                    const active = preferredQuality === q
                    return (
                      <button
                        key={q}
                        disabled={blocked}
                        onClick={() => { void useCallStore.getState().setPreferredQuality(q) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                          background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
                          color: active ? '#04120a' : blocked ? 'var(--text-muted)' : 'var(--text-primary)',
                          border: `1px solid ${active ? 'var(--accent)' : blocked ? 'var(--border)' : 'var(--border)'}`,
                          fontWeight: active ? 800 : 700, fontSize: 12.5, cursor: blocked ? 'not-allowed' : 'pointer',
                          opacity: blocked ? 0.6 : 1,
                        }}
                        title={blocked ? `Qualidade bloqueada no plano ${getStreamPlanLabel(currentUser).label}.` : undefined}
                      >
                        {active && <Fa name="check" size={11} />}
                        {blocked && <Fa name="lock" size={11} />}
                        {q}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>FPS <Fa name="gauge-high" size={10} /></div>
                    <select
                      value={preferredFps}
                      onChange={e => { void useCallStore.getState().setPreferredFps(Number(e.target.value) as never) }}
                      style={select}
                    >
                      {([30, 60] as const).map(f => {
                        const blocked = isFpsBlocked(currentUser, f)
                        return (
                          <option key={f} value={f} disabled={blocked}>
                            {blocked ? `${f} fps · bloqueado` : `${f} fps`}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Bitrate</div>
                    <select
                      value={preferredBitrate}
                      onChange={e => { void useCallStore.getState().setPreferredBitrate(Number(e.target.value)) }}
                      style={select}
                    >
                      {[2000, 4000, 6000, 8000, 12000, 16000, 25000, 35000, 45000].map(k => {
                        const blocked = isBitrateBlocked(currentUser, k)
                        const label = k >= 1000 ? `${(k / 1000).toFixed(k % 1000 === 0 ? 0 : 1)} Mbps` : `${k} kbps`
                        return (
                          <option key={k} value={k} disabled={blocked}>
                            {blocked ? `${label} · bloqueado` : label}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>
              </Row>
            </div>
          )}

          {tab === 'aparencia' && (
            <div>
              <Row label="Tema do aplicativo" hint="Vale para todas as telas deste dispositivo.">
                <div style={{ display: 'flex', gap: 10 }}>
                  {([
                    { id: 'dark' as const, label: 'Escuro', bg: '#11151b', card: '#1b2027' },
                    { id: 'light' as const, label: 'Claro', bg: '#f2f4f8', card: '#ffffff' },
                  ]).map(option => (
                    <button
                      key={option.id}
                      onClick={() => selectTheme(option.id)}
                      style={{
                        width: 148, borderRadius: 10, cursor: 'pointer', padding: 0, overflow: 'hidden',
                        border: theme === option.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                        background: option.bg, textAlign: 'left',
                      }}
                    >
                      <div style={{ height: 56, padding: 8 }}>
                        <div style={{ width: '62%', height: 6, borderRadius: 4, background: option.card, marginBottom: 6 }} />
                        <div style={{ width: '84%', height: 6, borderRadius: 4, background: option.card, marginBottom: 6 }} />
                        <div style={{ width: '44%', height: 6, borderRadius: 4, background: option.card }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--bg-tertiary)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {option.label}
                        {theme === option.id && <Fa name="check" size={12} style={{ color: 'var(--accent)' }} />}
                      </div>
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="Aparência do perfil" hint="Tema do perfil, banner, cor e efeito do nome — o que os outros veem.">
                <Button size="sm" onClick={() => setShowAppearance(true)}>Editar aparência do perfil</Button>
              </Row>
              <Row label="Workshop de temas" hint="Crie temas sólidos ou animados e compartilhe com quem tem ASTRO.">
                <Button size="sm" variant="secondary" onClick={() => setShowWorkshop(true)}>Abrir Workshop</Button>
              </Row>
            </div>
          )}

          {tab === 'privacidade' && (
            <PrivacySettings
              userSettings={settings as Record<string, string | boolean | undefined>}
              onSaveAll={(patch) => { void updateUser({ settings: { ...settings, ...patch } }) }}
            />
          )}

          {tab === 'armazenamento' && (
            <div>
              <Row label={t('settings.drive')} hint={t('settings.driveHint')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: drive ? '#23a55a' : '#80848e' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{drive ? t('settings.connected') : t('settings.notConnected')}</span>
                </div>
                <Button variant={drive ? 'danger' : 'primary'} size="sm" onClick={() => void toggleDrive()} disabled={driveBusy}>
                  {driveBusy ? t('settings.wait') : drive ? t('settings.disconnect') : t('settings.connectDrive')}
                </Button>
              </Row>
              <Row label="Armazenamento do Drive" hint="Espaço usado e livre na sua conta do Google Drive, atualizado em tempo real.">
                {drive && driveStorage ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <span>{formatBytes(driveStorage.usedBytes)} usado</span>
                      <span>{formatBytes(driveStorage.freeBytes)} livre</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%', borderRadius: 999,
                          background: (driveStorage.freeBytes / driveStorage.limitBytes) < 0.1 ? '#ed4245' : 'var(--accent)',
                          width: `${Math.min(100, (driveStorage.usedBytes / driveStorage.limitBytes) * 100)}%`,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {Math.round((driveStorage.usedBytes / driveStorage.limitBytes) * 100)}% de {formatBytes(driveStorage.limitBytes)} usado
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                      {drive ? 'Carregando informações de armazenamento...' : 'Conecte o Google Drive para ver o espaço utilizado.'}
                    </span>
                    {drive && <Button size="sm" variant="secondary" onClick={() => void refreshStorage()}>Atualizar</Button>}
                  </div>
                )}
              </Row>
              <Row label={t('settings.backend')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: backendOnline ? '#23a55a' : '#f23f43' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {backendOnline === null ? t('settings.wait') : backendOnline ? t('settings.connected') : 'Offline'}
                  </span>
                </div>
              </Row>
            </div>
          )}

          {tab === 'idioma' && (
            <div>
              <Row label="Idioma do aplicativo" hint="Muda textos, datas e avisos do app.">
                {([
                  { id: 'pt-BR' as const, label: 'Português (Brasil)' },
                  { id: 'en-US' as const, label: 'English (US)' },
                ]).map(option => (
                  <button
                    key={option.id}
                    onClick={() => setLang(option.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '11px 12px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                      background: lang === option.id ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                      border: `1px solid ${lang === option.id ? 'var(--accent)' : 'var(--border)'}`,
                      color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 600, textAlign: 'left',
                    }}
                  >
                    {option.label}
                    {lang === option.id && <Fa name="check" size={13} style={{ color: 'var(--accent)' }} />}
                  </button>
                ))}
              </Row>
            </div>
          )}

          {tab === 'historico' && (
            <div>
              <Row label="Caixa de Entrada" hint="Não lidas, menções e histórico completo — tudo em um só lugar.">
                <Button size="sm" onClick={() => fire('friends-space:open-inbox')}>Abrir Caixa de Entrada</Button>
              </Row>
              <Row label="Não lidas" hint="Solicitações de amizade, convites de call, notificações e canais com mensagens novas.">
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{unread} itens não lidos</span>
              </Row>
              <Row label="Menções" hint="Quando alguém menciona você com @ em um chat, aparece aqui e na Caixa de Entrada.">
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Ative/desative os avisos em Notificações → Menções (@).</span>
              </Row>
            </div>
          )}

          {tab === 'sobre' && (
            <div>
              <Row label="Friends Space" hint="O chat da turma: feed, servidores, calls, temas e ASTRO.">
                <Button size="sm" variant="secondary" onClick={() => { closeSettings(); fire('friends-space:open-about') }}>Abrir sobre o app</Button>
              </Row>
              <Row label="Site" hint="Página pública com informações do projeto.">
                <Button size="sm" variant="secondary" onClick={() => window.open('/sobre', '_blank')}>Abrir /sobre</Button>
              </Row>
            </div>
          )}

          {tab === 'ajuda' && (
            <div>
              <Row label="Central de ajuda" hint="Dúvidas, problemas e suporte direto com a equipe.">
                <Button size="sm" onClick={() => { closeSettings(); fire('friends-space:open-help') }}>Abrir ajuda</Button>
              </Row>
              <Row label="Aplicativo para desktop" hint="Windows e Linux — atualizações automáticas.">
                <Button size="sm" variant="secondary" onClick={() => { closeSettings(); fire('friends-space:open-download') }}>Baixar app</Button>
              </Row>
            </div>
          )}
        </div>
      </div>

      {showAppearance && <AppearanceModal onClose={() => setShowAppearance(false)} />}
      {showWorkshop && <ThemeWorkshopModal onClose={() => setShowWorkshop(false)} />}
      <AdminPanel open={showAdmin} onClose={() => setShowAdmin(false)} initialTab="overview" />
    </div>
  )
}
