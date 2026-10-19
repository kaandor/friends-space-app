// Desbloqueio de audio para WebRTC em navegadores mobile.
// iOS/Safari e alguns Android bloqueiam autoplay de audio; criar/resumir um
// AudioContext dentro de um gesto de usuario desbloqueia a saida de audio.

let ctx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext }
  const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : w.webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  return ctx
}

export function unlockAudio() {
  const context = getAudioContext()
  if (!context) return
  if (context.state === 'suspended') {
    void context.resume().catch(() => { })
  }
  try {
    // Nodo de silencio para "manter vivo" o contexto se a pagina nao usar WebAudio.
    if (context.state === 'running' && context.currentTime === 0) {
      const buffer = context.createBuffer(1, 1, 22050)
      const source = context.createBufferSource()
      source.buffer = buffer
      const gain = context.createGain()
      gain.gain.value = 0
      source.connect(gain)
      gain.connect(context.destination)
      source.start(0)
    }
  } catch { }
}