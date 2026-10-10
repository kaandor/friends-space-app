import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from 'livekit-client'
import type {
  RemoteParticipant,
  TrackPublication,
} from 'livekit-client'
import { useCallStore } from '../stores/callStore'
import { useUserStore } from '../stores/userStore'
import { requestBackend } from './backend'
import type { CallParticipant } from '../types'
import type { CallQuality } from '../services/antiloud'

let room: Room | null = null
let bridgeTimer: number | null = null
let joining = false
let cleaning = false

async function reportLivekit(stage: string, message: string) {
  try {
    const { requestBackend } = await import('./backend')
    void requestBackend('reportClientError', { where: 'livekit:' + stage, message: String(message).slice(0, 300) }).catch(() => {})
  } catch {}
}

export function isLivekitActive(): boolean {
  return !!room
}

function userLabel(identity: string): { name: string; photo: string } {
  try {
    const u = useUserStore.getState().users.find((x) => x.id === identity)
    return { name: u?.name || 'Usuário', photo: u?.photoUrl || '' }
  } catch {
    return { name: 'Usuário', photo: '' }
  }
}

function qualityEncoding(quality: CallQuality, fps: number, bitrateKbps: number): { maxBitrate: number; maxFramerate: number } {
  const f = Math.min(Math.max(fps || 30, 15), 60)
  const br = Math.min(Math.max(bitrateKbps || 4000, 500), 16000) * 1000
  if (quality === '2k') return { maxBitrate: Math.min(br, 16000000), maxFramerate: Math.min(f, 60) }
  if (quality === '1080p') return { maxBitrate: Math.min(br, 8000000), maxFramerate: Math.min(f, 60) }
  if (quality === '720p') return { maxBitrate: Math.min(br, 3000000), maxFramerate: Math.min(f, 60) }
  return { maxBitrate: Math.min(br, 1200000), maxFramerate: Math.min(f, 30) }
}

function cameraResolution(quality: CallQuality) {
  if (quality === '2k') return VideoPresets.h1440.resolution
  if (quality === '1080p') return VideoPresets.h1080.resolution
  if (quality === '720p') return VideoPresets.h720.resolution
  return undefined
}

function trackOf(pub: TrackPublication | undefined): MediaStreamTrack | null {
  try {
    const t = (pub as unknown as { track?: { mediaStreamTrack?: MediaStreamTrack } | null }).track
    return t?.mediaStreamTrack || null
  } catch {
    return null
  }
}

function localTrack(kind: 'audio' | 'video' | 'screen'): MediaStreamTrack | null {
  try {
    if (!room) return null
    const lp = room.localParticipant
    const pubs = Array.from(lp.trackPublications.values()) as TrackPublication[]
    for (const pub of pubs) {
      const src = (pub as unknown as { source?: unknown }).source
      if (kind === 'audio' && src === Track.Source.Microphone) {
        const t = trackOf(pub)
        if (t) return t
      }
      if (kind === 'video' && src === Track.Source.Camera) {
        const t = trackOf(pub)
        if (t) return t
      }
      if (kind === 'screen' && (src === Track.Source.ScreenShare || src === Track.Source.ScreenShareAudio)) {
        const t = trackOf(pub)
        if (t && t.kind === 'video') return t
      }
    }
    return null
  } catch {
    return null
  }
}

