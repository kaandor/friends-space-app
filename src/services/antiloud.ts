export type CallQuality = '480p' | '720p' | '1080p' | '2k' | '4k'
export type CallFps = 30 | 60
export type CallMode = 'audio' | 'video'

const VIDEO_PRESETS: Record<CallQuality, { width: MediaTrackConstraints['width']; height: MediaTrackConstraints['height'] }> = {
  '480p': { width: { ideal: 854 }, height: { ideal: 480 } },
  '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
  '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
  '2k': { width: { ideal: 2560 }, height: { ideal: 1440 } },
  '4k': { width: { ideal: 3840 }, height: { ideal: 2160 } },
}

// Bitrate sugerido por qualidade (kbps). Baseado no padrao de transmissao
// para entrega nitida: 480p ~2.5 Mbps, 720p ~5 Mbps, 1080p ~9 Mbps,
// 2k ~14 Mbps, 4k ~35 Mbps. E usado como ceiling do encoder da camera.
export const QUALITY_BITRATE_KBPS: Record<CallQuality, number> = {
  '480p': 3000,
  '720p': 6000,
  '1080p': 12000,
  '2k': 16000,
  '4k': 35000,
}

export function buildAudioConstraints(): MediaTrackConstraints {
  let echo = true
  let noise = true
  let agc = true
  try {
    echo = localStorage.getItem('friends-space:echo') !== '0'
    noise = localStorage.getItem('friends-space:noise') !== '0'
    agc = localStorage.getItem('friends-space:agc') !== '0'
  } catch { }
  const constraints: MediaTrackConstraints = {
    // Valores 'ideal' nunca causam falha de captura: o driver entrega o melhor
    // que suporta. Monofonico + 48kHz = voz limpa; processamento mata eco,
    // ruido de fundo e estabiliza o volume automaticamente.
    echoCancellation: { ideal: echo },
    noiseSuppression: { ideal: noise },
    autoGainControl: { ideal: agc },
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
  }
  // Dica de latencia minima de captura (0 = menor buffer do driver).
  // 'latency' nao existe no tipo do TS, mas o Chrome aceita; 'ideal' nunca
  // quebra (driver ignora se nao suportar). Voz continua mono: estereo
  // dobraria a banda = mais delay na transmissao.
  try {
    (constraints as unknown as Record<string, unknown>)['latency'] = { ideal: 0 }
  } catch { }
  return constraints
}

export function buildVideoConstraints(quality: CallQuality, fps: CallFps = 60): MediaTrackConstraints {
  return {
    ...VIDEO_PRESETS[quality],
    frameRate: { ideal: fps, max: fps },
    facingMode: 'user',
  }
}

export async function getAudioInputDevices(): Promise<{ deviceId: string; label: string }[]> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter(device => device.kind === 'audioinput')
      .map(device => ({ deviceId: device.deviceId, label: device.label || 'Microfone' }))
  } catch {
    return []
  }
}

export async function getAudioOutputDevices(): Promise<{ deviceId: string; label: string }[]> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter(device => device.kind === 'audiooutput')
      .map(device => ({ deviceId: device.deviceId, label: device.label || 'Fone de ouvido' }))
  } catch {
    return []
  }
}

export function supportsSinkId(): boolean {
  return typeof HTMLAudioElement !== 'undefined' && 'setSinkId' in HTMLAudioElement.prototype
}
export function applySinkId(el: HTMLMediaElement, deviceId: string | null): void {
  if (!deviceId || !supportsSinkId()) return
  try {
    const audio = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
    if (typeof audio.setSinkId === 'function') {
      void audio.setSinkId(deviceId).catch(() => { })
    }
  } catch {
  }
}

// ---------------------------------------------------------------------------
// Reconhecimento automatico de microfone (recurso ASTRO).
// O SO expoe cada driver/dispositivo via enumerateDevices; aqui pontuamos os
// rotulos: mic dedicado/USB de qualidade ganha de "padrao"/generico. Sem
// permissao de mic os rotulos vem vazios — por isso a selecao roda DEPOIS da
// primeira captura (que dispara o prompt de permissao).
// ---------------------------------------------------------------------------

