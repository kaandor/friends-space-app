import { create } from 'zustand'
import type { CallParticipant, CallSession, CallSessionWatch, CallSignal, User } from '../types'
import { requestBackend } from '../services/backend'
import { useUserStore } from './userStore'
import { clampStreamQuality, clampStreamFps, getMaxBitrateKbps, getMaxStreamFps, getAstroTier } from '../utils/astro'
import { stopMediaStream, QUALITY_BITRATE_KBPS } from '../services/antiloud'
import type { CallMode, CallQuality, CallFps } from '../services/antiloud'
import { startCallRecording, refreshCallRecording, stopCallRecording } from '../services/callRecording'
import { playSound } from '../services/sounds'
import { diag } from '../utils/diagCodes'

export interface ControlSettings {
  minutes: number
  mouse: boolean
  keyboard: boolean
  audio: boolean
  clipboard: boolean
  mic: boolean
}
export interface ControlGrant { mouse: boolean; keyboard: boolean }
interface CallState {
  activeCall: boolean
  channelId: string | null
  serverId: string | null
  createdAt: number | null
  participants: CallParticipant[]
  muted: boolean
  deafened: boolean
  livekitActive: boolean
  videoEnabled: boolean
  screenSharing: boolean
  localStream: MediaStream | null
  screenStream: MediaStream | null
  screenError: string | null
  remoteStreams: Record<string, MediaStream>
  remoteScreenStreams: Record<string, MediaStream>
  connectionStates: Record<string, string>
  peerProtos: Record<string, number>
  sessionWatch: CallSessionWatch | null
  speakingUsers: Record<string, boolean>
  screenMuted: boolean
  volumes: Record<string, number>
  controlRequests: { peerId: string; userName: string }[]
  controlling: string | null
  controlledBy: string | null
  controlPending: string | null
  remoteCursor: { x: number; y: number; width: number; height: number; scaleFactor?: number; visible: boolean } | null
  peerLocality: Record<string, { sameCity: boolean; sameIsp: boolean }>
  anydeskMode: boolean
  recordingActive: boolean
  sharingPeers: string[]
  recordingBy: { id: string; name: string } | null
  incomingCall: { fromId: string; fromName: string; fromPhoto: string; channelId?: string; serverId?: string; callMode?: CallMode; sessionId?: string } | null
  callingUser: { userId: string; userName: string; userPhoto: string } | null
  sessionId: string | null
  preferredQuality: CallQuality
  preferredFps: CallFps
  preferredBitrate: number
  callMode: CallMode
  callRejectedBy: { userId: string; userName: string; userPhoto: string; mode?: CallMode; reason?: 'decline' | 'timeout' } | null
  callWaiting: boolean
  startCall: (channelId: string, serverId: string, localStream: MediaStream, callMode?: CallMode, quality?: CallQuality, sessionId?: string) => void
  moveCall: (channelId: string, serverId: string) => void
  endCall: () => void
  addParticipant: (participant: CallParticipant) => void
  removeParticipant: (userId: string) => void
  toggleMute: () => void
  toggleDeafen: () => void
  setVideoEnabled: (enabled: boolean) => void
  setCleanAudioEnabled: (on: boolean) => Promise<void>
  toggleScreenShare: () => Promise<void>
  toggleScreenMute: () => void
  toggleRecording: () => void
  clearScreenError: () => void
  setVolume: (key: string, value: number) => void
  setVolumeForAll: (value: number) => void
  setLocalStream: (stream: MediaStream | null) => void
  attachLocalStream: (stream: MediaStream) => void
  switchMicDevice: (deviceId: string) => Promise<void>
  setIncomingCall: (call: { fromId: string; fromName: string; fromPhoto: string; channelId?: string; serverId?: string; callMode?: CallMode; sessionId?: string } | null) => void
  declineIncomingCall: () => void
  setCallingUser: (user: { userId: string; userName: string; userPhoto: string } | null) => void
  loadCallSessions: (serverId: string, userId?: string) => Promise<CallSession[]>
  setPreferredQuality: (quality: CallQuality) => Promise<void>
  setPreferredFps: (fps: CallFps) => Promise<void>
  setPreferredBitrate: (kbps: number) => Promise<void>
  setSpeaking: (userId: string, speaking: boolean) => void
  setScreenAudioEnabled: (enabled: boolean) => void
  requestControl: (peerId: string) => void
  acceptControlRequest: (peerId: string) => void
  denyControlRequest: (peerId: string) => void
  sendControlInput: (input: { it: 'move' | 'moveRel' | 'button' | 'wheel' | 'key'; x?: number; y?: number; dx?: number; dy?: number; button?: string; down?: boolean; deltaY?: number; key?: string }) => void
  sendClipboard: (text: string) => void
  controlSettings: ControlSettings
  setControlSettings: (patch: Partial<ControlSettings>) => void
  controlEndsAt: number | null
  controlGrants: ControlGrant | null
  controlLinkOk: boolean | null
  lastInputAckAt: number | null
  stopControlling: () => void
  revokeControl: () => void
  setAnydeskMode: (enabled: boolean) => void
  callUser: (userId: string, mode?: CallMode) => Promise<void>
  dismissRejectedCall: () => void
  inviteToCall: (userId: string) => Promise<void>
  acceptCallInvite: (invite: { fromUserId: string; fromName: string; fromPhoto: string; data?: Record<string, unknown> }) => Promise<void>
  rejectCallInvite: (invite: { fromUserId: string; data?: Record<string, unknown> }) => Promise<void>
}

const peerConnections = new Map<string, RTCPeerConnection>()
const dataChannels = new Map<string, RTCDataChannel>()
const processedSignals = new Set<string>()
// Sinais do mesmo peer em FILA: oferta via DC + via backend chegavam juntas e
// duas applySignal concorrentes disputavam a PC (uma fazia rollback da outra
// -> "set local answer sdp: Called in wrong state: stable").
const signalQueue = new Map<string, Promise<void>>()
function applySignalQueued(signal: CallSignal): Promise<void> {
  const prev = signalQueue.get(signal.fromUserId) || Promise.resolve()
  const next = prev.catch(() => {}).then(() => applySignal(signal))
  const settled = next.catch(() => {})
  signalQueue.set(signal.fromUserId, settled)
  void settled.then(() => { if (signalQueue.get(signal.fromUserId) === settled) signalQueue.delete(signal.fromUserId) })
  return next
}
async function auditRecordingEvent(action: 'start' | 'stop', userId: string, userName: string) {
  try {
    const { requestBackend } = await import('../services/backend')
    await requestBackend('reportClientError', { where: 'call:recording', message: `${action} by ${userName} (${userId})`.slice(0, 200) }).catch(() => {})
  } catch { }
}
const pendingCandidates = new Map<string, RTCIceCandidateInit[]>()
const declinedSessions = new Set<string>()
// Sessoes cujo toque ja terminou (30s sem atender -> sala de espera). Impede
// que o poll re-dispara o overlay de chamada recebida para a MESMA sessao.
const ringStoppedSessions = new Set<string>()
const reconnectRetries = new Map<string, number>()
const reconnectTimers = new Map<string, number>()
const disconnectTimers = new Map<string, number>()
const dtlsStuckTimers = new Map<string, number>()
const renegotiationAttempts = new Map<string, number>()
const creatingPeers = new Set<string>()
const peerCreatedAt = new Map<string, number>()
// Ultima vez que cada peer chegou a 'connected'. Usado para podar FANTASMAS:
// peer fora do backend so e mantido se conectou ha <30s (reconectando). PC
// presa em 'new'/'connecting'/'disconnected' para sempre NAO e prova de vida.
const peerLastConnected = new Map<string, number>()
const lastFallbackRetry = new Map<string, number>()
const peerQualityTier = new Map<string, number>()
let signalTimer: number | null = null
let signalVisibilityBound = false
let presenceSoundsArmed = false
let ringTimer: number | null = null
let presenceTimer: number | null = null
// Ultimos erros de envio de signal (para diagnostico visivel no painel).
const lastSignalErrors: Array<{ type: string; msg: string; ts: number }> = []
// RTT real medido nas requisições que já existem (sem ping extra).
// Exposto no Debug para diagnosticar ping alto em calls de servidor.
export let lastSignalRttMs: number | null = null
export let lastSignalRttAt = 0
export let lastPresenceRttMs: number | null = null
export let lastPresenceRttAt = 0
// Timer de 30s do lado de quem RECEBE a chamada: se nao atender a tempo,
// a ligacao e recusada automaticamente (mesmo comportamento do Discord).
let incomingTimer: number | null = null

function clearIncomingTimer() {
  if (incomingTimer !== null) {
    window.clearTimeout(incomingTimer)
    incomingTimer = null
  }
}
let sessionSyncOff: (() => void) | null = null

// Em malha (P2P) cada participante envia o video para todos os outros, entao o
// bitrate de cada sender e dividido pelo numero de participantes para nao
// saturar a banda. O monitor de rede degrada/restaura o bitrate por peer.
const MESH_VIDEO_BUDGET_KBPS = 32000
const MIN_PEER_VIDEO_KBPS = 400
const MAX_PEER_VIDEO_KBPS = 16000
const SCREEN_MIN_VIDEO_KBPS = 3000
const MAX_RECONNECT_ATTEMPTS = 4

// Persistencia local da qualidade/fps/bitrate preferidos (o desktop lembra).
const QUALITY_KEY = 'friends-space:call-quality'
const FPS_KEY = 'friends-space:call-fps'
const BITRATE_KEY = 'friends-space:call-bitrate'
const loadPref = (key: string, fallback: number | string) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (typeof fallback === 'number' ? Number(raw) : raw) : fallback
  } catch {
    return fallback
  }
}
const savePref = (key: string, value: string | number) => {
  try { localStorage.setItem(key, String(value)) } catch { }
}

// Localidade de rede de cada peer (mesma cidade / mesmo provedor), usada para
// dar bitrate e prioridade maiores a quem esta na mesma cidade/distribuidora.
const peerNetworkTier = new Map<string, { sameCity: boolean; sameIsp: boolean }>()
const normalizeNet = (n: unknown): { city?: string; region?: string; country?: string; asn?: string; isp?: string } | null => {
  if (!n || typeof n !== 'object') return null
  const o = n as Record<string, unknown>
  const city = typeof o.city === 'string' ? o.city.trim() : ''
  const region = typeof o.region === 'string' ? o.region.trim() : ''
  const country = typeof o.country === 'string' ? o.country.trim() : ''
  const asn = typeof o.asn === 'string' ? o.asn.trim() : ''
  const isp = typeof o.isp === 'string' ? o.isp.trim() : ''
  if (!city && !region && !country && !asn && !isp) return null
  return { city, region, country, asn, isp }
}

function computeLocality(peerId: string) {
  const mine = normalizeNet(useUserStore.getState().currentUser?.network)
  const theirs = normalizeNet(useUserStore.getState().users.find(u => u.id === peerId)?.network)
  const sameCity = Boolean(mine?.city && theirs?.city && mine.city === theirs.city
    || mine?.region && theirs?.region && mine.region === theirs.region)
  const sameIsp = Boolean(mine?.asn && theirs?.asn && mine.asn === theirs.asn
    || mine?.isp && theirs?.isp && mine.isp === theirs.isp)
  peerNetworkTier.set(peerId, { sameCity, sameIsp })
  return { sameCity, sameIsp }
}

function localityOf(peerId: string) {
  let tier = peerNetworkTier.get(peerId)
  if (!tier) tier = computeLocality(peerId)
  return tier
}

function refreshLocalities(participants: CallParticipant[]) {
  const next: Record<string, { sameCity: boolean; sameIsp: boolean }> = {}
  for (const p of participants) {
    if (p.userId === useUserStore.getState().currentUser?.id) continue
    const loc = computeLocality(p.userId)
    next[p.userId] = loc
  }
  useCallStore.setState({ peerLocality: next })
}

function startCursorFeed(controlledBy: string | null) {
  const api = getElectronAPI()
  if (api?.remoteCursorFeed && controlledBy) api.remoteCursorFeed(true)
}
function stopCursorFeed() {
  const api = getElectronAPI()
  if (api?.remoteCursorFeed) api.remoteCursorFeed(false)
}

let cursorRelayOff: (() => void) | null = null
let rcUnavailOff: (() => void) | null = null
// Quando EU sou controlado (estilo AnyDesk), o app desktop (Electron) envia a
// posicao real do mouse aqui, e repassamos ao controlador pelo data channel.
function setupCursorRelay(controlledBy: string | null) {
  if (cursorRelayOff) {
    try { cursorRelayOff() } catch { }
    cursorRelayOff = null
  }
  const api = getElectronAPI()
  startCursorFeed(controlledBy)
  if (api?.onRemoteControlUnavailable && !rcUnavailOff) {
    try {
      rcUnavailOff = api.onRemoteControlUnavailable(() => {
        try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Controle remoto indisponivel neste Linux (Wayland ou sem xdotool) — voz e tela seguem normais' })) } catch { }
      })
    } catch { rcUnavailOff = null }
  }
  if (!controlledBy) {
    if (rcUnavailOff) { try { rcUnavailOff() } catch { } rcUnavailOff = null }
    return
  }
  if (!api?.onRemoteCursor) return
  cursorRelayOff = api.onRemoteCursor((data: { x: number; y: number; width: number; height: number; scaleFactor?: number }) => {
      void sendControlMessage(controlledBy, { type: 'cursor', ...data, visible: true })
  })
}

// Transceiver de tela por peer: REUTILIZADO entre liga/desliga para manter a
// ordem das m-lines estável. Criar um novo a cada vez (addTransceiver) e
// remover (removeTrack) mudava a ordem/count e o remoto falhava com:
// "The order of m-lines in subsequent offer doesn't match...".
const screenTransceivers = new Map<string, RTCRtpTransceiver>()
// Slot de ÁUDIO da tela (separado do vídeo): o áudio do getDisplayMedia NÃO
// pode reusar o transceiver de vídeo (replaceTrack falha por kind, dava stop
// + addTransceiver no fim e embaralhava as m-lines a cada compartilhar).
const screenAudioTransceivers = new Map<string, RTCRtpTransceiver>()
// Slots canônicos de mic/câmera por peer: ligar a câmera depois ou trocar de
// mic dá replaceTrack no slot em vez de addTrack (que acrescentava m-line no
// fim e mudava o layout entre gerações da PC).
// Instante do último reset local da PC por peer. Ofertas criadas ANTES do
// reset (da geração antiga da PC remota) têm m-lines incompatíveis com a PC
// nova e falham com "order of m-lines ... doesn't match". Sem este guarda,
// o watchdog de 20s recria de um lado, a oferta velha do outro lado falha,
// o handler recria deste lado, e os dois ficam se resetando em loop.
const peerResetAt = new Map<string, number>()
// Geração (epoch) da PC por peer: incrementa a cada closePeer (todo reset).
// Vai embutida em cada offer/renegotiate (payload.fsGen). Ofertas de geração
// mais velha que a já vista são descartadas — isso quebra o ping-pong de
// reset mútuo ESTRUTURALMENTE (o guarda por timestamp falhava quando as
// ofertas cruzadas nasciam DEPOIS do reset, vindas da geração antiga remota).
// Peers em build velho não mandam fsGen: passam sempre (compat).
const peerGen = new Map<string, number>()
const remoteGen = new Map<string, number>()
// Falhas de m-line consecutivas por peer (60s): com 5+, para de auto-resetar
// (evita loop quente de CPU/bateria quando o remoto insiste em layout
// incompatível, ex.: build velho) e avisa para sair/entrar de novo.
const mlineFails = new Map<string, number[]>()
const mlineToasted = new Set<string>()
// Client de cada peer ('web' | 'electron'): aprendido via offer/answer.
// Dirige o DOWNSCALE por peer — EXE manda 1080p/2k/4k, mas quem está no
// navegador recebe 720p (limite do Chrome) com o bitrate alto original
// (720p nítido); EXE recebe full. Sem isso o browser tentava engolir 4K.
// Peers em build velho não mandam client: tratados como 'web' (seguro).
const peerClient = new Map<string, 'web' | 'electron'>()
// Boost de controle remoto por peer: enquanto controlamos a tela de alguém
// (só EXE→EXE), o sharer sobe o bitrate daquele peer ao teto para não travar.
const controlBoosted = new Set<string>()
const mediaSlots = new Map<string, { audio?: RTCRtpTransceiver; video?: RTCRtpTransceiver }>()
async function attachScreenTrack(pc: RTCPeerConnection, peerId: string, track: MediaStreamTrack, stream: MediaStream) {
  // Vídeo e áudio da tela têm slots PRÓPRIOS (criados na construção da PC,
  // sempre nas mesmas posições). Só cai no addTransceiver se o slot sumiu.
  const slotMap = track.kind === 'audio' ? screenAudioTransceivers : screenTransceivers
  const old = slotMap.get(peerId)
  if (old && old.direction !== 'stopped') {
    try {
      await old.sender.replaceTrack(track)
      try { old.direction = 'sendonly' } catch { }
      return old.sender
    } catch { }
    try { old.stop() } catch { }
  }
  const created = pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] })
  slotMap.set(peerId, created)
  return created.sender
}
function detachScreenTrack(pc: RTCPeerConnection, localStream: MediaStream | null) {
  const isLocal = (tr?: MediaStreamTrack | null) => Boolean(tr && (tr === localStream?.getVideoTracks()[0] || tr === localStream?.getAudioTracks()[0]))
  for (const tr of pc.getTransceivers()) {
    const s = tr.sender
    if (s && s.track && !isLocal(s.track)) {
      try { void s.replaceTrack(null) } catch { }
      try { if (tr.direction !== 'stopped') tr.direction = 'inactive' } catch { }
    }
  }
}
function closePeer(peerId: string) {
  peerResetAt.set(peerId, Date.now())
  peerGen.set(peerId, (peerGen.get(peerId) ?? 0) + 1)
  const pc = peerConnections.get(peerId)
  if (pc) { try { pc.close() } catch { } }
  peerConnections.delete(peerId)
  peerCreatedAt.delete(peerId)
  peerLastConnected.delete(peerId)
  dataChannels.delete(peerId)
  const timer = disconnectTimers.get(peerId)
  if (timer !== undefined) { window.clearTimeout(timer); disconnectTimers.delete(peerId) }
  const reconnectTimer = reconnectTimers.get(peerId)
  if (reconnectTimer !== undefined) { window.clearTimeout(reconnectTimer); reconnectTimers.delete(peerId) }
  const dtlsTimer = dtlsStuckTimers.get(peerId)
  if (dtlsTimer !== undefined) { window.clearTimeout(dtlsTimer); dtlsStuckTimers.delete(peerId) }
  renegotiationAttempts.delete(peerId)
  iceRestartAt.delete(peerId)
  relayFallbackDone.delete(peerId)
  screenTransceivers.delete(peerId)
  screenAudioTransceivers.delete(peerId)
  mediaSlots.delete(peerId)
  peerProto.delete(peerId)
  protoToasted.delete(peerId)
  useCallStore.setState(state => {
    if (!(peerId in state.peerProtos)) return state
    const next = { ...state.peerProtos }
    delete next[peerId]
    return { peerProtos: next }
  })
  // Para tracks de midia remota e limpa registros de sinal/candidato
  const streams = { ...useCallStore.getState().remoteStreams }
  const oldStream = streams[peerId]
  if (oldStream) { try { oldStream.getTracks().forEach(t => t.stop()) } catch { } }
  delete streams[peerId]
  const screenStreams = { ...useCallStore.getState().remoteScreenStreams }
  const oldScreen = screenStreams[peerId]
  if (oldScreen) { try { oldScreen.getTracks().forEach(t => t.stop()) } catch { } }
  delete screenStreams[peerId]
  useCallStore.setState({ remoteStreams: streams, remoteScreenStreams: screenStreams })
  pendingCandidates.delete(peerId)
  for (let i = candidateBatch.length - 1; i >= 0; i--) {
    if (candidateBatch[i] && candidateBatch[i].toUserId === peerId) candidateBatch.splice(i, 1)
  }
  peerNetworkTier.delete(peerId)
  peerQualityTier.delete(peerId)
}

function clearRingState() {
  if (ringTimer !== null) {
    window.clearTimeout(ringTimer)
    ringTimer = null
  }
  const s = useCallStore.getState()
  if (s.callingUser) useCallStore.setState({ callingUser: null })
  if (s.callWaiting) useCallStore.setState({ callWaiting: false })
}

let cachedIceServers: RTCIceServer[] | null = null
let cachedIceServersAt = 0
const ICE_CACHE_MS = 6 * 60 * 60 * 1000

function fallbackIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = []
  // TURN credenciado (fallback) primeiro: essencial em 4G/5G, dados moveis,
  // WiFi, ethernet/LAN e tethering de internet (celular -> PC via cabo, que
  // troca o IP publico). O relay mantem a call viva mesmo quando o IP muda.
  const turnUrl = import.meta.env.VITE_TURN_URL
  const turnUsername = import.meta.env.VITE_TURN_USERNAME
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL
  if (turnUrl && turnUsername && turnCredential) {
    servers.push({ urls: turnUrl.split(',').map((url: string) => url.trim()).filter(Boolean), username: turnUsername, credential: turnCredential })
  }
  servers.push({
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun.cloudflare.com:3478',
    ],
  })
  return servers
}

// TURN e usado apenas como ultimo recurso: o ICE tenta primeiro host (P2P
// direto na LAN) e depois STUN (srflx, P2P pela internet). O relay TURN so
// entra quando a conexao direta falha (ex.: mesmo IP publico / hairpin NAT).
// As credenciais sao curtas (24h), geradas pelo backend e cacheadas 6h aqui
// para nao gastar chamadas desnecessarias.
// FAST-PATH: iceServersSync retorna IMEDIATO (cache ou fallback) para a PC
// conectar sem esperar o backend (cold start). warmIceServers atualiza o
// cache em background.
function iceServersSync(): RTCIceServer[] {
  if (cachedIceServers && cachedIceServers.length) return cachedIceServers
  return fallbackIceServers()
}

