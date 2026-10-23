import { Fa } from '../../utils/fa'
import { WatchPartyBar } from './WatchPartyBar'
import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { IconScreenShare, IconVolume, IconClose } from '../../utils/icons'
import { useCallStore, CALL_PROTO, consumeCallViewOpenRequest } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'
import { useFriendStore } from '../../stores/friendStore'
import { Avatar } from '../ui/Avatar'
import { startAudioMonitor, stopAudioMonitor } from '../../services/audioMonitor'
import { unlockAudio } from '../../services/audioUnlock'
import DebugWindow from '../Debug/DebugWindow'
import { getLocalVideoStats, type LocalVideoStats } from '../../stores/callStore'
import { getAudioInputDevices } from '../../services/antiloud'
import { applyRemoteGain } from '../../services/antiloud'
import { useSettingsStore } from '../../stores/settingsStore'
import { useServerStore } from '../../stores/serverStore'
import {
  Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff,
  Headphones, HeadphoneOff, VolumeX, Volume2, PhoneOff, UserPlus, Ellipsis,
  Settings, Gauge, Check, PictureInPicture2, Minimize2, Maximize2, LayoutGrid, X, Presentation, Gamepad2,
} from 'lucide-react'
import { ActivityModal } from './ActivityModal'
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

const clampVolume = (v?: number) => (typeof v === 'number' && !Number.isNaN(v) ? Math.min(2, Math.max(0, v)) : 1)

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      min={0}
      max={200}
      value={Math.round(value * 100)}
      onChange={event => onChange(Number(event.target.value) / 100)}
      style={{ width: 110, accentColor: 'var(--accent)' }}
      title="Volume (até 200%)"
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