function rebuildRemoteState() {
  if (!room) return
  try {
    const s = useCallStore.getState()
    const prev = new Map(s.participants.map((p) => [p.userId, p]))
    const parts: CallParticipant[] = []
    const remoteStreams: Record<string, MediaStream> = {}
    const remoteScreenStreams: Record<string, MediaStream> = {}
    const conn: Record<string, string> = {}
    for (const [identity, rp] of room.remoteParticipants) {
      const typed = rp as RemoteParticipant
      const { name, photo } = userLabel(identity)
      const old = prev.get(identity)
      let micMuted = old?.muted
      try {
        if (micMuted === undefined) micMuted = !typed.isMicrophoneEnabled
      } catch {
        micMuted = old?.muted ?? false
      }
      parts.push({
        userId: identity,
        userName: name,
        userPhoto: photo,
        muted: micMuted ?? false,
        deafened: old?.deafened ?? false,
      })
      conn[identity] = 'connected'
      const voice: MediaStreamTrack[] = []
      const screen: MediaStreamTrack[] = []
      try {
        for (const pub of typed.trackPublications.values()) {
          const src = (pub as unknown as { source?: unknown }).source
          const t = trackOf(pub as unknown as TrackPublication)
          if (!t) continue
          if (src === Track.Source.ScreenShare || src === Track.Source.ScreenShareAudio) screen.push(t)
          else voice.push(t)
        }
      } catch {}
      if (voice.length) remoteStreams[identity] = new MediaStream(voice)
      if (screen.length) remoteScreenStreams[identity] = new MediaStream(screen)
    }
    const meU = useUserStore.getState().currentUser
    if (meU && !parts.some((p) => p.userId === meU.id)) {
      const oldSelf = prev.get(meU.id)
      parts.unshift({
        userId: meU.id,
        userName: meU.name,
        userPhoto: meU.photoUrl || '',
        muted: oldSelf?.muted ?? s.muted,
        deafened: oldSelf?.deafened ?? s.deafened,
      })
    }
    useCallStore.setState({
      participants: parts,
      remoteStreams,
      remoteScreenStreams,
      connectionStates: { ...s.connectionStates, ...conn },
    })
  } catch {}
}

function rebuildLocalState() {
  if (!room) return
  try {
    const mic = localTrack('audio')
    const cam = localTrack('video')
    const tracks: MediaStreamTrack[] = []
    if (mic) tracks.push(mic)
    if (cam) tracks.push(cam)
    if (tracks.length) {
      useCallStore.setState({ localStream: new MediaStream(tracks) })
    }
    const screen = localTrack('screen')
    if (screen) {
      useCallStore.setState({ screenStream: new MediaStream([screen]) })
    }
  } catch {}
}

function safeHandler(fn: () => void) {
  try {
    fn()
  } catch {}
}

function wireRoomEvents(r: Room) {
  r.on(RoomEvent.ParticipantConnected, () => safeHandler(rebuildRemoteState))
  r.on(RoomEvent.ParticipantDisconnected, () => safeHandler(rebuildRemoteState))
  r.on(RoomEvent.TrackSubscribed, () => safeHandler(() => { rebuildRemoteState(); rebuildLocalState() }))
  r.on(RoomEvent.TrackUnsubscribed, () => safeHandler(rebuildRemoteState))
  r.on(RoomEvent.TrackMuted, () => safeHandler(rebuildRemoteState))
  r.on(RoomEvent.TrackUnmuted, () => safeHandler(() => { rebuildRemoteState(); rebuildLocalState() }))
  r.on(RoomEvent.LocalTrackPublished, () => safeHandler(() => { rebuildLocalState(); rebuildRemoteState() }))
  r.on(RoomEvent.LocalTrackUnpublished, () => safeHandler(() => { rebuildLocalState(); rebuildRemoteState() }))
  r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => safeHandler(() => {
    try {
      const map: Record<string, boolean> = {}
      for (const sp of speakers || []) {
        const id = (sp as unknown as { identity?: string }).identity
        if (id) map[id] = true
      }
      useCallStore.setState({ speakingUsers: map })
    } catch {}
  }))
  r.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => safeHandler(() => {
    try {
      const raw = new TextDecoder().decode(payload)
      const identity = (participant as unknown as { identity?: string } | undefined)?.identity || ''
      if (!identity) return
      const { receiveCallData } = useCallStore.getState() as unknown as {
        receiveCallData?: (identity: string, raw: string) => void
      }
      if (typeof receiveCallData === 'function') receiveCallData(identity, raw)
    } catch {}
  }))
  r.on(RoomEvent.Disconnected, () => safeHandler(() => {
    try {
      useCallStore.getState().endCall()
    } catch {}
  }))
}

function startCameraBridge() {
  stopCameraBridge()
  bridgeTimer = window.setInterval(() => {
    try {
      if (!room) return
      const s = useCallStore.getState()
      const wantOn = Boolean(s.videoEnabled)
      const pubs = Array.from(room.localParticipant.trackPublications.values()) as TrackPublication[]
      const camPub = pubs.find((p) => {
        try {
          return (p as unknown as { source?: unknown }).source === Track.Source.Camera
        } catch {
          return false
        }
      })
      const published = Boolean(camPub && !(camPub as unknown as { isMuted?: boolean }).isMuted)
      if (wantOn && !published) {
        void room.localParticipant.setCameraEnabled(true).then(() => rebuildLocalState()).catch(() => {})
      } else if (!wantOn && published) {
        void room.localParticipant.setCameraEnabled(false).catch(() => {})
      }
    } catch {}
  }, 2000)
}