export function warmIceServers() {
  // Pré-aquecimento TURN: pode ser chamado ao abrir o canal (antes do join)
  // para a PC já nascer com relay válido, sem esperar o cold start.
  try {
    const now = Date.now()
    if (cachedIceServers && now - cachedIceServersAt < ICE_CACHE_MS) return
    const hadCache = Boolean(cachedIceServers && cachedIceServers.length)
    void requestBackend<{ iceServers: RTCIceServer[] | null }>('getTurnCredentials', {}).then(data => {
      if (data && Array.isArray(data.iceServers) && data.iceServers.length) {
        cachedIceServers = data.iceServers
        cachedIceServersAt = Date.now()
        // PCs criadas com fallback (sem TURN) ganham o relay agora: sem isso,
        // quem precisa de relay ficava preso em DTLS connecting para sempre.
        for (const [, pc] of peerConnections) {
          try { pc.setConfiguration({ iceServers: data.iceServers }) } catch { }
        }
        if (!hadCache) {
          for (const [, pc] of peerConnections) {
            const st = pc.connectionState
            if (st === 'connecting' || st === 'disconnected') {
              try { pc.restartIce() } catch { }
            }
          }
        }
      }
    }).catch(() => { })
  } catch { }
}
// Fila de espera + pre-conexao ("mente colmeia"): ao ENTRAR no servidor,
// ICE + sessoes + usuarios ja ficam quentes (sem midia: sem gesto, sem
// permissao). Ao SAIR da call, fica o carimbo standby — o rejoin reaproveita
// tudo que ainda vale. Cada entrada e UM usuario a menos para descobrir do
// zero: sem atraso, sem kick por timeout frio, sem fantasma.
const standbyByServer = new Map<string, number>()
const prewarmAt = new Map<string, number>()
export function prewarmServer(serverId: string) {
  try {
    if (!serverId) return
    const now = Date.now()
    if (now - (prewarmAt.get(serverId) || 0) < 30000) return
    prewarmAt.set(serverId, now)
    warmIceServers()
    const me = useUserStore.getState().currentUser
    void useCallStore.getState().loadCallSessions(serverId, me?.id).catch(() => { })
    void useUserStore.getState().loadUsers().catch(() => { })
  } catch { }
}
export function standbyFresh(serverId: string): boolean {
  try {
    if (!serverId) return false
    return Date.now() - (standbyByServer.get(serverId) || 0) < 5 * 60 * 1000
  } catch { return false }
}
// Diagnóstico real de TURN na máquina/rede do usuário: cria uma PC
// temporária, coleta candidatos e diz se há relay/srflx/host. Usado pelo
// botão "Testar TURN" do Debug — testa o caminho de verdade (não adivinha).
export interface TurnTestResult { relay: boolean; srflx: boolean; host: boolean; ms: number; source: string; error?: string }
export async function testTurnConnectivity(): Promise<TurnTestResult> {
  const t0 = Date.now()
  const res: TurnTestResult = { relay: false, srflx: false, host: false, ms: 0, source: 'fallback' }
  let servers: RTCIceServer[] = []
  try {
    const data = await Promise.race([
      requestBackend<{ iceServers?: RTCIceServer[] | null }>('getTurnCredentials', {}),
      new Promise<null>(r => window.setTimeout(() => r(null), 8000)),
    ])
    if (data && Array.isArray(data.iceServers) && data.iceServers.length) {
      servers = data.iceServers
      res.source = 'backend'
    }
  } catch { }
  if (!servers.length) servers = fallbackIceServers()
  return new Promise<TurnTestResult>((resolve) => {
    let done = false
    let pc: RTCPeerConnection | null = null
    const finish = (error?: string) => {
      if (done) return
      done = true
      res.ms = Date.now() - t0
      if (error && !res.relay && !res.srflx) res.error = error
      try { pc?.close() } catch { }
      resolve(res)
    }
    try {
      pc = new RTCPeerConnection({ iceServers: servers })
    } catch { finish('pc-failed'); return }
    const cur = pc
    cur.onicecandidate = (e) => {
      const c = (e.candidate && e.candidate.candidate) || ''
      if (c.includes(' typ relay ')) res.relay = true
      else if (c.includes(' typ srflx ')) res.srflx = true
      else if (c.includes(' typ host ')) res.host = true
      if (res.relay && res.srflx) finish()
    }
    cur.onicegatheringstatechange = () => {
      if (cur.iceGatheringState === 'complete') finish()
    }
    try {
      cur.createDataChannel('turn-test')
      void cur.createOffer()
        .then(o => cur.setLocalDescription(o))
        .catch(() => finish('offer-failed'))
    } catch { finish('offer-failed'); return }
    window.setTimeout(() => finish('timeout'), 10000)
  })
}
// DTLS travado com ICE ok: restartIce (preserva m-lines, sem glare) em vez de
// recriar a PC. Recriar no meio do handshake reiniciava o ciclo para sempre.
const iceRestartAt = new Map<string, number>()
// Fallback relay (uma vez por peer por call): após 18s preso em
// connecting/disconnected, se EXISTE candidato relay coletado, força
// iceTransportPolicy 'relay' + restartIce (salva 4G/CGNAT onde P2P falha).
// Sem relay coletado, o problema são as credenciais — avisa 1x/2min.
const relayFallbackDone = new Set<string>()
let relayToastAt = 0
function watchStuckDtls(peerId: string, pc: RTCPeerConnection) {
  const state = pc.connectionState
  if (state !== 'connecting' && state !== 'disconnected') {
    iceRestartAt.delete(peerId)
    return
  }
  const since = iceRestartAt.get(peerId) || 0
  if (!since) {
    iceRestartAt.set(peerId, Date.now())
    return
  }
  if (Date.now() - since > 15000) {
    iceRestartAt.set(peerId, Date.now() + 60000)
    try { pc.restartIce() } catch { }
  }
  if (Date.now() - since > 18000 && !relayFallbackDone.has(peerId)) {
    relayFallbackDone.add(peerId)
    void (async () => {
      try {
        let relay = false
        const stats = await pc.getStats()
        stats.forEach(report => {
          const r = report as unknown as { type?: string; candidateType?: string; url?: string }
          if (r.type === 'local-candidate' && (r.candidateType === 'relay' || String(r.url || '').startsWith('turn'))) relay = true
        })
        if (relay) {
          try { pc.setConfiguration({ iceTransportPolicy: 'relay' }) } catch { }
          try { pc.restartIce() } catch { }
          iceRestartAt.set(peerId, Date.now())
        } else if (Date.now() - relayToastAt > 120000) {
          try {
            relayToastAt = Date.now()
            diag('TURN-NOROUTE-04', 'Sem rota relay (TURN) — abra o Debug e toque em Testar TURN', 'call:ice')
          } catch { }
        }
      } catch { }
    })()
  }
}

async function sendSignal(signal: Omit<CallSignal, 'id' | 'createdAt'>) {
  // Offer SEMPRE pelo backend: e o primeiro contato entre peers — nao
  // existe DC aberto legitimo antes da conexao estabelecer. Candidate/reneg/
  // answer: so pelo DC se a PC do peer esta CONNECTADA (garante que o DC nao
  // e orfao de uma call anterior, cujo onclose ainda nao disparou e que o
  // remoto nao escuta mais — senao o signal vai pro vacuo: sem erro, sem
  // rastro no backend).
  // ANTES, qualquer DC com readyState 'open' era usado, mesmo orfao de call
  // anterior — o offer/answer era engolido silenciosamente e o peer ficava
  // preso em new/ice:new com candidatos no painel e 0 signals no backend.
  // O answer da RENEGOCIACAO (ex.: tela) vai pelo DC: mandar pelo backend
  // somava cold start do Vercel (ate 75s) e a tela demorava 1-3min p/ aparecer.
  const canDc = signal.type === 'candidate' || signal.type === 'renegotiate' || signal.type === 'answer'
  if (canDc) {
    const dc = dataChannels.get(signal.toUserId)
    const pc = peerConnections.get(signal.toUserId)
    if (dc && dc.readyState === 'open' && pc && pc.connectionState === 'connected') {
      try {
        dc.send(JSON.stringify({ type: 'friends-space-signal', payload: signal }))
        return
      } catch { }
    }
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await requestBackend('sendCallSignal', { signal })
      return
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      lastSignalErrors.push({ type: signal.type, msg, ts: Date.now() })
      if (lastSignalErrors.length > 20) lastSignalErrors.shift()
      console.error('[CALL] sendSignal error:', signal.type, 'attempt', attempt, msg)
      if (attempt >= 2) throw error
      await new Promise(resolve => window.setTimeout(resolve, 200 * (attempt + 1)))
    }
  }
}

// Trickle em LOTE: candidates chegam em rajada no gathering; 1 HTTP por
// candidate multiplica o RTT (300ms x N no 4G). Junta por 350ms e manda de
// uma vez via sendCallSignals. Fallback: um a um se o lote falhar.
type OutSignal = Omit<CallSignal, 'id' | 'createdAt'>
const candidateBatch: OutSignal[] = []
let candidateFlushTimer: number | null = null
function queueCandidate(signal: OutSignal) {
  candidateBatch.push(signal)
  if (candidateFlushTimer !== null) return
  candidateFlushTimer = window.setTimeout(() => {
    candidateFlushTimer = null
    void flushCandidates().catch(() => { })
  }, 350)
}
async function flushCandidates() {
  if (candidateBatch.length === 0) return
  const batch = candidateBatch.splice(0, candidateBatch.length)
  // Atalho DC quando já conectado (rápido e de graça).
  const viaBackend = batch.filter(s => {
    const dc = dataChannels.get(s.toUserId)
    const pc = peerConnections.get(s.toUserId)
    if (dc && dc.readyState === 'open' && pc && pc.connectionState === 'connected') {
      try { dc.send(JSON.stringify({ type: 'friends-space-signal', payload: s })); return false } catch { }
    }
    return true
  })
  if (viaBackend.length === 0) return
  try {
    if (viaBackend.length === 1) await sendSignal(viaBackend[0])
    else await sendSignalBatch(viaBackend)
  } catch {
    // Lote falhou: reenfileira um a um pelo caminho com retry individual.
    for (const s of viaBackend) void sendSignal(s).catch(() => { })
  }
}
async function sendSignalBatch(signals: OutSignal[]) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await requestBackend('sendCallSignals', { signals })
      return
    } catch (error) {
      if (attempt >= 1) throw error
      await new Promise(resolve => window.setTimeout(resolve, 300))
    }
  }
}

// Transporte UNICO de controle: so DataChannel (uma so programacao).
// ANTES havia dois caminhos (LiveKit primeiro, DC depois): com room
// semi-aberto as mensagens iam para o vazio e o controle morria mudo.
// Agora: 'input'/'cursor' sao lossy (1 tentativa); o resto e confiavel
// (3 tentativas em ~5s cobrem o DC abrindo).
const IMPORTANT_CONTROL = new Set(['request-control', 'control-accepted', 'control-denied', 'control-revoked', 'control-ping', 'control-pong', 'input-ack', 'clipboard', 'screen-started', 'screen-stopped', 'media-state'])
function sendControlMessage(peerId: string, message: unknown) {
  let kind = ''
  try { kind = String((message as Record<string, unknown>).type || '') } catch { }
  const reliable = IMPORTANT_CONTROL.has(kind)
  const deliver = (): boolean => {
    try {
      const dc = dataChannels.get(peerId)
      if (dc && dc.readyState === 'open' && dc.bufferedAmount < 262144) {
        dc.send(JSON.stringify(message))
        return true
      }
    } catch { }
    return false
  }
  if (deliver()) return
  if (!reliable) return
  let tries = 0
  const tick = () => {
    tries++
    try {
      if (deliver()) return
      if (tries < 3) window.setTimeout(tick, tries === 1 ? 1500 : 3000)
    } catch { }
  }
  window.setTimeout(tick, 1200)
}

// Versão do protocolo de call (Fase 4): vai em toda offer/answer. Peer com
// proto conhecido e diferente = build incompatível → update obrigatório
// (banner bloqueante). Ausente = build velha (proto 0, tolerada).
export const CALL_PROTO = 1
const peerProto = new Map<string, number>()
const protoToasted = new Set<string>()

// Monta o payload de offer/renegotiate com a geração atual (fsGen). O
// receptor usa para descartar ofertas de gerações velhas. Chaves extras no
// payload são ignoradas pelo setRemoteDescription.
function offerPayload(peerId: string, offer: RTCSessionDescriptionInit): Record<string, unknown> {
  return { ...(offer as unknown as Record<string, unknown>), fsGen: peerGen.get(peerId) ?? 0, client: myClientType(), proto: CALL_PROTO }
}

// 'web' | 'electron' deste client (para o downscale por peer no remoto).
function myClientType(): 'web' | 'electron' {
  try {
    return getElectronAPI()?.isElectron ? 'electron' : 'web'
  } catch {
    return 'web'
  }
}

// Aprende o client do peer a partir de offer/answer/renegotiate e reaplica o
// budget (pode ligar/desligar o downscale 720p na hora). Também aprende o
// proto: conhecido e diferente do nosso = build incompatível (banner de
// update obrigatório); ausente = build velha, tolerada.
function learnPeerClient(peerId: string, payload: unknown): void {
  try {
    const rec = (payload as unknown as Record<string, unknown> | undefined)
    const c = rec?.client
    if (c === 'web' || c === 'electron') {
      if (peerClient.get(peerId) !== c) {
        peerClient.set(peerId, c)
        void applyPeerVideoBudget(peerId)
      }
    }
    const p = rec?.proto
    if (typeof p === 'number') {
      if (peerProto.get(peerId) !== p) {
        peerProto.set(peerId, p)
        useCallStore.setState(state => ({ peerProtos: { ...state.peerProtos, [peerId]: p } }))
      }
      if (p !== CALL_PROTO && !protoToasted.has(peerId)) {
        protoToasted.add(peerId)
        const nm = useCallStore.getState().participants.find(x => x.userId === peerId)?.userName || 'Um participante'
        diag('APP-UPDATE-09', `${nm} está numa versão incompatível — peça para atualizar o app`, 'call:proto')
      }
    }
  } catch { }
}

function getElectronAPI(): { isElectron?: boolean; remoteControlInput?: (data: unknown) => void; remoteControlInfo?: () => Promise<{ scaleFactor?: number }>; remoteCursorFeed?: (enabled: boolean) => void; onRemoteCursor?: (cb: (data: { x: number; y: number; width: number; height: number; scaleFactor?: number }) => void) => () => void; onRemoteControlUnavailable?: (cb: () => void) => () => void } | undefined {
  return (window as unknown as { electronAPI?: { isElectron?: boolean; remoteControlInput?: (data: unknown) => void; remoteControlInfo?: () => Promise<{ scaleFactor?: number }>; remoteCursorFeed?: (enabled: boolean) => void; onRemoteCursor?: (cb: (data: { x: number; y: number; width: number; height: number; scaleFactor?: number }) => void) => () => void; onRemoteControlUnavailable?: (cb: () => void) => () => void } }).electronAPI
}

async function executeRemoteInput(input: { it: 'move' | 'moveRel' | 'button' | 'wheel' | 'key'; x?: number; y?: number; dx?: number; dy?: number; button?: string; down?: boolean; deltaY?: number; key?: string }) {
  const api = getElectronAPI()
  if (!api?.isElectron || !api.remoteControlInput) return
  try {
    const by = useCallStore.getState().controlledBy
    if (by) {
      const last = lastInputAckSent.get(by) || 0
      if (Date.now() - last > 3000) {
        lastInputAckSent.set(by, Date.now())
        sendControlMessage(by, { type: 'input-ack' })
      }
    }
  } catch { }
  // Permissoes do dono: mouse bloqueado derruba move/moveRel/button/wheel,
  // teclado bloqueado derruba key. Sem registro (build velha) permite tudo.
  try {
    const by = useCallStore.getState().controlledBy
    const g = by ? controlGrantsByPeer.get(by) : undefined
    if (g) {
      const isMouse = input.it === 'move' || input.it === 'moveRel' || input.it === 'button' || input.it === 'wheel'
      if (isMouse && !g.mouse) return
      if (input.it === 'key' && !g.keyboard) return
    }
  } catch { }
  if (input.it !== 'key' && typeof input.x === 'number' && typeof input.y === 'number') {
    // Normalizado 0..1 (relativo a captura): o main escala para o display
    // de destino. ANTES multiplicava aqui pelos pixels da captura e o main
    // multiplicava DE NOVO (mira gigante/errada, em especial no Linux).
    try {
      api.remoteControlInput({ t: 'move', x: Math.min(1, Math.max(0, input.x)), y: Math.min(1, Math.max(0, input.y)) })
    } catch { }
  }
  if (input.it === 'moveRel' && typeof input.dx === 'number' && typeof input.dy === 'number') {
    try { api.remoteControlInput({ t: 'moveRel', dx: Math.round(input.dx), dy: Math.round(input.dy) }) } catch { }
    return
  }
  if (input.it === 'button') {
    api.remoteControlInput({ t: 'button', b: input.button === 'right' ? 'right' : input.button === 'middle' ? 'middle' : 'left', down: Boolean(input.down) })
  } else if (input.it === 'wheel') {
    api.remoteControlInput({ t: 'wheel', d: Math.round(input.deltaY || 0) })
  } else if (input.it === 'key') {
    api.remoteControlInput({ t: 'key', k: input.key || '', down: Boolean(input.down) })
  }
}

export function receiveCallData(identity: string, raw: string) {
  try { handleControlMessage(identity, raw) } catch { }
}
const screenAnnounceTimers = new Map<string, number>()
function broadcastCallData(obj: unknown) {
  try {
    const t = (obj as { t?: unknown }).t
    if (t === 'screen-started' || t === 'screen-stopped') {
      const key = String(t)
      const prev = screenAnnounceTimers.get(key)
      if (prev !== undefined) { try { window.clearTimeout(prev) } catch { } }
      screenAnnounceTimers.set(key, window.setTimeout(() => {
        screenAnnounceTimers.delete(key)
        try {
          const st = useCallStore.getState()
          // So reenvia se o estado continua o mesmo (evita resgatar morto).
          if (t === 'screen-started' && !st.screenSharing) return
          if (t === 'screen-stopped' && st.screenSharing) return
          for (const pid of peerConnections.keys()) {
            try { sendControlMessage(pid, obj) } catch { }
          }
        } catch { }
      }, 2500))
    }
  } catch { }
  // DCs primeiro, de forma SINCRONA: o corpo async abaixo cede o event loop
  // no primeiro await e o endCall limpa dataChannels logo em seguida — o
  // call-leave/recording-stopped nunca chegava (fantasmas na call).
  try {
    const payload = JSON.stringify(obj)
    for (const dc of dataChannels.values()) {
      try { if (dc.readyState === 'open' && dc.bufferedAmount < 262144) dc.send(payload) } catch { }
    }
  } catch { }
}
// (Unificado: sem cauda LiveKit — entrega duplicada gerava toast duplo.)
const screenRetryTimers = new Map<string, number>()
// Turbo de tela: até este instante o poll HTTP não desacelera (mín 1s mesmo
// com tudo conectado). Ligado ao iniciar/receber tela — tela tem que chegar
// junto da voz, não 8s depois no poll lento de call estável.
let screenTurboUntil = 0
export function pokeScreenTurbo(ms = 45000) {
  try { screenTurboUntil = Math.max(screenTurboUntil, Date.now() + ms) } catch { }
}
export function requestScreenResync(peerId: string) {
  try {
    const cur = useCallStore.getState()
    const me = useUserStore.getState().currentUser
    if (!cur.activeCall || !cur.sessionId || !me) return
    void sendSignal({ sessionId: cur.sessionId, fromUserId: me.id, toUserId: peerId, type: 'resync', payload: {} }).catch(() => {})
  } catch { }
}
function scheduleScreenRetry(peerId: string, attempt = 0) {
  const prev = screenRetryTimers.get(peerId)
  if (prev !== undefined) window.clearTimeout(prev)
  // Progressivo e rápido (3s/6s/8s/8s/8s): a tela aparece junto da voz em
  // vez de 8s×3. Cada tentativa chuta o poll + pede resync ao sharer.
  const delay = attempt <= 0 ? 3000 : attempt === 1 ? 6000 : 8000
  screenRetryTimers.set(peerId, window.setTimeout(() => {
    screenRetryTimers.delete(peerId)
    try {
      const cur = useCallStore.getState()
      if (!cur.activeCall || !cur.sharingPeers.includes(peerId)) return
      if (cur.remoteScreenStreams[peerId]) return
      if (attempt >= 5) {
        try { diag('SHARE-FAILED-10', 'Não foi possível carregar a tela — peça para parar e compartilhar de novo', 'call:screen') } catch { }
        return
      }
      pokeScreenTurbo()
      kickSignalPoll()
      requestScreenResync(peerId)
      scheduleScreenRetry(peerId, attempt + 1)
    } catch { }
  }, delay))
}
export function startCallPresence() {
  if (presenceTimer !== null) {
    window.clearInterval(presenceTimer)
    presenceTimer = null
  }
  // Presença 8s em vez de 3s: cada tick faz upsert+load do store inteiro
  // (~900KB). A 3s, 5 users = ~90MB/min e estouro de cota Vercel/Pages
  // (ping alto + delay no offer). 8s corta ~62% do tráfego; fantasma morre
  // pelo stamp de 35s (CALL_SYNC_GRACE_MS), sem perda de discovery.
  // Monitor de rede roda a cada tick (8s, antes era 6s) — impacto mínimo.
  presenceTimer = window.setInterval(() => { void checkCallPresence(); void monitorNetworkQuality() }, 8000)
}