export function CallView({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    activeCall, participants, muted, deafened, screenSharing,
    screenStream, localStream, preferredQuality, preferredFps, preferredBitrate,
    remoteStreams, remoteScreenStreams, volumes, screenError,
    toggleMute, toggleDeafen, toggleScreenShare, setVolume, endCall, switchMicDevice, setPreferredQuality, setPreferredFps, setPreferredBitrate, clearScreenError, setCleanAudioEnabled,
    toggleRecording,
    controlRequests, controlling, controlledBy, controlSettings, setControlSettings,
    requestControl, acceptControlRequest, denyControlRequest, sendControlInput, stopControlling, revokeControl,
    inviteToCall, setAnydeskMode, startMeeting,
  } = useCallStore()
  const { currentUser } = useUserStore()
  const { friendUsers } = useFriendStore()
  const speakingUsers = useCallStore(s => s.speakingUsers)
  const callingUser = useCallStore(s => s.callingUser)
  const recordingActive = useCallStore(s => s.recordingActive)
  const recordingBy = useCallStore(s => s.recordingBy)
  const sharingPeers = useCallStore(s => s.sharingPeers)
  const peerProtos = useCallStore(s => s.peerProtos)
  const stalePeers = participants.filter(p => { const v = peerProtos[p.userId]; return typeof v === 'number' && v !== CALL_PROTO })
  const pendingScreens = sharingPeers.filter(id => !remoteScreenStreams[id])
  const [showRecConfirm, setShowRecConfirm] = useState(false)
  const [activitiesOpen, setActivitiesOpen] = useState(false)
  const isOwnRecording = Boolean(recordingActive && recordingBy && currentUser && recordingBy.id === currentUser.id)
  const callChannelName = useServerStore(s => s.currentChannel?.name)
  const callServerId = useCallStore(s => s.serverId)
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
  // Call DM embutida na conversa: o chat fica visivel durante a call (sem card
  // flutuante). O painel "Voz conectada" (VoicePanel) pede para abrir a visao
  // da call — via evento (ja montado) ou pedido pendente (clique antes de
  // montar, ex.: voltando de outra tela).
  const [embeddedExpanded, setEmbeddedExpanded] = useState(false)
  useEffect(() => {
    if (!embedded) return
    const open = () => setEmbeddedExpanded(true)
    if (consumeCallViewOpenRequest()) setEmbeddedExpanded(true)
    window.addEventListener('friends-space:open-call', open)
    return () => window.removeEventListener('friends-space:open-call', open)
  }, [embedded])
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
  const totalScreens = allRemoteScreenIds.length + (isLocalScreen ? 1 : 0)
  const hasActiveScreen = isLocalScreen || Boolean(screenUserId)
  const screenLabel = screenUserId
    ? (participants.find(p => p.userId === screenUserId)?.userName || 'Usuário')
    : isLocalScreen ? 'Você' : ''
  const stageVideoId = screenUserId ? `call-video-screen-${screenUserId}` : 'call-video-screen-mini'
  const popoutVideoId = screenUserId ? 'call-video-screen-remote-focus' : 'call-video-screen-focus'
  const hasCamera = Boolean(localStream?.getVideoTracks().length)
  const anyRemoteVideo = Object.values(remoteStreams).some(s => { try { return s.getVideoTracks().length > 0 } catch { return false } })
  const anyVideo = hasCamera || anyRemoteVideo
  // Card compacto: so em call DM embutida de VOZ. Com video/tela ativos (ou
  // expandido pelo usuario) renderiza a tela cheia para nao quebrar o palco.
  const embeddedCompact = embedded && !embeddedExpanded && !hasActiveScreen && !anyVideo

  // Mosaico e o layout PADRAO quando ha 2+ telas (a pessoa compartilhando ve
  // todas as telas em grade + faixa de pessoas embaixo). "Sair do mosaico"
  // (menu) volta ao palco de tela unica antigo quando quiser.
  const [mosaic, setMosaic] = useState(true)
  const [mosaicFocus, setMosaicFocus] = useState<string | null>(null)
  const [cameraStage, setCameraStage] = useState<string | null>(null)
  const [cameraMosaic, setCameraMosaic] = useState(false)
  const showMosaic = totalScreens > 1 && mosaic && !popout && !controlling
  type CameraTile = { userId: string; userName: string; stream: MediaStream | null; isSelf: boolean }
  const cameraTiles: CameraTile[] = [
    ...(hasCamera && cameraOn && currentUser ? [{ userId: currentUser.id, userName: 'Você', stream: localStream, isSelf: true }] : []),
    ...participants
      .filter(person => person.userId !== currentUser?.id)
      .map((person): CameraTile | null => {
        const stream = remoteStreams[person.userId] || null
        let hasVideo = false
        try { hasVideo = Boolean(stream && stream.getVideoTracks().length > 0) } catch { hasVideo = false }
        return hasVideo ? { userId: person.userId, userName: person.userName, stream, isSelf: false } : null
      })
      .filter((person): person is CameraTile => Boolean(person)),
  ]
  const focusedCamera = cameraStage ? cameraTiles.find(person => person.userId === cameraStage) || null : null

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
      setSrc(`call-tile-${userId}`, stream)
    }
    if (screenUserId && remoteScreenStreams[screenUserId]) setSrc('call-video-screen-remote-focus', remoteScreenStreams[screenUserId])
  }, [remoteStreams, remoteScreenStreams, screenUserId])

  useEffect(() => {
    for (const [userId, stream] of Object.entries(remoteScreenStreams)) {
      setSrc(`call-video-screen-${userId}`, stream)
      setSrc(`call-screen-audio-${userId}`, stream)
    }
    setSrc('call-video-screen-local', screenStream)
    // Os tiles do mosaico/destaque montam depois (ao abrir o mosaico ou
    // destacar): sem re-vincular aqui o video nasce sem srcObject (tela preta).
  }, [remoteScreenStreams, mosaic, mosaicFocus, showMosaic, screenStream])

  useEffect(() => {
    setSrc('call-video-screen-mini', screenStream)
    setSrc('call-video-screen-focus', screenStream)
    setSrc('call-video-screen-local', screenStream)
    setSrc('call-screen-audio-local', screenStream)
  }, [screenStream])

  useEffect(() => {
    setSrc('call-video-camera-mini', localStream)
  }, [localStream])

  const applyScreenMute = (userId: string, volume: number) => {
    const ids = [`call-screen-audio-${userId}`, `call-video-screen-${userId}`]
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLMediaElement | null
      if (el) applyRemoteGain(el, clampVolume(volume))
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
    if (localVid) applyRemoteGain(localVid, clampVolume(volumes['screen:local']))
    const remoteFocusVid = document.getElementById('call-video-screen-remote-focus') as HTMLVideoElement | null
    if (remoteFocusVid && screenUserId) applyRemoteGain(remoteFocusVid, clampVolume(volumes[`screen:${screenUserId}`]))
    const localFocusVid = document.getElementById('call-video-screen-focus') as HTMLVideoElement | null
    if (localFocusVid) applyRemoteGain(localFocusVid, clampVolume(volumes['screen:local']))
  }, [volumes, remoteStreams, remoteScreenStreams, screenUserId, mosaicFocus])

  useEffect(() => {
    playRemoteAudio(remoteStreams, remoteScreenStreams)
  }, [remoteStreams, remoteScreenStreams])

  // Audio estilo TV: 'all' = todas as telas, 'spotlight' = só a destacada,
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
      // Aplica direto no elemento também (cobre remount entre renders)
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

  // Aceitou controle: entra em tela cheia sozinho (modo remoto) e sai ao parar.
  useEffect(() => {
    const onStarted = () => {
      try {
        if (!useCallStore.getState().controlling) return
        if (document.fullscreenElement) return
        void toggleFullscreen(screenUserId ? `screen:${screenUserId}` : 'screen', 'remote')
      } catch { }
    }
    const onStopped = () => { try { exitCallFullscreen() } catch { } }
    window.addEventListener('friends-space:control-started', onStarted)
    window.addEventListener('friends-space:control-stopped', onStopped)
    return () => {
      window.removeEventListener('friends-space:control-started', onStarted)
      window.removeEventListener('friends-space:control-stopped', onStopped)
    }
  }, [screenUserId, toggleFullscreen])
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
  // Foco valido: ignora id que sumiu (parou de compartilhar) e aceita a tela local.
  const mosaicFocusValid = mosaicFocus
    ? (mosaicFocus === 'local' ? (isLocalScreen ? mosaicFocus : null) : (allRemoteScreenIds.includes(mosaicFocus) ? mosaicFocus : null))
    : null
  const mosaicThumbIds = [
    ...(isLocalScreen && mosaicFocusValid !== 'local' ? ['local'] : []),
    ...allRemoteScreenIds.filter(u => u !== mosaicFocusValid),
  ]
  // Nome para rotular uma tela do mosaico (local = "Sua tela").
  const screenNameFor = (id: string) => id === 'local'
    ? 'Sua tela'
    : (participants.find(p => p.userId === id)?.userName || 'Usuário')
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
  // Enquanto a pessoa esta sendo CHAMADA (ainda nao atendeu/entrou), ela NAO
  // conta/nao aparece como participante: tile e contagem so entram quando a
  // stream dela chega (entrou de verdade). Antes ela ja surgia "presente".
  const ringingTargetId = callingUser?.userId
  const ringingNotJoined = Boolean(ringingTargetId && !remoteStreams[ringingTargetId]
    && participants.some(p => p.userId === ringingTargetId))
  const hasSelf = currentUser ? participants.some(p => p.userId === currentUser.id) : true
  const totalInCall = participants.length + (hasSelf ? 0 : 1) - (ringingNotJoined ? 1 : 0)
  const callElapsed = callCreatedAt && callCreatedAt > 0 && nowClock >= callCreatedAt
    ? formatCallTime(nowClock - callCreatedAt)
    : '--:--'
  const dmPeer = callServerId === 'dm' ? participants.find(p => p.userId !== currentUser?.id) : undefined
  const callTitle = hasActiveScreen
    ? `Tela de ${screenLabel}`
    : callServerId === 'dm'
      ? (dmPeer?.userName ? `${dmPeer.userName}` : 'Chamada privada')
      : callChannelName ? `# ${callChannelName}` : 'Chamada de voz'
  const localTile = currentUser ? {
    userId: currentUser.id,
    userName: currentUser.name,
    userPhoto: currentUser.photoUrl,
    muted,
    deafened,
    isSelf: true,
  } : null
  // O tile dela so aparece quando ela realmente entra (stream ativa).
  const remoteTiles = participants
    .filter(p => p.userId !== currentUser?.id)
    .filter(p => !(ringingTargetId === p.userId && !remoteStreams[p.userId]))
    .map(p => ({ ...p, isSelf: false }))
  const tiles = [...(localTile ? [localTile] : []), ...remoteTiles]
  const tileCols = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : tiles.length <= 9 ? 3 : 4

  return (
    <>
      {showAstroPlans && <AstroPlansModal onClose={() => setShowAstroPlans(false)} />}
      {embeddedCompact ? null : (
        <div className="vc-screen" style={{ position: embedded ? 'absolute' : 'fixed', inset: 0, zIndex: embedded ? (embeddedExpanded ? 30 : 20) : 100, background: 'var(--bg-primary)', borderRadius: embedded ? 12 : 0, overflow: 'hidden' }}>
          <CameraOverlay />
          {embedded && embeddedExpanded && !hasActiveScreen && !anyVideo && (
            <button onClick={() => setEmbeddedExpanded(false)} title="Voltar para o chat" style={{ position: 'absolute', top: 12, right: 12, zIndex: 400, width: 34, height: 34, borderRadius: 10, background: 'rgba(0,0,0,0.55)', border: '1px solid var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Minimize2 size={15} strokeWidth={2.2} />
            </button>
          )}
          {recordingActive && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,.72)', border: '1px solid #ef4444', borderRadius: 999, padding: '7px 16px', fontSize: 12, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'fs-rec-blink 1.2s infinite' }} />
              <style>{`@keyframes fs-rec-blink { 0%,100% { opacity: 1 } 50% { opacity: .25 } }`}</style>
              {isOwnRecording ? 'Você está gravando · todos foram avisados' : `${recordingBy?.name || 'Alguém'} está gravando esta call`}
            </div>
          )}
          {stalePeers.length > 0 && (
            <div style={{ position: 'absolute', top: recordingActive ? 52 : 12, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,.78)', border: '1px solid #f0b232', borderRadius: 999, padding: '7px 12px 7px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              <Fa name="download" size={12} style={{ color: '#f0b232' }} />
              {stalePeers.length === 1 ? `${stalePeers[0].userName || 'Um participante'} está com o app desatualizado` : `${stalePeers.length} participantes com o app desatualizado`} · atualize para continuar
              <button onClick={() => window.dispatchEvent(new CustomEvent('friends-space:open-download'))} style={{ padding: '5px 12px', borderRadius: 7, background: 'var(--accent)', color: '#04120a', border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Atualizar app</button>
            </div>
          )}
          {pendingScreens.map(id => (
            <div key={id} style={{ position: 'absolute', top: recordingActive ? 52 : 12, left: '50%', transform: 'translateX(-50%)', zIndex: 299, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,.72)', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              <Fa name="circle-notch" size={12} className="fa-spin" style={{ color: '#fff' }} />
              {participants.find(p => p.userId === id)?.userName || 'Usuário'} está transmitindo · conectando...
            </div>
          ))}
          <div className={`vc-bg ${hasActiveScreen ? 'has-screenshare' : ''}`}>
            {!hasActiveScreen && focusedCamera && (
              <div id="call-camera-stage" className="vc-camera-stage" style={{ position: 'absolute', inset: '0 0 84px', zIndex: 60, background: '#05080e', display: 'flex', flexDirection: 'column' }}>
                <div className="vc-camera-stage-head" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', background: 'rgba(0,0,0,.55)' }}>
                  <span className="vc-live-dot" />
                  <strong style={{ fontSize: 14 }}>{focusedCamera.isSelf ? 'Sua câmera' : `Câmera de ${focusedCamera.userName}`}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>TELA CHEIA</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button className="vc-topbar-btn" onClick={() => { setCameraMosaic(true); setCameraStage(null) }} title="Ver todas as câmeras em mosaico"><LayoutGrid size={14} /></button>
                    <button className="vc-topbar-btn" onClick={() => { const el = document.getElementById('call-camera-stage'); if (!document.fullscreenElement) void el?.requestFullscreen?.(); else void document.exitFullscreen?.() }} title="Tela cheia"><Maximize2 size={14} /></button>
                    <button className="vc-topbar-btn" onClick={() => setCameraStage(null)} title="Fechar"><X size={14} /></button>
                  </div>
                </div>
                <div style={{ flex: 1, minHeight: 0, background: '#000' }}>
                  <video autoPlay playsInline muted={focusedCamera.isSelf} style={{ width: '100%', height: '100%', objectFit: 'contain', transform: focusedCamera.isSelf ? 'scaleX(-1)' : undefined }} ref={el => { if (el && focusedCamera.stream && el.srcObject !== focusedCamera.stream) el.srcObject = focusedCamera.stream }} />
                </div>
                {cameraTiles.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, padding: 10, overflowX: 'auto', background: 'rgba(0,0,0,.55)' }}>
                    {cameraTiles.filter(person => person.userId !== focusedCamera.userId).map(person => (
                      <button key={person.userId} onClick={() => setCameraStage(person.userId)} style={{ width: 150, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: '#000', padding: 0, cursor: 'pointer', flexShrink: 0, position: 'relative' }} title={person.isSelf ? 'Sua câmera' : person.userName}>
                        <video autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: person.isSelf ? 'scaleX(-1)' : undefined }} ref={el => { if (el && person.stream && el.srcObject !== person.stream) el.srcObject = person.stream }} />
                        <span style={{ position: 'absolute', left: 5, bottom: 4, fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px #000' }}>{person.isSelf ? 'Você' : person.userName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!hasActiveScreen && cameraMosaic && !focusedCamera && (
              <div id="call-camera-mosaic" className="vc-camera-mosaic" style={{ position: 'absolute', inset: '0 0 84px', zIndex: 60, background: '#05080e', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', background: 'rgba(0,0,0,.55)' }}>
                  <LayoutGrid size={15} />
                  <strong style={{ fontSize: 14 }}>Mosaico de câmeras</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{cameraTiles.length} {cameraTiles.length === 1 ? 'câmera' : 'câmeras'}</span>
                  <button className="vc-topbar-btn" style={{ marginLeft: 'auto' }} onClick={() => setCameraMosaic(false)} title="Fechar mosaico"><X size={14} /></button>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${cameraTiles.length <= 2 ? 1 : cameraTiles.length <= 4 ? 2 : 3}, minmax(0, 1fr))`, gap: 8, padding: 8, overflowY: 'auto' }}>
                  {cameraTiles.map(person => (
                    <button key={person.userId} onClick={() => { setCameraStage(person.userId); setCameraMosaic(false) }} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: '#000', minHeight: 120, padding: 0, cursor: 'pointer', position: 'relative' }} title={person.isSelf ? 'Sua câmera' : person.userName}>
                      <video autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: person.isSelf ? 'scaleX(-1)' : undefined }} ref={el => { if (el && person.stream && el.srcObject !== person.stream) el.srcObject = person.stream }} />
                      <span style={{ position: 'absolute', left: 8, bottom: 6, fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px #000' }}>{person.isSelf ? 'Você' : person.userName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hasActiveScreen && !popout && !showMosaic && (
            <div id={`call-fs-${fsKey}`} className="vc-main-screen" onContextMenu={e => { e.preventDefault(); setScreenMenu({ x: e.clientX, y: e.clientY, userId: screenUserId }) }}>
                <WatchPartyBar />
                <video id={stageVideoId} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: controlling === screenUserId ? 'fill' : 'contain', background: '#000' }} />
                {controlling && controlling === screenUserId && (
                  <RemoteControlOverlay
                    onInput={sendControlInput}
                    onExit={stopControlling}
                    onFullscreen={() => { void toggleFullscreen(screenUserId ? `screen:${screenUserId}` : 'screen', controlling ? 'remote' : 'normal') }}
                  />
                )}
                {isFullscreen && fullscreenMode === 'normal' && (
                  <button onClick={() => exitCallFullscreen()} title="Minimizar (sair da tela cheia)" className="vc-fs-exit"><Fa name="minimize" size={14} /></button>
                )}
              </div>
            )}
            {showMosaic && (
              <div className="vc-mosaic">
                <div className="vc-mosaic-header">
                  <Fa name="grid-2" size={13} />
                  <span>Modo mosaico · todas as telas</span>
                  <div className="vc-mosaic-header-actions">
                    {mosaicFocusValid && (
                      <button onClick={() => setMosaicFocus(null)} title="Desfazer destaque (voltar a grade normal)">
                        <Fa name="xmark" size={11} /> Desfazer destaque
                      </button>
                    )}
                    <button onClick={() => { setMosaic(false); setMosaicFocus(null) }}>Voltar</button>
                  </div>
                </div>
                {mosaicFocusValid ? (
                  <div className="vc-mosaic-focused">
                    <div
                      className={`vc-mosaic-main${mutedIds.has(mosaicFocusValid) ? ' muted' : ''}`}
                      id={`call-fs-mosaic-${mosaicFocusValid}`}
                      key={mosaicFocusValid}
                      onClick={() => setMosaicFocus(null)}
                      onContextMenu={e => { e.preventDefault(); setScreenMenu({ x: e.clientX, y: e.clientY, userId: mosaicFocusValid === 'local' ? null : mosaicFocusValid }) }}
                      title="Clique para desfazer o destaque; botao direito: volume"
                    >
                      <video id={`call-video-screen-${mosaicFocusValid}`} autoPlay playsInline muted={mosaicFocusValid === 'local'} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
                      <span className="vc-mosaic-label">{screenNameFor(mosaicFocusValid)} <b style={{ color: '#fff' }}>· EM DESTAQUE</b></span>
                      {isFullscreen && typeof document !== 'undefined' && document.fullscreenElement?.id === `call-fs-mosaic-${mosaicFocusValid}` && (
                        <button
                          className="vc-fs-exit"
                          onClick={e => { e.stopPropagation(); exitCallFullscreen() }}
                          title="Minimizar (sair da tela cheia)"
                        ><Fa name="minimize" size={14} /></button>
                      )}
                    </div>
                    <div className="vc-mosaic-thumbs">
                      {mosaicThumbIds.map(userId => (
                        <div
                          className={`vc-mosaic-tile vc-mosaic-tile-thumb${mutedIds.has(userId) ? ' muted' : ''}`}
                          id={`call-fs-mosaic-${userId}`}
                          key={userId}
                          onClick={() => { if (userId === 'local') setMosaicFocus('local'); else selectScreen(userId) }}
                          onContextMenu={e => { e.preventDefault(); setScreenMenu({ x: e.clientX, y: e.clientY, userId: userId === 'local' ? null : userId }) }}
                          title="Clique para destacar esta tela; botao direito: volume"
                        >
                          <video id={`call-video-screen-${userId}`} autoPlay playsInline muted={userId === 'local'} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
                          <span className="vc-mosaic-label">{screenNameFor(userId)}</span>
                          {isFullscreen && typeof document !== 'undefined' && document.fullscreenElement?.id === `call-fs-mosaic-${userId}` && (
                            <button
                              className="vc-fs-exit"
                              onClick={e => { e.stopPropagation(); exitCallFullscreen() }}
                              title="Minimizar (sair da tela cheia)"
                            ><Fa name="minimize" size={14} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="vc-mosaic-grid">
                    {isLocalScreen && (
                      <div
                        className="vc-mosaic-tile"
                        id="call-fs-mosaic-local"
                        key="local"
                        onClick={() => setMosaicFocus('local')}
                        onContextMenu={e => { e.preventDefault(); setScreenMenu({ x: e.clientX, y: e.clientY, userId: null }) }}
                        title="Sua tela · clique para destacar; botão direito: opções"
                      >
                        <video id="call-video-screen-local" autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
                        <span className="vc-mosaic-label">Sua tela</span>
                        {isFullscreen && typeof document !== 'undefined' && document.fullscreenElement?.id === 'call-fs-mosaic-local' && (
                          <button
                            className="vc-fs-exit"
                            onClick={e => { e.stopPropagation(); exitCallFullscreen() }}
                            title="Minimizar (sair da tela cheia)"
                          ><Fa name="minimize" size={14} /></button>
                        )}
                      </div>
                    )}
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
                        <span className="vc-mosaic-label">{screenNameFor(userId)}</span>
                        {isFullscreen && typeof document !== 'undefined' && document.fullscreenElement?.id === `call-fs-mosaic-${userId}` && (
                          <button
                            className="vc-fs-exit"
                            onClick={e => { e.stopPropagation(); exitCallFullscreen() }}
                            title="Minimizar (sair da tela cheia)"
                          ><Fa name="minimize" size={14} /></button>
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
                <Fa name="display" size={14} style={{  color: '#29A3FF' }} />
                <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Tela de {screenLabel}</span>
                <span className="vc-aolive">AO VIVO</span>
                <span className="vc-call-time">{callElapsed}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isElectronDevice() && screenUserId && (
                    <button className="vc-topbar-btn" onClick={() => { if (controlling === screenUserId) { stopControlling(); setAnydeskMode(false) } else { requestControl(screenUserId); setAnydeskMode(true) } }} title={controlling === screenUserId ? 'Parar controle' : 'Controlar o PC de ' + screenLabel} style={controlling === screenUserId ? { background: '#00c853', color: '#04120a', borderColor: '#00c853', fontWeight: 700 } : undefined}>
                      <Fa name="hand-pointer" size={12} />
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{controlling === screenUserId ? 'Parar controle' : 'Controlar'}</span>
                    </button>
                  )}
                  {totalScreens > 1 && (
                    <button className="vc-topbar-btn" onClick={() => setMosaic(true)} title="Modo mosaico (ver todas as telas ao mesmo tempo)"><Fa name="grid-2" size={12} /></button>
                  )}
                  <button className="vc-topbar-btn" onClick={() => setPopout(true)} title="Janela pop-up (sempre no topo)"><PictureInPicture2 size={14} strokeWidth={2} /></button>
                </div>
              </div>
            )}
            {!hasActiveScreen && !popout && (
              <>
                <div className="vc-call-header">
                  <span className="vc-live-dot" />
                  {callServerId === 'dm' && dmPeer && (
                    <Avatar src={dmPeer.userPhoto} name={dmPeer.userName} size={22} />
                  )}
                  <span className="vc-call-title">{callTitle}</span>
                  <span className="vc-call-time">{callElapsed}</span>
                  <span className="vc-call-count">
                    <Fa name="user-group" size={10} style={{  marginRight: 5 }} />
                    {totalInCall}
                  </span>
                  {cameraTiles.length > 0 && (
                    <button className="fs-dm-action" onClick={() => { setCameraMosaic(true); setCameraStage(null) }} title="Mosaico de câmeras">
                      <LayoutGrid size={15} strokeWidth={2} />
                    </button>
                  )}
                  {callServerId === 'dm' && (
                    <button
                      className="fs-dm-action"
                      onClick={() => setAddMenu(a => !a)}
                      title="Adicionar pessoa nesta chamada"
                    >
                      <UserPlus size={15} strokeWidth={2} />
                    </button>
                  )}
                </div>
                {ringingNotJoined && (
                  <div className="vc-ringing-hint">
                    Ligando para {callingUser?.userName || dmPeer?.userName || 'seu amigo'}…
                  </div>
                )}
                <div className={`vc-tiles vc-tiles-mosaic${anyVideo ? ' has-video' : ''}`} style={{ gridTemplateColumns: `repeat(${tileCols}, minmax(0, 1fr))` }}>
                  {tiles.map(t => {
                    const speaking = Boolean(speakingUsers[t.userId]) && !t.muted
                    const tileStream: MediaStream | null | undefined = t.isSelf ? localStream : remoteStreams[t.userId]
                    let hasTileVideo = false
                    try { hasTileVideo = Boolean(tileStream) && (tileStream as MediaStream).getVideoTracks().length > 0 } catch { hasTileVideo = false }
                    if (t.isSelf && !cameraOn) hasTileVideo = false
                    const off = Boolean(t.muted || t.deafened)
                    return (
                      <div key={t.userId} className={`vc-tile${speaking ? ' speaking' : ''}${off ? ' muted-ring' : ''}${hasTileVideo ? ' has-video' : ''}`} onDoubleClick={() => { if (hasTileVideo) setCameraStage(t.userId) }} style={hasTileVideo ? { cursor: 'zoom-in' } : undefined}>
                        {hasTileVideo ? (
                          <video
                            id={`call-tile-${t.userId}`}
                            autoPlay
                            playsInline
                            muted
                            className="vc-tile-video"
                            style={t.isSelf ? { transform: 'scaleX(-1)' } : undefined}
                            ref={el => { if (el && tileStream && el.srcObject !== tileStream) el.srcObject = tileStream }}
                          />
                        ) : (
                          <div className="vc-tile-ring">
                            <Avatar src={t.userPhoto} name={t.userName} size={84} />
                          </div>
                        )}
                        {hasTileVideo && (
                          <button
                            className="vc-tile-expand"
                            onClick={event => { event.stopPropagation(); setCameraStage(t.userId) }}
                            title="Ver câmera em tela cheia"
                            style={{ position: 'absolute', top: 6, right: 6, zIndex: 3, width: 27, height: 27, borderRadius: 7, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(0,0,0,.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                          >
                            <Maximize2 size={13} />
                          </button>
                        )}
                        <div className="vc-tile-bar">
                          <span className="vc-tile-name">{t.isSelf ? 'Você' : t.userName}</span>
                          <span className={`vc-tile-status${off ? ' off' : ''}`} title={t.deafened ? 'Com som desativado' : t.muted ? 'Mutado' : 'Falando / com áudio'}>
                            {t.deafened ? <HeadphoneOff size={12} /> : t.muted ? <MicOff size={12} /> : <Mic size={12} />}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {!controlling && (
            <div className="vc-bottom">
              <div className="vc-controls">
                <div className="vc-ctrl-group">
                  <button
                    className="vc-ctrl"
                    onClick={toggleMute}
                    onContextMenu={e => { e.preventDefault(); setMicMenu(micMenu ? null : { x: e.clientX, y: e.clientY }) }}
                    title={muted ? 'Ativar microfone (botão direito: trocar microfone)' : 'Desativar microfone (botão direito: trocar microfone)'}
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
                      title={cameraOn ? 'Desligar câmera (botão direito: opções)' : 'Ligar câmera (botão direito: opções)'}
                    >
                      <span className={`vc-btn ${cameraOn ? 'active' : ''}`}>
                        {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
                      </span>
                      <span className="vc-ctrl-label">Câmera</span>
                    </button>
                  )}
                  <button
                    className="vc-ctrl"
                    onClick={() => setActivitiesOpen(true)}
                    title="Atividades da call"
                  >
                    <span className="vc-btn">
                      <Gamepad2 size={20} />
                    </span>
                    <span className="vc-ctrl-label">Atividades</span>
                  </button>
                  <button
                    className="vc-ctrl"
                    onClick={() => startMeeting()}
                    title="Iniciar modo reunião / sala de aula"
                  >
                    <span className="vc-btn">
                      <Presentation size={20} />
                    </span>
                    <span className="vc-ctrl-label">Reunião</span>
                  </button>
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
                    title={isOwnRecording ? 'Parar gravação' : recordingActive ? `Gravando por ${recordingBy?.name || 'outro participante'}` : 'Gravar call (avisa a todos)'}
                  >
                    <span className={`vc-btn ${isOwnRecording ? 'active' : ''}`} style={isOwnRecording ? { background: '#ef4444', color: '#fff' } : undefined}>
                      <Fa name="circle-dot" size={19} />
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
                  <button className="vc-ctrl" onClick={() => setMoreMenu(m => !m)} title="Mais opções">
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
                  Todos os participantes serão avisados na hora (banner + som). A gravação captura tela compartilhada + áudio de todos, em trechos de 1 min salvos só no <b>seu</b> Google Drive (pasta Minhas Transmissões) · nada passa pelo servidor.
                </p>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Só grave com o consentimento de todos (LGPD). Você pode parar a qualquer momento.
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
          <button className="vc-debug-toggle" onClick={() => setShowDebugWindow(true)} title="Diagnóstico de conexão" style={controlling === screenUserId ? { display: 'none' } : undefined}>
            <Fa name="bug" size={14} />
          </button>
          {showDebugWindow && <DebugWindow onClose={() => setShowDebugWindow(false)} />}

          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 11, display: 'flex', alignItems: 'center', gap: 6, ...(controlling === screenUserId ? { display: 'none' } : {}) }}>
            <button
              onClick={() => setQualityMenu(q => !q)}
              title="Qualidade de transmissao"
              style={{ fontSize: 11, fontWeight: 700, color: qualityMenu ? '#fff' : 'var(--text-secondary)', background: 'rgba(0,0,0,0.4)', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              {preferredQuality} {preferredFps} · {preferredBitrate >= 1000 ? `${(preferredBitrate / 1000).toFixed(preferredBitrate % 1000 === 0 ? 0 : 1)} Mbps` : `${preferredBitrate} kbps`} <Fa name="gauge-high" size={10} />
            </button>
          </div>
        </div>
      )}

      {/* Palco da tela compartilhada (popout) */}
      {hasActiveScreen && popout && (
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
              <RemoteControlOverlay
                onInput={sendControlInput}
                onExit={stopControlling}
                onFullscreen={() => { void toggleFullscreen(screenUserId ? `screen:${screenUserId}` : 'screen', controlling ? 'remote' : 'normal') }}
              />
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
                      <Fa name="microphone" size={11} />
                      Volume da voz de {participants.find(p => p.userId === screenMenu.userId)?.userName || 'Usuário'}
                    </div>
                    <div style={{ padding: '4px 10px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <VolumeSlider value={clampVolume(volumes[screenMenu.userId])} onChange={v => { if (screenMenu.userId) setVolume(screenMenu.userId, v) }} />
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 34, textAlign: 'right' }}>{Math.round(clampVolume(volumes[screenMenu.userId as string]) * 100)}%</span>
                    </div>
                  </>
                )}
                <div style={{ padding: '7px 10px 3px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Fa name="volume-high" size={11} />
                  Volume da tela de {screenMenu.userId ? (participants.find(p => p.userId === screenMenu.userId)?.userName || 'Usuário') : 'Você'}
                </div>
                <div style={{ padding: '4px 10px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <VolumeSlider value={clampVolume(volumes[screenMenu.userId ? `screen:${screenMenu.userId}` : 'screen:local'])} onChange={v => { if (screenMenu.userId) setScreenVolume(screenMenu.userId, v); else setVolume('screen:local', v) }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 34, textAlign: 'right' }}>{Math.round(clampVolume(volumes[screenMenu.userId ? `screen:${screenMenu.userId}` : 'screen:local']) * 100)}%</span>
                </div>
                <button onClick={() => { setVolume(screenMenu.userId ? `screen:${screenMenu.userId}` : 'screen:local', 0); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  <Fa name="volume-xmark" size={12} />
                  Silenciar tela
                </button>
              </>
            )}
            {screenMenu.userId && (
              <>
                <div style={{ borderTop: '1px solid #1e1f22', margin: '4px 0' }} />
                <div style={{ padding: '7px 10px 3px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
                  Áudio: {audioMode === 'spotlight' ? 'só a destacada' : audioMode === 'muted' ? 'todas silenciadas' : 'todas as telas'}
                </div>
                <button onClick={() => { const id = screenMenu.userId as string; selectScreen(id); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  <Fa name="headphones" size={12} />
                  Ouvir só esta tela
                </button>
                <button onClick={() => { const id = screenMenu.userId as string; setMosaicFocus(id); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  <Fa name="star" size={12} />
                  Destacar esta tela
                </button>
                <button onClick={() => { const id = screenMenu.userId as string; setMutedScreens(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  {screenMenu.userId && mutedScreens.includes(screenMenu.userId) ? (<><Fa name="volume-high" size={12} /> Reativar esta tela</>) : (<><Fa name="volume-xmark" size={12} /> Silenciar esta tela</>)}
                </button>
                <button onClick={() => { setMutedScreens([]); setAudioMode('all'); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  <Fa name="volume-high" size={12} />
                  Ouvir todas as telas
                </button>
                <button onClick={() => { setAudioMode('muted'); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  <Fa name="volume-xmark" size={12} />
                  Silenciar todas as telas
                </button>
                <button onClick={() => { const id = screenMenu.userId as string; setScreenMenu(null); void toggleFullscreen(fullscreenKeyFor(id), 'normal') }} style={{ width: '100%', display: screenMenu.userId && screenMenu.userId !== currentUser?.id ? 'flex' : 'none', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                  <Fa name="expand" size={12} />
                  Tela cheia
                </button>
              </>
            )}
            {menuIsSelfScreen && isLocalScreen && (
              <button onClick={() => { const on = localStorage.getItem('friends-space:screen-audio') !== '0'; try { useCallStore.getState().setScreenAudioEnabled(!on) } catch { }; setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                <Fa name="music" size={12} />
                {localStorage.getItem('friends-space:screen-audio') !== '0' ? 'Parar de compartilhar áudio da tela' : 'Compartilhar áudio da tela'}
              </button>
            )}
            <div style={{ borderTop: '1px solid #1e1f22', margin: '4px 0' }} />
            <div style={{ padding: '7px 10px 3px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Qualidade instantânea · {getStreamPlanLabel(currentUser).label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 10px 8px' }}>
              {(['480p', '720p', '1080p', '2k', '4k'] as const).map(q => {
                const blocked = isQualityBlocked(currentUser, q)
                const active = preferredQuality === q
                return (
                  <button key={q} disabled={blocked} onClick={() => { void setPreferredQuality(q) }} title={blocked ? 'Bloqueado no seu plano' : 'Troca instantânea'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, background: active ? 'var(--accent)' : 'var(--bg-secondary)', color: active ? '#04120a' : 'var(--text-primary)', border: 'none', fontWeight: 700, fontSize: 12, cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.55 : 1 }}>
                    {blocked && <Fa name="lock" size={11} />}{q}
                  </button>
                )
              })}
            </div>
            <div style={{ padding: '0 10px 8px', color: 'var(--text-muted)', fontSize: 11 }}>Pares no navegador recebem até 720p (limite do Chrome).</div>
            <div style={{ display: 'flex', gap: 8, padding: '0 10px 8px' }}>
              <select value={preferredFps} onChange={e => { void setPreferredFps(Number(e.target.value) as never) }} style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, fontSize: 12 }}>
                {([30, 60] as const).map(f => <option key={f} value={f} disabled={currentUser ? f > getMaxStreamFps(currentUser) : false}>{f > (currentUser ? getMaxStreamFps(currentUser) : 30) ? `${f}fps · bloqueado` : `${f}fps`}</option>)}
              </select>
              <select value={preferredBitrate} onChange={e => { void setPreferredBitrate(Number(e.target.value)) }} style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, fontSize: 12 }}>
                {[2000, 4000, 6000, 8000, 12000, 16000, 25000, 35000, 45000].map(k => <option key={k} value={k} disabled={currentUser ? k > getMaxBitrateKbps(currentUser) : false}>{k >= 1000 ? `${k / 1000}M` : `${k}k`}</option>)}
              </select>
            </div>
            <div style={{ borderTop: '1px solid #1e1f22', margin: '4px 0', }} />
            <button onClick={() => { setPopout(!popout); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
              {popout ? (<><Fa name="minimize" size={12} /> Fechar pop-out</>) : (<><Fa name="window-restore" size={12} /> Abrir pop-out</>)}
            </button>
            {mosaic && (
              <button onClick={() => { setMosaic(false); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                <Fa name="grid-2" size={12} /> Sair do mosaico
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
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: selectedMic === device.deviceId ? '#fff' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}
              >
                <Fa name="microphone" size={12} style={{  opacity: selectedMic === device.deviceId ? 1 : 0.3 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.label}</span>
              </button>
            ))}
            {getAstroTier(currentUser) !== 'none' && isCleanAudioSupported() && (
              <button
                onClick={() => { void setCleanAudioEnabled(!isCleanAudioEnabledPref()).catch(() => { }); setMicMenu(null) }}
                title="Remove ruido de fundo com IA (RNNoise). Vale na hora e nas proximas calls."
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: isCleanAudioEnabledPref() ? '#fff' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}
              >
                <Fa name="wand-magic-sparkles" size={12} style={{  opacity: isCleanAudioEnabledPref() ? 1 : 0.3 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isCleanAudioEnabledPref() ? 'Áudio limpo ativado' : 'Áudio limpo (BETA)'}</span>
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
              <Fa name="video" size={12} />
              {cameraOn ? 'Desligar camera' : 'Ligar camera'}
            </button>
            {hasCamera && (
              <>
                <div style={{ padding: '7px 10px 3px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Modo da camera</div>
                {([['casual', 'Casual'], ['empresa', 'Empresa'], ['full', 'Tela cheia']] as [CameraMode, string][]).map(([value, label]) => (
                  <button key={value} onClick={() => { setCameraMode(value); setCamMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: getCameraMode() === value ? '#fff' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                    <Fa name={value === 'casual' ? 'user' : value === 'empresa' ? 'briefcase' : 'maximize'} size={12} />
                    {label}
                  </button>
                ))}
                {getCameraMode() !== 'full' && (
                  <>
                    <div style={{ padding: '7px 10px 3px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Posicao</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      {CAMERA_POSITIONS.map(pos => (
                        <button key={pos.value} onClick={() => { setCameraPosition(pos.value); setCamMenu(null) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 6, color: getCameraPosition() === pos.value ? '#fff' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 12, cursor: 'pointer' }} title={pos.label}>
                          <Fa name={pos.icon} size={10} />
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
            <div style={{ padding: '8px 12px 4px', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Mais opções</div>
            {([
              { icon: <Volume2 size={16} />, label: 'Volume dos participantes', desc: 'Ajustar voz de cada um', active: showVolumePanel, onClick: () => { setShowVolumePanel(s => !s); setMoreMenu(false) } },
              { icon: <Gauge size={16} />, label: 'Qualidade de transmissão', desc: `${preferredQuality} · ${preferredFps} fps`, active: qualityMenu, onClick: () => { setQualityMenu(q => !q); setMoreMenu(false) } },
              { icon: <Settings size={16} />, label: 'Configurações', desc: 'Abrir ajustes do app', active: false, onClick: () => { useSettingsStore.getState().openSettings(); setMoreMenu(false) } },
            ] as const).map(item => (
              <button
                key={item.label}
                onClick={item.onClick}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 10, background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ width: 34, height: 34, borderRadius: 10, background: item.active ? 'rgba(41,163,255,0.15)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: item.active ? '#29A3FF' : '#fff' }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#fff' }}>{item.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{item.desc}</span>
                </span>
                {item.active && <Check size={14} color="#29A3FF" />}
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
                  <Fa name="user-plus" size={12} style={{ color: '#fff' }} />
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
              <Fa name="tower-broadcast" size={11} /> Qualidade de transmissao
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: getStreamPlanLabel(currentUser).color, fontWeight: 700 }}>{getStreamPlanLabel(currentUser).label}</span>
            </div>
            <div style={{ padding: '2px 10px 6px', fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Fa name="video" size={10} />
              Atual: <b style={{ color: 'var(--text-secondary)' }}>{preferredQuality} · {preferredFps} fps · {preferredBitrate >= 1000 ? `${(preferredBitrate / 1000).toFixed(preferredBitrate % 1000 === 0 ? 0 : 1)} Mbps` : `${preferredBitrate} kbps`}</b>
            </div>
            {(['480p', '720p', '1080p', '2k', '4k'] as const).map(quality => {
              const blocked = isQualityBlocked(currentUser, quality)
              return (
                <button key={quality} disabled={blocked} onClick={() => { setPreferredQuality(quality); setQualityMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: preferredQuality === quality ? '#fff' : blocked ? '#4a4d52' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.55 : 1 }} title={blocked ? `Qualidade bloqueada no seu plano ${getStreamPlanLabel(currentUser).label}. Assine ASTRO+ para liberar.` : undefined}>
                  {preferredQuality === quality ? '?' : (blocked ? <Fa name="lock" size={11} style={{ width: 16, color: '#4a4d52' }} /> : <span style={{ width: 16 }} />)}
                  {quality}
                  {blocked && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a4d52' }}>bloqueado</span>}
                </button>
              )
            })}
            <div style={{ padding: '7px 10px 0', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Quadros por segundo</div>
            {([30, 60] as const).map(fps => {
              const blocked = fps > getMaxStreamFps(currentUser)
              return (
                <button key={fps} disabled={blocked} onClick={() => { void setPreferredFps(fps); setQualityMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: preferredFps === fps ? '#fff' : blocked ? '#4a4d52' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.55 : 1 }} title={blocked ? '60 FPS bloqueado no seu plano. Assine ASTRO para liberar.' : undefined}>
                  {preferredFps === fps ? '?' : (blocked ? <Fa name="lock" size={11} style={{ width: 16, color: '#4a4d52' }} /> : <span style={{ width: 16 }} />)}
                  {fps} fps
                  {blocked && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a4d52' }}>bloqueado</span>}
                </button>
              )
            })}
            <div style={{ padding: '7px 10px 0', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Bitrate</div>
            {([2000, 4000, 6000, 8000, 12000, 16000, 25000, 35000, 45000] as const).map(kbps => {
              const bitrateBlocked = kbps > getMaxBitrateKbps(currentUser)
              return (
              <button key={kbps} disabled={bitrateBlocked} onClick={() => { void setPreferredBitrate(kbps); setQualityMenu(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: preferredBitrate === kbps ? '#fff' : bitrateBlocked ? '#4a4d52' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: bitrateBlocked ? 'not-allowed' : 'pointer', opacity: bitrateBlocked ? 0.55 : 1 }} title={bitrateBlocked ? 'Bitrate bloqueado no seu plano. Assine ASTRO+ para liberar.' : undefined}>
                {preferredBitrate === kbps ? '?' : (bitrateBlocked ? <Fa name="lock" size={11} style={{ width: 16, color: '#4a4d52' }} /> : <span style={{ width: 16 }} />)}
                {kbps >= 1000 ? `${(kbps / 1000).toFixed(kbps % 1000 === 0 ? 0 : 1)} Mbps` : `${kbps} kbps`}
                {bitrateBlocked && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a4d52' }}>bloqueado</span>}
              </button>
            )})}
            <div style={{ padding: '6px 10px 0', color: 'var(--text-muted)', fontSize: 10.5 }}>Video e tela compartilhada</div>
            <div style={{ padding: '2px 10px 8px', color: liveStats.width > 0 ? '#4ade80' : 'var(--text-muted)', fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              {liveStats.width > 0 && <Fa name="circle" size={5} />}
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
            <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '4px 0' }}>Ninguém mais na chamada.</div>
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
              <Fa name="display" size={12} style={{  color: '#fff', width: 20, textAlign: 'center' }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>Tela de {participants.find(p => p.userId === userId)?.userName || 'Alguém'}</span>
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
      {screenError && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 200, background: '#ed4245', color: 'var(--text-primary)', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{screenError}</span>
          <button onClick={clearScreenError} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: 'var(--text-primary)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>OK</button>
        </div>
      )}

      {controlledBy && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 210, background: '#f0b232', color: '#000', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Fa name="hand-pointer" size={14} />
          <span>Alguem esta controlando seu PC{controlSettings.minutes > 0 ? ` · ${controlSettings.minutes} min` : ' · ilimitado'}</span>
          <button onClick={revokeControl} style={{ background: '#ed4245', color: 'var(--text-primary)', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
            Revogar agora
          </button>
        </div>
      )}

      {controlRequests.length > 0 && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 230, width: 'min(380px, calc(100vw - 32px))', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', color: 'var(--text-primary)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
          <Fa name="hand-pointer" size={28} style={{  color: '#fff', marginBottom: 10 }} />
          <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{controlRequests[0].userName || 'Alguem'} quer controlar seu PC</h3>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)' }}>Aceitar permite o acesso abaixo, pelo tempo escolhido.</p>
<div style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', margin: '0 0 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Permissões do controle</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Tempo máximo:</span>
              <select value={controlSettings.minutes} onChange={e => setControlSettings({ minutes: Number(e.target.value) })} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
                <option value={1}>1 minuto</option>
                <option value={5}>5 minutos</option>
                <option value={15}>15 minutos</option>
                <option value={0}>Ilimitado</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={controlSettings.audio} onChange={e => setControlSettings({ audio: e.target.checked })} /> Ouvir o áudio do meu computador
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={controlSettings.mouse} onChange={e => setControlSettings({ mouse: e.target.checked })} /> Controlar o mouse
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={controlSettings.keyboard} onChange={e => setControlSettings({ keyboard: e.target.checked })} /> Controlar o teclado
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={controlSettings.clipboard} onChange={e => setControlSettings({ clipboard: e.target.checked })} /> Área de transferência
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={controlSettings.mic} onChange={e => setControlSettings({ mic: e.target.checked })} /> Microfone aberto durante o controle
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <button onClick={() => acceptControlRequest(controlRequests[0].peerId)} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Aceitar</button>
            <button onClick={() => denyControlRequest(controlRequests[0].peerId)} style={{ background: '#f23f43', color: 'var(--text-primary)', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Recusar</button>
          </div>
        </div>
      )}
      {activitiesOpen && <ActivityModal onClose={() => setActivitiesOpen(false)} />}

    </>
  )
}