const QUALITY_MIC_HINTS = [
  'usb', 'hyperx', 'logitech', 'razer', 'blue', 'yeti', 'snowball', 'elgato',
  'shure', 'rode', 'audio-technica', 'jbl', 'sony', 'sennheiser', 'beyerdynamic',
  'fifine', 'maono', 'tonor', 'samson', 'akg', 'edifier', 'havit', 'redragon',
  'corsair', 'steelseries', 'quadcast', 'wave', 'nt-usb', 'podmic', 'sm7',
  'externo', 'external', 'condensador', 'condenser', 'dinamico', 'dynamic',
  'headset gamer', 'gaming headset',
]

const GENERIC_MIC_HINTS = [
  'default', 'padrao', 'padrão', 'communications', 'comunica',
  'hands-free', 'maos-livres', 'mãos-livres', 'hfp', 'hsp',
]

const WEAK_MIC_HINTS = [
  'webcam', 'camera', 'câmera', 'array', 'integrado', 'integrated',
  'realtek', 'high definition audio', 'stereo mix', 'mixagem',
]

export function scoreMicDevice(label: string, deviceId: string): number {
  const id = (deviceId || '').toLowerCase()
  const name = (label || '').toLowerCase()
  if (!name) return -1000
  let score = 0
  if (id === 'default' || id === 'communications') score -= 50
  for (const hint of GENERIC_MIC_HINTS) {
    if (name.includes(hint)) score -= 50
  }
  for (const hint of WEAK_MIC_HINTS) {
    if (name.includes(hint)) score -= 15
  }
  for (const hint of QUALITY_MIC_HINTS) {
    if (name.includes(hint)) score += 100
  }
  if (name.includes('microfone') || name.includes('microphone') || name.includes('mic ')) score += 5
  return score
}

export async function selectBestMicDevice(): Promise<{ deviceId: string; label: string } | null> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return null
    const devices = await navigator.mediaDevices.enumerateDevices()
    const mics = devices.filter(d => d.kind === 'audioinput' && d.deviceId)
    if (mics.length === 0) return null
    const ranked = mics
      .map(d => ({ deviceId: d.deviceId, label: d.label || '', score: scoreMicDevice(d.label || '', d.deviceId) }))
      .sort((a, b) => b.score - a.score)
    const best = ranked[0]
    // So vale a troca se o melhor for um mic reconhecido de verdade, nao um
    // "padrao"/generico (nesse caso o audio padrao ja e o correto).
    if (!best || best.score < 50) return null
    return { deviceId: best.deviceId, label: best.label }
  } catch {
    return null
  }
}

export async function acquireCallMedia(mode: CallMode, quality: CallQuality, deviceId?: string, fps: CallFps = 60) {
  const { unlockAudio } = await import('./audioUnlock')
  unlockAudio()
  const video = mode === 'video' ? buildVideoConstraints(quality, fps) : false

  // Cadeia de fallback para o micro/fone do usuario: tenta a melhor qualidade
  // (48kHz mono + processamento), e se o driver nao suportar alguma constraint
  // (fones Bluetooth, headsets USB, etc.) vai relaxando ate capturar com
  // certeza. Sem isso o getUserMedia falha e o usuario "nunca entra na call".
  const attempts: Array<{ audio: MediaTrackConstraints | boolean; label: string }> = []

  const full = buildAudioConstraints()
  if (deviceId) full.deviceId = { exact: deviceId }
  attempts.push({ audio: full, label: 'full' })

  const relaxed = buildAudioConstraints()
  if (deviceId) relaxed.deviceId = { exact: deviceId }
  relaxed.echoCancellation = { ideal: false }
  relaxed.noiseSuppression = { ideal: false }
  relaxed.autoGainControl = { ideal: false }
  attempts.push({ audio: relaxed, label: 'relaxed' })

  const noDevice = buildAudioConstraints()
  attempts.push({ audio: noDevice, label: 'nodevice' })

  const bare: MediaTrackConstraints = {}
  attempts.push({ audio: bare, label: 'bare' })
  attempts.push({ audio: true, label: 'true' })

  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: attempt.audio, video })
      return applyInputVolume(stream)
    } catch (err) {
      lastError = err
      const e = err as DOMException
      // Nao adianta repetir quando o usuario negou ou nao existe dispositivo.
      if (e?.name === 'NotAllowedError' || e?.name === 'NotFoundError') throw err
    }
  }
  throw lastError
}