function handleControlMessage(peerId: string, raw: string) {
  let message: { type: string; t?: string; [k: string]: unknown }
  try {
    message = JSON.parse(raw) as { type: string; [k: string]: unknown }
  } catch { return }
  if (message.t === 'signal-hint') {
    void processCallSignals().catch(() => { })
    return
  }
  if (message.t === 'screen-started') {
    const sharerId = (message.userId as string) || peerId
    const st0 = useCallStore.getState()
    if (!st0.sharingPeers.includes(sharerId)) {
      useCallStore.setState({ sharingPeers: [...st0.sharingPeers, sharerId] })
      try {
        const u = useUserStore.getState().users.find(x => x.id === sharerId)
        window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: `${u?.name || 'Usuário'} começou a transmitir` }))
      } catch { }
      pokeScreenTurbo()
      kickSignalPoll()
      scheduleScreenRetry(sharerId)
    }
    return
  }
  if (message.t === 'screen-stopped') {
    const st = useCallStore.getState()
    const wasSharing = st.sharingPeers.includes(peerId) || Boolean(st.remoteScreenStreams[peerId])
    const { [peerId]: _s, ...rest } = st.remoteScreenStreams
    useCallStore.setState({ remoteScreenStreams: rest, sharingPeers: st.sharingPeers.filter(id => id !== peerId) })
    if (wasSharing) {
      try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Transmissão encerrada' })) } catch { }
      try { playSound('screen-stop') } catch { }
    }
    return
  }
  if (message.t === 'recording-started') {
    const nm = typeof message.userName === 'string' && message.userName ? message.userName : 'Alguém'
    const uid = typeof message.userId === 'string' && message.userId ? message.userId : peerId
    useCallStore.setState({ recordingActive: true, recordingBy: { id: uid, name: nm } })
    try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: `${nm} começou a gravar a call` })) } catch { }
    playSound('call-join')
    return
  }
  if (message.t === 'recording-stopped') {
    useCallStore.setState({ recordingActive: false, recordingBy: null })
    try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Gravação da call encerrada' })) } catch { }
    return
  }
  if (message.t === 'media-state') {
    // Mute/deafen do remoto em tempo real: atualiza o participante para os
    // indicadores vermelhos acenderem (tiles, strip, sidebar) em todos.
    const m = message as unknown as { userId?: unknown; muted?: unknown; deafened?: unknown }
    if (typeof m.userId === 'string' && m.userId) {
      const prev = useCallStore.getState().participants.find(p => p.userId === m.userId)
      useCallStore.setState(state => ({
        participants: state.participants.map(p => p.userId === m.userId
          ? { ...p, muted: m.muted === true ? true : m.muted === false ? false : p.muted, deafened: m.deafened === true ? true : m.deafened === false ? false : p.deafened }
          : p),
      }))
      // Efeito para TODOS: so toca quando o estado MUDOU de verdade (eco ou
      // repeticao nao repetem o som).
      try {
        const nowMuted = m.muted === true ? true : m.muted === false ? false : prev?.muted
        const nowDeaf = m.deafened === true ? true : m.deafened === false ? false : (prev as unknown as { deafened?: boolean } | undefined)?.deafened
        const prevDeaf = (prev as unknown as { deafened?: boolean } | undefined)?.deafened
        if (prev && typeof nowMuted === 'boolean' && prev.muted !== nowMuted) playSound(nowMuted ? 'mute' : 'unmute')
        else if (prev && typeof nowDeaf === 'boolean' && prevDeaf !== nowDeaf) playSound(nowDeaf ? 'mute' : 'unmute')
      } catch { }
    }
    return
  }
  if (message.t === 'call-leave') {
    const leavingId = (message.userId as string) || peerId
    playSound('call-leave')
    try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Usuário saiu da call' })) } catch { }
    useCallStore.getState().removeParticipant(leavingId)
    const st = useCallStore.getState()
    const { [leavingId]: _s2, ...rest2 } = st.remoteScreenStreams
    const { [leavingId]: _r2, ...restR2 } = st.remoteStreams
    useCallStore.setState({ remoteScreenStreams: rest2, remoteStreams: restR2, sharingPeers: st.sharingPeers.filter(id => id !== leavingId) })
    const rec = useCallStore.getState().recordingBy
    if (rec && rec.id === leavingId) useCallStore.setState({ recordingActive: false, recordingBy: null })
    return
  }
  const api = getElectronAPI()
  switch (message.type) {
    case 'friends-space-signal': {
      const payload = message.payload as CallSignal | undefined
      if (payload && useCallStore.getState().activeCall) {
        if (payload.id && processedSignals.has(payload.id)) return
        if (payload.id) processedSignals.add(payload.id)
        void applySignalQueued(payload).catch(() => { })
      }
      return
    }
    case 'request-control': {
      if (!api?.isElectron) {
        sendControlMessage(peerId, { type: 'control-denied', reason: 'desktop' })
        try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Pedido de controle (use o app desktop para permitir)' })) } catch { }
        playSound('call-invite')
        return
      }
      const userName = typeof message.userName === 'string' ? message.userName : ''
      useCallStore.setState(state => {
        if (state.controlRequests.some(r => r.peerId === peerId)) return {}
        return { controlRequests: [...state.controlRequests, { peerId, userName }] }
      })
      try {
        const nm = userName || 'Usuário'
        window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: `${nm} quer controlar sua tela` }))
      } catch { }
      playSound('call-invite')
      break
    }
    case 'control-accepted': {
      const grant = message as unknown as { minutes?: unknown; mouse?: unknown; keyboard?: unknown }
      const minutes = typeof grant.minutes === 'number' ? grant.minutes : 0
      const gm = grant.mouse !== false
      const gk = grant.keyboard !== false
      useCallStore.setState(state => state.controlPending === peerId
        ? { controlling: peerId, controlPending: null, controlEndsAt: minutes > 0 ? Date.now() + minutes * 60000 : null, controlGrants: { mouse: gm, keyboard: gk }, controlLinkOk: null, lastInputAckAt: null }
        : {})
      // Handshake de enlace: ping imediato; sem pong em 4s = PC remoto mudo.
      try {
        if (useCallStore.getState().controlling === peerId) {
          sendControlMessage(peerId, { type: 'control-ping' })
          window.setTimeout(() => {
            try {
              const st = useCallStore.getState()
              if (st.controlling === peerId && st.controlLinkOk === null) {
                useCallStore.setState({ controlLinkOk: false })
                try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'PC remoto sem resposta — confira se ele atualizou o app' })) } catch { }
              }
            } catch { }
          }, 4000)
        }
      } catch { }
      break
    }
      // Controle ativo: pede bitrate máximo ao sharer (não trava o mouse).
      try { sendControlMessage(peerId, { type: 'control-boost', on: true }) } catch { }
      break
    case 'control-denied':
      useCallStore.setState(state => state.controlPending === peerId ? { controlPending: null } : {})
      break
    case 'control-revoked':
      useCallStore.setState(state => {
        const wasControlled = state.controlledBy === peerId
        if (wasControlled) setupCursorRelay(null)
        return {
          controlling: state.controlling === peerId ? null : state.controlling,
          controlledBy: wasControlled ? null : state.controlledBy,
        }
      })
      useCallStore.setState(state => (state.controlling === peerId || state.controlPending === peerId)
        ? { controlEndsAt: null, controlGrants: null }
        : {})
      try { document.exitPointerLock?.() } catch { }
      // Quem controlava saiu: volta o bitrate normal desse peer.
      if (controlBoosted.delete(peerId)) void applyPeerVideoBudget(peerId)
      break
    case 'control-boost': {
      // Pedido de bitrate máximo de quem nos controla (só EXE→EXE chega
      // aqui: web é barrada no request e no accept).
      const on = (message as unknown as { on?: unknown }).on === true
      if (on && useCallStore.getState().controlledBy !== peerId) break
      if (on) controlBoosted.add(peerId)
      else controlBoosted.delete(peerId)
      void applyPeerVideoBudget(peerId)
      // Modo game: 60fps cravados na tela enquanto controla (se o plano
      // permite), restaurando ao soltar. Sem renegociacao: so o teto do
      // encoder via setParameters.
      try {
        const st = useCallStore.getState()
        const me = useUserStore.getState().currentUser
        if (on && st.screenSharing) {
          const maxFps = getMaxStreamFps(me as never)
          if (maxFps >= 60) {
            if (gameBoostSavedFps === null) gameBoostSavedFps = st.preferredFps === 60 ? 60 : 30
            for (const [, pc] of peerConnections) {
              for (const sender of pc.getSenders()) {
                const tr = sender.track
                if (tr && tr.kind === 'video' && st.screenStream?.getVideoTracks().includes(tr)) {
                  try {
                    const par = sender.getParameters()
                    par.encodings = (par.encodings && par.encodings.length ? par.encodings : [{}]).map(e => ({ ...e, maxFramerate: 60 }))
                    void sender.setParameters(par).catch(() => { })
                  } catch { }
                }
              }
            }
          }
        } else if (!on && gameBoostSavedFps !== null) {
          const back = gameBoostSavedFps
          gameBoostSavedFps = null
          const st2 = useCallStore.getState()
          for (const [, pc2] of peerConnections) {
            for (const sender of pc2.getSenders()) {
              const tr = sender.track
              if (tr && tr.kind === 'video' && st2.screenStream?.getVideoTracks().includes(tr)) {
                try {
                  const par = sender.getParameters()
                  par.encodings = (par.encodings && par.encodings.length ? par.encodings : [{}]).map(e => ({ ...e, maxFramerate: back }))
                  void sender.setParameters(par).catch(() => { })
                } catch { }
              }
            }
          }
        }
      } catch { }
      break
    }
    case 'cursor':
      if (useCallStore.getState().controlling === peerId) {
        const c = message as unknown as { x: number; y: number; width: number; height: number; scaleFactor?: number; visible?: boolean }
        useCallStore.setState({ remoteCursor: { ...c, visible: c.visible !== false } })
      }
      break
    case 'control-ping':
      try { sendControlMessage(peerId, { type: 'control-pong' }) } catch { }
      break
    case 'control-pong':
      try {
        if (useCallStore.getState().controlling === peerId) useCallStore.setState({ controlLinkOk: true })
      } catch { }
      break
    case 'input-ack':
      try {
        if (useCallStore.getState().controlling === peerId) {
          useCallStore.setState({ controlLinkOk: true, lastInputAckAt: Date.now() })
        }
      } catch { }
      break
    case 'input':
      void executeRemoteInput(message as unknown as { it: 'move' | 'moveRel' | 'button' | 'wheel' | 'key'; x?: number; y?: number; dx?: number; dy?: number; button?: string; down?: boolean; deltaY?: number; key?: string })
      break
    case 'clipboard': {
      // Area de transferencia do controlador -> nosso PC (permissao do dono).
      const by = useCallStore.getState().controlledBy
      const g = by ? controlGrantsByPeer.get(by) : undefined
      if (g && !g.clipboard) break
      const text = (message as unknown as { text?: unknown }).text
      if (typeof text === 'string' && text.length > 0 && text.length < 100000) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            void navigator.clipboard.writeText(text).then(() => {
              try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Texto recebido na área de transferência' })) } catch { }
            }).catch(() => { })
          }
        } catch { }
      }
      break
    }
  }
}

async function triggerRenegotiation(peerId: string, attempt = 0) {
  const state = useCallStore.getState()
  const currentUser = useUserStore.getState().currentUser
  if (!currentUser || !state.sessionId) return
  const pc = peerConnections.get(peerId)
  if (!pc) return
  if (pc.signalingState !== 'stable') {
    if (attempt >= 4) return
    window.setTimeout(() => { void triggerRenegotiation(peerId, attempt + 1) }, 1500)
    return
  }
  try {
    const offer = await pc.createOffer({ iceRestart: true })
    await pc.setLocalDescription(offer)
    await sendSignal({ sessionId: state.sessionId, fromUserId: currentUser.id, toUserId: peerId, type: 'renegotiate', payload: offerPayload(peerId, offer) })
  } catch {
    if (attempt < 2) window.setTimeout(() => { void triggerRenegotiation(peerId, attempt + 1) }, 2000)
  }
}

// Renegociacao de MIDIA (add/remove track de tela) — usa iceRestart: false
// para nao reiniciar o ICE desnecessariamente. O `iceRestart: true` faz o
// browser zerar as conexoes ICE (novo ufrag/pwd), o que derruba brevemente
// a conexao e o peer remoto ve erros de sinalizacao no debug. Para adicionar
// ou remover tracks de tela, o browser ja dispara negotiationneeded sozinho;
// so precisamos criar a oferta e enviar, sem reiniciar o ICE.
// ANTES: triggerRenegotiation (com iceRestart) era usado para TUDO — inclusive
// adicionar track de tela -> o peer remoto via oferta de restart ICE enquanto
// a conexao estava estavel, causando oscilacao e erros no painel de debug.
async function triggerMediaRenegotiation(peerId: string, attempt = 0) {
  const state = useCallStore.getState()
  const currentUser = useUserStore.getState().currentUser
  if (!currentUser || !state.sessionId) return
  const pc = peerConnections.get(peerId)
  if (!pc) return
  // A oferta morria em silencio se a PC nao estava 'stable' (renegociacao ICE
  // ou re-offer em voo) — o sharer via "transmitindo" e ninguem recebia nada.
  // Espera estabilizar e tenta de novo em vez de desistir.
  if (pc.signalingState !== 'stable') {
    if (attempt >= 5) return
    window.setTimeout(() => { void triggerMediaRenegotiation(peerId, attempt + 1) }, 1500)
    return
  }
  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await sendSignal({ sessionId: state.sessionId, fromUserId: currentUser.id, toUserId: peerId, type: 'renegotiate', payload: offerPayload(peerId, offer) })
  } catch {
    if (attempt < 3) window.setTimeout(() => { void triggerMediaRenegotiation(peerId, attempt + 1) }, 2000)
  }
}

async function applyPeerVideoBudget(peerId: string) {
  const pc = peerConnections.get(peerId)
  const state = useCallStore.getState()
  if (!pc || !state.localStream) return
  const participantCount = Math.max(state.participants.length, 1)
  const tier = Math.min(peerQualityTier.get(peerId) || 0, 3)
  const divisor = Math.pow(2, tier)
  // Mesma cidade/provedor = rota curta e banda estavel: permite orcamento bem
  // maior por peer (ate ~4x o piso). Quem esta longe cai pro piso padrao.
  const loc = localityOf(peerId)
  const localBoost = loc.sameIsp ? 3 : loc.sameCity ? 2 : 1
  const ceiling = localBoost >= 3 ? 24000 : localBoost >= 2 ? 16000 : MAX_PEER_VIDEO_KBPS
  const baseBudget = Math.max(MIN_PEER_VIDEO_KBPS, Math.min(ceiling, Math.round((MESH_VIDEO_BUDGET_KBPS * localBoost) / participantCount)))
  const cameraBudget = Math.max(MIN_PEER_VIDEO_KBPS, Math.round(baseBudget / divisor))
  const screenTrack = state.screenStream?.getVideoTracks()[0]
  const qualityCeiling = QUALITY_BITRATE_KBPS[state.preferredQuality] || MAX_PEER_VIDEO_KBPS
  // Teto do plano (kbps): o menu já bloqueia acima, mas valor salvo antigo
  // pode estar maior — trava aqui também.
  const me = useUserStore.getState().currentUser
  const myPlanCap = getMaxBitrateKbps(me as never)
  const peerIsWeb = (peerClient.get(peerId) ?? 'web') === 'web'
  const boosted = controlBoosted.has(peerId)
  // Altura real capturada (para o fator de downscale web).
  let scrCapH = 0
  try { scrCapH = screenTrack?.getSettings()?.height || 0 } catch { }
  for (const sender of pc.getSenders()) {
    const track = sender.track
    if (!track || track.kind !== 'video') continue
    let target = cameraBudget
    const isScreen = Boolean(screenTrack && track === screenTrack)
    // Fator de downscale (só tela, só p/ web, só se capturamos >720p):
    // 1080p→1.5, 1440→2, 2160→3. O bitrate continua ALTO (teto original) =
    // 720p nítido no navegador. EXE recebe full.
    let scaleDown = 1
    if (isScreen) {
      if (boosted) {
        // Controle remoto ativo: bitrate no teto para não travar.
        target = Math.min(45000, Math.max(20000, state.preferredBitrate))
      } else {
        target = Math.max(SCREEN_MIN_VIDEO_KBPS, Math.min(Math.min(25000, myPlanCap), state.preferredBitrate))
      }
      if (peerIsWeb && !boosted && scrCapH > 720) {
        scaleDown = scrCapH / 720
      }
    } else {
      target = Math.max(MIN_PEER_VIDEO_KBPS, Math.min(qualityCeiling, Math.round(cameraBudget)))
    }
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      params.encodings.forEach(enc => {
        enc.maxBitrate = target * 1000
        enc.maxFramerate = state.preferredFps
        if (isScreen) {
          try { (enc as RTCRtpEncodingParameters & { scaleResolutionDownBy?: number }).scaleResolutionDownBy = scaleDown } catch { }
        }
      })
      if (isScreen) {
        try { (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'maintain-framerate' } catch { }
      }
      await sender.setParameters(params)
    } catch { }
  }
}

async function applyAllPeerVideoBudgets() {
  for (const [peerId] of peerConnections) await applyPeerVideoBudget(peerId)
}

async function monitorNetworkQuality() {
  const state = useCallStore.getState()
  const currentUser = useUserStore.getState().currentUser
  if (!state.activeCall) return
  for (const [peerId, pc] of peerConnections) {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') continue
    const created = peerCreatedAt.get(peerId) || 0
    if ((pc.connectionState === 'connecting' || pc.iceConnectionState === 'checking') && Date.now() - created > 40000) {
      // Só o lado "menor id" renegocia (papel canonico) para nunca gerar glare
      // com duas ofertas simultaneas no mesmo par. Apos MAX tentativas sem
      // conectar, derruba o peer — o processCallSignals recria se ainda ativo.
      const isCanonical = !!currentUser && currentUser.id < peerId
      const attempts = (renegotiationAttempts.get(peerId) || 0)
      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        renegotiationAttempts.delete(peerId)
        closePeer(peerId)
        continue
      }
      renegotiationAttempts.set(peerId, attempts + 1)
      if (isCanonical) void triggerRenegotiation(peerId)
      continue
    }
    if (pc.connectionState === 'connected') {
      renegotiationAttempts.delete(peerId)
    }
    let loss = 0
    let rtt = 0
    let gotStats = false
    try {
      const stats = await pc.getStats()
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && typeof report.packetsLost === 'number' && typeof report.packetsReceived === 'number') {
          const total = report.packetsLost + report.packetsReceived
          if (total > 0) loss = Math.max(loss, report.packetsLost / total)
          gotStats = true
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
          rtt = report.currentRoundTripTime * 1000
        }
      })
    } catch { }
    if (!gotStats) continue
    const tier = peerQualityTier.get(peerId) || 0
    // Limiares folgados p/ relay/TURN (RTT 200-400ms e normal no Brasil):
    // antes degradava com qualquer oscilacao e quase nunca recuperava,
    // deixando 1080p com cara de 720p para sempre.
    const degraded = loss > 0.08 || rtt > 800
    const healthy = loss < 0.02 && rtt < 350
    let next = tier
    if (degraded) next = Math.min(tier + 1, 3)
    else if (healthy) next = Math.max(tier - 1, 0)
    if (next !== tier) {
      peerQualityTier.set(peerId, next)
      void applyPeerVideoBudget(peerId)
    }
  }
}

function reapplyCallTrackState(stream: MediaStream | null, muted: boolean, deafened: boolean, videoEnabled: boolean) {
  if (!stream) return
  stream.getAudioTracks().forEach(t => { t.enabled = !muted && !deafened })
  stream.getVideoTracks().forEach(t => { t.enabled = videoEnabled })
}

// Reconhecimento de periferico: so ASTRO ganha auto-selecao de mic dedicado.
// Plano gratuito usa o audio padrao do sistema.
function isAstroUser(): boolean {
  try {
    const me = useUserStore.getState().currentUser
    return getAstroTier(me as { settings?: Record<string, unknown> } | null) !== 'none'
  } catch { return false }
}

function announceAutoMic(smart: { micLabel: string; micAuto: boolean }) {
  if (!smart.micAuto || !smart.micLabel) return
  try {
    window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: `Microfone ${smart.micLabel} selecionado automaticamente` }))
  } catch { }
}

// Upgrade de midia em BACKGROUND (pos-join): o join usa captura padrao
// imediata (rapido) e o mic dedicado + RNNoise entram depois sem travar a
// entrada na call. ANTES, o smart bloqueava o join por segundos (recaptura +
// fetch do wasm + worklet) — "demora para entrar na call".
export async function upgradeLocalMedia() {
  try {
    const st = useCallStore.getState()
    if (!st.activeCall || !st.localStream || !isAstroUser()) return
    // Escolha manual do usuario sempre vence a auto-selecao.
    let manualMic: string | null = null
    try { manualMic = localStorage.getItem('friends-space:mic') } catch { manualMic = null }
    if (!manualMic) {
      const { selectBestMicDevice } = await import('../services/antiloud')
      const cur = useCallStore.getState()
      if (!cur.activeCall || !cur.localStream) return
      const curId = (() => {
        try { return cur.localStream!.getAudioTracks()[0]?.getSettings?.().deviceId || '' } catch { return '' }
      })()
      let best: { deviceId: string; label: string } | null = null
      try { best = await selectBestMicDevice() } catch { best = null }
      const after = useCallStore.getState()
      if (!after.activeCall || !after.localStream) return
      if (best && best.deviceId && best.deviceId !== curId) {
        try {
          await after.switchMicDevice(best.deviceId)
          try { localStorage.setItem('friends-space:mic', best.deviceId) } catch { }
          announceAutoMic({ micLabel: best.label, micAuto: true })
        } catch { }
      }
    }
    await refreshCleanAudio()
  } catch { }
}

// Troca so o audio local (video intacto, sem recapturar camera): usado pelo
// audio limpo e por restauracoes. A mesma track viaja pro mesh e pro LiveKit.
async function swapLocalAudioTrack(track: MediaStreamTrack) {
  const st = useCallStore.getState()
  const cur = st.localStream
  const combined = new MediaStream([track, ...(cur?.getVideoTracks() || [])])
  useCallStore.setState({ localStream: combined })
  reapplyCallTrackState(combined, st.muted, st.deafened, st.videoEnabled)
  for (const [, pc] of peerConnections) {
    try {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio')
      if (sender) await sender.replaceTrack(track)
    } catch { }
  }
  if (st.livekitActive) {
    try {
      const lk = await import('../services/livekitCall')
      await lk.livekitPublishMicTrack(track)
    } catch { }
  }
}

// Reconcilia o RNNoise com a stream atual: derruba grafo obsoleto e recria se
// Astro + pref ligada. Chamar apos qualquer recaptura/troca de mic.
export async function refreshCleanAudio() {
  try {
    const rn = await import('../services/rnnoise')
    rn.disposeCleanAudio()
    const st = useCallStore.getState()
    if (!st.activeCall || !st.localStream) return
    if (!isAstroUser() || !rn.isCleanAudioEnabledPref()) return
    const handle = await rn.enableCleanAudio(st.localStream)
    if (!handle) return
    const cleanTrack = handle.stream.getAudioTracks()[0]
    if (!cleanTrack) {
      rn.disposeCleanAudio()
      return
    }
    await swapLocalAudioTrack(cleanTrack)
  } catch { }
}