function stopCameraBridge() {
  if (bridgeTimer !== null) {
    window.clearInterval(bridgeTimer)
    bridgeTimer = null
  }
}

export async function sendLivekitData(obj: unknown, targetIdentity?: string): Promise<boolean> {
  try {
    if (!room) return false
    const raw = JSON.stringify(obj)
    const bytes = new TextEncoder().encode(raw)
    if (targetIdentity) {
      await room.localParticipant.publishData(bytes, { reliable: true, destinationIdentities: [targetIdentity] })
    } else {
      await room.localParticipant.publishData(bytes, { reliable: true })
    }
    return true
  } catch {
    return false
  }
}

export interface LivekitJoinOpts {
  serverId: string
  channelId?: string
  peerId?: string
  audio: boolean
  video: boolean
}

export async function livekitJoin(opts: LivekitJoinOpts): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem('friends-space:use-livekit') !== '1') return false
  } catch {
    return false
  }
  if (joining || room) return !!room
  joining = true
  try {
    const st = useCallStore.getState()
    const meU = useUserStore.getState().currentUser
    if (!meU) {
      void reportLivekit('nouser', 'sem currentUser')
      return false
    }
    let peer = opts.peerId
    if (!peer && opts.serverId === 'dm') {
      peer = st.participants.find((p) => p.userId !== meU.id)?.userId
    }
    let creds: { url: string; token: string }
    try {
      creds = await requestBackend<{ url: string; token: string }>('getLivekitToken', {
        serverId: opts.serverId,
        channelId: opts.channelId || '',
        peerId: peer || '',
        userId: meU.id,
      })
    } catch (e) {
      void reportLivekit('token', e instanceof Error ? e.message : String(e))
      return false
    }
    if (!creds?.url || !creds?.token) {
      void reportLivekit('token', 'sem url/token')
      return false
    }
    const enc = qualityEncoding(st.preferredQuality, st.preferredFps, st.preferredBitrate)
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      publishDefaults: {
        videoEncoding: enc as never,
      },
    })
    wireRoomEvents(r)
    try {
      await r.connect(creds.url, creds.token)
    } catch (e) {
      void reportLivekit('connect', e instanceof Error ? e.message : String(e))
      try { await r.disconnect() } catch {}
      return false
    }
    room = r
    try {
      // Audio limpo (RNNoise/Astro): publica a track ja filtrada capturada no
      // join em vez da captura padrao do LiveKit. A mesma track obedece ao
      // mute (track.enabled) automaticamente.
      let cleanPublished = false
      if (opts.audio !== false) {
        try {
          const { isCleanAudioActive } = await import('./rnnoise')
          const cleanTrack = useCallStore.getState().localStream?.getAudioTracks()[0] || null
          if (isCleanAudioActive() && cleanTrack) {
            cleanPublished = await livekitPublishMicTrack(cleanTrack)
          }
        } catch {}
      }
      if (!cleanPublished) {
        await room.localParticipant.setMicrophoneEnabled(opts.audio !== false, {
          echoCancellation: true,
          noiseSuppression: true,
        })
      }
    } catch (e) {
      void reportLivekit('mic', e instanceof Error ? e.message : String(e))
    }
    if (opts.video) {
      try {
        const res = cameraResolution(st.preferredQuality)
        if (res) {
          await room.localParticipant.setCameraEnabled(true, { resolution: res })
        } else {
          await room.localParticipant.setCameraEnabled(true)
        }
      } catch {
        try {
          await room.localParticipant.setCameraEnabled(true)
        } catch {}
      }
    }
    rebuildLocalState()
    rebuildRemoteState()
    startCameraBridge()
    return true
  } catch {
    try {
      await livekitLeave()
    } catch {}
    return false
  } finally {
    joining = false
  }
}

export async function livekitLeave(): Promise<void> {
  stopCameraBridge()
  try {
    if (room) await room.disconnect()
  } catch {}
  room = null
  try {
    cleaning = true
    useCallStore.setState({ speakingUsers: {} })
  } finally {
    cleaning = false
  }
  void cleaning
}

