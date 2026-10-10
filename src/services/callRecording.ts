import { uploadTransmissionChunk } from './driveService'

// Gravacao automatica da chamada para o Drive DELE.
// Cada participante grava a propria visao da call (audio misturado de todos +
// a tela que estiver sendo compartilhada) e envia os trechos, em chunks de 1min,
// para a pasta pessoal "Minhas Transmissoes" — assim TODOS os envolvidos ficam
// com a gravacao no proprio Drive e nenhum binario passa pelo Friends Space.
// Quando ninguem esta compartilhando tela, grava so audio.

interface StreamSource {
  localStream: MediaStream | null
  screenStream: MediaStream | null
  remoteStreams: Record<string, MediaStream>
  remoteScreenStreams: Record<string, MediaStream>
}

interface AudioDestinationWithStream extends AudioNode {
  stream: MediaStream
}

interface RecordingState {
  sessionId: string
  getStreams: () => StreamSource
  audioContext: AudioContext | null
  recorder: MediaRecorder | null
  destination: AudioDestinationWithStream | null
  composition: string
  chunkIndex: number
  startedAt: number
  uploadQueue: Promise<void>
  activeVideoTrackId: string | null
}

let recording: RecordingState | null = null

const CHUNK_MS = 60_000

function pickPrimaryVideo(source: StreamSource): MediaStreamTrack | null {
  if (source.screenStream) {
    const track = source.screenStream.getVideoTracks()[0]
    if (track && track.readyState === 'live') return track
  }
  for (const stream of Object.values(source.remoteScreenStreams)) {
    const track = stream.getVideoTracks()[0]
    if (track && track.readyState === 'live') return track
  }
  return null
}

function collectAudioTracks(source: StreamSource): MediaStreamTrack[] {
  const tracks: MediaStreamTrack[] = []
  if (source.localStream) tracks.push(...source.localStream.getAudioTracks())
  for (const stream of Object.values(source.remoteStreams)) {
    tracks.push(...stream.getAudioTracks())
  }
  return tracks.filter(track => track.readyState === 'live')
}

function computeComposition(source: StreamSource): string {
  const video = pickPrimaryVideo(source)
  const audio = collectAudioTracks(source)
    .map(track => track.id)
    .sort()
  return `${video ? `v:${video.id}` : 'audio-only'}|a:${audio.join(',')}`
}

function pickMimeType(hasVideo: boolean): string {
  const candidates = hasVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  if (typeof MediaRecorder === 'undefined') return candidates[0]
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate
    } catch { }
  }
  return hasVideo ? 'video/webm' : 'audio/webm'
}

function buildRecordingStream(state: RecordingState): MediaStream | null {
  const source = state.getStreams()
  const audioTracks = collectAudioTracks(source)
  const videoTrack = pickPrimaryVideo(source)
  if (audioTracks.length === 0 && !videoTrack) return null

  const trackSource = new MediaStream([...audioTracks, ...(videoTrack ? [videoTrack] : [])])
  if (!videoTrack) {
    // So audio: usar MediaRecorder direto sobre os tracks de audio (sem
    // AudioContext) evita processos extras e incompatibilidade de codecs.
    return trackSource
  }

  try {
    if (!state.audioContext) state.audioContext = new AudioContext()
    const ctx = state.audioContext
    if (ctx.state === 'suspended') void ctx.resume().catch(() => { })
    if (!state.destination) state.destination = ctx.createMediaStreamDestination()
    const dest = state.destination
    const mixedAudio = new MediaStream()
    for (const track of audioTracks) {
      try {
        const sourceNode = ctx.createMediaStreamSource(new MediaStream([track]))
        sourceNode.connect(dest)
        mixedAudio.addTrack(dest.stream.getAudioTracks()[0])
      } catch { }
    }
    const output = new MediaStream()
    if (videoTrack) output.addTrack(videoTrack)
    for (const track of mixedAudio.getAudioTracks()) output.addTrack(track)
    return output
  } catch {
    return trackSource
  }
}

function stopRecorder() {
  const state = recording
  if (!state || !state.recorder) return
  const recorder = state.recorder
  state.recorder = null
  recorder.onstop = null
  recorder.ondataavailable = null
  try { recorder.stop() } catch { }
}

function disposeAudioContext() {
  const state = recording
  if (!state) return
  if (state.audioContext) {
    try { void state.audioContext.close().catch(() => { }) } catch { }
    state.audioContext = null
  }
  state.destination = null
}

function startRecorder() {
  const state = recording
  if (!state) return
  const source = state.getStreams()
  const stream = buildRecordingStream(state)
  const videoTrack = pickPrimaryVideo(source)
  if (!stream || stream.getTracks().length === 0) return

  const mimeType = pickMimeType(Boolean(videoTrack))
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 128_000 } : undefined)
  } catch {
    try {
      recorder = new MediaRecorder(stream)
    } catch {
      return
    }
  }
  state.recorder = recorder
  recorder.ondataavailable = event => {
    if (!event.data || event.data.size === 0) return
    const chunk = event.data
    state.chunkIndex += 1
    const index = state.chunkIndex
    const date = new Date()
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`
    const mime = chunk.type || (videoTrack ? 'video/webm' : 'audio/webm')
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'
    const name = `call-${state.sessionId.slice(0, 8)}-${stamp}-${String(index).padStart(2, '0')}.${ext}`
    state.uploadQueue = state.uploadQueue
      .then(async () => { await uploadTransmissionChunk(chunk, name, mime) })
      .catch(() => { })
  }
  try {
    recorder.start(CHUNK_MS)
  } catch {
    state.recorder = null
  }
}

export function startCallRecording(sessionId: string, getStreams: () => StreamSource) {
  stopCallRecording()
  if (typeof MediaRecorder === 'undefined') return
  recording = {
    sessionId,
    getStreams,
    audioContext: null,
    recorder: null,
    destination: null,
    composition: '',
    chunkIndex: 0,
    startedAt: Date.now(),
    uploadQueue: Promise.resolve(),
    activeVideoTrackId: null,
  }
  refreshCallRecording()
}

// Reavalia a composicao da gravacao (audio/tela mudaram) e reinicia o recorder
// so quando os tracks efetivamente mudaram — assim alternar share nao divide o
// arquivo em pedacos desnecessarios.
export function refreshCallRecording() {
  const state = recording
  if (!state) return
  const source = state.getStreams()
  const composition = computeComposition(source)
  const videoTrack = pickPrimaryVideo(source)
  const videoTrackId = videoTrack ? videoTrack.id : null
  const audioChanged = composition !== state.composition
  const videoChanged = videoTrackId !== state.activeVideoTrackId
  if (state.recorder && !audioChanged && !videoChanged) return
  if (!state.recorder && !audioChanged && state.composition === composition) {
    state.composition = composition
    state.activeVideoTrackId = videoTrackId
  }
  state.composition = composition
  state.activeVideoTrackId = videoTrackId
  stopRecorder()
  disposeAudioContext()
  startRecorder()
}

export function stopCallRecording() {
  const state = recording
  if (!state) return
  stopRecorder()
  disposeAudioContext()
  const queue = state.uploadQueue
  recording = null
  void queue.catch(() => { })
}