async function createPeerConnection(peerId: string, initiator: boolean) {
  const state = useCallStore.getState()
  const currentUser = useUserStore.getState().currentUser
  if (!currentUser || !state.sessionId || peerConnections.has(peerId) || creatingPeers.has(peerId)) return
  creatingPeers.add(peerId)
  warmIceServers()
  const ice = iceServersSync()
  const pc = new RTCPeerConnection({
    iceServers: ice,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 2,
  })
  peerConnections.set(peerId, pc)
  peerCreatedAt.set(peerId, Date.now())
  reconnectRetries.delete(peerId)
  // Canal de controle PRÉ-NEGOCIADO (id 0) nos DOIS lados: o m=application
  // (SCTP) fica idêntico em toda oferta/geração e some a classe "Failed to
  // start SCTP transport" — antes só o initiator criava in-band e cada reset
  // propunha outro SCTP. O ondatachannel abaixo fica como fallback para
  // builds velhas (que ainda criam in-band).
  try {
    const dc = pc.createDataChannel('friends-space-control', { negotiated: true, id: 0, ordered: true })
    dataChannels.set(peerId, dc)
    dc.onmessage = event => handleControlMessage(peerId, String(event.data))
    dc.onclose = () => { if (dataChannels.get(peerId) === dc) dataChannels.delete(peerId) }
  } catch { }
  pc.ondatachannel = event => {
    const dc = event.channel
    // Já temos o canal pré-negociado: ignora duplicata do handshake in-band.
    try { if (dc.label === 'friends-space-control' && dataChannels.get(peerId)) { try { dc.close() } catch { } return } } catch { }
    dataChannels.set(peerId, dc)
    dc.onmessage = messageEvent => handleControlMessage(peerId, String(messageEvent.data))
    dc.onclose = () => { if (dataChannels.get(peerId) === dc) dataChannels.delete(peerId) }
  }
  const timer = disconnectTimers.get(peerId)
  if (timer !== undefined) { window.clearTimeout(timer); disconnectTimers.delete(peerId) }
  const localStream = state.localStream
  const screenStream = state.screenStream
  // Layout CANÔNICO de m-lines — SEMPRE igual, em toda geração da PC e em
  // todo peer: [0] áudio do mic · [1] vídeo da câmera · [2] vídeo da tela ·
  // [3] áudio da tela. Ofertas com ordem/count idênticos nunca dão "order of
  // m-lines" no remoto. ANTES, as tracks eram adicionadas dinamicamente
  // (mic/câmera/tela conforme existiam no momento, com sort áudio-primeiro),
  // então cada reset gerava uma ordem diferente e os dois lados ficavam se
  // resetando em ping-pong sem convergir. Liga/desliga só troca track e
  // direction dentro do slot — nunca add/remove.
  const micTrack = localStream?.getAudioTracks()[0]
  const camTrack = localStream?.getVideoTracks()[0]
  const scrVTrack = screenStream?.getVideoTracks()[0]
  const scrATrack = screenStream?.getAudioTracks()[0]
  const addSlot = (kind: 'audio' | 'video', track: MediaStreamTrack | undefined, stream: MediaStream | null | undefined) => {
    try {
      if (track && stream) return pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] })
      return pc.addTransceiver(kind, { direction: 'inactive' })
    } catch { return null }
  }
  const micSlot = addSlot('audio', micTrack, localStream)
  const camSlot = addSlot('video', camTrack, localStream)
  const scrVSlot = addSlot('video', scrVTrack, screenStream)
  const scrASlot = addSlot('audio', scrATrack, screenStream)
  if (micSlot || camSlot) mediaSlots.set(peerId, { audio: micSlot ?? undefined, video: camSlot ?? undefined })
  if (scrVSlot) screenTransceivers.set(peerId, scrVSlot)
  if (scrASlot) screenAudioTransceivers.set(peerId, scrASlot)
  // Preferir VP8 no video: evita a TELA VERDE de decodificacao H.264 por
  // hardware (bug conhecido de Chromium/GPU, comum em tela compartilhada e
  // controle remoto). VP8 e o codec mais compativel; H.264 continua como
  // fallback se VP8 nao estiver disponivel.
  try {
    const caps = RTCRtpSender.getCapabilities?.('video')
    if (caps && caps.codecs.length) {
      const vp8 = caps.codecs.filter((c: { mimeType: string }) => c.mimeType.toLowerCase().includes('vp8'))
      const other = caps.codecs.filter((c: { mimeType: string }) => !c.mimeType.toLowerCase().includes('vp8'))
      const ordered = [...vp8, ...other]
      if (ordered.length) {
        for (const tr of pc.getTransceivers()) {
          if (tr.sender && tr.sender.track && tr.sender.track.kind === 'video') {
            try { tr.setCodecPreferences(ordered) } catch { }
          }
        }
      }
    }
  } catch { /* navegador sem suporte: segue o padrao */ }
  try {
    const acaps = RTCRtpSender.getCapabilities?.('audio')
    if (acaps && acaps.codecs.length) {
      const opus = acaps.codecs.filter((c: { mimeType: string }) => c.mimeType.toLowerCase().includes('opus'))
      const rest = acaps.codecs.filter((c: { mimeType: string }) => !c.mimeType.toLowerCase().includes('opus'))
      const ordered = [...opus, ...rest]
      if (ordered.length) {
        for (const tr of pc.getTransceivers()) {
          if (tr.sender && tr.sender.track && tr.sender.track.kind === 'audio') {
            try { tr.setCodecPreferences(ordered) } catch { }
          }
        }
      }
    }
  } catch { /* segue o padrao */ }
  pc.onicecandidate = event => {
    if (event.candidate) queueCandidate({ sessionId: state.sessionId!, fromUserId: currentUser.id, toUserId: peerId, type: 'candidate', payload: event.candidate.toJSON() })
  }
  pc.ontrack = event => {
    const stream = event.streams[0] || new MediaStream([event.track])
    // A stream de tela (getDisplayMedia) nao tem track de audio; a stream de
    // camera/mic (getUserMedia) sempre tem. Classificar por conteudo em vez de
    // por ordem de chegada evita a tela cair em remoteStreams (e a camera em
    // remoteScreenStreams) quando os eventos chegam fora de ordem.
    // Referudo: uma stream que compartilha tracks com a tela do peer continua
    // sendo tela (incluso si um peer antigo ainda manda audio do sistema nela).
    const existingScreen = useCallStore.getState().remoteScreenStreams[peerId]
    const sameScreenAsBefore = existingScreen && stream.getTracks().some(t => existingScreen.getTracks().some(et => et.id === t.id))
    const hasDisplaySurface = stream.getVideoTracks().some(track => {
      try { return Boolean((track.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface) } catch { return false }
    })
    // Tolerante: no Electron/desktopCapturer o displaySurface vem vazio e a
    // stream pode trazer audio do sistema — sem isso a tela caia em
    // remoteStreams (invisivel) embora o video estivesse chegando. Se o peer
    // anunciou screen-started E o rotulo parece tela (Screen/Window/Monitor),
    // trata como tela. Camera ("FaceTime", etc.) continua indo pra voz.
    const announcedSharing = useCallStore.getState().sharingPeers.includes(peerId)
    const looksLikeScreen = stream.getVideoTracks().some(t => /screen|window|monitor|display|entire|tela|pantalla|ecran|bildschirm/i.test(t.label || ''))
    const isScreenStream = hasDisplaySurface || stream.getAudioTracks().length === 0 || Boolean(sameScreenAsBefore) || (announcedSharing && looksLikeScreen)
    if (isScreenStream) {
      const hadScreenBefore = Boolean(useCallStore.getState().remoteScreenStreams[peerId])
      useCallStore.setState(state => {
        const previous = state.remoteScreenStreams[peerId]
        if (previous && previous.id !== stream.id) {
          try { previous.getTracks().forEach(t => t.stop()) } catch { }
        }
        const merged = previous && previous.id === stream.id ? previous : stream
        for (const track of stream.getTracks()) {
          if (merged.getTracks().some(t => t.id === track.id)) continue
          // NUNCA mezclar audio de tela com el mixer de voz: si un peer
          // antiguo envía audio del sistema en la stream de tela, lo
          // descartamos aquí (no se reproduce y no contamina el mixer).
          merged.addTrack(track)
          track.onended = () => {
            const current = useCallStore.getState().remoteScreenStreams[peerId]
            if (!current) return
            const liveTracks = current.getTracks().filter(t => t.readyState === 'live')
            if (liveTracks.length === 0) {
              useCallStore.setState(state => {
                const next = { ...state.remoteScreenStreams }
                delete next[peerId]
                return { remoteScreenStreams: next }
              })
            }
            refreshCallRecording()
          }
        }
        return { remoteScreenStreams: { ...state.remoteScreenStreams, [peerId]: merged } }
      })
      if (!hadScreenBefore) {
        try {
          const u = useUserStore.getState().users.find(x => x.id === peerId)
          window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: `${u?.name || 'Usuário'} começou a transmitir` }))
        } catch { }
        playSound('screen-start')
      }
    } else {
      useCallStore.setState(state => {
        const previous = state.remoteStreams[peerId]
        if (previous && previous.id !== stream.id) {
          try { previous.getTracks().forEach(t => t.stop()) } catch { }
        }
        const merged = previous && previous.id === stream.id ? previous : stream
        for (const track of stream.getTracks()) {
          if (!merged.getTracks().some(t => t.id === track.id)) merged.addTrack(track)
          track.onended = () => refreshCallRecording()
        }
        return { remoteStreams: { ...state.remoteStreams, [peerId]: merged } }
      })
    }
    refreshCallRecording()
    const calling = useCallStore.getState().callingUser
    if (calling && peerId === calling.userId) clearRingState()
  }
  // Slots de tela criados acima no layout canônico — nada a reservar aqui.
  pc.onconnectionstatechange = () => {
    const connectionState = pc.connectionState
    watchStuckDtls(peerId, pc)
    useCallStore.setState({ connectionStates: { ...useCallStore.getState().connectionStates, [peerId]: connectionState } })
    // SEM watchdog de DTLS: matar a PC quando connectionState fica 'connecting'
    // impedia o handshake DTLS de completar em rede com relay/TURN lento,
    // recriando a PC em loop (sintoma: ping aparece e some). O browser conclui
    // o DTLS sozinho; se a PC morrer de verdade, o processCallSignals recria.
    if (connectionState === 'connected') {
      reconnectRetries.delete(peerId)
      peerLastConnected.set(peerId, Date.now())
      const timer = disconnectTimers.get(peerId)
      if (timer !== undefined) { window.clearTimeout(timer); disconnectTimers.delete(peerId) }
      void applyPeerVideoBudget(peerId)
      // Quando o WebRTC conecta, a chamada COMECOU de verdade: para o toque do
      // chamador e sai da tela "Ligando..." (antes dependia do ontrack, que
      // atrasava/nao chegava se a midia demorasse — deixando o chamador em loop).
      const calling = useCallStore.getState().callingUser
      if (calling && peerId === calling.userId) clearRingState()
    } else if (connectionState === 'disconnected' || connectionState === 'failed') {
      // SEM reconnect automatico (restartIce + triggerRenegotiation): ANTES,
      // o lado canonico renegociava, mas o outro lado nao processava a oferta
      // de renegociacao a tempo -> glare -> a conexao caia e o ciclo reiniciava.
      // O browser ja tenta reconectar sozinho (ICE restart implicito); se a PC
      // falhar de verdade, o guard do processCallSignals fecha e o papel
      // canonico recria com oferta nova.
      useCallStore.setState({ connectionStates: { ...useCallStore.getState().connectionStates, [peerId]: connectionState } })
    } else if (connectionState === 'closed') {
      closePeer(peerId)
    }
    if (connectionState === 'disconnected' && !disconnectTimers.has(peerId)) {
      // Se a PC voltar para 'connected', o timer e limpo acima. Se ficar
      // 'disconnected' por 30s (antes 15s, que era agressivo em rede movel),
      // ai sim fecha. ICE restart ja rodou varias vezes nesse periodo.
      disconnectTimers.set(peerId, window.setTimeout(() => {
        disconnectTimers.delete(peerId)
        const current = peerConnections.get(peerId)
        if (!current || (current.connectionState !== 'disconnected' && current.connectionState !== 'failed')) return
        closePeer(peerId)
      }, 30000))
    }
  }
  try {
    if (initiator) {
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        // Reseta o backoff do poll: o answer deve chegar rapido (proximo poll
        // em 800ms), senao o re-offer watchdog derruba a PC antes da resposta.
        signalBackoffIndex = 0
        // Offer fire-and-forget: se o sendSignal demorar 75s (cold start Vercel
        // com 3 tentativas de 25s), a PC nao fica bloqueada. Se falhar, o
        // re-offer watchdog (20s) recria a PC e reenvia — o Vercel ja estara
        // quente e o offer chega. ANTES, o await bloqueava por 75s e o catch
        // engolia o erro, o offer nunca chegava ao backend (0 offers na sessao).
        void sendSignal({ sessionId: state.sessionId, fromUserId: currentUser.id, toUserId: peerId, type: 'offer', payload: offerPayload(peerId, offer) }).catch(() => { })
        void processCallSignals().catch(() => { })
      } catch (offerErr) {
        // NAO fechar a PC aqui. Se o sendSignal falhar (timeout/rede), fechar e
        // recriar gera um loop infinito: nova PC -> novo offer -> sendSignal
        // falha -> closePeer -> ... (console mostrava MaxListenersExceededWarning:
        // 11 close listeners). Mantendo a PC viva, o poll continua e o re-offer
        // watchdog de 20s no processCallSignals recria quando realmente
        // necessario. A oferta eventualmente chega quando a rede estabiliza.
        const msg = offerErr instanceof Error ? offerErr.message : String(offerErr)
        lastSignalErrors.push({ type: 'offer-criacao', msg, ts: Date.now() })
        if (lastSignalErrors.length > 20) lastSignalErrors.shift()
        console.error('[CALL] createOffer/setLocalDescription error:', msg)
      }
    }
  } finally {
    creatingPeers.delete(peerId)
  }
}

async function connectToAllExistingPeers() {
if (useCallStore.getState().livekitActive) return
  const state = useCallStore.getState()
  const currentUser = useUserStore.getState().currentUser
  if (!state.activeCall || !state.sessionId || !currentUser) return
  await Promise.all(state.participants.map(async (participant) => {
    if (participant.userId === currentUser.id) return
    if (peerConnections.has(participant.userId) || creatingPeers.has(participant.userId)) return
    await createPeerConnection(participant.userId, currentUser.id < participant.userId)
  }))
}

async function applySignal(signal: CallSignal) {
  if (signal.type === 'resync') {
    // O peer resetou a PC (ex.: SCTP travado, m-line) e precisa de oferta nova.
    const st = useCallStore.getState()
    const me = useUserStore.getState().currentUser
    if (!st.activeCall || !me) return
    // Iniciador canônico re-oferta (vale p/ voz pura também — ANTES só
    // re-ofertava se estivéssemos compartilhando tela, e call só-voz
    // ficava 0/2 presa para sempre após um reset).
    if (me.id < signal.fromUserId && peerConnections.has(signal.fromUserId)) {
      void triggerMediaRenegotiation(signal.fromUserId)
      return
    }
    if (st.screenSharing && peerConnections.has(signal.fromUserId)) {
      void triggerMediaRenegotiation(signal.fromUserId)
    }
    return
  }
  if (signal.type === 'decline' || signal.type === 'cancel') {
    const state = useCallStore.getState()
    const calling = state.callingUser
    // Quem esta chamando recebeu decline/cancel de quem atendeu (ou desistiu).
    if (calling && signal.fromUserId === calling.userId) {
      clearRingState()
      const mode = state.callMode
      useCallStore.setState({ callRejectedBy: { userId: calling.userId, userName: calling.userName, userPhoto: calling.userPhoto, mode } })
      useCallStore.getState().endCall()
      return
    }
    // Quem esta recebendo a chamada: o chamador cancelou -> para de tocar na hora.
    if (signal.type === 'cancel' && state.incomingCall && signal.fromUserId === state.incomingCall.fromId) {
      clearIncomingTimer()
      useCallStore.setState({ incomingCall: null })
      return
    }
    return
  }
  let pc = peerConnections.get(signal.fromUserId)
  if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed'
    || (pc.connectionState === 'new' && !pc.localDescription && Date.now() - (peerCreatedAt.get(signal.fromUserId) || 0) > 15000))) {
    closePeer(signal.fromUserId)
    pc = undefined
  }
  if (!pc && (signal.type === 'offer' || signal.type === 'renegotiate' || signal.type === 'candidate')) {
    await createPeerConnection(signal.fromUserId, false)
    pc = peerConnections.get(signal.fromUserId)
  }
  if (!pc) {
    // Se a PC nao pôde ser criada (ex.: ainda em creatingPeers porque o
    // iceServers() esperou o cold start do Vercel), NAO descartar a oferta:
    // lanca erro para o processCallSignals reprocessar no proximo poll.
    // ANTES, o offer era descartado aqui, marcado como processado e perdido —
    // conexao intermitente (conecta com Vercel quente, nao com cold start).
    if (signal.type === 'offer' || signal.type === 'renegotiate') {
      throw new Error('PC indisponivel para processar oferta — reprocessar')
    }
    if (signal.type === 'candidate') {
      const queued = pendingCandidates.get(signal.fromUserId) || []
      queued.push(signal.payload as RTCIceCandidateInit)
      pendingCandidates.set(signal.fromUserId, queued)
    }
    return
  }
  if (signal.type === 'offer' || signal.type === 'renegotiate') {
    // Geração: descarta oferta de geração velha (pc antiga do remoto).
    // Sem fsGen (build velho): processa sempre (compat).
    try {
      const rGen = (signal.payload as unknown as Record<string, unknown> | undefined)?.fsGen
      if (typeof rGen === 'number') {
        const seen = remoteGen.get(signal.fromUserId) ?? 0
        if (rGen < seen) return
        remoteGen.set(signal.fromUserId, Math.max(seen, rGen))
      }
    } catch { }
    learnPeerClient(signal.fromUserId, signal.payload)
    // Descarta oferta velha (geração anterior da PC remota): criada antes do
    // nosso último reset local, suas m-lines não batem com a PC nova.
    // Retornar sem erro marca como processada e quebra o loop de reset
    // mútuo. Tolerância de 15s para skew de relógio com o backend.
    const resetAt = peerResetAt.get(signal.fromUserId) || 0
    const sigTs = Number(signal.createdAt || 0)
    if (resetAt && sigTs + 15000 < resetAt) return
    // FIX (09/2026): PC presa em estado que NAO aceita oferta (ex: have-local-answer
    // porque o answer anterior se perdeu no cold start do Vercel, ou have-remote-*)
    // nao consegue rollback — setLocalDescription({type:'rollback'}) so e valido
    // de have-local-offer/have-remote-offer. ANTES, o rollback falhava (engolido),
    // o setRemoteDescription lancava InvalidStateError (engolido pelo catch { }),
    // a oferta era marcada como processada e o answer NUNCA era criado — 0 answers
    // no backend com offers fluindo (ciclo re-offer). Solucao: se a PC nao esta
    // em stable nem have-local-offer, FECHA e RECRIA como non-initiator — a oferta
    // e idempotente e sera processada na PC nova (cada oferta nova gera answer novo).
    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
      closePeer(signal.fromUserId)
      await createPeerConnection(signal.fromUserId, false)
      pc = peerConnections.get(signal.fromUserId)
      if (!pc) throw new Error('PC indisponivel apos recriacao — reprocessar')
    }
    try {
      // Glare (have-local-offer): desfaz a oferta local antes de aceitar a remota.
      if (pc.signalingState !== 'stable') {
        try { await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit) } catch { }
      }
      await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit)
      const answer = await pc.createAnswer()
      if (pc.signalingState !== 'have-remote-offer') return
      await pc.setLocalDescription(answer)
      // Answer com retry em background (nao bloqueia a PC): se o sendSignal
      // falhar (ex.: 503 em pico), tenta de novo em 2s/4s. Sem isso o answer
      // se perdia e o initiator ficava preso em new/ice:new. O re-offer
      // watchdog do initiator (20s) continua como rede de seguranca final.
      void (async () => {
        const peerId = signal.fromUserId
        const me = useUserStore.getState().currentUser
        if (!me) return
        for (let a = 0; a < 3; a++) {
          try {
            await sendSignal({ sessionId: signal.sessionId, fromUserId: me.id, toUserId: peerId, type: 'answer', payload: { ...(answer as unknown as Record<string, unknown>), client: myClientType(), proto: CALL_PROTO } })
            return
          } catch {
            if (a < 2) await new Promise(r => setTimeout(r, 2000 * (a + 1)))
          }
        }
      })().catch(() => { })
      await flushPendingCandidates(signal.fromUserId, pc)
      // Oferta aceita: zera o contador de falhas de m-line desse peer.
      mlineFails.delete(signal.fromUserId)
      mlineToasted.delete(signal.fromUserId)
    } catch (offerErr) {
      // Visibilidade do erro de processamento de oferta (09/2026): a call
      // mostrava 11 offers + 187 candidates no backend mas 0 answers — o answer
      // nunca era criado porque este bloco falhava (createAnswer/setLocalDescription)
      // e o catch ANTIGO engolia tudo silenciosamente. Logar aqui para o painel.
      const msg = offerErr instanceof Error ? offerErr.message : String(offerErr)
      // Contagem de m-lines (local x oferta): diagnostica o mismatch sem
      // precisar reproduzir a call.
      let mInfo = ''
      try {
        const sdp = String((signal.payload as unknown as { sdp?: unknown })?.sdp || '')
        const rCount = (sdp.match(/^m=/gm) || []).length
        mInfo = ` m=${pc.getTransceivers().length}/${rCount}`
      } catch { }
      lastSignalErrors.push({ type: `offer-proc:${pc.signalingState}`, msg: msg + mInfo, ts: Date.now() })
      if (lastSignalErrors.length > 20) lastSignalErrors.shift()
      console.error('[CALL] applySignal offer error:', msg + mInfo, 'signalingState:', pc.signalingState)
      // SCTP travado: a PC local ja tem transporte SCTP (datachannel da conexao
      // original) e a oferta renegociada propoe outro — o Chrome nao inicia o
      // novo transporte, o answer nunca sai e a tela fica preta para sempre
      // (cada re-offer falha igual). Reseta a PC e pede oferta nova ao peer.
      if (/sctp|m-line|m-lines|sdp|rtp|extension|mid=|candidate/i.test(msg)) {
        const peerId = signal.fromUserId
        // Cap anti-loop: 5+ falhas em 60s = remoto insistindo em layout
        // incompatível (ex.: build velho). Para de resetar e avisa — sem isso
        // os dois lados se resetam para sempre (ping-pong quente).
        const now = Date.now()
        const arr = (mlineFails.get(peerId) ?? []).filter(t => now - t < 60000)
        arr.push(now)
        mlineFails.set(peerId, arr)
        if (arr.length >= 5) {
          if (!mlineToasted.has(peerId)) {
            mlineToasted.add(peerId)
            try {
              const nm = useCallStore.getState().participants.find(p => p.userId === peerId)?.userName || 'Usuário'
              diag('SIG-MLINE-01', `Falha ao sincronizar com ${nm} — peça para atualizar o app e entrar de novo`, 'call:offer')
            } catch { }
          }
          // 5 falhas seguidas = quase certo build velha: marca proto 0 para o
          // banner "Atualizar app" aparecer na call (se cura sozinho quando o
          // peer atualizar, via learnPeerClient).
          peerProto.delete(peerId)
          try { useCallStore.setState(state => ({ peerProtos: { ...state.peerProtos, [peerId]: 0 } })) } catch { }
          return
        }
        try { closePeer(peerId) } catch { }
        try { await createPeerConnection(peerId, false) } catch { }
        // Se somos o iniciador canônico, re-oferta com JITTER (0.8–2.5s), não
        // imediatamente: sem isso os dois lados re-ofertam juntos após resets
        // simultâneos (glare eterno). Só oferta se a PC fresh continuar
        // estável — se o remoto já ofertou nesse meio-tempo, processamos a
        // oferta dele em vez de cruzar com a nossa.
        try {
          const me = useUserStore.getState().currentUser
          const fresh = peerConnections.get(peerId)
          if (me && me.id < peerId && fresh && fresh.signalingState === 'stable') {
            const delay = 800 + Math.floor(Math.random() * 1700)
            window.setTimeout(() => {
              void (async () => {
                try {
                  const cur = peerConnections.get(peerId)
                  const meNow = useUserStore.getState().currentUser
                  const sess = useCallStore.getState().sessionId
                  if (!cur || !meNow || !sess) return
                  if (!useCallStore.getState().activeCall) return
                  if (cur.signalingState !== 'stable') return
                  const offer2 = await cur.createOffer()
                  await cur.setLocalDescription(offer2)
                  signalBackoffIndex = 0
                  void sendSignal({ sessionId: sess, fromUserId: meNow.id, toUserId: peerId, type: 'offer', payload: offerPayload(peerId, offer2) }).catch(() => { })
                  void processCallSignals().catch(() => { })
                } catch (reOfferErr) {
                  const m2 = reOfferErr instanceof Error ? reOfferErr.message : String(reOfferErr)
                  lastSignalErrors.push({ type: 'offer-criacao', msg: m2, ts: Date.now() })
                  if (lastSignalErrors.length > 20) lastSignalErrors.shift()
                }
              })()
            }, delay)
          }
        } catch (reOfferErr) {
          const m2 = reOfferErr instanceof Error ? reOfferErr.message : String(reOfferErr)
          lastSignalErrors.push({ type: 'offer-criacao', msg: m2, ts: Date.now() })
          if (lastSignalErrors.length > 20) lastSignalErrors.shift()
        }
        // O re-offer pode cair no vazio (DC do sharer ainda parece aberto logo
        // apos o reset) — repete o pedido ate a tela chegar (5s x 6).
        let tries = 0
        const askOffer = () => {
          try {
            const cur = useCallStore.getState()
            if (!cur.activeCall) return
            if (cur.remoteScreenStreams[peerId]) return
            if (tries++ > 5) return
            const me = useUserStore.getState().currentUser
            if (me && cur.sessionId) {
              void sendSignal({ sessionId: signal.sessionId, fromUserId: me.id, toUserId: peerId, type: 'resync', payload: {} }).catch(() => { })
            }
            window.setTimeout(askOffer, 5000)
          } catch { }
        }
        askOffer()
      }
    }
  } else if (signal.type === 'answer') {
    learnPeerClient(signal.fromUserId, signal.payload)
    if (pc.signalingState !== 'have-local-offer') {
      // Fora de hora: se JA temos remote, e duplicata (ignora). Se NAO temos,
      // pode ser answer valido que chegou cedo/tarde — lanca para tentar de
      // novo no proximo poll em vez de perder para sempre.
      if (pc.remoteDescription) return
      throw new Error('answer fora de hora (sem remote) — reprocessar')
    }
    try {
      await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit)
      await flushPendingCandidates(signal.fromUserId, pc)
    } catch { }
    const calling = useCallStore.getState().callingUser
    if (calling && signal.fromUserId === calling.userId) clearRingState()
  } else if (signal.type === 'candidate') {
    if (pc.remoteDescription) {
      try { await pc.addIceCandidate(signal.payload as RTCIceCandidateInit) } catch { }
    } else {
      const queued = pendingCandidates.get(signal.fromUserId) || []
      queued.push(signal.payload as RTCIceCandidateInit)
      pendingCandidates.set(signal.fromUserId, queued)
    }
  }
}

