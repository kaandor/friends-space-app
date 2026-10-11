import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { IconScreenShare, IconVolume, IconClose } from '../../utils/icons'
import { useCallStore } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'
import { useFriendStore } from '../../stores/friendStore'
import { Avatar } from '../ui/Avatar'
import { startAudioMonitor, stopAudioMonitor } from '../../services/audioMonitor'
import { unlockAudio } from '../../services/audioUnlock'
import DebugWindow from '../Debug/DebugWindow'
import { getLocalVideoStats, type LocalVideoStats } from '../../stores/callStore'
import { getAudioInputDevices } from '../../services/antiloud'
import { applyRemoteGain } from '../../services/antiloud'
import { UserContextMenu } from '../ui/UserContextMenu'
import { useSettingsStore } from '../../stores/settingsStore'
import { useServerStore } from '../../stores/serverStore'
import {
  Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff,
  Headphones, HeadphoneOff, VolumeX, Volume2, PhoneOff, UserPlus, Ellipsis,
  Minus, Settings, Gauge, Check, PictureInPicture2,
} from 'lucide-react'
import { RemoteControlOverlay } from './RemoteControlOverlay'
import { isElectronDevice, useCallFullscreen } from './callFullscreen'
import { getStreamPlanLabel, isQualityBlocked, getMaxStreamFps, getMaxBitrateKbps, getAstroTier } from '../../utils/astro'
import { isCleanAudioEnabledPref, isCleanAudioSupported } from '../../services/rnnoise'
import { AstroPlansModal } from '../Home/AstroPlansModal'
import { CameraOverlay, CAMERA_POSITIONS, getCameraMode, getCameraPosition, setCameraMode, setCameraPosition, type CameraMode } from './CameraOverlay'

function playRemoteAudio(remoteStreams: Record<string, MediaStream>, remoteScreenStreams: Record<string, MediaStream>) {
  for (const userId of Object.keys(remoteStreams)) {
    const el = document.getElementById(`call-audio-${userId}`) as HTMLAudioElement | null
    if (el && el.paused) void el.play().catch(() => { })
  }
  for (const userId of Object.keys(remoteScreenStreams)) {
    const el = document.getElementById(`call-screen-audio-${userId}`) as HTMLAudioElement | null
    if (el && el.paused) void el.play().catch(() => { })
  }

}

const setSrc = (id: string, stream: MediaStream | null) => {
  const el = document.getElementById(id) as HTMLVideoElement | HTMLAudioElement | null
  if (el && el.srcObject !== stream) el.srcObject = stream
}

const clampVolume = (v?: number) => (typeof v === 'number' && !Number.isNaN(v) ? Math.min(1, Math.max(0, v)) : 1)

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      value={Math.round(value * 100)}
      onChange={event => onChange(Number(event.target.value) / 100)}
      style={{ width: 110, accentColor: 'var(--accent)' }}
    />
  )
}

const controlBtn: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.15s',
}

