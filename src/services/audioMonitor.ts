import { useCallStore } from '../stores/callStore'

const analysers = new Map<string, { analyser: AnalyserNode; context: AudioContext }>()
const lastSpeaking: Record<string, boolean> = {}
let interval: number | null = null

function connectAnalyser(key: string, stream: MediaStream) {
  if (analysers.has(key)) return
  const audioTrack = stream.getAudioTracks()[0]
  if (!audioTrack) return
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    const context = new Ctor()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.4
    source.connect(analyser)
    analysers.set(key, { analyser, context })
    if (interval === null) interval = window.setInterval(update, 150)
  } catch { }
}

function update() {
  const changed: Record<string, boolean> = {}
  for (const [key, { analyser }] of analysers) {
    const data = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / data.length)
    const speaking = rms > 0.02
    if (speaking !== lastSpeaking[key]) {
      lastSpeaking[key] = speaking
      changed[key] = speaking
    }
  }
  if (Object.keys(changed).length > 0) {
    useCallStore.setState({ speakingUsers: { ...useCallStore.getState().speakingUsers, ...changed } })
  }
}

export function startAudioMonitor(streams: { key: string; stream: MediaStream }[]) {
  const keys = new Set(streams.map(s => s.key))
  for (const key of [...analysers.keys()]) {
    if (keys.has(key)) continue
    const entry = analysers.get(key)
    if (entry) void entry.context.close()
    analysers.delete(key)
    if (lastSpeaking[key]) {
      lastSpeaking[key] = false
      const speaking = { ...useCallStore.getState().speakingUsers }
      delete speaking[key]
      useCallStore.setState({ speakingUsers: speaking })
    }
  }
  for (const { key, stream } of streams) connectAnalyser(key, stream)
  if (analysers.size === 0 && interval !== null) {
    window.clearInterval(interval)
    interval = null
  }
}

export function stopAudioMonitor() {
  if (interval !== null) window.clearInterval(interval)
  interval = null
  for (const entry of analysers.values()) void entry.context.close()
  analysers.clear()
  for (const key of Object.keys(lastSpeaking)) delete lastSpeaking[key]
  if (Object.keys(useCallStore.getState().speakingUsers).length > 0) useCallStore.setState({ speakingUsers: {} })
}

// Retorna true se o microfone local esta captando SOM (nivel acima do limiar).
// Usado para alertar quando o mic selecionado esta mudo (ex.: dispositivo errado).
export function getMicLevel(): boolean {
  const entry = analysers.get('local')
  if (!entry) return false
  const data = new Uint8Array(entry.analyser.fftSize)
  entry.analyser.getByteTimeDomainData(data)
  let peak = 0
  for (let i = 0; i < data.length; i += 1) {
    const v = Math.abs((data[i] - 128) / 128)
    if (v > peak) peak = v
  }
  return peak > 0.03
}
