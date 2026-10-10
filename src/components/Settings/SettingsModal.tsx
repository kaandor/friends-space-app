import { useEffect, useState } from 'react'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { useUserStore } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getAudioInputDevices, getAudioOutputDevices, supportsSinkId } from '../../services/antiloud'
import { connectDrive, disconnectDrive, getDriveStorage, isDriveConnected, type DriveStorageInfo } from '../../services/driveService'
import { pingBackend } from '../../services/backend'
import { useCallStore } from '../../stores/callStore'
import { getStreamPlanLabel, isQualityBlocked, getMaxStreamQuality, isFpsBlocked, isBitrateBlocked } from '../../utils/astro'

type SettingsTab = 'voz' | 'sistema'

interface SettingsModalProps {}

const TABS: { key: SettingsTab; icon: string; label: string }[] = [
  { key: 'voz', icon: 'fa-solid fa-microphone', label: 'settings.voice' },
  { key: 'sistema', icon: 'fa-solid fa-server', label: 'settings.system' },
]

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

export function SettingsModal(_props: SettingsModalProps) {
  const { open, closeSettings } = useSettingsStore()
  const { currentUser } = useUserStore()
  const { t } = useLangStore()
  const preferredQuality = useCallStore(s => s.preferredQuality)
  const preferredFps = useCallStore(s => s.preferredFps)
  const preferredBitrate = useCallStore(s => s.preferredBitrate)
  const [tab, setTab] = useState<SettingsTab>('voz')
  const [micDevices, setMicDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [outDevices, setOutDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [selectedMic, setSelectedMic] = useState(() => { try { return localStorage.getItem('friends-space:mic') || '' } catch { return '' } })
  const [selectedOutput, setSelectedOutput] = useState(() => { try { return localStorage.getItem('friends-space:output') || '' } catch { return '' } })
  const [echo, setEcho] = useState(() => { try { return localStorage.getItem('friends-space:echo') !== '0' } catch { return true } })
  const [noise, setNoise] = useState(() => { try { return localStorage.getItem('friends-space:noise') !== '0' } catch { return true } })
  const [agc, setAgc] = useState(() => { try { return localStorage.getItem('friends-space:agc') !== '0' } catch { return true } })
  const [volumeOut, setVolumeOut] = useState(() => { try { return Number(localStorage.getItem('friends-space:vol-out') || '80') } catch { return 80 } })
  const [drive, setDrive] = useState(isDriveConnected())
  const [driveBusy, setDriveBusy] = useState(false)
  const [driveStorage, setDriveStorage] = useState<DriveStorageInfo | null>(null)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  useEffect(() => {
    if (!open) return
    setTab('voz')
    void getAudioInputDevices().then(setMicDevices)
    void getAudioOutputDevices().then(setOutDevices)
    void pingBackend().then(setBackendOnline)
    void refreshStorage()
  }, [open, currentUser])

  if (!open) return null

  const savePrefs = (key: string, value: string) => {
    try { localStorage.setItem(key, value) } catch { }
  }

  const selectMic = (deviceId: string) => {
    setSelectedMic(deviceId)
    savePrefs('friends-space:mic', deviceId)
    useCallStore.getState().switchMicDevice(deviceId).catch(() => { })
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} onClick={closeSettings}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(720px, calc(100vw - 32px))', height: 'min(520px, calc(100vh - 64px))',
          background: 'var(--bg-primary)', border: '1px solid var(--border)',
          borderRadius: 14, display: 'flex', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0, background: 'var(--bg-secondary)', padding: '18px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', padding: '0 8px 12px' }}>{t('settings.title')}</div>
          {TABS.map(tb => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8,
                background: tab === tb.key ? 'var(--bg-hover)' : 'transparent', border: 'none',
                color: tab === tb.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: tab === tb.key ? 700 : 500, cursor: 'pointer', textAlign: 'left',
              }}
            >
              <i className={tb.icon} style={{ width: 16, fontSize: 13 }} />
              {t(tb.label)}
            </button>
          ))}
          <div style={{ marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderRadius: 8, background: 'var(--bg-tertiary)' }}>
              <Avatar src={currentUser?.photoUrl} name={currentUser?.name || '?'} size={32} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser?.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>@{currentUser?.friendCode}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
              {t(TABS.find(x => x.key === tab)?.label || '')}
            </h2>
            <button onClick={closeSettings} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>{tab === 'voz' && (
            <div>
              <Row label={t('settings.mic')} hint={t('settings.micHint')}>
                <select value={selectedMic} onChange={e => selectMic(e.target.value)} style={select}>
                  <option value="">{t('settings.systemDefault')}</option>
                  {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </Row>
              <Row label={t('settings.output')} hint={supportsSinkId() ? t('settings.outputHint') : t('settings.outputUnsupported')}>
                <select value={selectedOutput} onChange={e => { setSelectedOutput(e.target.value); savePrefs('friends-space:output', e.target.value) }} style={select} disabled={!supportsSinkId()}>
                  <option value="">{t('settings.systemDefault')}</option>
                  {outDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
              </Row>
              <Row label={t('settings.outputVolume')} hint={t('settings.outputVolumeHint')}>
                <input
                  type="range" min={0} max={200} value={volumeOut}
                  onChange={e => { const v = Number(e.target.value); setVolumeOut(v); savePrefs('friends-space:vol-out', String(v)) }}
                  onMouseUp={() => { useCallStore.getState().setVolumeForAll(volumeOut / 100) }}
                  onTouchEnd={() => { useCallStore.getState().setVolumeForAll(volumeOut / 100) }}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{volumeOut}%</div>
              </Row>
              <Row label={t('settings.audioProcessing')}>
                <Toggle checked={echo} onChange={v => { setEcho(v); savePrefs('friends-space:echo', v ? '1' : '0') }} label={t('settings.echo')} />
                <Toggle checked={noise} onChange={v => { setNoise(v); savePrefs('friends-space:noise', v ? '1' : '0') }} label={t('settings.noise')} />
                <Toggle checked={agc} onChange={v => { setAgc(v); savePrefs('friends-space:agc', v ? '1' : '0') }} label={t('settings.agc')} />
              </Row>
              <Row label="Qualidade de transmissão (vídeo)" hint="De acordo com o seu plano. Qualidades acima aparecem com cadeado — assine ASTRO, ASTRO+ ou Plus para liberar as superiores. Aplicado na próxima entrada em call e trocado ao vivo durante a chamada.">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-secondary)', color: getStreamPlanLabel(currentUser).color, border: `1px solid ${getStreamPlanLabel(currentUser).color}55` }}>{getStreamPlanLabel(currentUser).label}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Liberado até <b style={{ color: 'var(--text-primary)' }}>{isQualityBlocked(currentUser, preferredQuality) ? `${getMaxStreamQuality(currentUser)} (atual acima do plano)` : preferredQuality}</b></span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {(['480p', '720p', '1080p', '2k'] as const).map(q => {
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
                        {active && <i className="fa-solid fa-check" style={{ fontSize: 11 }} />}
                        {blocked && <i className="fa-solid fa-lock" style={{ fontSize: 11 }} />}
                        {q}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>FPS <i className="fa-solid fa-gauge-high" style={{ fontSize: 10 }} /></div>
                    <select
                      value={preferredFps}
                      onChange={e => { void useCallStore.getState().setPreferredFps(Number(e.target.value) as never) }}
                      style={select}
                    >
                      {([30, 60] as const).map(f => {
                        const blocked = isFpsBlocked(currentUser, f)
                        return (
                          <option key={f} value={f} disabled={blocked}>
                            {blocked ? `🔒 ${f} fps` : `${f} fps`}
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
                      {[2000, 4000, 6000, 8000, 12000, 16000, 25000].map(k => {
                        const blocked = isBitrateBlocked(currentUser, k)
                        const label = k >= 1000 ? `${(k / 1000).toFixed(k % 1000 === 0 ? 0 : 1)} Mbps` : `${k} kbps`
                        return (
                          <option key={k} value={k} disabled={blocked}>
                            {blocked ? `🔒 ${label}` : label}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>
              </Row>
            </div>
          )}

          {tab === 'sistema' && (
            <div>
              <Row label={t('settings.backend')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: backendOnline ? '#23a55a' : '#f23f43' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {backendOnline === null ? t('settings.wait') : backendOnline ? t('settings.connected') : 'Offline'}
                  </span>
                </div>
              </Row>
              <Row label={t('settings.drive')} hint={t('settings.driveHint')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: drive ? '#23a55a' : '#80848e' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{drive ? t('settings.connected') : t('settings.notConnected')}</span>
                </div>
                <Button variant={drive ? 'danger' : 'primary'} size="sm" onClick={() => void toggleDrive()} disabled={driveBusy}>
                  {driveBusy ? t('settings.wait') : drive ? t('settings.disconnect') : t('settings.connectDrive')}
                </Button>
              </Row>
              <Row label="Armazenamento do Drive" hint="Espaco usado e livre na sua conta do Google Drive, atualizado em tempo real.">
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
                      {drive ? 'Carregando informacoes de armazenamento...' : 'Conecte o Google Drive para ver o espaco utilizado.'}
                    </span>
                    {drive && <Button size="sm" variant="secondary" onClick={() => void refreshStorage()}>Atualizar</Button>}
                  </div>
                )}
              </Row>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

