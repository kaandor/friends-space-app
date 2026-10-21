import { useEffect, useState } from 'react'
import { Camera, Gamepad2, Mic, MicOff, MonitorUp, Music, PhoneOff } from 'lucide-react'
import { useCallStore, requestCallViewOpen } from '../../stores/callStore'
import { useServerStore } from '../../stores/serverStore'
import { ActivityModal } from './ActivityModal'

const SOUNDS: Array<{ name: string; label: string }> = [
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

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`
}

// Painel de voz inspirado no Discord na sidebar: status + nome da call
// (clicavel para voltar), camera, tela, atividades, sons e sair.
export function VoicePanel({ onReturnToCall }: { onReturnToCall?: () => void }) {
  const activeCall = useCallStore(s => s.activeCall)
  const channelId = useCallStore(s => s.channelId)
  const createdAt = useCallStore(s => s.createdAt)
  const connectedAt = useCallStore(s => s.connectedAt)
  const participants = useCallStore(s => s.participants)
  const screenSharing = useCallStore(s => s.screenSharing)
  const toggleScreenShare = useCallStore(s => s.toggleScreenShare)
  const muted = useCallStore(s => s.muted)
  const toggleMute = useCallStore(s => s.toggleMute)
  const cameraOn = useCallStore(s => s.cameraOn)
  const toggleCamera = useCallStore(s => s.toggleCamera)
  const cameraDevices = useCallStore(s => s.cameraDevices)
  const selectedCamera = useCallStore(s => s.selectedCamera)
  const refreshCameraDevices = useCallStore(s => s.refreshCameraDevices)
  const playSoundboard = useCallStore(s => s.playSoundboard)
  const endCall = useCallStore(s => s.endCall)
  const servers = useServerStore(s => s.servers)
  const [now, setNow] = useState(() => Date.now())
  const [camOpen, setCamOpen] = useState(false)
  const [soundsOpen, setSoundsOpen] = useState(false)
  const [activitiesOpen, setActivitiesOpen] = useState(false)

  useEffect(() => {
    if (!activeCall) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [activeCall])

  if (!activeCall) return null
  let channelName = 'Voz'
  let serverName = ''
  for (const srv of servers) {
    const ch = (srv.channels || []).find(c => c.id === channelId)
    if (ch) { channelName = ch.name; serverName = srv.name; break }
  }

  return (
    <div className="vp-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className="vp-dot" />
        <span className="vp-title">Voz conectada</span>
        <span className="vp-timer">
          {(connectedAt || createdAt) ? fmtElapsed(now - ((connectedAt || createdAt) as number)) : '--:--'}
        </span>
      </div>
      <button className="vp-name" onClick={() => { try { requestCallViewOpen(); window.dispatchEvent(new CustomEvent('friends-space:open-call')) } catch { } try { onReturnToCall?.() } catch { } }} title="Voltar para a call">
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {channelName}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {serverName}{serverName ? ' · ' : ''}{participants.length} na call
        </div>
      </button>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className={`vp-btn vp-mute-btn${muted ? ' vp-muted' : ''}`}
          onClick={() => { try { toggleMute() } catch { } }}
          title={muted ? 'Reativar microfone (você está mudo)' : 'Mutar microfone (mudo total)'}
        >
          {muted ? <MicOff size={15} /> : <Mic size={15} />} {muted ? 'Mudo' : 'Mutar'}
        </button>
        <div style={{ position: 'relative', flex: 1, display: 'flex', minWidth: 0 }}>
          <button
            className={`vp-btn${cameraOn ? ' vp-active' : ''}`}
            onClick={() => { void toggleCamera() }}
            onContextMenu={e => { e.preventDefault(); setCamOpen(v => !v); if (!camOpen) void refreshCameraDevices().catch(() => { }) }}
            title="Câmera (botão direito: escolher)"
          >
            <Camera size={15} /> Câmera
          </button>
          {camOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setCamOpen(false)} />
              <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 999, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, maxHeight: 180, overflowY: 'auto' }}>
                {cameraDevices.length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma câmera achada</div>
                )}
                {cameraDevices.map(d => (
                  <button
                    key={d.deviceId}
                    onClick={() => { setCamOpen(false); void toggleCamera(d.deviceId) }}
                    title={d.label || d.deviceId}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: d.deviceId === selectedCamera ? 'var(--bg-tertiary)' : 'none', border: 'none', color: 'var(--text-primary)', fontSize: 12, padding: '7px 10px', borderRadius: 5, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {d.label || d.deviceId.slice(0, 18)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          className={`vp-btn${screenSharing ? ' vp-active' : ''}`}
          onClick={() => { void toggleScreenShare() }}
          title={screenSharing ? 'Parar tela' : 'Compartilhar tela'}
        >
          <MonitorUp size={15} /> Tela
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button className="vp-btn" onClick={() => setActivitiesOpen(true)} title="Atividades da call">
          <Gamepad2 size={15} /> Atividades
        </button>
        <div style={{ position: 'relative', flex: 1, display: 'flex', minWidth: 0 }}>
          <button className="vp-btn" onClick={() => setSoundsOpen(v => !v)} title="Efeitos sonoros">
            <Music size={15} /> Sons
          </button>
          {soundsOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setSoundsOpen(false)} />
              <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 999, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                {SOUNDS.map(snd => (
                  <button
                    key={snd.name}
                    onClick={() => { try { playSoundboard(snd.name) } catch { } }}
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 4px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {snd.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button className="vp-btn vp-danger" onClick={() => { try { endCall() } catch { } }} title="Sair da call">
          <PhoneOff size={15} />
        </button>
      </div>
      {activitiesOpen && <ActivityModal onClose={() => setActivitiesOpen(false)} />}
    </div>
  )
}