let lastSignalTs = 0
let signalPollActive = false
const watchResyncAt = new Map<string, number>()
const CONTROL_SETTINGS_KEY = 'friends-space:control-settings'
function loadControlSettings(): ControlSettings {
  const fallback: ControlSettings = { minutes: 5, mouse: true, keyboard: true, audio: true, clipboard: true, mic: true }
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(CONTROL_SETTINGS_KEY) : null
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<ControlSettings>
    return {
      minutes: typeof p.minutes === 'number' ? p.minutes : fallback.minutes,
      mouse: p.mouse !== false,
      keyboard: p.keyboard !== false,
      audio: p.audio !== false,
      clipboard: p.clipboard !== false,
      mic: p.mic !== false,
    }
  } catch { return fallback }
}
const controlTimer: { id: number | null } = { id: null }
function clearControlTimer() {
  try { if (controlTimer.id !== null) window.clearTimeout(controlTimer.id) } catch { }
  controlTimer.id = null
}
const controlGrantsByPeer = new Map<string, { mouse: boolean; keyboard: boolean; clipboard: boolean }>()
const lastInputAckSent = new Map<string, number>()
let controlSavedMuted: boolean | null = null
let controlSavedScreenAudio: boolean | null = null
let gameBoostSavedFps: number | null = null
const signalFailCount = new Map<string, number>()
let syncFailCount = 0
let syncToastAt = 0
let sessFailCount = 0
async function processCallSignals() {
  if (signalPollActive) return
  signalPollActive = true
  try {
    await processCallSignalsInner()
  } finally {
    signalPollActive = false
  }
}
async function processCallSignalsInner() {
  const state = useCallStore.getState()
  const currentUser = useUserStore.getState().currentUser
  if (!state.activeCall || !state.sessionId || !currentUser) return
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const signals = await requestBackend<CallSignal[]>('loadCallSignals', { sessionId: state.sessionId, userId: currentUser.id, since: lastSignalTs })
  try {
    const rtt = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
    lastSignalRttMs = rtt
    lastSignalRttAt = Date.now()
  } catch { }
  if (signals.length > 0) signalBackoffIndex = 0
  for (const signal of signals) {
    if (processedSignals.has(signal.id)) continue
    try {
      await applySignalQueued(signal)
      processedSignals.add(signal.id)
      signalFailCount.delete(signal.id)
      const ts = Number((signal as { createdAt?: number }).createdAt || 0)
      if (ts > lastSignalTs) lastSignalTs = ts
    } catch {
      // NAO marca como processado de cara: se applySignal falhar (ex.: a PC
      // ainda nao foi criada porque o cold start do Vercel atrasou o
      // iceServers()), o signal sera reprocessado no proximo poll — e o
      // lastSignalTs SO avanca no sucesso, senao a oferta falha uma vez e
      // nunca mais e entregue (o since pula ela para sempre).
      // Trava de seguranca: apos 5 falhas, desiste do signal (evita lista
      // infinita) — os watchdogs de re-offer recriam a negociacao.
      const fails = (signalFailCount.get(signal.id) || 0) + 1
      signalFailCount.set(signal.id, fails)
      if (fails >= 5) {
        processedSignals.add(signal.id)
        signalFailCount.delete(signal.id)
        const ts = Number((signal as { createdAt?: number }).createdAt || 0)
        if (ts > lastSignalTs) lastSignalTs = ts
      }
    }
  }
  // Limpeza periodica: processedSignals e declinedSessions crescem sem
  // limite em calls longas (milhares de sinais de ICE/candidatos).
  // peerResetAt também é podado (guarda só vale nos 5min após o reset).
  if (processedSignals.size > 5000) {
    const toKeep = new Set(signals.map(s => s.id))
    for (const id of processedSignals) { if (!toKeep.has(id)) processedSignals.delete(id) }
  }
  if (peerResetAt.size > 50) {
    const cutoff = Date.now() - 5 * 60 * 1000
    for (const [pid, ts] of peerResetAt) { if (ts < cutoff) peerResetAt.delete(pid) }
  }
  // peerGen/remoteGen/mlineFails só valem na call ativa; poda por tamanho.
  if (peerGen.size > 50) peerGen.clear()
  if (remoteGen.size > 50) remoteGen.clear()
  if (peerProto.size > 50) peerProto.clear()
  if (mlineFails.size > 50) mlineFails.clear()
  if (mlineToasted.size > 50) mlineToasted.clear()
  if (peerClient.size > 100) peerClient.clear()
  if (declinedSessions.size > 50) declinedSessions.clear()
  for (const participant of state.participants) {
    if (participant.userId === currentUser.id) continue
    // Watchdogs proporcionais ao RTT: em rede lenta (4G, 300ms+) os limites
    // fixos matavam a PC no meio do handshake. Com RTT alto, dobra a paciência.
    const slowNet = (lastSignalRttMs ?? lastPresenceRttMs ?? 0) > 250
    const newPcMs = slowNet ? 30000 : 15000
    const stuckMs = slowNet ? 35000 : 20000
    const existing = peerConnections.get(participant.userId)
    if (existing && (existing.connectionState === 'failed' || existing.connectionState === 'closed'
      || (existing.connectionState === 'new' && !existing.localDescription && Date.now() - (peerCreatedAt.get(participant.userId) || 0) > newPcMs))) {
      closePeer(participant.userId)
    }
    if (currentUser.id < participant.userId && !peerConnections.has(participant.userId)) {
      await createPeerConnection(participant.userId, true)
    }
    // Watchdog da oferta: se o PC existe, esta em 'new' com localDescription
    // (offer enviado) mas sem remoteDescription (answer nunca chegou) por >20s,
    // recria o PC. O tempo deve ser MAIOR que o pior caso do poll (backoff
    // maximo 12s) senao a PC morre antes da resposta chegar. Sem isso o
    // initiator fica preso em new/ice:new para sempre esperando um answer que
    // nunca veio.
    const stuckOffer = peerConnections.get(participant.userId)
    if (stuckOffer && stuckOffer.connectionState === 'new'
      && stuckOffer.localDescription && !stuckOffer.remoteDescription
      && Date.now() - (peerCreatedAt.get(participant.userId) || 0) > stuckMs) {
      closePeer(participant.userId)
      await createPeerConnection(participant.userId, true)
    }
    // Fallback anti-deadlock: se a call ja esta ativa ha >8s e este participante
    // AINDA NAO conectou (sem PC, ou PC em 'new' sem descricao remota), o lado
    // NAO-canônico tambem cria a PC e envia offer. Isso elimina o ponto unico
    // de falha do papel canônico (id menor): se ele falhar em criar a oferta
    // (ex.: iceServers com erro no cold start do Vercel), o id maior ficava
    // esperando para sempre. O glare (dois offers simultaneos) e resolvido pelo
    // rollback do applySignal (perfect negotiation).
    // ATENCAO: NAO fechar PC que esta processando (tem localDescription) —
    // se o sendSignal(answer) demorou 75s (cold start Vercel) e o fallback
    // matar a PC, o answer se perde e o ciclo reinicia para sempre.
    const callStartedAt = state.createdAt || Date.now()
    if (Date.now() - callStartedAt > 8000) {
      const dead = peerConnections.get(participant.userId)
      const neverConnected = !dead || (dead.connectionState === 'new' && !dead.localDescription && !dead.remoteDescription)
      const lastTry = lastFallbackRetry.get(participant.userId) || 0
      if (neverConnected && Date.now() - lastTry > 10000) {
        lastFallbackRetry.set(participant.userId, Date.now())
        closePeer(participant.userId)
        await createPeerConnection(participant.userId, true)
      }
    }
  }
}

async function flushPendingCandidates(peerId: string, pc: RTCPeerConnection) {
  const queued = pendingCandidates.get(peerId) || []
  pendingCandidates.delete(peerId)
  for (const candidate of queued) {
    try { await pc.addIceCandidate(candidate) } catch { }
  }
}

async function checkCallPresence() {
  const state = useCallStore.getState()
  const currentUser = useUserStore.getState().currentUser
  if (!state.activeCall || !state.serverId || !currentUser) return
  // Mantem o stamp de presenca do usuario SEMPRE fresco no backend: o
  // upsertCallSession remove participantes cujo stamp expira (>45s). ANTES,
  // nenhum caminho chamava syncSession periodicamente — so em eventos
  // (startCall/toggleMute/addParticipant). Em call 24/7 sem interacao, os
  // dois lados "sumiam" do participantIds e o discovery quebrava
  // ("Nenhuma conexao criada" com 2 usuarios na call).
  const syncedSessions = await Promise.race([
    syncSession(state).catch(() => null),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 800)),
  ])
  const knownIds = new Set(state.participants.map(p => p.userId))
  if (syncedSessions && syncedSessions.length) {
    await applyCallSessions(syncedSessions, state.serverId, currentUser.id)
  } else {
    await useCallStore.getState().loadCallSessions(state.serverId, currentUser.id)
  }
  const next = useCallStore.getState()
  if (!next.activeCall || next.serverId !== state.serverId) return
  const freshIds = new Set(next.participants.map(p => p.userId))
  const newPeers = [...freshIds].filter(id => id !== currentUser.id && !knownIds.has(id))
  // Som de conexao/desconexao (09/2026): detecta quem ENTROU e quem SAIU da call
  // comparando a lista anterior (knownIds) com a nova (freshIds). O som toca
  // UMA vez por peer (evita repetir a cada 20s do presenceTimer).
  // O primeiro tick estabelece o baseline (participantes que JA estavam na
  // call quando EU entrei) sem tocar som — senao tocaria uma rajada de joins.
  if (presenceSoundsArmed) {
    const leftPeers = [...knownIds].filter(id => id !== currentUser.id && !freshIds.has(id))
    for (const pid of leftPeers) {
      playSound('call-leave')
      try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Usuário saiu da call' })) } catch { }
      useCallStore.getState().removeParticipant(pid)
      const st = useCallStore.getState()
      const { [pid]: _rs, ...restScreens } = st.remoteScreenStreams
      const { [pid]: _r, ...restRemote } = st.remoteStreams
      useCallStore.setState({ remoteScreenStreams: restScreens, remoteStreams: restRemote, sharingPeers: st.sharingPeers.filter(id => id !== pid) })
    }
    for (const pid of newPeers) {
      playSound('call-join')
      try {
        const u = useUserStore.getState().users.find(x => x.id === pid)
        window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: `${u?.name || 'Usuário'} entrou na call` }))
      } catch { }
    }
  } else {
    presenceSoundsArmed = true
  }
  const livekitOn = useCallStore.getState().livekitActive
  if (newPeers.length > 0) {
    // Novo participante entrou: a oferta dele chega por HTTP (o canal P2P ainda
    // nao existe), entao conecta e processa na hora em vez de esperar o poll.
    // Em modo LiveKit o SFU já entrega tudo: sem mesh aqui.
    if (!livekitOn) {
      await connectToAllExistingPeers()
      if (signalTimer !== null) { window.clearTimeout(signalTimer); signalTimer = null }
      void processCallSignals().catch(() => { })
    }
  } else {
    // Rede de seguranca: mesmo sem peers NOVOS, tenta conectar quem ainda nao
    // tem PC (connectToAllExistingPeers e idempotente — pula quem ja conectou).
    // Sem isso, se a oferta inicial do startCall se perder (fila de sinais
    // atrasada, sessao ainda nao publicada no loadCallSessions, etc.), a call
    // DM fica presa em "Ligando..." para sempre: o chamador nunca recebe o
    // answer e o clearRingState (connectionState === 'connected') nunca roda.
    if (!livekitOn) {
      await connectToAllExistingPeers()
    }
  }
}

function startSignalLoop() {
  if (signalTimer !== null) return
  // Quando a aba volta a ficar visivel durante a call, dispara poll imediato:
  // se ficou oculta, o poll pode ter atrasado e ha ofertas/respostas
  // pendentes (sem isso, so o proximo tick do loop retomaria em ate 12s).
  if (!signalVisibilityBound) {
    signalVisibilityBound = true
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return
      const st = useCallStore.getState()
      if (!st.activeCall || !st.sessionId) return
      if (signalTimer !== null) { window.clearTimeout(signalTimer); signalTimer = null }
      void processCallSignals().catch(() => { })
      signalBackoffIndex = 0
      scheduleSignalLoop()
    })
  }
  void processCallSignals().catch(() => { })
  scheduleSignalLoop()
}

let signalBackoffIndex = 0
// Poll rapido e constante: com backoff maximo de 2s (antes 12s), a oferta
// chega ao non-initiator em <1s (instantanco como Discord). Backoff longo
// atrasava a descoberta da oferta e o guard de 30s do processCallSignals
// matava a PC do non-initiator antes dela chegar.
// ATENCAO (09/2026): o polling constante de 400ms-2s + presence 5s estourou o
// limite de requisicoes dos planos gratis (Cloudflare Pages 100k/dia + Vercel).
// Backoff mais espaçado para nao estourar cota em calls longas: max 4s.
const SIGNAL_BACKOFF_STEPS = [400, 800, 1500]

function scheduleSignalLoop() {
  if (signalTimer !== null) return
  const state = useCallStore.getState()
  const states = Object.values(state.connectionStates)
  const allConnected = states.length > 0 && states.every(s => s === 'connected')
  // Com tudo conectado o sinal ja trafega pelo DataChannel (mesh); o poll HTTP
  // vira rede de seguranca para ofertas de novos participantes/telas que ainda
  // nao estabeleceram canal — 8s em vez de ~24 req/min. ANTES era 30s e a tela
  // compartilhada demorava ate 30s para aparecer quando o DC nao estava aberto.
  if (allConnected) signalBackoffIndex = 0
  // Poll turbo nos primeiros 10s da call: ainda nao conectou, o signaling HTTP
  // precisa responder em <300ms (ida e volta) para a conexao parecer
  // instantanea como o Discord. Depois disso, volta ao backoff normal.
  const callStartedAt = state.createdAt || Date.now()
  // Turbo não só nos primeiros 10s: enquanto QUALQUER peer estiver
  // new/connecting/disconnected, o poll fica em 100ms — oferta/answer de quem
  // está entrando não espera o backoff. Com tudo conectado, volta ao normal.
  const anyUnstable = states.length === 0 || states.some(s => s !== 'connected')
  const inTurbo = !allConnected && (anyUnstable || Date.now() - callStartedAt < 10000)
  // Turbo de tela: com tela recém-iniciada/recebida, o poll não desacelera
  // (mín 1s) — a oferta da tela chega junto da voz.
  const inScreenTurbo = Date.now() < screenTurboUntil
  const delay = allConnected ? (inScreenTurbo ? 1000 : 8000) : (inTurbo ? 100 : SIGNAL_BACKOFF_STEPS[signalBackoffIndex])
  signalTimer = window.setTimeout(() => {
    signalTimer = null
    // Nao martela o backend quando offline (sem internet real). Em background
    // (aba oculta) o poll CONTINUA durante a call — se pausar, a aba em
    // background nunca recebe ofertas e a call fica presa em new/ice:new.
    // O browser pode throttle o setTimeout, mas eventualmente dispara.
    if (!navigator.onLine) {
      scheduleSignalLoop()
      return
    }
    void processCallSignals().catch(() => { })
    if (signalBackoffIndex < SIGNAL_BACKOFF_STEPS.length - 1) signalBackoffIndex += 1
    scheduleSignalLoop()
  }, delay)
}

// Chute imediato no poll de sinais (reseta backoff + processa agora).
// Usar ao iniciar/parar share, upgrades de midia e qualquer evento que gere
// oferta — a resposta chega no proximo poll rapido em vez de ate 8s depois.
export function kickSignalPoll() {
  try {
    const st = useCallStore.getState()
    if (!st.activeCall || !st.sessionId) return
    if (signalTimer !== null) { window.clearTimeout(signalTimer); signalTimer = null }
    void processCallSignals().catch(() => { })
    signalBackoffIndex = 0
    scheduleSignalLoop()
  } catch { }
}

function stopSignalLoop() {  if (signalTimer !== null) window.clearTimeout(signalTimer)
  signalTimer = null
  signalBackoffIndex = 0
  for (const pc of peerConnections.values()) pc.close()
  peerConnections.clear()
  // Limpa dataChannels: ANTES, os DCs de calls anteriores ficavam orfaos no
  // map (readyState podia ficar 'open' por um tick apos pc.close()) e o
  // sendSignal os usava como atalho, engolindo offer/answer da call nova.
  for (const dc of dataChannels.values()) { try { dc.close() } catch { } }
  dataChannels.clear()
  for (const timer of disconnectTimers.values()) window.clearTimeout(timer)
  disconnectTimers.clear()
  for (const timer of reconnectTimers.values()) window.clearTimeout(timer)
  reconnectTimers.clear()
  for (const timer of screenRetryTimers.values()) window.clearTimeout(timer)
  screenRetryTimers.clear()
  lastFallbackRetry.clear()
  candidateBatch.length = 0
  if (candidateFlushTimer !== null) { try { window.clearTimeout(candidateFlushTimer) } catch { } candidateFlushTimer = null }
  statsSampleCache.clear()
  signalQueue.clear()
  pendingCandidates.clear()
  reconnectRetries.clear()
  creatingPeers.clear()
  processedSignals.clear()
  signalFailCount.clear()
  lastSignalTs = 0
  peerCreatedAt.clear()
  peerLastConnected.clear()
  renegotiationAttempts.clear()
  peerQualityTier.clear()
  // Para as tracks da midia remota (camera/tela dos outros) antes de largar:
  // sem o stop() os decodificadores ficam ativos e a call seguinte reutiliza
  // streams mortas do state.
  const { remoteStreams, remoteScreenStreams } = useCallStore.getState()
  for (const stream of Object.values(remoteStreams)) { try { stream.getTracks().forEach(t => t.stop()) } catch { } }
  for (const stream of Object.values(remoteScreenStreams)) { try { stream.getTracks().forEach(t => t.stop()) } catch { } }
  clearControlTimer()
  useCallStore.setState({ remoteStreams: {}, remoteScreenStreams: {}, connectionStates: {}, peerProtos: {}, sessionWatch: null, controlEndsAt: null, controlGrants: null, controlLinkOk: null, lastInputAckAt: null, speakingUsers: {} })
}

// Poller rapido de chamadas recebidas: enquanto o usuario nao esta em nenhuma
// call, verifica a cada 1.5s se alguem iniciou uma ligacao de DM para ele.
// Sem isso o toque demorava ate 10s (poll do App) e a call parecia "morta".
let ringPollTimer: number | null = null
let ringPollUserId: string | null = null

export function startIncomingCallPoll(userId: string) {
  if (ringPollTimer !== null && ringPollUserId === userId) return
  stopIncomingCallPoll()
  ringPollUserId = userId
  void useCallStore.getState().loadCallSessions('', userId).catch(() => { })
  // Poll de chamadas recebidas ADAPTATIVO: 1.5s com a aba focada (call chega
  // quase instantanea, <1.5s), 5s com a aba visivel mas sem foco, e pausa com
  // a aba oculta. Tick de 1s sem rede; o poll so dispara quando o tempo minimo
  // do estado atual passou.
  let lastPollAt = Date.now()
  ringPollTimer = window.setInterval(() => {
    if (document.hidden) return
    const minDelay = document.hasFocus() ? 5000 : 10000
    const now = Date.now()
    if (now - lastPollAt >= minDelay) {
      lastPollAt = now
      void useCallStore.getState().loadCallSessions('', userId).catch(() => { })
    }
  }, 1000)
}

export function stopIncomingCallPoll() {
  if (ringPollTimer !== null) {
    window.clearInterval(ringPollTimer)
    ringPollTimer = null
  }
  ringPollUserId = null
}