export function CallView() {
  const {
    activeCall, participants, muted, deafened, screenSharing,
    screenStream, localStream, preferredQuality, preferredFps, preferredBitrate,
    remoteStreams, remoteScreenStreams, volumes, screenError,
    toggleMute, toggleDeafen, toggleScreenShare, setVolume, endCall, switchMicDevice, setPreferredQuality, setPreferredFps, setPreferredBitrate, clearScreenError, setCleanAudioEnabled,
    toggleRecording,
    controlRequests, controlling, controlledBy,
    requestControl, acceptControlRequest, denyControlRequest, sendControlInput, stopControlling, revokeControl,
    inviteToCall, setAnydeskMode,
  } = useCallStore()
  const { currentUser } = useUserStore()
  const { friendUsers } = useFriendStore()
  const speakingUsers = useCallStore(s => s.speakingUsers)
  const recordingActive = useCallStore(s => s.recordingActive)
  const recordingBy = useCallStore(s => s.recordingBy)
  const sharingPeers = useCallStore(s => s.sharingPeers)
  const pendingScreens = sharingPeers.filter(id => !remoteScreenStreams[id])
  const [showRecConfirm, setShowRecConfirm] = useState(false)
  const isOwnRecording = Boolean(recordingActive && recordingBy && currentUser && recordingBy.id === currentUser.id)
  const callChannelName = useServerStore(s => s.currentChannel?.name)
  const [popout, setPopout] = useState(false)
    const [showVolumePanel, setShowVolumePanel] = useState(false)
    const formatCallTime = (ms: number) => {
      const s = Math.floor(ms / 1000)
      const m = Math.floor(s / 60)
      const sec = (s % 60).toString().padStart(2, '0')
      return `${m}:${sec}`
    }
  const [cameraOn, setCameraOn] = useState(() => {
    const { videoEnabled } = useCallStore.getState()
    const track = localStream?.getVideoTracks()[0]
    return track ? track.enabled : videoEnabled
  })
  const [camMenu, setCamMenu] = useState<{ x: number; y: number } | null>(null)
  const [micMenu, setMicMenu] = useState<{ x: number; y: number } | null>(null)
  const [qualityMenu, setQualityMenu] = useState(false)
  const [showAstroPlans, setShowAstroPlans] = useState(false)
  const [micDevices, setMicDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [selectedMic, setSelectedMic] = useState<string | null>(null)
  const [addMenu, setAddMenu] = useState(false)
  const [moreMenu, setMoreMenu] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const [winPos, setWinPos] = useState(() => ({ x: Math.max(16, window.innerWidth - 520), y: 56 }))
  const [showDebugWindow, setShowDebugWindow] = useState(false)
  const [liveStats, setLiveStats] = useState<LocalVideoStats>({ width: 0, height: 0, fps: 0, kind: null })
  const [minimized, setMinimized] = useState(false)
  // Relogio do painel de debug: hora atual + tempo decorrido da call, atualizado
  // a cada 1s. Ajuda a perceber bug de minutagem alta (createdAt errado).
  const [nowClock, setNowClock] = useState(() => Date.now())
  const callCreatedAt = useCallStore(s => s.createdAt)
  useEffect(() => {
    const t = window.setInterval(() => setNowClock(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!activeCall) return
    const refresh = () => setLiveStats(getLocalVideoStats())
    refresh()
    const t = window.setInterval(refresh, 1500)
    return () => window.clearInterval(t)
  }, [activeCall])

  const toggleCamera = () => {
    setCameraOn(prev => {
      const next = !prev
      const track = localStream?.getVideoTracks()[0]
      if (track) track.enabled = next
      try { useCallStore.getState().setVideoEnabled(next) } catch { /* ignore */ }
      return next
    })
  }

  const [focusedScreenId, setFocusedScreenId] = useState<string | null>(null)
  const allRemoteScreenIds = Object.keys(remoteScreenStreams)
  const screenUserId = allRemoteScreenIds.length > 0
    ? (allRemoteScreenIds.includes(focusedScreenId || '') ? focusedScreenId : allRemoteScreenIds[0])
    : null
  const isLocalScreen = Boolean(screenStream)
  const hasActiveScreen = isLocalScreen || Boolean(screenUserId)
  const screenLabel = screenUserId
    ? (participants.find(p => p.userId === screenUserId)?.userName || 'Usu�rio')
    : isLocalScreen ? 'Voc�' : ''
  const stageVideoId = screenUserId ? `call-video-screen-${screenUserId}` : 'call-video-screen-mini'
  const popoutVideoId = screenUserId ? 'call-video-screen-remote-focus' : 'call-video-screen-focus'
  const hasCamera = Boolean(localStream?.getVideoTracks().length)

  const dragging = (e: { clientX: number; clientY: number }) => {
    const startX = e.clientX
    const startY = e.clientY
    const start = winPos
    const onMove = (ev: PointerEvent) => {
      setWinPos({ x: start.x + (ev.clientX - startX), y: start.y + (ev.clientY - startY) })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  useEffect(() => {
    startAudioMonitor([
      ...Object.entries(remoteStreams).map(([userId, stream]) => ({ key: userId, stream })),
      ...(localStream && !muted && !deafened ? [{ key: 'local', stream: localStream }] : []),
    ])
  }, [remoteStreams, localStream, muted, deafened])

  useEffect(() => () => stopAudioMonitor(), [])

  useEffect(() => {
    if (controlling) setFocusedScreenId(controlling)
  }, [controlling])

  useEffect(() => {
    for (const [userId, stream] of Object.entries(remoteStreams)) {
      setSrc(`call-video-${userId}`, stream)
      setSrc(`call-audio-${userId}`, stream)
    }
    if (screenUserId && remoteScreenStreams[screenUserId]) setSrc('call-video-screen-remote-focus', remoteScreenStreams[screenUserId])
  }, [remoteStreams, remoteScreenStreams, screenUserId])

  const [mosaic, setMosaic] = useState(false)
  const [mosaicFocus, setMosaicFocus] = useState<string | null>(null)

  useEffect(() => {
    for (const [userId, stream] of Object.entries(remoteScreenStreams)) {
      setSrc(`call-video-screen-${userId}`, stream)
      setSrc(`call-screen-audio-${userId}`, stream)
    }
    // Os tiles do mosaico/destaque montam depois (ao abrir o mosaico ou
    // destacar): sem re-vincular aqui o video nasce sem srcObject (tela preta).
  }, [remoteScreenStreams, mosaic, mosaicFocus])

  useEffect(() => {
    setSrc('call-video-screen-mini', screenStream)
    setSrc('call-video-screen-focus', screenStream)
    setSrc('call-screen-audio-local', screenStream)
  }, [screenStream])

  useEffect(() => {
    setSrc('call-video-camera-mini', localStream)
  }, [localStream])

  const applyScreenMute = (userId: string, volume: number) => {
    const v = clampVolume(volume)
    const ids = [`call-screen-audio-${userId}`, `call-video-screen-${userId}`]
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLMediaElement | null
      if (el) { el.volume = v; el.muted = v <= 0 }
    }
  }
  useEffect(() => {
    for (const userId of Object.keys(remoteStreams)) {
      const el = document.getElementById(`call-audio-${userId}`) as HTMLAudioElement | null
      if (el) applyRemoteGain(el, clampVolume(volumes[userId]))
    }
    for (const userId of Object.keys(remoteScreenStreams)) {
      applyScreenMute(userId, volumes[`screen:${userId}`])
    }
    const local = document.getElementById('call-screen-audio-local') as HTMLAudioElement | null
    if (local) local.volume = 0
    const localVid = document.getElementById('call-video-screen-mini') as HTMLVideoElement | null
    if (localVid) localVid.volume = clampVolume(volumes['screen:local'])
    const remoteFocusVid = document.getElementById('call-video-screen-remote-focus') as HTMLVideoElement | null
    if (remoteFocusVid && screenUserId) remoteFocusVid.volume = clampVolume(volumes[`screen:${screenUserId}`])
    const localFocusVid = document.getElementById('call-video-screen-focus') as HTMLVideoElement | null
    if (localFocusVid) localFocusVid.volume = clampVolume(volumes['screen:local'])
  }, [volumes, remoteStreams, remoteScreenStreams, screenUserId, mosaicFocus])

  useEffect(() => {
    playRemoteAudio(remoteStreams, remoteScreenStreams)
  }, [remoteStreams, remoteScreenStreams])

  // Audio estilo TV: 'all' = todas as telas, 'spotlight' = s� a destacada,
  // 'muted' = todas silenciadas. mutedScreens = silenciadas individualmente.
  const [audioMode, setAudioMode] = useState<'all' | 'spotlight' | 'muted'>('all')
  const [mutedScreens, setMutedScreens] = useState<string[]>([])
  const baseVolumes = useRef(new Map<string, number>())

  const setScreenVolume = (id: string, v: number) => {
    baseVolumes.current.set(id, v)
    setMutedScreens(prev => (v <= 0 ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(x => x !== id)))
    setVolume(`screen:${id}`, v)
  }
  // Clicar/destacar = aquela tela toca, resto silencia (como trocar de canal)
  const selectScreen = (id: string) => {
    baseVolumes.current.set(id, baseVolumes.current.get(id) ?? 1)
    setMutedScreens(prev => prev.filter(x => x !== id))
    setMosaicFocus(id)
    setAudioMode('spotlight')
  }

  const effectiveFocus = mosaicFocus ?? screenUserId
  useEffect(() => {
    const ids = allRemoteScreenIds
    if (!ids || ids.length === 0) return
    ids.forEach(id => {
      const key = `screen:${id}`
      if (!baseVolumes.current.has(id)) {
        const cur = volumes[key]
        baseVolumes.current.set(id, typeof cur === 'number' ? cur : 1)
      }
      const base = baseVolumes.current.get(id) ?? 1
      let target = base
      if (audioMode === 'muted' || mutedScreens.includes(id)) target = 0
      else if (audioMode === 'spotlight' && effectiveFocus) target = id === effectiveFocus ? base : 0
      const cur = volumes[key]
      if ((cur === undefined ? 1 : cur) !== target) setVolume(key, target)
      // Aplica direto no elemento tamb�m (cobre remount entre renders)
      applyScreenMute(id, target)
    })
  }, [mosaicFocus, screenUserId, audioMode, mutedScreens, allRemoteScreenIds, volumes, setVolume])

  // Setas do teclado trocam de tela/audio como na TV (ignora digitacao)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const el = e.target as HTMLElement | null
      if (el && typeof el.closest === 'function' && el.closest('input,textarea,select,[contenteditable="true"]')) return
      const ids = Object.keys(useCallStore.getState().remoteScreenStreams || {})
      if (ids.length < 2) return
      e.preventDefault()
      const cur = mosaicFocus ?? screenUserId
      const idx = ids.indexOf(cur as string)
      const next = ids[((idx === -1 ? 0 : idx) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]
      baseVolumes.current.set(next, baseVolumes.current.get(next) ?? 1)
      setMutedScreens(prev => prev.filter(x => x !== next))
      setMosaicFocus(next)
      setAudioMode('spotlight')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mosaicFocus, screenUserId])

  useEffect(() => {
    const onGesture = () => {
      unlockAudio()
      playRemoteAudio(useCallStore.getState().remoteStreams, useCallStore.getState().remoteScreenStreams)
    }
    window.addEventListener('click', onGesture)
    window.addEventListener('touchstart', onGesture)
    window.addEventListener('pointerdown', onGesture)
    return () => {
      window.removeEventListener('click', onGesture)
      window.removeEventListener('touchstart', onGesture)
      window.removeEventListener('pointerdown', onGesture)
    }
  }, [])

  // Retry periodico de play enquanto houver midia remota (resolve autoplay tardio)
  useEffect(() => {
    if (!activeCall) return
    const timer = window.setInterval(() => {
      unlockAudio()
      playRemoteAudio(useCallStore.getState().remoteStreams, useCallStore.getState().remoteScreenStreams)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [activeCall])

  // Carrega dispositivos de microfono, aplica o salvo e detecta mic mudo a cada ~1s
  useEffect(() => {
    if (!activeCall) return
    let mounted = true
    const saved = localStorage.getItem('friends-space:mic')
    if (saved) setSelectedMic(saved)
    void getAudioInputDevices().then(devices => {
      if (!mounted) return
      setMicDevices(devices)
      if (saved && devices.length > 0 && !devices.some(d => d.deviceId === saved)) {
        const fallback = devices[0].deviceId
        localStorage.setItem('friends-space:mic', fallback)
        setSelectedMic(fallback)
      }
    })
    return () => { mounted = false }
  }, [activeCall])

  const { isFullscreen, fullscreenMode, toggleCallFullscreen: toggleFullscreen, exitCallFullscreen } = useCallFullscreen()
  const [screenMenu, setScreenMenu] = useState<{ x: number; y: number; userId: string | null } | null>(null)

  // Ctrl+Shift+C = parar controle; Ctrl+Shift+Z = cancelar modo remoto (sair da tela cheia)
  // F = alternar tela cheia; setas esquerda/direita = trocar de tela (modo normal, nao remoto)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.shiftKey && e.ctrlKey) {
        const key = e.key.toLowerCase()
        if (key === 'c') {
          if (!controlling) return
          e.preventDefault()
          stopControlling()
          return
        }
        if (key === 'z') {
          if (!controlling) return
          e.preventDefault()
          stopControlling()
          exitCallFullscreen()
          return
        }
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        if (typing) return
        e.preventDefault()
        void toggleFullscreen(screenUserId ? `screen:${screenUserId}` : 'screen', controlling ? 'remote' : 'normal')
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (typing || controlling) return
        const ids = allRemoteScreenIds
        if (ids.length < 2) return
        e.preventDefault()
        const cur = screenUserId || ids[0]
        const idx = ids.indexOf(cur)
        const next = (idx + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length
        setFocusedScreenId(ids[next])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, fullscreenMode, controlling, screenUserId, allRemoteScreenIds, stopControlling])

  const candidates = (friendUsers || [])
    .filter(user => user.id !== currentUser?.id)
    .filter(user => !participants.some(p => p.userId === user.id))
    .filter(user => {
      const q = addQuery.trim().toLowerCase()
      if (!q) return true
      return user.name.toLowerCase().includes(q) || (user.friendCode || '').toLowerCase().includes(q)
    })

  if (!activeCall) return null

  const fsKey = screenUserId ? `screen:${screenUserId}` : 'screen'
  const showMosaic = allRemoteScreenIds.length > 0 && mosaic && !popout && !controlling
  // Ids mutados (anel vermelho fixo nas telas): Set por render (N pequeno).
  const mutedIds = new Set<string>()
  try { for (const p of participants) { if (p.muted || (p as { deafened?: boolean }).deafened) mutedIds.add(p.userId) } } catch { }
  // Menu da PRÓPRIA tela (sem userId ou próprio id): sem mixer.
  const menuIsSelfScreen = !screenMenu?.userId || screenMenu.userId === currentUser?.id
  // Chave definitiva de tela cheia para a tela de um usuário: prefere o tile
  // do mosaico (quando visível) e cai no palco principal. ANTES, o menu de
  // botão direito sempre usava `mosaic-${id}` — fora do mosaico esse elemento
  // não existe e o botão "não funcionava" em silêncio.
  const fullscreenKeyFor = (userId: string | null): string => {
    try {
      if (userId && showMosaic && document.getElementById(`call-fs-mosaic-${userId}`)) {
        return `mosaic-${userId}`
      }
    } catch { }
    return fsKey
  }

  /* -- Dados do header + grade de participantes -- */
  const hasSelf = currentUser ? participants.some(p => p.userId === currentUser.id) : true
  const totalInCall = participants.length + (hasSelf ? 0 : 1)
  const callElapsed = callCreatedAt && callCreatedAt > 0 && nowClock >= callCreatedAt
    ? formatCallTime(nowClock - callCreatedAt)
    : '--:--'
  const callTitle = hasActiveScreen
    ? `Tela de ${screenLabel}`
    : callChannelName ? `# ${callChannelName}` : 'Chamada de voz'
  const localTile = currentUser ? {
    userId: currentUser.id,
    userName: currentUser.name,
    userPhoto: currentUser.photoUrl,
    muted,
    deafened,
    isSelf: true,
  } : null
  const remoteTiles = participants
    .filter(p => p.userId !== currentUser?.id)
    .map(p => ({ ...p, isSelf: false }))
  const tiles = [...(localTile ? [localTile] : []), ...remoteTiles]

  return (
    <>
      {showAstroPlans && <AstroPlansModal onClose={() => setShowAstroPlans(false)} />}
      {minimized ? (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 2500, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 999, boxShadow: '0 8px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#23a55a', animation: 'pulse 1.2s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Em chamada</span>
          <button onClick={() => setMinimized(false)} style={{ padding: '6px 14px', borderRadius: 7, background: 'var(--accent)', color: '#000', border: 'none', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Voltar</button>
          <button onClick={endCall} style={{ padding: '6px 14px', borderRadius: 7, background: '#f23f43', color: 'var(--text-primary)', border: 'none', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Sair da chamada</button>
        </div>
      ) : (
        <div className="vc-screen" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg-primary)' }}>
          <CameraOverlay />
          {recordingActive && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,.72)', border: '1px solid #ef4444', borderRadius: 999, padding: '7px 16px', fontSize: 12, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'fs-rec-blink 1.2s infinite' }} />
              <style>{`@keyframes fs-rec-blink { 0%,100% { opacity: 1 } 50% { opacity: .25 } }`}</style>
              {isOwnRecording ? 'Voc� est� gravando � todos foram avisados' : `${recordingBy?.name || 'Algu�m'} est� gravando esta call`}
            </div>
          )}
          {pendingScreens.map(id => (
            <div key={id} style={{ position: 'absolute', top: recordingActive ? 52 : 12, left: '50%', transform: 'translateX(-50%)', zIndex: 299, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,.72)', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 12, color: 'var(--accent)' }} />
              {participants.find(p => p.userId === id)?.userName || 'Usu�rio'} est� transmitindo � conectando...
            </div>
          ))}
          <div className={`vc-bg ${hasActiveScreen ? 'has-screenshare' : ''}`}>
            {hasActiveScreen && !popout && !showMosaic && (
              <div id={`call-fs-${fsKey}`} className="vc-main-screen" onContextMenu={e => { e.preventDefault(); setScreenMenu({ x: e.clientX, y: e.clientY, userId: screenUserId }) }}>
                <video id={stageVideoId} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: controlling === screenUserId ? 'fill' : 'contain', background: '#000' }} />
                {controlling && controlling === screenUserId && (
                  <RemoteControlOverlay onInput={sendControlInput} />
                )}
                {isFullscreen && fullscreenMode === 'normal' && (
                  <button onClick={() => exitCallFullscreen()} title="Minimizar (sair da tela cheia)" className="vc-fs-exit"><i className="fa-solid fa-minimize" style={{ fontSize: 14 }} /></button>
                )}
              </div>
            )}
            {showMosaic && (
              <div className="vc-mosaic">
                <div className="vc-mosaic-header">
                  <i className="fa-solid fa-grid-2" style={{ fontSize: 13 }} />
                  <span>Modo mosaico � todas as telas</span>
                  <div className="vc-mosaic-header-actions">
                    {mosaicFocus && (
                      <button onClick={() => setMosaicFocus(null)} title="Desfazer destaque (voltar a grade normal)">
                        <i className="fa-solid fa-xmark" style={{ fontSize: 11 }} /> Desfazer destaque
                      </button>
                    )}
                    <button onClick={() => { setMosaic(false); setMosaicFocus(null) }}>Voltar</button>
                  </div>
                </div>
                {mosaicFocus ? (
                  <div className="vc-mosaic-focused">
                    <div
                      className={`vc-mosaic-main${mutedIds.has(mosaicFocus) ? ' muted' : ''}`}
                      id={`call-fs-mosaic-${mosaicFocus}`}
                      key={mosaicFocus}
                      onClick={() => setMosaicFocus(null)}
                      onContextMenu={e => { e.preventDefault(); setScreenMenu({ x: e.clientX, y: e.clientY, userId: mosaicFocus }) }}
                      title="Clique para desfazer o destaque; botao direito: volume"
                    >
                      <video id={`call-video-screen-${mosaicFocus}`} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
                      <span className="vc-mosaic-label">{participants.find(p => p.userId === mosaicFocus)?.userName || 'Usu�rio'} <b style={{ color: 'var(--accent)' }}>� EM DESTAQUE</b></span>
                      {isFullscreen && typeof document !== 'undefined' && document.fullscreenElement?.id === `call-fs-mosaic-${mosaicFocus}` && (
                        <button
                          className="vc-fs-exit"
                          onClick={e => { e.stopPropagation(); exitCallFullscreen() }}
                          title="Minimizar (sair da tela cheia)"
                        ><i className="fa-solid fa-minimize" style={{ fontSize: 14 }} /></button>
                      )}
                    </div>
                    <div className="vc-mosaic-thumbs">
                      {allRemoteScreenIds.filter(u => u !== mosaicFocus).map(userId => (
                        <div
                          className={`vc-mosaic-tile vc-mosaic-tile-thumb${mutedIds.has(userId) ? ' muted' : ''}`}
                          id={`call-fs-mosaic-${userId}`}
                          key={userId}
                          onClick={() => selectScreen(userId)}
                          onContextMenu={e => { e.preventDefault(); setScreenMenu({ x: e.clientX, y: e.clientY, userId }) }}
                          title="Clique para destacar esta tela; botao direito: volume"
                        >
                          <video id={`call-video-screen-${userId}`} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
                          <span className="vc-mosaic-label">{participants.find(p => p.userId === userId)?.userName || 'Usu�rio'}</span>
                          {isFullscreen && typeof document !== 'undefined' && document.fullscreenElement?.id === `call-fs-mosaic-${userId}` && (
                            <button
                              className="vc-fs-exit"
                              onClick={e => { e.stopPropagation(); exitCallFullscreen() }}
                              title="Minimizar (sair da tela cheia)"
                            ><i className="fa-solid fa-minimize" style={{ fontSize: 14 }} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="vc-mosaic-grid">
                    {allRemoteScreenIds.map(userId => (
                      <div
                        className={`vc-mosaic-tile${mutedIds.has(userId) ? ' muted' : ''}`}
                        id={`call-fs-mosaic-${userId}`}
                        key={userId}
                        onClick={() => selectScreen(userId)}
                        onContextMenu={e => { e.preventDefault(); setScreenMenu({ x: e.clientX, y: e.clientY, userId }) }}
                        title="Clique para destacar a tela no centro; botao direito: volume"
                      >
                        <video id={`call-video-screen-${userId}`} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
                        <span className="vc-mosaic-label">{participants.find(p => p.userId === userId)?.userName || 'Usu�rio'}</span>
                        {isFullscreen && typeof document !== 'undefined' && document.fullscreenElement?.id === `call-fs-mosaic-${userId}` && (
                          <button
                            className="vc-fs-exit"
                            onClick={e => { e.stopPropagation(); exitCallFullscreen() }}
                            title="Minimizar (sair da tela cheia)"
                          ><i className="fa-solid fa-minimize" style={{ fontSize: 14 }} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasActiveScreen && !popout && !showMosaic && controlling !== screenUserId && (
              <div className="vc-topbar">
                <span className="vc-live-dot" />
                <i className="fa-solid fa-display" style={{ fontSize: 14, color: '#00ff88' }} />
                <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Tela de {screenLabel}</span>
                <span className="vc-aolive">AO VIVO</span>
                <span className="vc-call-time">{callElapsed}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isElectronDevice() && screenUserId && (
                    <button className="vc-topbar-btn" onClick={() => { if (controlling === screenUserId) { stopControlling(); setAnydeskMode(false) } else { requestControl(screenUserId); setAnydeskMode(true) } }} title={controlling === screenUserId ? 'Parar controle' : 'Controlar o PC de ' + screenLabel} style={controlling === screenUserId ? { background: '#00c853', color: '#04120a', borderColor: '#00c853', fontWeight: 700 } : undefined}>
                      <i className="fa-solid fa-hand-pointer" style={{ fontSize: 12 }} />
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{controlling === screenUserId ? 'Parar controle' : 'Controlar'}</span>
                    </button>
                  )}
                  {allRemoteScreenIds.length > 1 && (
                    <button className="vc-topbar-btn" onClick={() => setMosaic(true)} title="Modo mosaico (ver todas as telas ao mesmo tempo)"><i className="fa-solid fa-grid-2" style={{ fontSize: 12 }} /></button>
                  )}
                  <button className="vc-topbar-btn" onClick={() => setPopout(true)} title="Janela pop-up (sempre no topo)"><PictureInPicture2 size={14} strokeWidth={2} /></button>
                </div>
              </div>
            )}
            {!hasActiveScreen && !popout && (
              <>
                <div className="vc-call-header">
                  <span className="vc-live-dot" />
                  <span className="vc-call-title">{callTitle}</span>
                  <span className="vc-call-time">{callElapsed}</span>
                  <span className="vc-call-count">
                    <i className="fa-solid fa-user-group" style={{ fontSize: 10, marginRight: 5 }} />
                    {totalInCall}
                  </span>
                </div>
                <div className="vc-tiles">
                  {tiles.map(t => {
                    const speaking = Boolean(speakingUsers[t.userId]) && !t.muted
                    return (
                      <div key={t.userId} className={`vc-tile${speaking ? ' speaking' : ''}${t.muted || (t as { deafened?: boolean }).deafened ? ' muted-ring' : ''}`}>
                        <div className="vc-tile-ring">
                          <Avatar src={t.userPhoto} name={t.userName} size={84} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
                          <span className="vc-tile-name">{t.isSelf ? 'Voc�' : t.userName}</span>
                          {t.isSelf && <span className="vc-tile-you">VOC�</span>}
                        </div>
                        <span className={`vc-tile-status${t.muted || t.deafened ? ' off' : ''}`} title={t.deafened ? 'Com som desativado' : t.muted ? 'Mutado' : 'Falando / com �udio'}>
                          {t.deafened ? <HeadphoneOff size={13} /> : t.muted ? <MicOff size={13} /> : <Mic size={13} />}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {controlling !== screenUserId && (
            <div className="vc-bottom">
              <div className="vc-controls">
                <div className="vc-ctrl-group">
                  <button
                    className="vc-ctrl"
                    onClick={toggleMute}
                    onContextMenu={e => { e.preventDefault(); setMicMenu(micMenu ? null : { x: e.clientX, y: e.clientY }) }}
                    title={muted ? 'Ativar microfone (bot�o direito: trocar microfone)' : 'Desativar microfone (bot�o direito: trocar microfone)'}
                  >
                    <span className={`vc-btn ${muted ? 'muted' : ''}`}>
                      {muted ? <MicOff size={20} /> : <Mic size={20} />}
                    </span>
                    <span className="vc-ctrl-label">{muted ? 'Ativar' : 'Mutar'}</span>
                  </button>
                  <button
                    className="vc-ctrl"
                    onClick={toggleDeafen}
                    title={deafened ? 'Ativar som' : 'Desativar som'}
                  >
                    <span className={`vc-btn ${deafened ? 'muted' : ''}`}>
                      {deafened ? <VolumeX size={20} /> : <Headphones size={20} />}
                    </span>
                    <span className="vc-ctrl-label">{deafened ? 'Som off' : 'Som'}</span>
                  </button>
                  {hasCamera && (
                    <button
                      className="vc-ctrl"
                      onClick={toggleCamera}
                      onContextMenu={e => { e.preventDefault(); setCamMenu(camMenu ? null : { x: e.clientX, y: e.clientY }) }}
                      title={cameraOn ? 'Desligar c�mera (bot�o direito: op��es)' : 'Ligar c�mera (bot�o direito: op��es)'}
                    >
                      <span className={`vc-btn ${cameraOn ? 'active' : ''}`}>
                        {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
                      </span>
                      <span className="vc-ctrl-label">C�mera</span>
                    </button>
                  )}
                  <button
                    className="vc-ctrl"
                    onClick={() => { toggleScreenShare() }}
                    title={screenSharing ? 'Parar de compartilhar' : 'Compartilhar tela'}
                  >
                    <span className={`vc-btn ${screenSharing ? 'active' : ''}`}>
                      {screenSharing ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}
                    </span>
                    <span className="vc-ctrl-label">Tela</span>
                  </button>
                  <button
                    className="vc-ctrl"
                    onClick={() => { if (isOwnRecording) toggleRecording(); else if (!recordingActive) setShowRecConfirm(true) }}
                    title={isOwnRecording ? 'Parar grava��o' : recordingActive ? `Gravando por ${recordingBy?.name || 'outro participante'}` : 'Gravar call (avisa a todos)'}
                  >
                    <span className={`vc-btn ${isOwnRecording ? 'active' : ''}`} style={isOwnRecording ? { background: '#ef4444', color: '#fff' } : undefined}>
                      <i className="fa-solid fa-circle-dot" style={{ fontSize: 19 }} />
                    </span>
                    <span className="vc-ctrl-label">{isOwnRecording ? 'Gravando' : 'Gravar'}</span>
                  </button>
                </div>
                <div className="vc-ctrl-sep" />
                <div className="vc-ctrl-group">
                  <button className="vc-ctrl" onClick={() => setAddMenu(a => !a)} title="Adicionar / chamar pessoa">
                    <span className="vc-btn">
                      <UserPlus size={20} />
                    </span>
                    <span className="vc-ctrl-label">Chamar</span>
                  </button>
                  <button className="vc-ctrl" onClick={() => setMoreMenu(m => !m)} title="Mais op��es">
                    <span className={`vc-btn ${moreMenu ? 'active' : ''}`}>
                      <Ellipsis size={20} />
                    </span>
                    <span className="vc-ctrl-label">Mais</span>
                  </button>
                </div>
                <div className="vc-ctrl-sep" />
                <div className="vc-ctrl-group">
                  <button className="vc-ctrl" onClick={endCall} title="Sair da chamada">
                    <span className="vc-btn leave">
                      <PhoneOff size={24} />
                    </span>
                    <span className="vc-ctrl-label" style={{ color: '#ff8085' }}>Sair</span>
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>

          {showRecConfirm && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowRecConfirm(false)}>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 420, padding: 20 }} onClick={e => e.stopPropagation()}>
                <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Gravar esta call?</h4>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Todos os participantes ser�o avisados na hora (banner + som). A grava��o captura tela compartilhada + �udio de todos, em trechos de 1 min salvos s� no <b>seu</b> Google Drive (pasta Minhas Transmiss�es) � nada passa pelo servidor.
                </p>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  S� grave com o consentimento de todos (LGPD). Voc� pode parar a qualquer momento.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowRecConfirm(false)} style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--bg-tertiary)', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={() => { setShowRecConfirm(false); toggleRecording() }} style={{ padding: '9px 18px', borderRadius: 8, background: '#ef4444', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                    Gravar com aviso a todos
                  </button>
                </div>
              </div>
            </div>
          )}
          <button className="vc-debug-toggle" onClick={() => setShowDebugWindow(true)} title="Diagn�stico de conex�o" style={controlling === screenUserId ? { display: 'none' } : undefined}>
            <i className="fa-solid fa-bug" />
          </button>
          {showDebugWindow && <DebugWindow onClose={() => setShowDebugWindow(false)} />}

          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 11, display: 'flex', alignItems: 'center', gap: 6, ...(controlling === screenUserId ? { display: 'none' } : {}) }}>
            <button
              onClick={() => setQualityMenu(q => !q)}
              title="Qualidade de transmissao"
              style={{ fontSize: 11, fontWeight: 700, color: qualityMenu ? 'var(--accent)' : 'var(--text-secondary)', background: 'rgba(0,0,0,0.4)', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
            >
              {preferredQuality} {preferredFps} � {preferredBitrate >= 1000 ? `${(preferredBitrate / 1000).toFixed(preferredBitrate % 1000 === 0 ? 0 : 1)} Mbps` : `${preferredBitrate} kbps`} ?
            </button>
          </div>
        </div>
      )}

      {/* Palco da tela compartilhada (popout) */}
      {hasActiveScreen && popout && !minimized && (
        <div
          id={`call-fs-${fsKey}`}
          style={{
            position: 'fixed',
            left: winPos.x,
            top: winPos.y,
            width: 400,
            height: 260,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: '#000',
            zIndex: 2000,
            boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
          }}
          onContextMenu={e => { e.preventDefault(); setScreenMenu({ x: e.clientX, y: e.clientY, userId: screenUserId }) }}
        >
          <div onPointerDown={dragging} style={{ height: 30, flexShrink: 0, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 0 12px', cursor: 'grab', userSelect: 'none' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconScreenShare width={14} height={14} />
              Tela de {screenLabel}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setPopout(false)} title="Fechar pop-up" style={{ ...controlBtn, width: 28, height: 28, background: 'transparent', color: 'var(--text-secondary)' }}><IconClose width={14} height={14} /></button>
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative', background: '#000' }}>
            <video id={popoutVideoId} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: controlling === screenUserId ? 'fill' : 'contain' }} />
            {controlling && controlling === screenUserId && (
              <RemoteControlOverlay onInput={sendControlInput} />
            )}
          </div>
        </div>
      )}

      {screenMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 210 }} onClick={() => setScreenMenu(null)} />
          <div style={{ position: 'fixed', top: Math.min(screenMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 340), left: Math.min(screenMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 220), zIndex: 211, minWidth: 210, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            {!menuIsSelfScreen && (
              <>
                {screenMenu.userId && (
                  <>
                    <div style={{ padding: '7px 10px 3px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fa-solid fa-microphone" style={{ fontSize: 11 }} />
                      Volume da voz de {participants.find(p => p.userId === screenMenu.userId)?.userName || 'Usu�rio'}
                    </div>
                    <div style={{ padding: '4px 10px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <VolumeSlider value={clampVolume(volumes[screenMenu.userId])} onChange={v => { if (screenMenu.userId) setVolume(screenMenu.userId, v) }} />
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 34, textAlign: 'right' }}>{Math.round(clampVolume(volumes[screenMenu.userId as string]) * 100)}%</span>
                    </div>
                  </>
                )}
                <div style={{ padding: '7px 10px 3px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fa-solid fa-volume-high" style={{ fontSize: 11 }} />
                  Volume da tela de {screenMenu.userId ? (participants.find(p => p.userId === screenMenu.userId)?.userName || 'Usu�rio') : 'Voc�'}
                </div>
                <div style={{ padding: '4px 10px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <VolumeSlider value={clampVolume(volumes[screenMenu.userId ? `screen:${screenMenu.userId}` : 'screen:local'])} onChange={v => { if (screenMenu.userId) setScreenVolume(screenMenu.userId, v); else setVolume('screen:local', v) }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 34, textAlign: 'right' }}>{Math.round(clampVolume(volumes[screenMenu.userId ? `screen:${screenMenu.userId}` : 'screen:local']) * 100)}%</span>
                </div>
                <button onClick={() => { setVolume(screenMenu.userId ? `screen:${screenMenu.userId}` : 'screen:local', 0); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  <i className="fa-solid fa-volume-xmark" style={{ fontSize: 12 }} />
                  Silenciar tela
                </button>
              </>
            )}
            {screenMenu.userId && (
              <>
                <div style={{ borderTop: '1px solid #1e1f22', margin: '4px 0' }} />
                <div style={{ padding: '7px 10px 3px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
                  �udio: {audioMode === 'spotlight' ? 's� a destacada' : audioMode === 'muted' ? 'todas silenciadas' : 'todas as telas'}
                </div>
                <button onClick={() => { const id = screenMenu.userId as string; selectScreen(id); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  ?? Ouvir s� esta tela
                </button>
                <button onClick={() => { const id = screenMenu.userId as string; setMosaicFocus(id); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  ? Destacar esta tela
                </button>
                <button onClick={() => { const id = screenMenu.userId as string; setMutedScreens(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  {screenMenu.userId && mutedScreens.includes(screenMenu.userId) ? '?? Reativar esta tela' : '?? Silenciar esta tela'}
                </button>
                <button onClick={() => { setMutedScreens([]); setAudioMode('all'); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  ?? Ouvir todas as telas
                </button>
                <button onClick={() => { setAudioMode('muted'); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  ?? Silenciar todas as telas
                </button>
                <button onClick={() => { const id = screenMenu.userId as string; setScreenMenu(null); void toggleFullscreen(fullscreenKeyFor(id), 'normal') }} style={{ width: '100%', display: screenMenu.userId && screenMenu.userId !== currentUser?.id ? 'flex' : 'none', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  <i className="fa-solid fa-expand" style={{ fontSize: 12 }} />
                  Tela cheia
                </button>
              </>
            )}
            {menuIsSelfScreen && isLocalScreen && (
              <button onClick={() => { const on = localStorage.getItem('friends-space:screen-audio') !== '0'; try { useCallStore.getState().setScreenAudioEnabled(!on) } catch { }; setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                <i className="fa-solid fa-music" style={{ fontSize: 12 }} />
                {localStorage.getItem('friends-space:screen-audio') !== '0' ? 'Parar de compartilhar �udio da tela' : 'Compartilhar �udio da tela'}
              </button>
            )}
            <div style={{ borderTop: '1px solid #1e1f22', margin: '4px 0' }} />
            <div style={{ padding: '7px 10px 3px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Qualidade instant�nea � {getStreamPlanLabel(currentUser).label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 10px 8px' }}>
              {(['480p', '720p', '1080p', '2k', '4k'] as const).map(q => {
                const blocked = isQualityBlocked(currentUser, q)
                const active = preferredQuality === q
                return (
                  <button key={q} disabled={blocked} onClick={() => { void setPreferredQuality(q) }} title={blocked ? 'Bloqueado no seu plano' : 'Troca instant�nea'} style={{ padding: '6px 10px', borderRadius: 6, background: active ? 'var(--accent)' : 'var(--bg-secondary)', color: active ? '#04120a' : 'var(--text-primary)', border: 'none', fontWeight: 700, fontSize: 12, cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.55 : 1 }}>
                    {blocked ? `??${q}` : q}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 10px 8px' }}>
              <select value={preferredFps} onChange={e => { void setPreferredFps(Number(e.target.value) as never) }} style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, fontSize: 12 }}>
                {([30, 60] as const).map(f => <option key={f} value={f} disabled={currentUser ? f > getMaxStreamFps(currentUser) : false}>{f > (currentUser ? getMaxStreamFps(currentUser) : 30) ? `??${f}fps` : `${f}fps`}</option>)}
              </select>
              <select value={preferredBitrate} onChange={e => { void setPreferredBitrate(Number(e.target.value)) }} style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, fontSize: 12 }}>
                {[2000, 4000, 6000, 8000, 12000, 16000, 25000, 35000, 45000].map(k => <option key={k} value={k} disabled={currentUser ? k > getMaxBitrateKbps(currentUser) : false}>{k >= 1000 ? `${k / 1000}M` : `${k}k`}</option>)}
              </select>
            </div>
            <div style={{ borderTop: '1px solid #1e1f22', margin: '4px 0', }} />
            <button onClick={() => { setPopout(!popout); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
              {popout ? '?? Fechar pop-out' : '?? Abrir pop-out'}
            </button>
            {mosaic && (
              <button onClick={() => { setMosaic(false); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                <i className="fa-solid fa-grid-2" style={{ fontSize: 12 }} /> Sair do mosaico
              </button>
            )}
          </div>
        </>
      )}

      {micMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onClick={() => setMicMenu(null)} />
          <div style={{ position: 'fixed', top: Math.min(micMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 220), left: Math.max(8, micMenu.x - 220), zIndex: 120, minWidth: 220, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '7px 10px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Microfone</div>
            {micDevices.length === 0 && <div style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 12 }}>Nenhum dispositivo encontrado</div>}
            {micDevices.map(device => (
              <button
                key={device.deviceId}
                onClick={() => { setSelectedMic(device.deviceId); localStorage.setItem('friends-space:mic', device.deviceId); void switchMicDevice(device.deviceId).catch(() => { }); setMicMenu(null) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: selectedMic === device.deviceId ? 'var(--accent)' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}
              >
                <i className="fa-solid fa-microphone" style={{ fontSize: 12, opacity: selectedMic === device.deviceId ? 1 : 0.3 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.label}</span>
              </button>
            ))}
            {getAstroTier(currentUser) !== 'none' && isCleanAudioSupported() && (
              <button
                onClick={() => { void setCleanAudioEnabled(!isCleanAudioEnabledPref()).catch(() => { }); setMicMenu(null) }}
                title="Remove ruido de fundo com IA (RNNoise). Vale na hora e nas proximas calls."
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: isCleanAudioEnabledPref() ? 'var(--accent)' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}
              >
                <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: 12, opacity: isCleanAudioEnabledPref() ? 1 : 0.3 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isCleanAudioEnabledPref() ? '? �udio limpo ativado' : '�udio limpo (BETA)'}</span>
              </button>
            )}
          </div>
        </>
      )}

      {camMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onClick={() => setCamMenu(null)} />
          <div style={{ position: 'fixed', top: Math.min(camMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 380), left: Math.max(8, camMenu.x - 180), zIndex: 120, minWidth: 220, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', maxHeight: 380, overflowY: 'auto' }}>
            <button onClick={() => { toggleCamera(); setCamMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
              <i className="fa-solid fa-video" style={{ fontSize: 12 }} />
              {cameraOn ? 'Desligar camera' : 'Ligar camera'}
            </button>
            {hasCamera && (
              <>
                <div style={{ padding: '7px 10px 3px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Modo da camera</div>
                {([['casual', 'Casual'], ['empresa', 'Empresa'], ['full', 'Tela cheia']] as [CameraMode, string][]).map(([value, label]) => (
                  <button key={value} onClick={() => { setCameraMode(value); setCamMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: getCameraMode() === value ? 'var(--accent)' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                    <i className={`fa-solid ${value === 'casual' ? 'fa-user' : value === 'empresa' ? 'fa-briefcase' : 'fa-maximize'}`} style={{ fontSize: 12 }} />
                    {label}
                  </button>
                ))}
                {getCameraMode() !== 'full' && (
                  <>
                    <div style={{ padding: '7px 10px 3px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Posicao</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      {CAMERA_POSITIONS.map(pos => (
                        <button key={pos.value} onClick={() => { setCameraPosition(pos.value); setCamMenu(null) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 6, color: getCameraPosition() === pos.value ? 'var(--accent)' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 12, cursor: 'pointer' }} title={pos.label}>
                          <i className={pos.icon} style={{ fontSize: 10 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {moreMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onClick={() => setMoreMenu(false)} />
          <div style={{ position: 'fixed', bottom: 118, left: '50%', transform: 'translateX(-50%)', zIndex: 120, width: 270, background: 'rgba(13,16,20,0.95)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 6, boxShadow: '0 18px 50px rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)' }}>
            <div style={{ padding: '8px 12px 4px', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Mais op��es</div>
            {([
              { icon: <Volume2 size={16} />, label: 'Volume dos participantes', desc: 'Ajustar voz de cada um', active: showVolumePanel, onClick: () => { setShowVolumePanel(s => !s); setMoreMenu(false) } },
              { icon: <Gauge size={16} />, label: 'Qualidade de transmiss�o', desc: `${preferredQuality} � ${preferredFps} fps`, active: qualityMenu, onClick: () => { setQualityMenu(q => !q); setMoreMenu(false) } },
              { icon: <Settings size={16} />, label: 'Configura��es', desc: 'Abrir ajustes do app', active: false, onClick: () => { useSettingsStore.getState().openSettings(); setMoreMenu(false) } },
              { icon: <Minus size={16} />, label: 'Minimizar chamada', desc: 'Continuar em segundo plano', active: false, onClick: () => { setMinimized(true); setMoreMenu(false) } },
            ] as const).map(item => (
              <button
                key={item.label}
                onClick={item.onClick}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 10, background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ width: 34, height: 34, borderRadius: 10, background: item.active ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: item.active ? '#00ff88' : '#fff' }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#fff' }}>{item.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{item.desc}</span>
                </span>
                {item.active && <Check size={14} color="#00ff88" />}
              </button>
            ))}
          </div>
        </>
      )}

      {addMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onClick={() => setAddMenu(false)} />
          <div style={{ position: 'fixed', bottom: 92, right: 24, zIndex: 120, width: 280, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Adicionar a chamada</div>
            <input value={addQuery} onChange={e => setAddQuery(e.target.value)} placeholder="Buscar amigo..." style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 6 }} />
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {candidates.length === 0 && (
                <div style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 12 }}>{addQuery ? 'Nenhum amigo encontrado.' : 'Nenhum amigo disponivel para chamar.'}</div>
              )}
              {candidates.map(user => (
                <button key={user.id} onClick={() => { void inviteToCall(user.id); setAddMenu(false); setAddQuery('') }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = '#1a1b1e')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <Avatar src={user.photoUrl} name={user.name} size={30} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
                  <i className="fa-solid fa-user-plus" style={{ color: 'var(--accent)', fontSize: 12 }} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {qualityMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onClick={() => setQualityMenu(false)} />
          <div style={{ position: 'fixed', top: Math.max(8, (typeof window !== 'undefined' ? window.innerHeight : 600) - 240), left: Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 800) - 220), zIndex: 120, minWidth: 200, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '7px 10px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-tower-broadcast" style={{ fontSize: 11 }} /> Qualidade de transmissao
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: getStreamPlanLabel(currentUser).color, fontWeight: 700 }}>{getStreamPlanLabel(currentUser).label}</span>
            </div>
            <div style={{ padding: '2px 10px 6px', fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-video" style={{ fontSize: 10 }} />
              Atual: <b style={{ color: 'var(--text-secondary)' }}>{preferredQuality} � {preferredFps} fps � {preferredBitrate >= 1000 ? `${(preferredBitrate / 1000).toFixed(preferredBitrate % 1000 === 0 ? 0 : 1)} Mbps` : `${preferredBitrate} kbps`}</b>
            </div>
            {(['480p', '720p', '1080p', '2k', '4k'] as const).map(quality => {
              const blocked = isQualityBlocked(currentUser, quality)
              return (
                <button key={quality} disabled={blocked} onClick={() => { setPreferredQuality(quality); setQualityMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: preferredQuality === quality ? 'var(--accent)' : blocked ? '#4a4d52' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.55 : 1 }} title={blocked ? `Qualidade bloqueada no seu plano ${getStreamPlanLabel(currentUser).label}. Assine ASTRO+ para liberar.` : undefined}>
                  {preferredQuality === quality ? '?' : (blocked ? <i className="fa-solid fa-lock" style={{ width: 16, fontSize: 11, color: '#4a4d52' }} /> : <span style={{ width: 16 }} />)}
                  {quality}
                  {blocked && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a4d52' }}>bloqueado</span>}
                </button>
              )
            })}
            <div style={{ padding: '7px 10px 0', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Quadros por segundo</div>
            {([30, 60] as const).map(fps => {
              const blocked = fps > getMaxStreamFps(currentUser)
              return (
                <button key={fps} disabled={blocked} onClick={() => { void setPreferredFps(fps); setQualityMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: preferredFps === fps ? 'var(--accent)' : blocked ? '#4a4d52' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.55 : 1 }} title={blocked ? '60 FPS bloqueado no seu plano. Assine ASTRO para liberar.' : undefined}>
                  {preferredFps === fps ? '?' : (blocked ? <i className="fa-solid fa-lock" style={{ width: 16, fontSize: 11, color: '#4a4d52' }} /> : <span style={{ width: 16 }} />)}
                  {fps} fps
                  {blocked && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a4d52' }}>bloqueado</span>}
                </button>
              )
            })}
            <div style={{ padding: '7px 10px 0', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Bitrate</div>
            {([2000, 4000, 6000, 8000, 12000, 16000, 25000, 35000, 45000] as const).map(kbps => {
              const bitrateBlocked = kbps > getMaxBitrateKbps(currentUser)
              return (
              <button key={kbps} disabled={bitrateBlocked} onClick={() => { void setPreferredBitrate(kbps); setQualityMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: preferredBitrate === kbps ? 'var(--accent)' : bitrateBlocked ? '#4a4d52' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: bitrateBlocked ? 'not-allowed' : 'pointer', opacity: bitrateBlocked ? 0.55 : 1 }} title={bitrateBlocked ? 'Bitrate bloqueado no seu plano. Assine ASTRO+ para liberar.' : undefined}>
                {preferredBitrate === kbps ? '?' : (bitrateBlocked ? <i className="fa-solid fa-lock" style={{ width: 16, fontSize: 11, color: '#4a4d52' }} /> : <span style={{ width: 16 }} />)}
                {kbps >= 1000 ? `${(kbps / 1000).toFixed(kbps % 1000 === 0 ? 0 : 1)} Mbps` : `${kbps} kbps`}
                {bitrateBlocked && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a4d52' }}>bloqueado</span>}
              </button>
            )})}
            <div style={{ padding: '6px 10px 0', color: 'var(--text-muted)', fontSize: 10.5 }}>Video e tela compartilhada</div>
            <div style={{ padding: '2px 10px 8px', color: liveStats.width > 0 ? '#4ade80' : 'var(--text-muted)', fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              {liveStats.width > 0 && <i className="fa-solid fa-circle" style={{ fontSize: 5 }} />}
              {liveStats.width > 0
                ? `Ao vivo: ${liveStats.width}x${liveStats.height} @ ${liveStats.fps} fps (${liveStats.kind === 'screen' ? 'tela' : 'camera'})`
                : 'Sem video ativo no momento'}
            </div>
          </div>
        </>
      )}

      {/* Volume por participante (voz + telas) */}
      {showVolumePanel && (
        <div style={{ position: 'fixed', bottom: 74, right: 24, zIndex: 120, width: 'min(300px, calc(100vw - 48px))', padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--text-primary)', fontSize: 12, fontWeight: 700 }}>
            <IconVolume width={14} height={14} style={{ color: 'var(--text-secondary)' }} />
            Volumes
          </div>
          {participants.filter(p => p.userId !== currentUser?.id).length === 0 && Object.keys(remoteScreenStreams).length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '4px 0' }}>Ningu�m mais na chamada.</div>
          )}
          {participants.filter(p => p.userId !== currentUser?.id).map(p => (
            <div key={`vol-${p.userId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <Avatar src={p.userPhoto} name={p.userName} size={20} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>{p.userName}</span>
              <VolumeSlider value={clampVolume(volumes[p.userId])} onChange={v => setVolume(p.userId, v)} />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>{Math.round(clampVolume(volumes[p.userId]) * 100)}%</span>
            </div>
          ))}
          {Object.keys(remoteScreenStreams).map(userId => (
            <div key={`vol-screen-${userId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <i className="fa-solid fa-display" style={{ fontSize: 12, color: 'var(--accent)', width: 20, textAlign: 'center' }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>Tela de {participants.find(p => p.userId === userId)?.userName || 'Algu�m'}</span>
              <VolumeSlider value={clampVolume(volumes[`screen:${userId}`])} onChange={v => setScreenVolume(userId, v)} />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>{Math.round(clampVolume(volumes[`screen:${userId}`]) * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Audio remoto e mantido pelo CallAudioLayer (persiste fora da tela da call) */}
      {participants.filter(p => p.userId !== currentUser?.id).map(p => (
        <video key={p.userId} id={`call-video-${p.userId}`} autoPlay muted playsInline style={{ position: 'absolute', width: 1, height: 1, left: -9999 }} />
      ))}
      <UserContextMenu />

      {screenError && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 200, background: '#ed4245', color: 'var(--text-primary)', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{screenError}</span>
          <button onClick={clearScreenError} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: 'var(--text-primary)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>OK</button>
        </div>
      )}

      {controlledBy && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 210, background: '#f0b232', color: '#000', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <i className="fa-solid fa-hand-pointer" />
          <span>Alguem esta controlando seu PC</span>
          <button onClick={revokeControl} style={{ background: '#ed4245', color: 'var(--text-primary)', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
            Revogar agora
          </button>
        </div>
      )}

      {controlRequests.length > 0 && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 230, width: 'min(380px, calc(100vw - 32px))', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', color: 'var(--text-primary)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
          <i className="fa-solid fa-hand-pointer" style={{ fontSize: 28, color: 'var(--accent)', marginBottom: 10 }} />
          <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{controlRequests[0].userName || 'Alguem'} quer controlar seu PC</h3>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-secondary)' }}>Aceitar permite que a pessoa mova o mouse e digite no seu computador durante a chamada.</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <button onClick={() => acceptControlRequest(controlRequests[0].peerId)} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Aceitar</button>
            <button onClick={() => denyControlRequest(controlRequests[0].peerId)} style={{ background: '#f23f43', color: 'var(--text-primary)', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Recusar</button>
          </div>
        </div>
      )}

    </>
  )
}
