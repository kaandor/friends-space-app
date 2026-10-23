// Sons do Friends Space: sintetizados em Web Audio com estetica "alienigena".
// Nada de arquivos: tudo e gerado com ondas senoidais/triangulares, glissandos,
// vibrato e arpejos pentatonicos etǸreos �?" o "idioma" sonoro do app.

import { soundboardVolumeFraction } from './soundboardVolume'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let playbackGain = 1

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    try {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface ToneOpts {
  freq: number
  at?: number
  dur?: number
  type?: OscillatorType
  gain?: number
  glideTo?: number
}

function tone(o: ToneOpts) {
  const c = ensure()
  if (!c || !master) return
  const t0 = c.currentTime + (o.at ?? 0)
  const dur = o.dur ?? 0.25
  const osc = c.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(Math.max(1, o.freq), t0)
  if (o.glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.glideTo), t0 + dur)
  const g = c.createGain()
  const peak = (o.gain ?? 0.18) * playbackGain
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

// Brilho etéreo com vibrato (LFO modulando a frequencia).
function shimmer(freq: number, at = 0, dur = 0.6, gain = 0.05) {
  const c = ensure()
  if (!c || !master) return
  const t0 = c.currentTime + at
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  const lfo = c.createOscillator()
  lfo.frequency.value = 6
  const lfoGain = c.createGain()
  lfoGain.gain.value = freq * 0.012
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain * playbackGain, t0 + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
  lfo.start(t0)
  lfo.stop(t0 + dur + 0.05)
}

export type SoundName =
  | 'dm'
  | 'server'
  | 'notification'
  | 'call-join'
  | 'call-leave'
  | 'screen-start'
  | 'screen-stop'
  | 'participant-add'
  | 'friend-request'
  | 'call-invite'
  | 'astro'
  | 'mute'
  | 'unmute'
  | 'chime'

export function playSound(name: SoundName, volume = 1) {
  const previousGain = playbackGain
  playbackGain = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1))
  try {
    switch (name) {
      case 'dm':
        tone({ freq: 660, glideTo: 990, dur: 0.16, gain: 0.15 })
        tone({ freq: 990, at: 0.13, glideTo: 1320, dur: 0.2, gain: 0.11 })
        break
      case 'server':
        tone({ freq: 440, glideTo: 660, dur: 0.16, gain: 0.13 })
        shimmer(1320, 0.08, 0.35, 0.03)
        break
      case 'notification':
        tone({ freq: 659.25, dur: 0.16, gain: 0.12, type: 'triangle' })
        tone({ freq: 987.77, at: 0.09, dur: 0.16, gain: 0.12, type: 'triangle' })
        tone({ freq: 1318.5, at: 0.18, dur: 0.28, gain: 0.1, type: 'triangle' })
        shimmer(2637, 0.18, 0.4, 0.035)
        break
      case 'call-join':
        tone({ freq: 300, glideTo: 900, dur: 0.4, gain: 0.15 })
        shimmer(1500, 0.08, 0.5, 0.04)
        break
      case 'call-leave':
        tone({ freq: 900, glideTo: 220, dur: 0.45, gain: 0.14 })
        tone({ freq: 450, at: 0.1, glideTo: 150, dur: 0.4, gain: 0.08 })
        break
      case 'screen-start':
        tone({ freq: 880, glideTo: 1760, dur: 0.14, gain: 0.12, type: 'sawtooth' })
        shimmer(1760, 0.06, 0.3, 0.03)
        break
      case 'screen-stop':
        tone({ freq: 1760, glideTo: 660, dur: 0.18, gain: 0.11, type: 'sawtooth' })
        break
      case 'participant-add':
        tone({ freq: 783.99, dur: 0.11, gain: 0.13, type: 'triangle' })
        tone({ freq: 1174.66, at: 0.09, dur: 0.16, gain: 0.13, type: 'triangle' })
        break
      case 'friend-request':
        tone({ freq: 1046.5, dur: 0.14, gain: 0.12, type: 'triangle' })
        tone({ freq: 783.99, at: 0.12, dur: 0.14, gain: 0.12, type: 'triangle' })
        tone({ freq: 523.25, at: 0.24, dur: 0.3, gain: 0.11, type: 'triangle' })
        shimmer(2093, 0.1, 0.5, 0.03)
        break
      case 'call-invite':
        tone({ freq: 523.25, dur: 0.14, gain: 0.13 })
        tone({ freq: 659.25, at: 0.11, dur: 0.14, gain: 0.13 })
        tone({ freq: 783.99, at: 0.22, dur: 0.3, gain: 0.13 })
        shimmer(1568, 0.16, 0.5, 0.04)
        break
      case 'astro':
        tone({ freq: 220, glideTo: 1320, dur: 0.5, gain: 0.13 })
        shimmer(2640, 0.1, 0.6, 0.05)
        shimmer(1760, 0.3, 0.5, 0.03)
        break
      case 'mute':
        tone({ freq: 660, glideTo: 330, dur: 0.16, gain: 0.13, type: 'triangle' })
        break
      case 'unmute':
        tone({ freq: 330, glideTo: 660, dur: 0.16, gain: 0.13, type: 'triangle' })
        break
      case 'chime':
        tone({ freq: 880, dur: 0.22, gain: 0.07, type: 'sine' })
        tone({ freq: 1174.66, at: 0.12, dur: 0.3, gain: 0.06, type: 'sine' })
        break
    }
  } catch {
    // audio indisponivel: silencio
  } finally {
    playbackGain = previousGain
  }
}

export function playSoundboardEffect(name: SoundName) {
  playSound(name, soundboardVolumeFraction())
}

const TYPE_SOUND: Record<string, SoundName> = {
  'dm': 'dm',
  'server-message': 'server',
  'server-event': 'notification',
  'call-join': 'call-join',
  'call-leave': 'call-leave',
  'screen-start': 'screen-start',
  'screen-stop': 'screen-stop',
  'call-invite': 'call-invite',
  'call-invite-response': 'participant-add',
  'call-waiting': 'call-invite',
  'participant-add': 'participant-add',
  'friend-request': 'friend-request',
  'folder-share': 'server',
  'friend-accept': 'participant-add',
  'pending-user': 'friend-request',
  'server-invite': 'call-invite',
  'system': 'notification',
  'text': 'notification',
  'online': 'notification',
  'status': 'notification',
  'astro': 'astro',
  'astro-gift': 'astro',
  'feed-comment': 'chime',
  'update-news': 'chime',
}

export function playSoundForType(type: string) {
  const sound = TYPE_SOUND[type]
  if (sound) playSound(sound)
}