let leaveBeaconBound = false
function sendLeaveBeacon() {
  try {
    const st = useCallStore.getState()
    const u = useUserStore.getState().currentUser
    if (!st.activeCall || !st.sessionId || !u) return
    const payload = JSON.stringify({
      action: 'upsertCallSession',
      session: { id: st.sessionId, serverId: st.serverId, channelId: st.channelId, active: true, participantIds: [u.id] },
      leaveUserId: u.id,
      userId: u.id,
    })
    if (navigator.sendBeacon) {
      try { navigator.sendBeacon('/api/app', new Blob([payload], { type: 'application/json' })); return } catch { }
    }
    fetch('/api/app', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => { })
  } catch { }
}
function bindLeaveBeacon() {
  if (leaveBeaconBound || typeof window === 'undefined') return
  leaveBeaconBound = true
  window.addEventListener('pagehide', sendLeaveBeacon)
}

function participantsEqual(a: CallParticipant[], b: CallParticipant[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].userId !== b[i].userId) return false
  }
  return true
}

export async function syncSession(state: Pick<CallState, 'sessionId' | 'activeCall' | 'channelId' | 'serverId' | 'participants' | 'screenSharing' | 'screenStream' | 'preferredQuality' | 'preferredFps' | 'preferredBitrate' | 'callMode' | 'createdAt'>, leaveUserId?: string) {
  if (!state.sessionId || !state.channelId || !state.serverId) return
  const currentUser = useUserStore.getState().currentUser
  const connectionStats: Record<string, { state: string; tracks: number; screen: boolean; screenTracks: number; dc: boolean; ice: string }> = {}
  for (const [peerId, pc] of peerConnections) {
    const st = useCallStore.getState()
    const dc = dataChannels.get(peerId)
    connectionStats[peerId] = {
      state: pc.connectionState,
      tracks: st.remoteStreams[peerId]?.getTracks().length || 0,
      screen: Boolean(st.remoteScreenStreams[peerId]),
      screenTracks: st.remoteScreenStreams[peerId]?.getTracks().length || 0,
      dc: Boolean(dc && dc.readyState === 'open'),
      ice: pc.iceConnectionState,
    }
  }
  // Sem poda explícita: ela causava guerras (um lado podava o outro por PC
  // ainda conectando, derrubando quem estava vivo). Fantasma morre pelo
  // stamp de 35s + aviso de saída (DC + leaveUserId + beacon).
  const pruneIds: string[] = []
  const payload: CallSession = {
    id: state.sessionId,
    serverId: state.serverId,
    channelId: state.channelId,
    active: state.activeCall,
    hostUserId: currentUser?.id || '',
    participantIds: [...new Set([...state.participants.map(p => p.userId), ...(state.activeCall && currentUser && !leaveUserId ? [currentUser.id] : [])])],
    screenSharingUserId: state.screenSharing ? (currentUser?.id || '') : '',
    callMode: state.callMode,
    quality: state.preferredQuality,
    fps: state.preferredFps,
    bitrateKbps: state.preferredBitrate,
    createdAt: state.createdAt || Date.now(),
    updatedAt: Date.now(),
    connectionStats,
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const result = await requestBackend<{ session: CallSession; callSessions?: CallSession[] }>('upsertCallSession', { session: payload, leaveUserId, userId: currentUser?.id, pruneIds })
      try {
        lastPresenceRttMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
        lastPresenceRttAt = Date.now()
      } catch { }
      syncFailCount = 0
      const canonical = result?.session
      const current = useCallStore.getState()
      if (canonical?.id && canonical.id !== current.sessionId && current.activeCall) {
        useCallStore.setState({ sessionId: canonical.id })
      }
      try {
        const mine = (result?.callSessions || []).find(s => s && (s.id === useCallStore.getState().sessionId || (s.channelId === current.channelId && s.serverId === current.serverId)))
        if (mine && (mine as unknown as { watch?: unknown }).watch !== undefined) {
          useCallStore.setState({ sessionWatch: (mine as unknown as { watch: CallSessionWatch }).watch })
        }
      } catch { }
      // Sou o sharer e a tela nao chega em alguem: renegocia direto com ele
      // (1x/25s por peer). Nao espera o usuario perceber.
      try {
        const cur = useCallStore.getState()
        const w = cur.sessionWatch
        if (cur.activeCall && cur.screenSharing && w && w.screenMissingFor.length) {
          for (const pid of w.screenMissingFor) {
            const last = watchResyncAt.get(pid) || 0
            if (Date.now() - last < 25000) continue
            const pc = peerConnections.get(pid)
            if (!pc || (pc.connectionState !== 'connected' && pc.connectionState !== 'connecting')) continue
            watchResyncAt.set(pid, Date.now())
            try { triggerMediaRenegotiation(pid) } catch { }
          }
        }
      } catch { }
      return result?.callSessions || null
    } catch (syncErr) {
      if (attempt >= 2) {
        syncFailCount += 1
        if (syncFailCount >= 2 && Date.now() - syncToastAt > 60000) {
          syncToastAt = Date.now()
          try {
            const __m = syncErr instanceof Error ? syncErr.message : ''
            if (/Sessão expirada|401|403/.test(__m)) {
              void useUserStore.getState().trySilentReauth().then((ok) => {
                if (!ok) window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Sessão expirada. Recarregue (Ctrl+F5) e entre de novo.' }))
              })
            } else {
              const short = __m ? String(__m).slice(0, 80) : 'sem resposta do servidor'
              window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Falha na call (' + short + ')' }))
            }
          } catch { }
        }
        return
      }
      await new Promise(resolve => window.setTimeout(resolve, 350 * (attempt + 1)))
    }
  }
}

async function applyCallSessions(sessions: CallSession[], _serverId?: string, userId?: string) {
  const state = useCallStore.getState()
  const userStore = useUserStore.getState()
  const active = sessions.filter(session => session.active)

  if (userId) {
    const sameChannelActive = state.activeCall && state.channelId && state.serverId && state.serverId !== 'dm'
      ? active.filter(session => session.serverId === state.serverId && session.channelId === state.channelId)
      : []
    if (state.activeCall && state.sessionId && state.serverId !== 'dm'
      && Date.now() - (state.createdAt || 0) > 5000
      && !active.some(session => session.id === state.sessionId)
      && sameChannelActive.length === 0) {
      // NUNCA suicida: o backend pode ter nos podado (stamp expirado num
      // blip de rede, pruneIds indevido, cold start com lista velha).
      // Reanuncia a sessao e segue — sair e so por acao do usuario.
      void syncSession(useCallStore.getState())
      return sessions
    }
    if (state.activeCall && state.sessionId && sameChannelActive.length > 0
      && !sameChannelActive.some(session => session.id === state.sessionId)) {
      const canonical = sameChannelActive.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0]
      // BUG FIX (09/2026): NÃO sobrescrever createdAt com o da sessão antiga.
      // O relógio da call (ChannelSidebar: now - createdAt) começava em minutos
      // altos quando o usuário entrava num canal 24/7 cuja sessão já existia há
      // horas — o createdAt local (momento que ELE entrou) era trocado pelo da
      // sessão canônica. Modelo Discord: o timer conta desde que o usuário entrou.
      useCallStore.setState({ sessionId: canonical.id })
    }
    if (active.length === 0) {
      const calling = state.callingUser
      if (calling && !sessions.some(session => session.participantIds.includes(calling.userId))) {
        clearRingState()
        useCallStore.getState().endCall()
        return sessions
      }
      if (state.incomingCall) useCallStore.setState({ incomingCall: null })
      return sessions
    }
  }

  const userCache = new Map<string, User>()
  const allIds = [...new Set(active.flatMap(session => session.participantIds))]
  await Promise.all(allIds.map(async (id) => {
    if (userCache.has(id)) return
    const cached = userStore.users.find(user => user.id === id)
    if (cached) userCache.set(id, cached)
    else {
      const loaded = await userStore.getUserById(id)
      if (loaded) userCache.set(id, loaded)
    }
  }))

  const mySession = state.activeCall && state.sessionId
    ? active.find(session => session.id === state.sessionId)
    : undefined
  const sameChannelSessions = state.activeCall && state.channelId && state.serverId && state.serverId !== 'dm'
    ? active.filter(session => session.serverId === state.serverId && session.channelId === state.channelId)
    : []
  // BUG FIX: quem ja esta na call (tem mySession) so olhava a propria
  // sessao e IGNORAVA outras sessoes ativas do mesmo canal. Quando um
  // participante novo entra com sessionId proprio (startCall gera UUID
  // novo), o lado antigo nunca via ele -> nunca criava a oferta -> o
  // novo ficava em "new/ice:new" esperando para sempre ("Ligando..." ou
  // call muda). Participantes agora vem de TODAS as sessoes ativas do
  // canal (server), nao so da propria.
  const relevantSessions = sameChannelSessions.length > 0
    ? sameChannelSessions
    : (mySession ? [mySession] : [])
  const currentSession = relevantSessions[0]

  if (currentSession) {
    const sessionParticipantIds = [...new Set(relevantSessions.flatMap(session => session.participantIds))]
    const backendParticipants = sessionParticipantIds
      .map(id => userCache.get(id))
      .filter(Boolean)
      .map(user => ({
        userId: user!.id,
        userName: user!.name,
        userPhoto: user!.photoUrl,
        muted: false,
        deafened: false,
      }))
    const calling = state.callingUser
    if (calling && !backendParticipants.some(p => p.userId === calling.userId)) {
      clearRingState()
      useCallStore.getState().endCall()
      return sessions
    }
    const currentUser = userStore.currentUser
    const localUserInParticipants = currentUser && state.participants.some(p => p.userId === currentUser.id)
    const backendHasLocalUser = currentUser && backendParticipants.some(p => p.userId === currentUser.id)
    let finalParticipants = backendParticipants
    if (localUserInParticipants && !backendHasLocalUser && backendParticipants.length === 0) {
      finalParticipants = state.participants
    } else if (backendParticipants.length > 0) {
      const merged = new Map<string, CallParticipant>()
      // Sessoes atualizadas ha pouco = gente entrando agora (sem PC ainda):
      // mantem. Sessoes velhas sem PC = fantasma de quem ja saiu: descarta.
      const freshWindow = relevantSessions.some(sess => Date.now() - ((sess as unknown as { updatedAt?: number; createdAt?: number }).updatedAt || (sess as unknown as { createdAt?: number }).createdAt || 0) < 20000)
      for (const p of backendParticipants) {
        const cur = state.participants.find(x => x.userId === p.userId)
        // Preserva muted/deafened reais (vindos do media-state via DC): ANTES
        // o reload recriava todos com muted:false e a borda de mute sumia
        // segundos depois de aparecer.
        if (cur) merged.set(p.userId, { ...p, muted: cur.muted, deafened: (cur as unknown as { deafened?: boolean }).deafened ?? (p as unknown as { deafened?: boolean }).deafened ?? false })
        else if (peerConnections.has(p.userId) || freshWindow) merged.set(p.userId, p)
      }
      for (const p of state.participants) {
        if (merged.has(p.userId)) continue
        if (currentUser && p.userId === currentUser.id) { merged.set(p.userId, p); continue }
        const pc = peerConnections.get(p.userId)
        const recentlyConnected = Date.now() - (peerLastConnected.get(p.userId) || 0) < 30000
        const alive = (pc && (pc.connectionState === 'connected' || (recentlyConnected && pc.connectionState !== 'closed' && pc.connectionState !== 'failed')))
        if (alive) { merged.set(p.userId, p); continue }
        closePeer(p.userId)
        useCallStore.setState(st => {
          const { [p.userId]: _s, ...restScreens } = st.remoteScreenStreams
          const { [p.userId]: _r, ...restRemote } = st.remoteStreams
          return { remoteScreenStreams: restScreens, remoteStreams: restRemote }
        })
      }
      finalParticipants = Array.from(merged.values())
    }
    if (!participantsEqual(state.participants, finalParticipants)) {
      useCallStore.setState({ participants: finalParticipants })
      refreshLocalities(finalParticipants)
    }
    // Re-anuncia meu mute/deafen: se algum peer perdeu o media-state (DC
    // fechado na hora), converge em segundos em vez de ficar errado.
    try {
      const me = useCallStore.getState()
      const self = useUserStore.getState().currentUser
      if (self && me.activeCall) broadcastCallData({ t: 'media-state', userId: self.id, muted: me.muted, deafened: me.deafened })
    } catch { }
    return sessions
  }

  if (userId) {
    const freshCutoff = Date.now() - 120_000
    const incoming = active
      .filter(session =>
        session.serverId === 'dm'
        && session.active
        && session.hostUserId !== userStore.currentUser?.id
        && !declinedSessions.has(session.id)
        && !ringStoppedSessions.has(session.id)
        && (session.updatedAt || session.createdAt || 0) >= freshCutoff)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]

    if (incoming && state.incomingCall?.sessionId !== incoming.id) {
      const host = userCache.get(incoming.hostUserId)
      useCallStore.setState({
        incomingCall: {
          fromId: incoming.hostUserId,
          fromName: host?.name || 'Usuário',
          fromPhoto: host?.photoUrl || '',
          channelId: incoming.channelId,
          serverId: incoming.serverId,
          callMode: incoming.callMode || 'audio',
          sessionId: incoming.id,
        },
      })
      // Nao atendeu em 30s? Para de tocar, mas NAO recusa (sala de espera):
      // o chamador continua esperando e o usuario recebe a notificacao
      // "esta esperando sua chamada" com Entrar/Recusar (modelo Discord).
      clearIncomingTimer()
      incomingTimer = window.setTimeout(() => {
        incomingTimer = null
        ringStoppedSessions.add(incoming.id)
        if (ringStoppedSessions.size > 100) ringStoppedSessions.clear()
        const s = useCallStore.getState()
        if (s.incomingCall?.sessionId === incoming.id && !s.activeCall) {
          useCallStore.setState({ incomingCall: null })
        }
      }, 30000)
    } else if (!incoming && state.incomingCall) {
      clearIncomingTimer()
      useCallStore.setState({ incomingCall: null })
    }
  }
  return sessions
}

