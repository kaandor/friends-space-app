import { Fa } from '../../utils/fa'
import { WatchPartyBar } from './WatchPartyBar'
import { useEffect, useRef, useCallback, useState } from 'react'
import type { Channel } from '../../types'
import { Avatar } from '../ui/Avatar'
import { useCallStore, upgradeLocalMedia, warmIceServers } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'
import DebugWindow from '../Debug/DebugWindow'
import { useUserMenuStore } from '../../stores/userMenuStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Mic, MicOff, HeadphoneOff } from 'lucide-react'
import { IconMic, IconMicOff, IconHeadphone, IconHeadphonesOff, IconGear, IconEndCall, IconDisplay, IconStop, IconChat } from '../../utils/icons'
import { RemoteControlOverlay } from './RemoteControlOverlay'
import { isElectronDevice, isElectronFs, fullscreenTileById, useCallFullscreen } from './callFullscreen'
import { acquireCallMedia, getAudioInputDevices, getAudioOutputDevices } from '../../services/antiloud'
import { startAudioMonitor, stopAudioMonitor } from '../../services/audioMonitor'
import { unlockAudio } from '../../services/audioUnlock'
import { DriveRequiredModal } from '../Chat/DriveRequiredModal'
import { CameraOverlay } from './CameraOverlay'
import { CallChatPanel } from './CallChatPanel'
import { getStreamPlanLabel, isQualityBlocked, getMaxStreamFps, getMaxBitrateKbps } from '../../utils/astro'
import { requestBackend } from '../../services/backend'

const clampVcVolume = (v?: number) => (typeof v === 'number' && !Number.isNaN(v) ? Math.min(1, Math.max(0, v)) : 1)

function VcVolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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

interface VoiceChannelViewProps {
  channel: Channel
}

// Tile com video da camera quando houver trilha (avatar caso contrario).
function VoiceTileMedia({ stream, name, photo, muted }: { stream: MediaStream | null; name: string; photo: string; muted: boolean }) {
  let hasVideo = false
  try { hasVideo = Boolean(stream && stream.getVideoTracks().length > 0) } catch { hasVideo = false }
  if (!hasVideo) {
    return (
      <div className="vc-tile-ring">
        <Avatar src={photo} name={name} size={84} />
      </div>
    )
  }
  return (
    <video
      ref={el => {
        try {
          if (el && stream && el.srcObject !== stream) {
            el.srcObject = stream
            void el.play().catch(() => { })
          }
        } catch { }
      }}
      muted={muted}
      playsInline
      autoPlay
      className="vc-tile-ring"
      style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', background: '#000' }}
    />
  )
}

