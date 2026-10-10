let ctx: AudioContext | null = null
let loopTimer: number | null = null

function getContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
  }
  return ctx
}

export function resumeRingtoneAudio() {
  try {
    const audioContext = getContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch { }
}

function ringBurst(audioContext: AudioContext, startAt: number) {
  const osc = audioContext.createOscillator()
  const gain = audioContext.createGain()
  osc.type = 'sine'
  osc.frequency.value = 425
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02)
  gain.gain.setValueAtTime(0.25, startAt + 0.16)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2)
  osc.connect(gain)
  gain.connect(audioContext.destination)
  osc.start(startAt)
  osc.stop(startAt + 0.21)
}

export function startRingtone() {
  if (loopTimer !== null) return
  try {
    const audioContext = getContext()
    void audioContext.resume()
    const play = () => {
      const t = audioContext.currentTime + 0.05
      ringBurst(audioContext, t)
      ringBurst(audioContext, t + 0.45)
    }
    play()
    loopTimer = window.setInterval(play, 2400)
  } catch { }
}

export function stopRingtone() {
  if (loopTimer !== null) {
    window.clearInterval(loopTimer)
    loopTimer = null
  }
}