export const useCallStore = create<CallState>((set, get) => ({
  activeCall: false,
  channelId: null,
  serverId: null,
  createdAt: null,
  participants: [],
  muted: false,
  deafened: false,
  videoEnabled: true,
  livekitActive: false,
  screenSharing: false,
  localStream: null,
  screenStream: null,
  screenError: null,
  remoteStreams: {},
  remoteScreenStreams: {},
  connectionStates: {},
  peerProtos: {},
  sessionWatch: null,
  controlSettings: loadControlSettings(),
  controlEndsAt: null,
  controlGrants: null,
  controlLinkOk: null,
  lastInputAckAt: null,
  speakingUsers: {},
  screenMuted: false,
  volumes: {},
  controlRequests: [],
  controlling: null,
  controlledBy: null,
  controlPending: null,
  incomingCall: null,
  callingUser: null,
  sessionId: null,
  preferredQuality: loadPref(QUALITY_KEY, '720p') as CallQuality,
  preferredFps: loadPref(FPS_KEY, 60) as CallFps,
  preferredBitrate: loadPref(BITRATE_KEY, 12000) as number,
  callMode: 'audio',
  callRejectedBy: null,
  callWaiting: false,
  remoteCursor: null,
  peerLocality: {},
  anydeskMode: false,
  recordingActive: false,
  recordingBy: null,
  sharingPeers: [],
  startCall: async (channelId, serverId, localStream, callMode = 'audio', quality = get().preferredQuality, sessionId) => {
    const previous = get()
    // Nova call = novo baseline de sons de conexao: o primeiro tick do
    // checkCallPresence estabelece quem ja estava (sem tocar som) e os
    // proximos tocam call-join/call-leave conforme entram/saem.
    presenceSoundsArmed = false
    previous.localStream?.getTracks().forEach(track => track.stop())
    previous.screenStream?.getTracks().forEach(track => track.stop())
    stopMediaStream(previous.localStream)
    const resolvedSessionId = sessionId
      || (previous.sessionId && previous.channelId === channelId && previous.serverId === serverId
        ? previous.sessionId
        : crypto.randomUUID())
    set({
      activeCall: true,
      channelId,
      serverId,
      localStream,
      callMode,
      participants: [],
      preferredQuality: quality,
      muted: false,
      deafened: false,
      videoEnabled: true,
      livekitActive: false,
      screenSharing: false,
      createdAt: Date.now(),
      sessionId: resolvedSessionId,
      sharingPeers: [],
      recordingActive: false,
      recordingBy: null,
      callRejectedBy: null,
    })
    stopIncomingCallPoll()
    warmIceServers()
    bindLeaveBeacon()
    void import('../services/audioUnlock').then(m => m.unlockAudio()).catch(() => { })
    signalBackoffIndex = 0
    try {
      let lk: typeof import('../services/livekitCall')
      try {
        lk = await import('../services/livekitCall')
      } catch (e) {
        try {
          const { requestBackend } = await import('../services/backend')
          void requestBackend('reportClientError', { where: 'livekit:import', message: String((e as Error)?.message || e).slice(0, 200) }).catch(() => {})
        } catch {}
        throw e
      }
      const joined = await lk.livekitJoin({
        serverId,
        channelId,
        audio: true,
        video: callMode === 'video',
      })
      if (joined) {
        try { localStream.getTracks().forEach(tr => { try { tr.stop() } catch {} }) } catch {}
        try { useCallStore.setState({ livekitActive: true }) } catch {}
        startCallPresence()
        refreshLocalities(get().participants)
        return
      }
      try { useCallStore.setState({ livekitActive: false }) } catch {}
      try {
        const { requestBackend } = await import('../services/backend')
        void requestBackend('reportClientError', { where: 'livekit:fallback', message: 'mesh' }).catch(() => {})
      } catch {}
    } catch { /* cai para o mesh */ }
    startSignalLoop()
    refreshLocalities(get().participants)
    startCallPresence()
    if (serverId !== 'dm') {
      // Descobre participantes existentes no canal imediatamente (nao esperar o
      // timer de presenca), adota a sessao canonica e publica a participacao
      // para os demais ja na mesma sessao — conexao quase instantanea.
      const currentUserId = useUserStore.getState().currentUser?.id
      window.setTimeout(() => {
        if (!useCallStore.getState().activeCall) return
        void useCallStore.getState().loadCallSessions(serverId, currentUserId).then(async () => {
          const s = useCallStore.getState()
          if (s.activeCall && s.sessionId && s.channelId) {
            await connectToAllExistingPeers()
            void syncSession(s)
          }
        })
      }, 0)
      // Poll imediato: a oferta criada pelo connectToAllExistingPeers deve ser
      // descoberta AGORA, nao esperar o primeiro setTimeout de 400ms do poll.
      void processCallSignals().catch(() => { })
    }
    if (serverId === 'dm') {
      if (ringTimer !== null) window.clearTimeout(ringTimer)
      // Mesmo discovery de participantes dos canais de servidor: conecta
      // IMEDIATAMENTE com quem ja esta na lista local (quem ligou adicionou o
      // alvo no callUser ANTES do startCall; quem atende adiciona logo apos)
      // e publica a sessao. Antes, a DM dependia do checkCallPresence (15s),
      // que so conecta quando ha peers NOVOS — como o alvo ja esta local,
      // connectToAllExistingPeers nunca rodava, nenhuma oferta era criada e o
      // chamador ficava preso em "Ligando..." mesmo com o outro lado aceitando.
      const currentUserId = useUserStore.getState().currentUser?.id
      window.setTimeout(() => {
        if (!useCallStore.getState().activeCall) return
        void (async () => {
          await syncSession(useCallStore.getState())
          const s = useCallStore.getState()
          if (!s.activeCall || !s.sessionId) return
          await useCallStore.getState().loadCallSessions('dm', currentUserId).catch(() => { })
          const s2 = useCallStore.getState()
          if (s2.activeCall && s2.sessionId) {
            await connectToAllExistingPeers()
            void syncSession(s2)
          }
          // Poll imediato na DM tambem: a oferta do chamador deve ser descoberta
          // agora, nao esperar o primeiro setTimeout de 400ms do poll.
          void processCallSignals().catch(() => { })
        })()
      }, 0)
      // Tempo de espera de 30s: se ninguem atender, o chamador vai para a sala
      // de espera (call continuar ativa, nao encerra) e o receptor recebe uma
      // notificacao "Esta esperando sua chamada" com botoes Entrar/Recusar.
      // (modelo Discord: chamada nunca morre — quem ligou aguarda, quem recebeu
      // ve a chamada pendente ate aceitar ou recusar explicitamente.)
      ringTimer = window.setTimeout(() => {
        ringTimer = null
        const state = useCallStore.getState()
        if (!state.callingUser) return
        const calling = state.callingUser
        const currentUser = useUserStore.getState().currentUser
        if (currentUser && calling.userId !== currentUser.id) {
          // Nao encerra a call: entra em sala de espera
          useCallStore.setState({ callWaiting: true })
          // Notificacao in-app (aparece como toast com Entrar/Recusar)
          void requestBackend('createNotification', {
            toUserId: calling.userId,
            fromUserId: currentUser.id,
            fromName: currentUser.name,
            fromPhoto: currentUser.photoUrl || '',
            type: 'call-waiting',
            title: `${currentUser.name} esta esperando sua chamada`,
            body: 'Toque para entrar na chamada',
            data: { sessionId: state.sessionId, callMode: state.callMode, channelId: 'dm', serverId: 'dm' },
          }).catch(() => { })
          // Push para quando o app estiver em background/fechado
          void requestBackend('sendPush', {
            userId: calling.userId,
            fromUserId: currentUser.id,
            title: `${currentUser.name} esta esperando`,
            body: 'Toque para entrar na chamada',
            tag: `call-waiting-${state.sessionId}`,
            icon: currentUser.photoUrl || '/Logo.png',
          }).catch(() => { })
        }
      }, 30000)
    }
  },
  moveCall: (channelId, serverId) => {
    const state = get()
    if (!state.activeCall) return
    set({ channelId, serverId, createdAt: state.createdAt })
    void syncSession({ ...state, channelId, serverId })
  },
  endCall: () => {
    screenTransceivers.clear()
    controlBoosted.clear()
    peerClient.clear()
    peerGen.clear()
    remoteGen.clear()
    mlineFails.clear()
    mlineToasted.clear()
    // Derruba o grafo do audio limpo (senao o worklet continua gastando CPU).
    try {
      void import('../services/rnnoise').then(m => { try { m.disposeCleanAudio() } catch { } }).catch(() => { })
    } catch { }
    const earlyState = get()
    const earlyUser = useUserStore.getState().currentUser
    const earlyLocal = earlyState.localStream
    const earlyScreen = earlyState.screenStream
    void (async () => {
      try {
        const lk = await import('../services/livekitCall')
        await lk.livekitLeave()
      } catch { }
    })()
    try {
    const currentUser = earlyUser
    const state = earlyState
    if (ringTimer !== null) {
      window.clearTimeout(ringTimer)
      ringTimer = null
    }
    clearIncomingTimer()
    stopCursorFeed()
    stopCallRecording()
    if (cursorRelayOff) {
      try { cursorRelayOff() } catch { }
      cursorRelayOff = null
    }
    peerNetworkTier.clear()
    useCallStore.setState({ remoteCursor: null, peerLocality: {}, anydeskMode: false })
    if (sessionSyncOff) {
      sessionSyncOff()
      sessionSyncOff = null
    }
    if (presenceTimer !== null) {
      window.clearInterval(presenceTimer)
      presenceTimer = null
    }
    if (earlyState.recordingActive && earlyState.recordingBy?.id === currentUser?.id) {
      broadcastCallData({ type: 'recording-stopped', userId: currentUser?.id })
    }
    broadcastCallData({ t: 'call-leave', userId: currentUser?.id })
    stopSignalLoop()
    if (state.serverId === 'dm' && state.sessionId) {
      void requestBackend('upsertCallSession', {
        session: {
          id: state.sessionId,
          serverId: 'dm',
          channelId: 'dm',
          active: false,
          hostUserId: currentUser?.id || '',
          participantIds: [],
          screenSharingUserId: '',
          createdAt: state.createdAt || Date.now(),
          updatedAt: Date.now(),
        },
      }).catch(() => { })
    } else {
      void syncSession({ ...state, screenSharing: false }, currentUser?.id)
    }
    } catch (leaveErr) { console.error('[CALL] endCall cleanup:', leaveErr) }
    try { earlyLocal?.getTracks().forEach(x => x.stop()) } catch { }
    try { earlyScreen?.getTracks().forEach(x => x.stop()) } catch { }
    try { stopMediaStream(earlyLocal) } catch { }
    {
    try {
      const preState = get()
      if (preState.serverId) standbyByServer.set(preState.serverId, Date.now())
    } catch { }
    const currentUser = earlyUser
    set({
      activeCall: false,
      channelId: null,
      serverId: null,
      createdAt: null,
      participants: [],
      muted: false,
      deafened: false,
      videoEnabled: true,
      screenSharing: false,
      localStream: null,
      screenStream: null,
      remoteStreams: {},
      remoteScreenStreams: {},
      connectionStates: {},
      peerProtos: {},
      sessionWatch: null,
      controlEndsAt: null,
      controlGrants: null,
      controlLinkOk: null,
      lastInputAckAt: null,
      speakingUsers: {},
      screenMuted: false,
      volumes: {},
      controlRequests: [],
      controlling: null,
      controlledBy: null,
      controlPending: null,
      recordingActive: false,
      recordingBy: null,
      sharingPeers: [],
      sessionId: null,
      callMode: 'audio',
      callingUser: null,
      callWaiting: false,
      livekitActive: false,
      incomingCall: null,
    })
    if (currentUser) startIncomingCallPoll(currentUser.id)
    }
  },
  toggleRecording: () => {
    const st = get()
    const me = useUserStore.getState().currentUser
    if (!st.activeCall || !st.sessionId || !me) return
    if (st.recordingActive && st.recordingBy && st.recordingBy.id !== me.id) return
    if (st.recordingActive) {
      stopCallRecording()
      set({ recordingActive: false, recordingBy: null })
      broadcastCallData({ type: 'recording-stopped', userId: me.id })
      void auditRecordingEvent('stop', me.id, me.name)
      return
    }
    startCallRecording(st.sessionId, () => ({
      localStream: get().localStream,
      screenStream: get().screenStream,
      remoteStreams: get().remoteStreams,
      remoteScreenStreams: get().remoteScreenStreams,
    }))
    set({ recordingActive: true, recordingBy: { id: me.id, name: me.name } })
    broadcastCallData({ type: 'recording-started', userId: me.id, userName: me.name })
    void auditRecordingEvent('start', me.id, me.name)
  },
  addParticipant: (participant) => {
    const existing = get().participants.find(p => p.userId === participant.userId)
    if (existing) {
      set({ participants: get().participants.map(p => p.userId === participant.userId ? { ...p, ...participant } : p) })
    } else {
      set({ participants: [...get().participants, participant] })
      void applyAllPeerVideoBudgets()
    }
    refreshLocalities(get().participants)
    window.setTimeout(() => { void syncSession(get()) }, 0)
  },
  removeParticipant: (userId) => {
    set({ participants: get().participants.filter(p => p.userId !== userId) })
    // Purga total do peer (anti-fantasma): falante, controle e cursor nao
    // podem sobreviver a quem saiu.
    try {
      useCallStore.setState(st => {
        if (!(userId in st.speakingUsers)) return st
        const next = { ...st.speakingUsers }
        delete next[userId]
        return { speakingUsers: next }
      })
    } catch { }
    try { if (get().controlling === userId) get().stopControlling() } catch { }
    try {
      if (get().controlledBy === userId) {
        set({ controlledBy: null, controlRequests: get().controlRequests.filter(r => r.peerId !== userId) })
        stopCursorFeed()
      }
    } catch { }
    // Fecha o peer connection e para as tracks da midia remota: sem isso o
    // PC ficava aberto e a stream vazava depois que alguem saia da call.
    if (peerConnections.has(userId)) closePeer(userId)
    void applyAllPeerVideoBudgets()
    refreshLocalities(get().participants)
    window.setTimeout(() => { void syncSession(get()) }, 0)
  },
  toggleMute: () => {
    const { localStream, muted } = get()
    const newMuted = !muted
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = !newMuted })
    }
    set({ muted: newMuted, deafened: false })
    try { playSound(newMuted ? 'mute' : 'unmute') } catch { }
    if (get().livekitActive) {
      void import('../services/livekitCall').then(m => m.livekitSetMicEnabled(!newMuted)).catch(() => {})
    }
    const currentUser = useUserStore.getState().currentUser
    if (currentUser) {
      const participants = get().participants.map(p =>
        p.userId === currentUser.id ? { ...p, muted: newMuted } : p
      )
      set({ participants })
      // Sincroniza o mute com todos: sem isso os outros veem seu mic sempre
      // aberto (participants remotos nascem muted:false e nunca atualizam).
      try { broadcastCallData({ t: 'media-state', userId: currentUser.id, muted: newMuted }) } catch { }
    }
    void syncSession(get())
  },
  setVideoEnabled: (enabled) => {
    const { localStream } = get()
    if (localStream) {
      localStream.getVideoTracks().forEach(t => { t.enabled = enabled })
    }
    set({ videoEnabled: enabled })
  },
  toggleDeafen: () => {
    const { localStream, deafened } = get()
    const newDeafened = !deafened
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = !newDeafened })
    }
    set({ deafened: newDeafened, muted: newDeafened })
    try { playSound(newDeafened ? 'mute' : 'unmute') } catch { }
    const currentUser = useUserStore.getState().currentUser
    if (currentUser) {
      const participants = get().participants.map(p =>
        p.userId === currentUser.id ? { ...p, muted: newDeafened } : p
      )
      set({ participants })
      try { broadcastCallData({ t: 'media-state', userId: currentUser.id, muted: newDeafened, deafened: newDeafened }) } catch { }
    }
    void syncSession(get())
  },
  toggleScreenShare: async () => {
    if (get().livekitActive) {
      try {
        const lk = await import('../services/livekitCall')
        await lk.livekitToggleScreen()
      } catch { }
      return
    }
    const { screenSharing, screenStream } = get()
    if (screenSharing) {
      screenStream?.getTracks().forEach(t => t.stop())
      set({ screenSharing: false, screenStream: null })
      refreshCallRecording()
      broadcastCallData({ t: 'screen-stopped', userId: useUserStore.getState().currentUser?.id })
      for (const [peerId] of peerConnections) {
        const pc = peerConnections.get(peerId)
        if (!pc) continue
        detachScreenTrack(pc, get().localStream)
        void triggerMediaRenegotiation(peerId)
      }
      try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Você parou de transmitir' })) } catch { }
      void syncSession(get())
      kickSignalPoll()
    } else {
      try {
        const { preferredQuality, preferredFps, preferredBitrate } = get()
        // Captura na resolucao escolhida: 4k captura 3840x2160 e 2k 2560x1440
        // de verdade (se o SO/driver nao suportar, o fallback OverconstrainedError
        // abaixo cai para 720p em vez de quebrar o picker).
        const targetDim = preferredQuality === '4k'
          ? { width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 } }
          : preferredQuality === '2k'
          ? { width: { ideal: 2560, max: 2560 }, height: { ideal: 1440, max: 1440 } }
          : preferredQuality === '1080p'
            ? { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 } }
            : { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 } }
        const videoConstraints = {
          ...targetDim,
          frameRate: { ideal: preferredFps, max: preferredFps },
        }
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: videoConstraints })
        } catch (firstError) {
          const firstName = firstError instanceof Error ? firstError.name : ''
          // So repete com constraints reduzidas se a falha foi por constraints
          // (OverconstrainedError). Cancelamento (NotAllowedError) nao reabre o picker.
          if (firstName === 'NotAllowedError') throw firstError
          try {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } })
          } catch (secondError) {
            const secondName = secondError instanceof Error ? secondError.name : ''
            if (secondName === 'NotAllowedError') throw secondError
            throw secondError
          }
        }
        // IMPORTANTE - separar audio da tela do audio do mic:
        // O picker do SO pode incluir o audio do sistema na stream de tela
        // (getDisplayMedia). Se esse audio existir, o receptor classifica a
        // stream como "voz" (porque tem audio) e o mixer de voz passa a
        // controlar o volume da tela (bug: baixar "voz" baixa tambem a tela).
        // Aqui REMOVEMOS os tracks de audio da stream ANTES de envia-la:
        // - removeTrack removes da stream (getTracks() deixa de contarlo)
        // - stop() para a captura do sistema (evita eco local)
        // Asi a stream de tela viaja SOLO com video e e sempre detectada.
        const shareScreenAudio = typeof window !== 'undefined' && window.localStorage.getItem('friends-space:screen-audio') !== '0'
        if (!shareScreenAudio) {
          for (const t of stream.getAudioTracks()) {
            try { stream.removeTrack(t) } catch { }
            try { t.stop() } catch { }
          }
        }
        const videoTrack = stream.getVideoTracks()[0]
        if (!videoTrack) {
          stream.getTracks().forEach(track => track.stop())
          set({ screenError: 'Nenhuma tela com video foi selecionada' })
          void syncSession(get())
          return
        }
        set({ screenSharing: true, screenStream: stream, screenError: null })
        try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Você começou a transmitir' })) } catch { }
        try { broadcastCallData({ t: 'screen-started', userId: useUserStore.getState().currentUser?.id }) } catch { }
        playSound('screen-start')
        refreshCallRecording()
        for (const [peerId] of peerConnections) {
          const pc = peerConnections.get(peerId)
          if (!pc) continue
          for (const track of stream.getTracks()) {
            // Reutiliza o transceiver de tela do peer (criado no primeiro
            // compartilhamento) em vez de adicionar outro: a ordem das
            // m-lines fica idêntica entre ofertas e o remoto aceita sempre.
            try {
              try { (track as MediaStreamTrack & { contentHint?: string }).contentHint = 'detail' } catch { }
              const sender = await attachScreenTrack(pc, peerId, track, stream)
              if (track.kind === 'video' && sender) {
                try {
                  const params = sender.getParameters()
                  if (!params.encodings || params.encodings.length === 0) {
                    params.encodings = [{}]
                  }
                  // Tela: bitrate do plano (gameplay 1080p60 precisa 12Mbps+)
                  // e fps cheio, com preferencia por manter fluidez em vez de
                  // borrar a imagem quando a rede oscila.
                  params.encodings[0].maxBitrate = Math.max(Math.min(preferredBitrate, 25000) * 1000, 300_000)
                  params.encodings[0].maxFramerate = preferredFps
                  try { (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'maintain-framerate' } catch { }
                  await sender.setParameters(params)
                } catch { }
              }
            } catch { }
          }
          void triggerMediaRenegotiation(peerId)
          for (const dc of dataChannels.values()) {
            try { if (dc.readyState === 'open') dc.send(JSON.stringify({ t: 'signal-hint' })) } catch { }
          }
        }
        // A resposta (answer) a renegociacao chega pelo poll: chuta para nao
        // esperar ate 8s com a tela preta do outro lado.
        pokeScreenTurbo()
        kickSignalPoll()
        // Confirma que a tela entrou nos senders: attach mudo = tela preta
        // para todos sem nenhum erro visivel.
        try {
          let attached = 0
          for (const [, pc] of peerConnections) {
            for (const sender of pc.getSenders()) {
              const tr = sender.track
              if (tr && tr.kind === 'video' && stream.getVideoTracks().includes(tr)) attached++
            }
          }
          if (peerConnections.size > 0 && attached === 0) {
            diag('SHARE-FAILED-10', 'Tela não entrou na call — pare e compartilhe de novo', 'call:screen')
          }
        } catch { }
        videoTrack.onended = () => {
          set({ screenSharing: false, screenStream: null })
      broadcastCallData({ t: 'screen-stopped', userId: useUserStore.getState().currentUser?.id })
          for (const [peerId] of peerConnections) {
            const pc = peerConnections.get(peerId)
            if (!pc) continue
            detachScreenTrack(pc, get().localStream)
            void triggerMediaRenegotiation(peerId)
          }
          try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Transmissão encerrada' })) } catch { }
          void syncSession(get())
        }
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        const isDenied = name === 'NotAllowedError' || name === 'SecurityError'
        set({ screenError: isDenied ? 'Permissao negada para compartilhar a tela' : `Nao foi possivel compartilhar a tela (${name || 'erro'})` })
      }
    }
    void syncSession(get())
  },
  clearScreenError: () => set({ screenError: null }),
  toggleScreenMute: () => {
    set({ screenMuted: !get().screenMuted })
  },
  setVolume: (key, value) => {
    set({ volumes: { ...get().volumes, [key]: Math.min(1, Math.max(0, value)) } })
  },
  setVolumeForAll: (value) => {
    const v = Math.min(1, Math.max(0, value))
    const keys = new Set<string>(['screen', 'screen:local'])
    for (const peerId of Object.keys(get().remoteStreams)) keys.add(peerId)
    for (const peerId of Object.keys(get().remoteScreenStreams)) keys.add(peerId)
    for (const peerId of Object.keys(get().remoteScreenStreams)) keys.add(`screen:${peerId}`)
    set({ volumes: Object.fromEntries([...keys].map(k => [k, v])) })
  },
  setLocalStream: (stream) => set({ localStream: stream }),
  attachLocalStream: (stream) => {
    if (get().livekitActive) {
      try {
        const did = stream.getAudioTracks()[0]?.getSettings?.()?.deviceId
        stream.getTracks().forEach(tr => { try { tr.stop() } catch {} })
        void import('../services/livekitCall').then(m => m.livekitAttachMic(did)).catch(() => {})
      } catch { }
      return
    }
    const st = get()
    if (!st.activeCall || !stream) { set({ localStream: stream }); return }
    const old = st.localStream
    const hadTracks = (old?.getTracks().length || 0) > 0
    set({ localStream: stream, muted: false, deafened: false })
    reapplyCallTrackState(stream, false, false, true)
    void (async () => {
      for (const [peerId, pc] of peerConnections) {
        let added = false
        // Slots canônicos primeiro (valem mesmo inativos/sem track):
        // replaceTrack no slot preserva a ordem das m-lines; addTrack só em
        // último caso.
        const slots = mediaSlots.get(peerId)
        for (const track of stream.getTracks()) {
          const has = pc.getSenders().some(s => s.track && s.track.id === track.id)
          if (has) continue
          const slotAudio = slots?.audio && slots.audio.direction !== 'stopped' ? slots.audio : null
          const audioSender = track.kind === 'audio'
            ? (slotAudio?.sender ?? pc.getSenders().find(s => s.track && s.track.kind === 'audio'))
            : null
          // Câmera: prefere replaceTrack no sender de vídeo existente em vez de
          // addTrack — addTrack pode reutilizar o transceiver inativo da TELA
          // e embaralhar a ordem das m-lines no remoto. Exclui os senders da
          // tela para não trocar câmera por tela.
          const screenTr = track.kind === 'video' ? screenTransceivers.get(peerId) : undefined
          const slotVideo = slots?.video && slots.video.direction !== 'stopped' && (!screenTr || slots.video !== screenTr) ? slots.video : null
          const videoSender = track.kind === 'video'
            ? (slotVideo?.sender ?? pc.getSenders().find(s => s.track && s.track.kind === 'video' && (!screenTr || s !== screenTr.sender)))
            : null
          try {
            if (audioSender && track.kind === 'audio' && !hadTracks) {
              await audioSender.replaceTrack(track)
              if (slotAudio && audioSender === slotAudio.sender) { try { slotAudio.direction = 'sendonly' } catch { } }
            } else if (videoSender) {
              await videoSender.replaceTrack(track)
              if (slotVideo && videoSender === slotVideo.sender) { try { slotVideo.direction = 'sendonly' } catch { } }
            }
            else { pc.addTrack(track, stream); added = true }
          } catch { }
        }
        if (added) void triggerMediaRenegotiation(peerId)
      }
    })()
  },
  switchMicDevice: async (deviceId) => {
    if (get().livekitActive) {
      try {
        const lk = await import('../services/livekitCall')
        await lk.livekitSwitchMic(deviceId)
      } catch { }
      return
    }
    const { acquireCallMedia } = await import('../services/antiloud')
    const state = get()
    if (!state.activeCall) return
    const stream = await acquireCallMedia(state.callMode || 'audio', state.preferredQuality, deviceId, state.preferredFps)
    const oldTracks = state.localStream?.getTracks() || []
    oldTracks.forEach(track => track.stop())
    stopMediaStream(state.localStream)
    set({ localStream: stream, muted: false, deafened: false })
    reapplyCallTrackState(stream, false, false, true)
    const audioTrack = stream.getAudioTracks()[0]
    for (const [, pc] of peerConnections) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio')
      if (sender && audioTrack) {
        try { await sender.replaceTrack(audioTrack) } catch { }
      }
    }
    // A troca invalida o grafo do audio limpo: reconcilia (recria se ligado).
    await refreshCleanAudio()
  },
  setCleanAudioEnabled: async (on) => {
    const toast = (detail: string) => {
      try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail })) } catch { }
    }
    if (!isAstroUser()) {
      toast('Áudio limpo é um recurso dos planos Astro')
      return
    }
    const rn = await import('../services/rnnoise')
    if (on && !rn.isCleanAudioSupported()) {
      toast('Este navegador não suporta áudio limpo')
      return
    }
    rn.setCleanAudioEnabledPref(on)
    const state = get()
    if (!state.activeCall || !state.localStream) {
      toast(on ? 'Áudio limpo ativado para a próxima call' : 'Áudio limpo desativado')
      return
    }
    if (!on) {
      // Volta ao mic cru (ainda vivo como fonte do grafo) e derruba o filtro.
      const raw = rn.getCleanAudioSource()?.getAudioTracks()[0] || null
      rn.disposeCleanAudio(true)
      if (raw) {
        await swapLocalAudioTrack(raw)
        toast('Áudio limpo desativado')
      } else {
        // Fallback: recaptura so audio (sem piscar a camera).
        try {
          const { acquireCallMedia } = await import('../services/antiloud')
          const savedMic = (() => { try { return localStorage.getItem('friends-space:mic') || undefined } catch { return undefined } })()
          const fresh = await acquireCallMedia('audio', state.preferredQuality, savedMic, state.preferredFps)
          const freshAudio = fresh.getAudioTracks()[0]
          fresh.getVideoTracks().forEach(t => { try { t.stop() } catch { } })
          if (freshAudio) {
            await swapLocalAudioTrack(freshAudio)
            toast('Áudio limpo desativado')
          }
        } catch {
          toast('Não foi possível restaurar o microfone')
        }
      }
      return
    }
    await refreshCleanAudio()
    toast(rn.isCleanAudioActive() ? 'Áudio limpo ativado' : 'Não foi possível ativar o áudio limpo')
  },
  setIncomingCall: (call) => {
    if (!call) clearIncomingTimer()
    set({ incomingCall: call })
  },
  setCallingUser: (user) => set({ callingUser: user }),
  declineIncomingCall: () => {
    clearIncomingTimer()
    const { incomingCall } = get()
    set({ incomingCall: null })
    if (!incomingCall?.sessionId) return
    declinedSessions.add(incomingCall.sessionId)
    const currentUser = useUserStore.getState().currentUser
    if (currentUser && incomingCall.fromId && incomingCall.fromId !== currentUser.id) {
      void sendSignal({
        sessionId: incomingCall.sessionId,
        fromUserId: currentUser.id,
        toUserId: incomingCall.fromId,
        type: 'decline',
        payload: {},
      }).catch(() => { })
    }
    void requestBackend('upsertCallSession', {
      session: {
        id: incomingCall.sessionId,
        serverId: incomingCall.serverId || 'dm',
        channelId: incomingCall.channelId || 'dm',
        active: false,
        hostUserId: '',
        participantIds: [],
        screenSharingUserId: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    }).catch(() => { })
  },
  callUser: async (userId, mode = 'audio') => {
    const current = get()
    if (current.callingUser) return
    if (current.activeCall) get().endCall()
    set({ callRejectedBy: null, incomingCall: null })
    const userStore = useUserStore.getState()
    const target = userStore.users.find(user => user.id === userId)
    if (!target) return
    try {
      set({ callingUser: { userId: target.id, userName: target.name, userPhoto: target.photoUrl } })
      const { acquireCallMedia } = await import('../services/antiloud')
      const stream = await acquireCallMedia(mode, current.preferredQuality, undefined, current.preferredFps)
      // Mic dedicado + audio limpo entram em background (sem travar o join).
      void upgradeLocalMedia()
      const actualMode: CallMode = stream.getVideoTracks().length > 0 ? 'video' : 'audio'
      get().addParticipant({ userId: target.id, userName: target.name, userPhoto: target.photoUrl, muted: false, deafened: false })
      try {
        await get().startCall('dm', 'dm', stream, actualMode, current.preferredQuality)
      } catch (dmErr) {
        set({ callingUser: null })
        try {
          window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: dmErr instanceof Error && dmErr.message ? dmErr.message : 'Falha ao ligar. Tente de novo.' }))
        } catch {}
      }
    } catch {
      set({ callingUser: null })
    }
  },
  dismissRejectedCall: () => set({ callRejectedBy: null }),
  inviteToCall: async (userId) => {
    const state = get()
    const currentUser = useUserStore.getState().currentUser
    if (!currentUser || !state.activeCall || !state.sessionId) return
    const target = useUserStore.getState().users.find(user => user.id === userId)
    if (!target) return
    const participants = state.participants
      .filter(p => p.userId !== userId && p.userId !== currentUser.id)
      .map(p => ({ userId: p.userId, name: p.userName, photoUrl: p.userPhoto }))
    await requestBackend('createNotification', {
      toUserId: userId,
      fromUserId: currentUser.id,
      fromName: currentUser.name,
      fromPhoto: currentUser.photoUrl || '',
      type: 'call-invite',
      title: `${currentUser.name} quer te adicionar nesta call!`,
      body: participants.length > 0 ? `${participants.length} ${participants.length === 1 ? 'pessoa' : 'pessoas'} na chamada` : 'Chamada em andamento',
      data: {
        sessionId: state.sessionId,
        channelId: state.channelId,
        serverId: state.serverId,
        callMode: state.callMode,
        participants,
      },
    }).catch(() => { })
  },
  acceptCallInvite: async (invite) => {
    const currentUser = useUserStore.getState().currentUser
    const data = (invite.data || {}) as { sessionId?: string; channelId?: string; serverId?: string; callMode?: CallMode }
    if (get().activeCall) get().endCall()
    set({ incomingCall: null })
    try {
      const { acquireCallMedia } = await import('../services/antiloud')
      const stream = await acquireCallMedia(data.callMode || 'audio', get().preferredQuality, undefined, get().preferredFps)
      void upgradeLocalMedia()
      const mode: CallMode = stream.getVideoTracks().length > 0 ? 'video' : 'audio'
      get().addParticipant({ userId: invite.fromUserId, userName: invite.fromName, userPhoto: invite.fromPhoto, muted: false, deafened: false })
      get().startCall(data.channelId || 'dm', data.serverId || 'dm', stream, mode, get().preferredQuality, data.sessionId)
      if (currentUser) {
        void requestBackend('createNotification', {
          toUserId: invite.fromUserId,
          fromUserId: currentUser.id,
          fromName: currentUser.name,
          fromPhoto: currentUser.photoUrl || '',
          type: 'call-invite-response',
          title: `${currentUser.name} entrou na call`,
          data: { sessionId: data.sessionId },
        }).catch(() => { })
      }
    } catch { }
  },
  rejectCallInvite: async (invite) => {
    const currentUser = useUserStore.getState().currentUser
    set({ incomingCall: null })
    if (currentUser) {
      // Recusou a sala de espera: avisa o chamador (sinal decline) para ele
      // sair da espera, alem da notificacao de recusa.
      const sessionId = (invite.data || {}).sessionId as string | undefined
      if (sessionId && invite.fromUserId && invite.fromUserId !== currentUser.id) {
        void sendSignal({
          sessionId,
          fromUserId: currentUser.id,
          toUserId: invite.fromUserId,
          type: 'decline',
          payload: {},
        }).catch(() => { })
      }
      void requestBackend('createNotification', {
        toUserId: invite.fromUserId,
        fromUserId: currentUser.id,
        fromName: currentUser.name,
        fromPhoto: currentUser.photoUrl || '',
        type: 'call-invite-response',
        title: `${currentUser.name} recusou seu convite para a call`,
        data: { sessionId: (invite.data || {}).sessionId },
      }).catch(() => { })
    }
  },
  setPreferredQuality: async (quality) => {
    const user = useUserStore.getState().currentUser
    const clamped = clampStreamQuality(user, quality)
    let bitrate = QUALITY_BITRATE_KBPS[clamped] || 8000
    bitrate = Math.min(bitrate, getMaxBitrateKbps(user))
    set({ preferredQuality: clamped, preferredBitrate: bitrate })
    savePref(QUALITY_KEY, clamped)
    savePref(BITRATE_KEY, bitrate)
    const state = get()
    const videoOn = Boolean(state.localStream?.getVideoTracks().length)
    if (state.activeCall && videoOn) {
      try {
        const { acquireCallMedia } = await import('../services/antiloud')
        const curMicId = (() => { try { return state.localStream?.getAudioTracks()[0]?.getSettings?.().deviceId || undefined } catch { return undefined } })()
      const stream = await acquireCallMedia(state.callMode || 'video', clamped, curMicId, state.preferredFps)
        // So depois de obter a stream nova: parar a antiga antes deixava o
        // usuario sem camera se a captura falhasse (o catch engolia o erro).
        const oldTracks = state.localStream?.getTracks() || []
        oldTracks.forEach(track => track.stop())
        stopMediaStream(state.localStream)
        set({ localStream: stream })
        const audioTrack = stream.getAudioTracks()[0]
        const videoTrack = stream.getVideoTracks()[0]
        for (const [, pc] of peerConnections) {
          const senders = pc.getSenders()
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio')
          const videoSender = senders.find(s => s.track && s.track.kind === 'video')
          if (audioSender && audioTrack) { try { await audioSender.replaceTrack(audioTrack) } catch { } }
          if (videoSender && videoTrack) { try { await videoSender.replaceTrack(videoTrack) } catch { } }
        }
        reapplyCallTrackState(stream, state.muted, state.deafened, state.videoEnabled)
        void applyAllPeerVideoBudgets()
        await refreshCleanAudio()
      } catch { }
    }
    void syncSession(get())
  },
  setPreferredFps: async (fps) => {
    const user = useUserStore.getState().currentUser
    const clamped = clampStreamFps(user, fps)
    set({ preferredFps: clamped })
    savePref(FPS_KEY, clamped)
    const state = get()
    const videoOn = Boolean(state.localStream?.getVideoTracks().length)
    if (state.activeCall && videoOn) {
      try {
        const { acquireCallMedia } = await import('../services/antiloud')
        const curMicId2 = (() => { try { return state.localStream?.getAudioTracks()[0]?.getSettings?.().deviceId || undefined } catch { return undefined } })()
      const stream = await acquireCallMedia(state.callMode || 'video', state.preferredQuality, curMicId2, clamped)
        // So depois de obter a stream nova: parar a antiga antes deixava o
        // usuario sem camera se a captura falhasse (o catch engolia o erro).
        const oldTracks = state.localStream?.getTracks() || []
        oldTracks.forEach(track => track.stop())
        stopMediaStream(state.localStream)
        set({ localStream: stream })
        const audioTrack = stream.getAudioTracks()[0]
        const videoTrack = stream.getVideoTracks()[0]
        for (const [, pc] of peerConnections) {
          const senders = pc.getSenders()
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio')
          const videoSender = senders.find(s => s.track && s.track.kind === 'video')
          if (audioSender && audioTrack) { try { await audioSender.replaceTrack(audioTrack) } catch { } }
          if (videoSender && videoTrack) { try { await videoSender.replaceTrack(videoTrack) } catch { } }
        }
        reapplyCallTrackState(stream, state.muted, state.deafened, state.videoEnabled)
        void applyAllPeerVideoBudgets()
        await refreshCleanAudio()
      } catch { }
    }
    void syncSession(get())
  },
  setPreferredBitrate: async (kbps) => {
    const user = useUserStore.getState().currentUser
    const clamped = Math.min(kbps, getMaxBitrateKbps(user))
    set({ preferredBitrate: clamped })
    savePref(BITRATE_KEY, clamped)
    void syncSession(get())
    for (const [, pc] of peerConnections) {
      const senders = pc.getSenders().filter(s => s.track && (s.track.kind === 'video' || s.track !== get().localStream?.getAudioTracks()[0]))
      for (const sender of senders) {
        if (!sender.track) continue
        try {
          const params = sender.getParameters()
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
          params.encodings.forEach(enc => { enc.maxBitrate = clamped * 1000; enc.maxFramerate = get().preferredFps })
          await sender.setParameters(params)
        } catch { }
      }
    }
  },
  loadCallSessions: async (serverId, userId) => {
    try {
      const sessions = await requestBackend<CallSession[]>('loadCallSessions', { serverId, userId })
      sessFailCount = 0
      return applyCallSessions(sessions, serverId, userId)
    } catch (sessErr) {
      sessFailCount += 1
      if (sessFailCount >= 3) {
        sessFailCount = 0
        try {
          const __m = sessErr instanceof Error ? sessErr.message : ''
          if (/Sessão expirada|401|403/.test(__m)) {
            const ok = await useUserStore.getState().trySilentReauth()
            if (ok) return get().loadCallSessions(serverId, userId)
            window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Conexão expirada. Recarregue (Ctrl+F5).' }))
          }
        } catch { }
      }
      return []
    }
  },
  setSpeaking: (userId, speaking) => {
    set({ speakingUsers: { ...get().speakingUsers, [userId]: speaking } })
  },
  setScreenAudioEnabled: (enabled) => {
    // Botão "áudio da tela" (menu da própria tela): ANTES só gravava a flag
    // para a PRÓXIMA transmissão — no meio da call parecia não funcionar.
    // Agora muta de verdade e na hora: remove os tracks de áudio da
    // screenStream e corta nos senders (replaceTrack(null) não renegocia).
    // Ligar no meio da call exige re-captura do SO: avisa e vale na próxima.
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem('friends-space:screen-audio', enabled ? '1' : '0')
    } catch { }
    const { screenStream } = get()
    if (!screenStream) return
    if (!enabled) {
      const audioTracks = screenStream.getAudioTracks()
      for (const t of audioTracks) {
        try { screenStream.removeTrack(t) } catch { }
        try { t.stop() } catch { }
      }
      for (const [, pc] of peerConnections) {
        for (const sender of pc.getSenders()) {
          const tr = sender.track
          if (tr && tr.kind === 'audio' && audioTracks.includes(tr)) {
            try { void sender.replaceTrack(null).catch(() => { }) } catch { }
          }
        }
      }
      try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Áudio da sua tela mutado' })) } catch { }
    } else {
      try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Áudio da tela volta na próxima transmissão' })) } catch { }
    }
    void syncSession(get())
  },
  requestControl: (peerId) => {
    // Controle remoto é EXE→EXE: exige app desktop nos dois lados (execução
    // de mouse/teclado via PowerShell/xdotool só existe no EXE).
    if (myClientType() !== 'electron') {
      try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Controle remoto só no app desktop (EXE)' })) } catch { }
      return
    }
    // UMA SÓ programação: controle exige mesmo protocolo nos dois lados.
    // Build velha (sem proto) ou navegador = falha muda garantida, então
    // bloqueia com orientação em vez de falhar silencioso.
    try {
      const nm = get().participants.find(p => p.userId === peerId)?.userName || 'Usuário'
      if (peerClient.get(peerId) === 'web') {
        window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: `${nm} está no navegador — controle remoto é EXE para EXE` }))
        return
      }
      const proto = peerProto.get(peerId)
      if (proto !== CALL_PROTO) {
        window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: `${nm} está com o app desatualizado — peça para atualizar e tentar de novo` }))
        try { useCallStore.setState(state => ({ peerProtos: { ...state.peerProtos, [peerId]: proto ?? 0 } })) } catch { }
        return
      }
    } catch { }
    const currentUser = useUserStore.getState().currentUser
    set({ controlPending: peerId })
    const reqPayload = { type: 'request-control', userName: currentUser?.name || '' }
    sendControlMessage(peerId, reqPayload)
    // Retry: pedido perdido (DC fechado na hora) nao pode falhar mudo.
    for (const ms of [2000, 4500]) {
      window.setTimeout(() => {
        try {
          const st = useCallStore.getState()
          if (st.controlPending === peerId && !st.controlling) sendControlMessage(peerId, reqPayload)
        } catch { }
      }, ms)
    }
    window.setTimeout(() => {
      try {
        const st = useCallStore.getState()
        if (st.controlPending === peerId && !st.controlling) {
          useCallStore.setState({ controlPending: null })
          try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Sem resposta ao pedido de controle — peça para aceitar' })) } catch { }
        }
      } catch { }
    }, 12000)
  },
  acceptControlRequest: (peerId) => {
    const s = get().controlSettings
    set(state => ({
      controlledBy: peerId,
      controlRequests: state.controlRequests.filter(r => r.peerId !== peerId),
    }))
    setupCursorRelay(peerId)
    const acceptedPayload = { type: 'control-accepted', minutes: s.minutes, mouse: s.mouse, keyboard: s.keyboard }
    sendControlMessage(peerId, acceptedPayload)
    for (const ms of [1200, 2800]) {
      window.setTimeout(() => {
        try {
          if (useCallStore.getState().controlledBy === peerId) sendControlMessage(peerId, acceptedPayload)
        } catch { }
      }, ms)
    }
    controlGrantsByPeer.set(peerId, { mouse: s.mouse, keyboard: s.keyboard, clipboard: s.clipboard })
    // Microfone fechado: muta durante o controle, restaura ao revogar.
    controlSavedMuted = get().muted
    if (!s.mic && !get().muted) {
      try { get().toggleMute() } catch { }
    }
    // Audio da tela fechado: corta na hora, restaura ao revogar.
    try { controlSavedScreenAudio = window.localStorage.getItem('friends-space:screen-audio') !== '0' } catch { controlSavedScreenAudio = true }
    if (!s.audio) {
      try { get().setScreenAudioEnabled(false) } catch { }
    }
    // Tempo escolhido pelo dono: expirou = revoga sozinho.
    clearControlTimer()
    if (s.minutes > 0) {
      const endsAt = Date.now() + s.minutes * 60000
      set({ controlEndsAt: endsAt })
      controlTimer.id = window.setTimeout(() => {
        controlTimer.id = null
        try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Tempo de controle esgotado' })) } catch { }
        try { get().revokeControl() } catch { }
      }, s.minutes * 60000)
    } else {
      set({ controlEndsAt: null })
    }
  },
  denyControlRequest: (peerId) => {
    set(state => ({ controlRequests: state.controlRequests.filter(r => r.peerId !== peerId) }))
    sendControlMessage(peerId, { type: 'control-denied' })
  },
  sendControlInput: (input) => {
    const peerId = get().controlling
    if (peerId) sendControlMessage(peerId, { type: 'input', ...input })
  },
  sendClipboard: (text) => {
    const peerId = get().controlling
    if (!peerId || !text) return
    sendControlMessage(peerId, { type: 'clipboard', text: text.slice(0, 100000) })
  },
  stopControlling: () => {
    const peerId = get().controlling
    set({ controlling: null, remoteCursor: null, controlEndsAt: null, controlGrants: null })
    try { document.exitPointerLock?.() } catch { }
    if (peerId) {
      try { sendControlMessage(peerId, { type: 'control-boost', on: false }) } catch { }
      sendControlMessage(peerId, { type: 'control-revoked' })
    }
  },
  revokeControl: () => {
    const peerId = get().controlledBy
    clearControlTimer()
    controlGrantsByPeer.delete(peerId || '')
    set({ controlledBy: null, controlEndsAt: null })
    setupCursorRelay(null)
    if (peerId) sendControlMessage(peerId, { type: 'control-revoked' })
    // Restaura mic e audio da tela se foram fechados para o controle.
    try {
      if (controlSavedMuted === false && get().muted) get().toggleMute()
    } catch { }
    try {
      if (controlSavedScreenAudio === true) get().setScreenAudioEnabled(true)
    } catch { }
    controlSavedMuted = null
    controlSavedScreenAudio = null
  },
  setAnydeskMode: (enabled) => {
    set({ anydeskMode: enabled })
  },
  setControlSettings: (patch) => {
    const next = { ...get().controlSettings, ...patch }
    set({ controlSettings: next })
    try { window.localStorage.setItem(CONTROL_SETTINGS_KEY, JSON.stringify(next)) } catch { }
  },
}))

