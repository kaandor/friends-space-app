import { useEffect, useState } from 'react'
import { Camera, MonitorUp, Music, PhoneOff } from 'lucide-react'
import { Fa } from '../../utils/fa'
import { useCallStore } from '../../stores/callStore'
import { useServerStore } from '../../stores/serverStore'
import { WatchPartyModal } from './WatchPartyModal'

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

// Painel de voz estilo Discord na sidebar: status grande + câmera, tela,
// YouTube junto, sons e sair.
export function VoicePanel() {
  const activeCall = useCallStore(s => s.activeCall)
  const channelId = useCallStore(s => s.channelId)
  const createdAt = useCallStore(s => s.createdAt)
  const connectedAt = useCallStore(s => s.connectedAt)
  const participants = useCallStore(s => s.participants)
  const screenSharing = useCallStore(s => s.screenSharing)
  const toggleScreenShare = useCallStore(s => s.toggleScreenShare)
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
  const [ytOpen, setYtOpen] = useState(false)

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

  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 0',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 1, minWidth: 0,
  }

  return (
    <div style={{ margin: '10px 12px 0', background: 'linear-gradient(180deg, var(--bg-secondary), var(--bg-tertiary))', border: '1px solid var(--border)', borderRadius: 10, padding: 14, boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, boxShadow: '0 0 8px var(--accent)' }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.02em' }}>Voz conectada</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {(connectedAt || createdAt) ? fmtElapsed(now - ((connectedAt || createdAt) as number)) : '--:--'}
        </span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
        {channelName}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        {serverName}{serverName ? ' · ' : ''}{participants.length} na call
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', minWidth: 0 }}>
          <button
            onClick={() => { void toggleCamera() }}
            onContextMenu={e => { e.preventDefault(); setCamOpen(v => !v); if (!camOpen) void refreshCameraDevices().catch(() => { }) }}
            title="Câmera (botão direito: escolher)"
            style={{ ...btn, background: cameraOn ? 'var(--accent)' : btn.background, color: cameraOn ? '#04120a' : btn.color }}
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
          onClick={() => { void toggleScreenShare() }}
          title={screenSharing ? 'Parar tela' : 'Compartilhar tela'}
          style={{ ...btn, background: screenSharing ? 'var(--accent)' : btn.background, color: screenSharing ? '#04120a' : btn.color }}
        >
          <MonitorUp size={15} /> Tela
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button onClick={() => setYtOpen(true)} title="Assistir junto (YouTube)" style={btn}>
          <Fa name="play" size={12} /> YouTube
        </button>
        <div style={{ position: 'relative', flex: 1, display: 'flex', minWidth: 0 }}>
          <button onClick={() => setSoundsOpen(v => !v)} title="Efeitos sonoros" style={btn}>
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
        <button onClick={() => { try { endCall() } catch { } }} title="Sair da call"
          style={{ ...btn, background: '#ed4245', borderColor: '#ed4245', color: '#fff', flex: '0 0 40px' }}>
          <PhoneOff size={15} />
        </button>
      </div>
      {ytOpen && <WatchPartyModal onClose={() => setYtOpen(false)} />}
    </div>
  )
}