export async function livekitToggleScreen(): Promise<void> {
  if (!room) return
  const s = useCallStore.getState()
  const meU = useUserStore.getState().currentUser
  if (s.screenSharing) {
    try {
      await room.localParticipant.setScreenShareEnabled(false)
    } catch {}
    try {
      await sendLivekitData({ t: 'screen-stopped', userId: meU?.id })
    } catch {}
    useCallStore.setState({ screenSharing: false, screenStream: null })
    try {
      window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Você parou de transmitir' }))
    } catch {}
    return
  }
  let shareAudio = true
  try {
    shareAudio = window.localStorage.getItem('friends-space:screen-audio') !== '0'
  } catch {}
  try {
    const q = useCallStore.getState().preferredQuality
    // 2k compartilha em 2560x1440 de verdade; demais qualidades usam o padrao.
    const captureOpts = q === '2k'
      ? { audio: shareAudio, resolution: VideoPresets.h1440.resolution }
      : { audio: shareAudio }
    await room.localParticipant.setScreenShareEnabled(true, captureOpts as never)
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'NotAllowedError') throw e
    await room.localParticipant.setScreenShareEnabled(true)
  }
  try {
    const pubs = Array.from(room.localParticipant.trackPublications.values()) as TrackPublication[]
    for (const pub of pubs) {
      try {
        const src = (pub as unknown as { source?: unknown }).source
        if (src !== Track.Source.ScreenShare) continue
        const track = (pub as unknown as { track?: { mediaStreamTrack?: MediaStreamTrack } | null }).track
        const mst = track?.mediaStreamTrack
        if (mst) {
          try {
            (mst as MediaStreamTrack & { contentHint?: string }).contentHint = 'detail'
          } catch {}
          if (typeof mst.addEventListener === 'function') {
            mst.onended = () => {
              void (async () => {
                try {
                  await room?.localParticipant.setScreenShareEnabled(false)
                } catch {}
                try {
                  await sendLivekitData({ t: 'screen-stopped', userId: useUserStore.getState().currentUser?.id })
                } catch {}
                useCallStore.setState({ screenSharing: false, screenStream: null })
              })()
            }
          }
        }
      } catch {}
    }
  } catch {}
  rebuildLocalState()
  useCallStore.setState({ screenSharing: true })
}

export async function livekitAttachMic(deviceId?: string): Promise<void> {
  if (!room) return
  try {
    await room.localParticipant.setMicrophoneEnabled(true, {
      echoCancellation: true,
      noiseSuppression: true,
    })
  } catch {}
  try {
    if (deviceId) await room.switchActiveDevice('audioinput', deviceId)
  } catch {}
  rebuildLocalState()
}

export async function livekitSwitchMic(deviceId: string): Promise<boolean> {
  if (!room || !deviceId) return false
  try {
    await room.switchActiveDevice('audioinput', deviceId)
    rebuildLocalState()
    return true
  } catch {
    return false
  }
}

export function livekitSetMicEnabled(on: boolean): void {
  try {
    if (!room) return
    const pubs = Array.from(room.localParticipant.trackPublications.values()) as TrackPublication[]
    for (const pub of pubs) {
      try {
        const src = (pub as unknown as { source?: unknown }).source
        if (src !== Track.Source.Microphone) continue
        const t = trackOf(pub)
        if (t) t.enabled = on
      } catch {}
    }
  } catch {}
}

export function livekitLocalVideoTrack(): MediaStreamTrack | null {
  return localTrack('video')
}

// Publica uma track de mic externa (ex.: audio ja filtrado pelo RNNoise) no
// lugar da captura padrao do LiveKit. Usado pelo audio limpo (Astro).
export async function livekitPublishMicTrack(track: MediaStreamTrack): Promise<boolean> {
  if (!room || !track) return false
  try {
    const pubs = Array.from(room.localParticipant.trackPublications.values()) as TrackPublication[]
    for (const pub of pubs) {
      try {
        const src = (pub as unknown as { source?: unknown }).source
        if (src !== Track.Source.Microphone) continue
        const t = trackOf(pub)
        await room.localParticipant.unpublishTrack(t as never, false)
      } catch {}
    }
    await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone })
    rebuildLocalState()
    return true
  } catch {
    return false
  }
}