export interface CallDiagnostics {
  localAudioTracks: number
  localVideoTracks: number
  localMicEnabled: boolean
  participantCount: number
  remoteStreamCount: number
  serverLatencyMs: number | null
  signalRttMs: number | null
  signalRttAt: number
  presenceRttMs: number | null
  presenceRttAt: number
  signalErrors: Array<{ type: string; msg: string; ts: number }>
  remoteByPeer: Record<string, {
    connectionState: string
    iceState: string
    audioIn: number
    videoIn: number
    audioOut: number
    candidates: string[]
    latencyMs: number | null
    jitterMs: number | null
    audioLoss: number | null
    videoLoss: number | null
    audioPackets: number | null
    videoPackets: number | null
    audioBytes: number | null
    videoBytes: number | null
    audioBitrateKbps: number | null
    videoBitrateKbps: number | null
    videoFps: number | null
    audioCodec: string | null
    videoCodec: string | null
    dataChannelState: string | null
    remoteCandidateType: string | null
    transportType: string | null
  }>
}

// Diagnostico ao vivo da call: mostra se o microfono capta (audio local)
// e se as tracks de midia chegam/saem por peer. Usado no painel de debug.
const statsSampleCache = new Map<string, { bytes: number; ts: number }>()

export async function getCallDiagnostics(): Promise<CallDiagnostics> {
  const state = useCallStore.getState()
  const entries: Record<string, CallDiagnostics['remoteByPeer'][string]> = {}

  for (const [peerId, pc] of peerConnections) {
    entries[peerId] = {
      connectionState: pc.connectionState,
      iceState: pc.iceConnectionState,
      audioIn: 0,
      videoIn: 0,
      audioOut: 0,
      candidates: [],
      latencyMs: null,
      jitterMs: null,
      audioLoss: null,
      videoLoss: null,
      audioPackets: null,
      videoPackets: null,
      audioBytes: null,
      videoBytes: null,
      audioBitrateKbps: null,
      videoBitrateKbps: null,
      videoFps: null,
      audioCodec: null,
      videoCodec: null,
      dataChannelState: dataChannels.get(peerId)?.readyState ?? null,
      remoteCandidateType: null,
      transportType: null,
    }
  }

  const now = Date.now()
  for (const [peerId, pc] of peerConnections) {
    try {
      const stats = await pc.getStats()
      const entry = entries[peerId]
      if (!entry) continue
      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          if (report.kind === 'audio') {
            if (typeof report.bytesReceived === 'number' && report.bytesReceived > 0) {
              entry.audioIn += 1
              entry.audioBytes = report.bytesReceived
              entry.audioPackets = typeof report.packetsReceived === 'number' ? report.packetsReceived : null
              if (typeof report.packetsLost === 'number') entry.audioLoss = report.packetsLost
              entry.audioBitrateKbps = sampleBitrate(peerId, 'audio-in', report.bytesReceived, now)
            }
            if (typeof report.jitter === 'number') entry.jitterMs = Math.round(report.jitter * 1000)
          }
          if (report.kind === 'video') {
            if (typeof report.bytesReceived === 'number' && report.bytesReceived > 0) {
              entry.videoIn += 1
              entry.videoBytes = report.bytesReceived
              entry.videoPackets = typeof report.packetsReceived === 'number' ? report.packetsReceived : null
              if (typeof report.packetsLost === 'number') entry.videoLoss = report.packetsLost
              if (typeof report.framesPerSecond === 'number') entry.videoFps = Math.round(report.framesPerSecond)
              entry.videoBitrateKbps = sampleBitrate(peerId, 'video-in', report.bytesReceived, now)
            }
            if (typeof report.jitter === 'number') entry.jitterMs = Math.round(report.jitter * 1000)
            if (typeof report.roundTripTime === 'number') entry.latencyMs = Math.round(report.roundTripTime * 1000)
          }
        } else if (report.type === 'outbound-rtp') {
          if (report.kind === 'audio' && typeof report.bytesSent === 'number' && report.bytesSent > 0) {
            entry.audioOut += 1
            entry.audioBitrateKbps = sampleBitrate(peerId, 'audio-out', report.bytesSent, now)
          }
          if (report.kind === 'video' && typeof report.roundTripTime === 'number') entry.latencyMs = Math.round(report.roundTripTime * 1000)
        } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (typeof report.currentRoundTripTime === 'number') entry.latencyMs = Math.round(report.currentRoundTripTime * 1000)
        } else if (report.type === 'remote-candidate' && report.candidateType) {
          entry.remoteCandidateType = report.candidateType
          entry.candidates.push(report.candidateType)
        } else if (report.type === 'local-candidate' && report.candidateType) {
          entry.candidates.push(report.candidateType)
        } else if (report.type === 'transport' && report.dtlsState) {
          entry.transportType = report.dtlsState
        } else if (report.type === 'codec') {
          if (entry.audioCodec === null && /audio/i.test(report.mimeType || '')) entry.audioCodec = report.mimeType
          if (entry.videoCodec === null && /video/i.test(report.mimeType || '')) entry.videoCodec = report.mimeType
        }
      })
    } catch { }
  }

  for (const entry of Object.values(entries)) {
    entry.candidates = [...new Set(entry.candidates)]
  }

  // Ping do servidor (RTT do backend): o Discord mostra a latencia para o
  // servidor de voz mesmo quando voce esta sozinho no canal — aqui medimos o
  // tempo de ida-e-volta de uma requisicao leve ao backend (proxy Pages).
  // Reusa o RTT real das requisições que já rodam (signal/presença) quando
  // o ping dedicado falhar ou para evitar 1 request extra a cada 2.5s.
  let serverLatencyMs: number | null = null
  try {
    const t0 = performance.now()
    await requestBackend<{ ok: boolean }>('ping', {})
    serverLatencyMs = Math.round(performance.now() - t0)
  } catch {
    serverLatencyMs = lastSignalRttMs ?? lastPresenceRttMs ?? null
  }

  return {
    localAudioTracks: state.localStream?.getAudioTracks().length || 0,
    localVideoTracks: state.localStream?.getVideoTracks().length || 0,
    localMicEnabled: Boolean(state.localStream?.getAudioTracks().some(t => t.enabled)),
    participantCount: state.participants.length,
    remoteStreamCount: Object.keys(state.remoteStreams).length,
    serverLatencyMs,
    signalRttMs: lastSignalRttMs,
    signalRttAt: lastSignalRttAt,
    presenceRttMs: lastPresenceRttMs,
    presenceRttAt: lastPresenceRttAt,
    signalErrors: [...lastSignalErrors],
    remoteByPeer: entries,
  }
}

function sampleBitrate(peerId: string, kind: string, bytes: number, ts: number): number | null {
  const key = `${peerId}:${kind}`
  const prev = statsSampleCache.get(key)
  statsSampleCache.set(key, { bytes, ts })
  if (!prev || prev.ts >= ts || bytes < prev.bytes) return null
  const elapsedSec = (ts - prev.ts) / 1000
  if (elapsedSec <= 0) return null
  return Math.round(((bytes - prev.bytes) * 8) / elapsedSec / 1000)
}

export interface LocalVideoStats {
  width: number
  height: number
  fps: number
  kind: 'camera' | 'screen' | null
}

// Resolucao/fps REAIS da transmissao local (o que o getUserMedia entregou).
export function getLocalVideoStats(): LocalVideoStats {
  const state = useCallStore.getState()
  const camTrack = state.localStream?.getVideoTracks()[0]
  const screenTrack = state.screenStream?.getVideoTracks()[0]
  const track = screenTrack || camTrack
  if (!track) return { width: 0, height: 0, fps: 0, kind: null }
  let width = 0
  let height = 0
  let fps = 0
  try {
    const s = track.getSettings()
    width = s.width || 0
    height = s.height || 0
    fps = s.frameRate || 0
  } catch { }
  return { width, height, fps, kind: screenTrack ? 'screen' : 'camera' }
}