// ── Volume de entrada (ganho do microfone) ─────────────────────────────────
// Preferencia local ('friends-space:vol-in', 0-200). Quando != 100 monta um
// grafo WebAudio leve na captura; o slider do painel muda o ganho ao vivo.
const INPUT_VOLUME_KEY = 'friends-space:vol-in'

export function inputVolumePref(): number {
  try {
    const v = Number(localStorage.getItem(INPUT_VOLUME_KEY) || '100')
    return Number.isFinite(v) ? Math.min(200, Math.max(0, v)) : 100
  } catch {
    return 100
  }
}

let inputGain: { ctx: AudioContext; gain: GainNode; sourceStream: MediaStream; output: MediaStream } | null = null

function closeInputGain(): void {
  const g = inputGain
  inputGain = null
  if (!g) return
  try { void g.ctx.close().catch(() => { }) } catch { }
}

export function applyInputVolume(stream: MediaStream, volume = inputVolumePref()): MediaStream {
  closeInputGain()
  try {
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0 || volume === 100) return stream
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(new MediaStream(audioTracks))
    const gain = ctx.createGain()
    gain.gain.value = Math.min(2, Math.max(0, volume / 100))
    const dest = ctx.createMediaStreamDestination()
    source.connect(gain)
    gain.connect(dest)
    const output = new MediaStream([...dest.stream.getAudioTracks(), ...stream.getVideoTracks()])
    inputGain = { ctx, gain, sourceStream: stream, output }
    return output
  } catch {
    return stream
  }
}

export function setInputVolume(volume: number): void {
  const v = Math.min(2, Math.max(0, volume / 100))
  try { if (inputGain) inputGain.gain.gain.value = v } catch { }
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return
  const g = inputGain
  if (g && (stream === g.output || stream.getAudioTracks().some(t => t.id === g.sourceStream.getAudioTracks()[0]?.id))) {
    closeInputGain()
    g.sourceStream.getTracks().forEach(track => track.stop())
  }
  stream.getTracks().forEach(track => track.stop())
}

// Volume remoto ate 200%: HTMLMediaElement.volume satura em 1, entao o ganho
// extra (>100%) e feito por GainNode (WebAudio), um grafo por elemento.
const remoteGainChains = new WeakMap<HTMLMediaElement, { ctx: AudioContext; gain: GainNode }>()
let remoteGainCtx: AudioContext | null = null

function remoteGainChain(el: HTMLMediaElement): { ctx: AudioContext; gain: GainNode } | null {
  const existing = remoteGainChains.get(el)
  if (existing) return existing
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!remoteGainCtx || remoteGainCtx.state === 'closed') remoteGainCtx = new Ctor()
    const ctx = remoteGainCtx
    const source = ctx.createMediaElementSource(el)
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(ctx.destination)
    const chain = { ctx, gain }
    remoteGainChains.set(el, chain)
    return chain
  } catch {
    return null
  }
}

export function applyRemoteGain(el: HTMLMediaElement, volume: number): void {
  const v = Math.max(0, Math.min(2, volume))
  try {
    el.volume = Math.min(1, v)
    el.muted = v <= 0
  } catch { }
  if (v <= 1) {
    const chain = remoteGainChains.get(el)
    if (chain) { try { chain.gain.gain.value = 1 } catch { } }
    return
  }
  const chain = remoteGainChain(el)
  if (!chain) return
  try {
    if (chain.ctx.state === 'suspended') void chain.ctx.resume().catch(() => { })
    chain.gain.gain.value = v
  } catch { }
}