export function VoiceChannelView({ channel }: VoiceChannelViewProps) {
  const {
    activeCall, participants, muted, deafened, screenSharing, localStream, screenStream, screenError,
    remoteStreams, remoteScreenStreams, speakingUsers, volumes,
    startCall, endCall, toggleMute, toggleDeafen, toggleScreenShare, addParticipant, removeParticipant, setSpeaking, clearScreenError,
    preferredQuality, preferredFps, preferredBitrate, setVolume,
    setPreferredQuality, setPreferredFps, setPreferredBitrate, switchMicDevice,
    controlRequests, controlling, controlledBy, controlPending, controlSettings, setControlSettings,
    requestControl, acceptControlRequest, denyControlRequest, sendControlInput, stopControlling, revokeControl,
  } = useCallStore()
  const { currentUser } = useUserStore()
  const joinedRef = useRef(false)
  const channelRef = useRef<string>('')
  const leftRef = useRef(false)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [focusedScreen, setFocusedScreen] = useState<string | null>(() => {
    const local = typeof window !== 'undefined' && window.localStorage.getItem('friends-space:screen-focus')
    return local || null
  })
  const [micMenu, setMicMenu] = useState<{ x: number; y: number } | null>(null)
  const [micDevices, setMicDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [selectedMic, setSelectedMic] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [showDebugWindow, setShowDebugWindow] = useState(false)
  const [outMenu, setOutMenu] = useState<{ x: number; y: number } | null>(null)
  const { open: openUserMenu } = useUserMenuStore()
  const [driveModal, setDriveModal] = useState(false)
  const [screenMenu, setScreenMenu] = useState<{ x: number; y: number; userId: string | null } | null>(null)
  const [outDevices, setOutDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [selectedOutput, setSelectedOutput] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('friends-space:output') : null
  )

  const hasAnyScreenShare = screenSharing || Object.keys(remoteScreenStreams).length > 0
  // Menu da PRÓPRIA tela (sem userId, próprio id ou 'local'): sem mixer.
  const menuIsSelfScreen = !screenMenu?.userId || screenMenu.userId === currentUser?.id || screenMenu.userId === 'local'
  // Anel de voz para TODOS: analisa o áudio remoto aqui mesmo (cada client
  // detecta localmente) — antes só o próprio mic alimentava speakingUsers e
  // o círculo dos outros nunca acendia. O próprio mic entra na lista junto
  // (igual na CallView): sem isso a limpeza do monitor apagava o estado
  // local a cada 150ms e o anel do "Você" nunca acendia nos cards do meio.
  useEffect(() => {
    if (!activeCall) return
    startAudioMonitor([
      ...Object.entries(remoteStreams).map(([userId, stream]) => ({ key: userId, stream })),
      ...(localStream && !muted && !deafened && currentUser ? [{ key: currentUser.id, stream: localStream }] : []),
    ])
  }, [activeCall, remoteStreams, localStream, muted, deafened, currentUser])
  useEffect(() => () => stopAudioMonitor(), [])

  const { isFullscreen, fullscreenMode, toggleCallFullscreen, exitCallFullscreen } = useCallFullscreen()
  const toggleFullscreen = (mode: 'normal' | 'remote' = 'normal') => toggleCallFullscreen('vc-screen', mode)
  // Fullscreen do TILE clicado (botão direito → Tela cheia): a tela DAQUELA
  // pessoa ocupa tudo. Guarda o id para o botão minimizar; limpa ao sair
  // (navegador dispara fullscreenchange; no Electron o overlay se apaga
  // sozinho via isElectronFs()).
  const [tileFsId, setTileFsId] = useState<string | null>(null)
  const openTileFs = (userId: string) => {
    try {
      if (fullscreenTileById(`vc-mosaic-tile-${userId}`)) setTileFsId(userId)
    } catch { }
  }
  useEffect(() => {
    const onFsChange = () => {
      try {
        if (!document.fullscreenElement) setTileFsId(null)
      } catch { }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])
  const isTileFsActive = (userId: string) => {
    if (tileFsId !== userId) return false
    try {
      if (isElectronDevice()) return isElectronFs()
      return document.fullscreenElement?.id === `vc-mosaic-tile-${userId}`
    } catch {
      return false
    }
  }
  const exitTileFs = () => {
    try { exitCallFullscreen() } catch { }
    setTileFsId(null)
  }

  // Aceitou controle: entra em tela cheia sozinho (modo remoto) e sai ao parar.
  useEffect(() => {
    const onStarted = () => {
      try {
        if (!useCallStore.getState().controlling) return
        if (document.fullscreenElement) return
        void toggleFullscreen('remote')
      } catch { }
    }
    const onStopped = () => { try { exitCallFullscreen() } catch { } }
    window.addEventListener('friends-space:control-started', onStarted)
    window.addEventListener('friends-space:control-stopped', onStopped)
    return () => {
      window.removeEventListener('friends-space:control-started', onStarted)
      window.removeEventListener('friends-space:control-stopped', onStopped)
    }
  }, [toggleFullscreen])

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
        void toggleFullscreen(controlling ? 'remote' : 'normal')
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (typing || controlling) return
        const ids = Object.keys(remoteScreenStreams)
        if (ids.length < 2) return
        e.preventDefault()
        const cur = focusedScreen && ids.includes(focusedScreen) ? focusedScreen : ids[0]
        const idx = ids.indexOf(cur)
        const next = (idx + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length
        setFocusedScreen(ids[next])
        try { localStorage.setItem('friends-space:screen-focus', ids[next]) } catch { }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, fullscreenMode, controlling, focusedScreen, remoteScreenStreams, stopControlling])

  useEffect(() => {
    if (controlling) {
      setFocusedScreen(controlling)
      try { localStorage.setItem('friends-space:screen-focus', controlling) } catch { }
    }
  }, [controlling])

  const detectSpeaking = useCallback(() => {
    if (!analyserRef.current || !currentUser) {
      animFrameRef.current = window.requestAnimationFrame(detectSpeaking)
      return
    }
    const analyser = analyserRef.current
    const data = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const val = (data[i] - 128) / 128
      sum += val * val
    }
    const rms = Math.sqrt(sum / data.length)
    setSpeaking(currentUser.id, rms > 0.05)
    animFrameRef.current = window.requestAnimationFrame(detectSpeaking)
  }, [currentUser, setSpeaking])

  const joinCall = useCallback(async () => {
    if (joinedRef.current || activeCall) return
    // Gate do servidor (staff/senha/membro): conta nova em público passa
    // livre; privado/staff/senha nega com motivo em vez de falhar mudo.
    if (currentUser) {
      try {
        const gate = await requestBackend<{ allowed: boolean; reason?: string; requiresPassword?: boolean }>('canJoinCall', { serverId: channel.serverId, userId: currentUser.id })
        if (!gate?.allowed) {
          let password: string | undefined
          if (gate?.requiresPassword) {
            try { password = window.prompt('Esta call tem senha:') || undefined } catch { password = undefined }
            if (password === undefined) return
            try {
              const retry = await requestBackend<{ allowed: boolean; reason?: string }>('canJoinCall', { serverId: channel.serverId, userId: currentUser.id, password })
              if (!retry?.allowed) {
                window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: retry?.reason || 'Entrada negada nesta call' }))
                return
              }
            } catch {
              return
            }
          } else {
            window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: gate?.reason || 'Entrada negada nesta call' }))
            return
          }
        }
      } catch { /* backend fora: segue o join local */ }
    }
    joinedRef.current = true
    // Voz não exige Drive (só uploads/gravações) — nunca bloquear o join.
    try { unlockAudio() } catch { }
    const empty = new MediaStream()
    try {
      const started = startCall(channel.id, channel.serverId, empty, 'audio', preferredQuality) as unknown as Promise<void> | undefined
      if (started && typeof started.catch === 'function') {
        started.catch((joinErr) => {
          joinedRef.current = false
          try {
            window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: joinErr instanceof Error && joinErr.message ? joinErr.message : 'Falha ao entrar na call. Tente de novo.' }))
          } catch {}
        })
      }
    } catch (joinErr) {
      joinedRef.current = false
    }
    if (currentUser) {
      addParticipant({ userId: currentUser.id, userName: currentUser.name, userPhoto: currentUser.photoUrl, muted: false, deafened: false })
    }
    try {
      const savedMic = typeof window !== 'undefined' ? localStorage.getItem('friends-space:mic') : null
      let stream: MediaStream
      try {
        if (savedMic) {
          // Escolha manual do usuario sempre vence.
          stream = await acquireCallMedia('audio', preferredQuality, savedMic)
        } else {
          // Join rapido com captura padrao; mic dedicado entra em background.
          stream = await acquireCallMedia('audio', preferredQuality)
        }
      } catch {
        stream = await acquireCallMedia('audio', preferredQuality)
      }
      useCallStore.getState().attachLocalStream(stream)
      // Upgrade pos-join (mic dedicado + audio limpo, se Astro).
      void upgradeLocalMedia()
    } catch {
      joinedRef.current = false
      try {
        const st = useCallStore.getState()
        if (st.activeCall && (!st.localStream || st.localStream.getTracks().length === 0)) {
          st.endCall()
          window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Microfone indisponível. Verifique a permissão.' }))
        }
      } catch { }
    }
  }, [channel.id, channel.serverId, activeCall, preferredQuality, currentUser, startCall, addParticipant])

  useEffect(() => {
    if (channel.id !== channelRef.current) {
      channelRef.current = channel.id
      joinedRef.current = false
      leftRef.current = false
    }
    // Warm TURN antecipado: busca credenciais frescas ao ABRIR o canal,
    // não só no join — a PC já nasce com relay válido (fix 15s DTLS travado).
    try { warmIceServers() } catch { }
    if (joinedRef.current || activeCall || leftRef.current) return
    void joinCall()
  }, [joinCall, activeCall, channel.id])
  useEffect(() => {
    const onReset = () => {
      try {
        if (useCallStore.getState().activeCall) return
        joinedRef.current = false
        leftRef.current = false
      } catch {}
    }
    window.addEventListener('friends-space:join-reset', onReset)
    return () => window.removeEventListener('friends-space:join-reset', onReset)
  }, [])

  useEffect(() => {
    if (!localStream || muted) {
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => { })
        audioCtxRef.current = null
      }
      analyserRef.current = null
      window.cancelAnimationFrame(animFrameRef.current)
      if (currentUser) setSpeaking(currentUser.id, false)
      return
    }
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new AudioContext()
      } catch { }
    }
    const ctx = audioCtxRef.current
    if (!ctx) return
    try {
      const source = ctx.createMediaStreamSource(localStream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      analyserRef.current = analyser
      animFrameRef.current = window.requestAnimationFrame(detectSpeaking)
    } catch { }
    return () => {
      analyserRef.current = null
      window.cancelAnimationFrame(animFrameRef.current)
      if (currentUser) setSpeaking(currentUser.id, false)
    }
  }, [localStream, muted, detectSpeaking, currentUser, setSpeaking])

  const playAllRemote = useCallback(() => {
    for (const [userId, stream] of Object.entries(useCallStore.getState().remoteStreams)) {
      const el = document.getElementById(`call-audio-${userId}`) as HTMLAudioElement | null
      if (el) {
        if (el.srcObject !== stream) el.srcObject = stream
        if (el.paused) void el.play().catch(() => { })
      }
    }
  }, [])

  useEffect(() => {
    playAllRemote()
  }, [remoteStreams, participants])

  useEffect(() => {
    if (!activeCall) return
    const timer = window.setInterval(() => {
      unlockAudio()
      playAllRemote()
    }, 1500)
    return () => window.clearInterval(timer)
  }, [activeCall, playAllRemote])

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

  useEffect(() => {
    if (!activeCall) return
    let mounted = true
    const saved = localStorage.getItem('friends-space:output')
    if (saved) setSelectedOutput(saved)
    void getAudioOutputDevices().then(devices => {
      if (!mounted) return
      setOutDevices(devices)
      if (saved && devices.length > 0 && !devices.some(d => d.deviceId === saved)) {
        localStorage.removeItem('friends-space:output')
        setSelectedOutput(null)
      }
    })
    return () => { mounted = false }
  }, [activeCall])

  useEffect(() => {
    if (!activeCall || !localStream || !selectedMic) return
    const currentDevice = (localStream.getAudioTracks()[0] as MediaStreamTrack & { getSettings?: () => MediaTrackSettings })
      ?.getSettings?.().deviceId
    if (currentDevice && currentDevice !== selectedMic) {
      void switchMicDevice(selectedMic).catch(() => { })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall, localStream])

  useEffect(() => {
    return () => {
      window.cancelAnimationFrame(animFrameRef.current)
      if (currentUser) setSpeaking(currentUser.id, false)
    }
  }, [])

  const handleLeave = () => {
    leftRef.current = true
    window.cancelAnimationFrame(animFrameRef.current)
    if (currentUser) {
      setSpeaking(currentUser.id, false)
      removeParticipant(currentUser.id)
    }
    endCall()
  }

  const myUser = currentUser ? {
    userId: currentUser.id,
    userName: currentUser.name,
    userPhoto: currentUser.photoUrl,
    muted,
    deafened,
  } : null

  const allParticipants = myUser
    ? [myUser, ...participants.filter(p => p.userId !== currentUser?.id)]
    : participants

  return (
    <div className="vc-screen">
      <CameraOverlay />
      <div className={`vc-bg ${hasAnyScreenShare ? 'has-screenshare' : ''}`}>
        {hasAnyScreenShare ? (
          <div className="vc-voice-share">
              <div id="call-fs-vc-screen" className="vc-voice-share-main" style={{ position: 'relative' }} onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                const ids = Object.keys(remoteScreenStreams)
                const cur = focusedScreen && ids.includes(focusedScreen) ? focusedScreen : (ids[0] || null)
                const uid = cur && cur !== currentUser?.id ? cur : (screenSharing ? null : cur)
                setScreenMenu({ x: e.clientX, y: e.clientY, userId: uid })
              }}>
              {isFullscreen && fullscreenMode === 'normal' && (
                <button className="vc-fs-exit" onClick={() => exitCallFullscreen()} title="Minimizar (sair da tela cheia)"><Fa name="minimize" size={14} /></button>
              )}
              <ScreenMosaicView
                currentUser={currentUser}
                screenSharing={screenSharing}
                screenStream={screenStream}
                remoteScreenStreams={remoteScreenStreams}
                participants={allParticipants}
                focusedScreen={focusedScreen}
                onFocus={(id) => { setFocusedScreen(id); try { localStorage.setItem('friends-space:screen-focus', id || '') } catch { } }}
                onTileContextMenu={(id, x, y) => setScreenMenu({ x, y, userId: id })}
                isTileFsActive={isTileFsActive}
                onExitTileFs={exitTileFs}
                speakingUsers={speakingUsers}
              />
              {!controlling && (
              <div className="vc-topbar">
                <Fa name="display" size={14} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  Tela de {allParticipants.find(p => {
                    if (focusedScreen) return p.userId === focusedScreen
                    if (p.userId === currentUser?.id && screenSharing) return true
                    return Boolean(remoteScreenStreams[p.userId])
                  })?.userName || 'Alguem'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--danger, #ed4245)', padding: '2px 6px', borderRadius: 4 }}>AO VIVO</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isElectronDevice() && focusedScreen && focusedScreen !== currentUser?.id && remoteScreenStreams[focusedScreen] && (
                    controlling === focusedScreen ? (
                      <button
                        onClick={stopControlling}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        <Fa name="hand-pointer" size={11} /> Parar controle
                      </button>
                    ) : !controlling ? (
                      <button
                        onClick={() => requestControl(focusedScreen)}
                        disabled={Boolean(controlPending)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: controlPending ? 'rgba(255,255,255,0.2)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        <Fa name="mouse-pointer" size={11} />
                        {controlPending === focusedScreen ? 'Aguardando...' : 'Controlar'}
                      </button>
                    ) : null
                  )}
                </div>
              </div>
              )}
              {controlling && (
                <RemoteControlOverlay
                  onInput={sendControlInput}
                  onExit={stopControlling}
                  onFullscreen={() => { void toggleFullscreen(controlling ? 'remote' : 'normal') }}
                />
              )}
            {!controlling && !hasAnyScreenShare && (
            <div className="vc-people-strip">
              {allParticipants.map(p => {
                const isSelf = p.userId === currentUser?.id
                const pMuted = Boolean(p.muted || p.deafened)
                const speaking = Boolean(speakingUsers[p.userId]) && !pMuted
                return (
                  <div
                    key={p.userId}
                    className={`vc-strip-chip${speaking ? ' speaking' : ''}${pMuted ? ' muted-ring' : ''}`}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openUserMenu({ id: p.userId, name: p.userName, photoUrl: p.userPhoto, bio: '', friendCode: '', createdAt: 0 }, e.clientX, e.clientY) }}
                    title={`${p.userName} (botão direito: ver perfil)`}
                  >
                    <div className="vc-strip-ring">
                      <Avatar src={p.userPhoto} name={p.userName} size={34} />
                    </div>
                    <span className="vc-strip-name">{isSelf ? 'Você' : p.userName}</span>
                    {p.muted && <MicOff size={11} color="#ff8085" />}
                  </div>
                )
              })}
            </div>
            )}
          </div>
          </div>
        ) : (
          <div className="vc-tiles">
            <div style={{ gridColumn: '1 / -1' }}><WatchPartyBar /></div>
            {allParticipants.map(p => {
              const isSelf = p.userId === currentUser?.id
              const pMuted = isSelf ? muted : p.muted
              const pDeafened = isSelf ? deafened : p.deafened
              const speaking = Boolean(speakingUsers[p.userId]) && !pMuted
              const isMuted = Boolean(pMuted || pDeafened)
              return (
                <div key={p.userId} className={`vc-tile${speaking ? ' speaking' : ''}${isMuted ? ' muted-ring' : ''}`}>
                  <VoiceTileMedia
                    stream={(isSelf ? localStream : remoteStreams[p.userId]) || null}
                    name={p.userName}
                    photo={p.userPhoto}
                    muted={isSelf}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
                    <span className="vc-tile-name">{isSelf ? 'Você' : p.userName}</span>
                  </div>
                  <span className={`vc-tile-status${pMuted || pDeafened ? ' off' : ''}`} title={pDeafened ? 'Com som desativado' : pMuted ? 'Mutado' : 'Na chamada'}>
                    {pDeafened ? <HeadphoneOff size={13} /> : pMuted ? <MicOff size={13} /> : <Mic size={13} />}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {!controlling && (
        <div className="vc-bottom">
          <div className="vc-controls">
            <button
              className={`vc-btn ${muted ? 'muted' : ''}`}
              onClick={toggleMute}
              onContextMenu={e => { e.preventDefault(); setMicMenu(micMenu ? null : { x: e.clientX, y: e.clientY }) }}
              title={muted ? 'Ativar microfone (botao direito: trocar microfono)' : 'Desativar microfone (botao direito: trocar microfono)'}
            >
              {muted ? <IconMicOff width={22} height={22} /> : <IconMic width={22} height={22} />}
            </button>
            <button
              className={`vc-btn ${deafened ? 'muted' : ''}`}
              onClick={toggleDeafen}
              onContextMenu={e => { e.preventDefault(); setOutMenu(outMenu ? null : { x: e.clientX, y: e.clientY }) }}
              title={deafened ? 'Ativar som (botao direito: escolher fone)' : 'Desativar som (botao direito: escolher fone)'}
            >
              {deafened ? <IconHeadphonesOff width={22} height={22} /> : <IconHeadphone width={22} height={22} />}
            </button>
            <button
              className="vc-btn"
              onClick={() => useSettingsStore.getState().openSettings()}
              title="Configuracoes"
            >
              <IconGear width={22} height={22} />
            </button>
            <button className="vc-btn leave" onClick={handleLeave} title="Sair da call">
              <IconEndCall width={22} height={22} />
            </button>
            <button
              className={`vc-btn ${screenSharing ? 'active' : ''}`}
              onClick={() => { toggleScreenShare() }}
              title={screenSharing ? 'Parar compartilhar' : 'Compartilhar tela'}
            >
              {screenSharing ? <IconStop width={20} height={20} /> : <IconDisplay width={22} height={22} />}
            </button>
            <button
              className={`vc-btn ${showChat ? 'active' : ''}`}
              onClick={() => setShowChat(s => !s)}
              title="Mostrar chat"
            >
              <IconChat width={22} height={22} />
            </button>
          </div>
        </div>
        )}

        {showChat && !controlling && (
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 60, display: 'flex' }}>
            <CallChatPanel channel={channel} onClose={() => setShowChat(false)} />
          </div>
        )}
      </div>

      {screenMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 210 }} onClick={() => setScreenMenu(null)} />
          <div style={{ position: 'fixed', top: Math.min(screenMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 340), left: Math.min(screenMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 220), zIndex: 211, minWidth: 210, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            {!menuIsSelfScreen && (
              <>
                <div style={{ padding: '7px 10px 3px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Fa name="volume-high" size={11} />
                  Volume da tela de {screenMenu.userId ? (allParticipants.find(p => p.userId === screenMenu.userId)?.userName || 'Usuário') : 'Você'}
                </div>
                <div style={{ padding: '4px 10px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <VcVolumeSlider value={clampVcVolume(volumes[screenMenu.userId ? `screen:${screenMenu.userId}` : 'screen:local'])} onChange={v => setVolume(screenMenu.userId ? `screen:${screenMenu.userId}` : 'screen:local', v)} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 34, textAlign: 'right' }}>{Math.round(clampVcVolume(volumes[screenMenu.userId ? `screen:${screenMenu.userId}` : 'screen:local']) * 100)}%</span>
                </div>
              </>
            )}
            {!menuIsSelfScreen && screenMenu.userId && (
              <>
                <div style={{ padding: '7px 10px 3px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Fa name="microphone" size={11} />
                  Volume da voz de {allParticipants.find(p => p.userId === screenMenu.userId)?.userName || 'Usuário'}
                </div>
                <div style={{ padding: '4px 10px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <VcVolumeSlider value={clampVcVolume(volumes[screenMenu.userId])} onChange={v => { if (screenMenu.userId) setVolume(screenMenu.userId, v) }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 34, textAlign: 'right' }}>{Math.round(clampVcVolume(screenMenu.userId ? volumes[screenMenu.userId] : 1) * 100)}%</span>
                </div>
              </>
            )}
            <div style={{ borderTop: '1px solid #1e1f22', margin: '4px 0' }} />
            {screenMenu.userId && screenMenu.userId !== currentUser?.id && screenMenu.userId !== 'local' && (
              <button onClick={() => { const id = screenMenu.userId as string; setScreenMenu(null); openTileFs(id) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                <Fa name="expand" size={12} />
                Tela cheia
              </button>
            )}
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
            <div style={{ borderTop: '1px solid #1e1f22', margin: '4px 0' }} />
            {menuIsSelfScreen ? (
              <>
                {screenSharing && (
                  <button onClick={() => { const on = localStorage.getItem('friends-space:screen-audio') !== '0'; try { useCallStore.getState().setScreenAudioEnabled(!on) } catch { }; setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                    <Fa name="music" size={12} />
                    {localStorage.getItem('friends-space:screen-audio') !== '0' ? 'Parar de compartilhar áudio da tela' : 'Compartilhar áudio da tela'}
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => { const v = localStorage.getItem('friends-space:screen-audio') !== '0'; localStorage.setItem('friends-space:screen-audio', v ? '0' : '1'); setScreenMenu(null) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: 'var(--text-primary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>
                <Fa name="music" size={12} />
                {localStorage.getItem('friends-space:screen-audio') !== '0' ? 'Parar de compartilhar áudio da tela' : 'Compartilhar áudio da tela'}
              </button>
            )}
          </div>
        </>
      )}

      {screenError && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 130, background: '#ed4245', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{screenError}</span>
          <button onClick={clearScreenError} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>OK</button>
        </div>
      )}

      {controlledBy && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 140, background: '#ed4245', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Fa name="mouse-pointer" size={12} />
          <span>Alguem esta controlando seu PC{controlSettings.minutes > 0 ? ` · ${controlSettings.minutes} min` : ' · ilimitado'}</span>
          <button onClick={revokeControl} style={{ background: '#fff', color: '#ed4245', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>Revogar agora</button>
        </div>
      )}

      {controlRequests[0] && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 151, width: 'min(380px, calc(100vw - 32px))', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', color: 'var(--text-primary)' }}>
            <Fa name="mouse-pointer" size={26} style={{  color: 'var(--accent)', marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{controlRequests[0].userName || 'Alguem'}</h3>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: '0 0 14px' }}>quer controlar seu PC. So aceite se confiar nesta pessoa.</p>
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
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => acceptControlRequest(controlRequests[0].peerId)} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Aceitar</button>
              <button onClick={() => denyControlRequest(controlRequests[0].peerId)} style={{ background: '#f23f43', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Recusar</button>
            </div>
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
                <Fa name="microphone" size={12} style={{  opacity: selectedMic === device.deviceId ? 1 : 0.3 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {outMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onClick={() => setOutMenu(null)} />
          <div style={{ position: 'fixed', top: Math.min(outMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 220), left: Math.max(8, outMenu.x - 220), zIndex: 120, minWidth: 220, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '7px 10px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Fone de ouvido / saida de audio</div>
            {outDevices.length === 0 && <div style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 12 }}>Nenhum dispositivo encontrado</div>}
            {outDevices.map(device => (
              <button
                key={device.deviceId}
                onClick={() => {
                  setSelectedOutput(device.deviceId)
                  localStorage.setItem('friends-space:output', device.deviceId)
                  window.dispatchEvent(new Event('friends-space:output-changed'))
                  setOutMenu(null)
                }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, color: selectedOutput === device.deviceId ? 'var(--accent)' : 'var(--text-secondary)', background: 'transparent', border: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}
              >
                <Fa name="headphones" size={12} style={{  opacity: selectedOutput === device.deviceId ? 1 : 0.3 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <button
        className="vc-debug-toggle"
        onClick={() => setShowDebugWindow(true)}
        title="Diagnóstico de conexão"
      >
        <Fa name="bug" size={14} />
      </button>

      {showDebugWindow && <DebugWindow onClose={() => setShowDebugWindow(false)} />}

      <DriveRequiredModal
        open={driveModal}
        required
        onClose={() => setDriveModal(false)}
        onConnected={() => { setDriveModal(false); void joinCall() }}
      />
    </div>
  )
}


function MosaicScreenTile({ tileId, stream, label, focused, speaking, muted, onFocus, onContextMenu, fsActive, onExitFs }: {
  tileId: string
  stream: MediaStream | null
  label: string
  focused: boolean
  speaking: boolean
  muted: boolean
  onFocus: () => void
  onContextMenu: (x: number, y: number) => void
  fsActive: boolean
  onExitFs: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])

  return (
    <div
      id={`vc-mosaic-tile-${tileId}`}
      className={`vc-mosaic-tile${focused ? ' focused' : ''}${!muted && speaking ? ' speaking' : ''}${muted ? ' muted' : ''}`}
      onClick={onFocus}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY) }}
      title={focused ? 'Clique para soltar o destaque; botão direito: opções' : 'Clique para destacar esta tela; botão direito: opções'}
    >
      <video ref={ref} autoPlay muted playsInline />
      <span className="vc-mosaic-label">
        {label}
        {focused && <b style={{ color: '#00ff88' }}> · EM DESTAQUE</b>}
      </span>
      {fsActive && (
        <button className="vc-fs-exit" onClick={e => { e.stopPropagation(); onExitFs() }} title="Minimizar (sair da tela cheia)"><Fa name="minimize" size={14} /></button>
      )}
    </div>
  )
}

function ScreenMosaicView({ currentUser, screenSharing, screenStream, remoteScreenStreams, participants, focusedScreen, onFocus, onTileContextMenu, isTileFsActive, onExitTileFs, speakingUsers }: {
  focusedScreen: string | null
  currentUser: { id: string } | null
  screenSharing: boolean
  screenStream: MediaStream | null
  remoteScreenStreams: Record<string, MediaStream>
  participants: { userId: string; userName: string }[]
  onFocus: (id: string | null) => void
  onTileContextMenu: (id: string, x: number, y: number) => void
  isTileFsActive: (id: string) => boolean
  onExitTileFs: () => void
  speakingUsers: Record<string, boolean>
}) {
  // Mute real (store) para o anel vermelho: a prop `participants` aqui não
  // tem os flags, então lê do store (sincronizado via media-state).
  const liveParts = useCallStore(s => s.participants)
  const selfMuted = useCallStore(s => s.muted || s.deafened)
  const tiles: { id: string; stream: MediaStream | null; label: string; remote: boolean }[] = []
  if (screenSharing && screenStream) {
    tiles.push({ id: currentUser?.id || 'local', stream: screenStream, label: 'Sua tela', remote: false })
  }
  for (const [uid, stream] of Object.entries(remoteScreenStreams)) {
    tiles.push({ id: uid, stream, label: participants.find(p => p.userId === uid)?.userName || 'Alguém', remote: true })
  }

  if (tiles.length === 0) return null

  return (
    <div className="vc-voice-mosaic-wrap">
      <WatchPartyBar />
      <div className="vc-voice-mosaic">
        {tiles.map(t => {
          const mp = t.remote ? liveParts.find(p => p.userId === t.id) : null
          const tileMuted = t.remote ? Boolean(mp?.muted || mp?.deafened) : selfMuted
          return (
          <MosaicScreenTile
            key={t.id}
            tileId={t.id}
            stream={t.stream}
            label={t.label}
            focused={focusedScreen === t.id}
            speaking={Boolean(speakingUsers[t.id])}
            muted={tileMuted}
            onFocus={() => onFocus(focusedScreen === t.id ? null : t.id)}
            onContextMenu={(x, y) => onTileContextMenu(t.id, x, y)}
            fsActive={isTileFsActive(t.id)}
            onExitFs={onExitTileFs}
          />
          )
        })}
      </div>
    </div>
  )
}

