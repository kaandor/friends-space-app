import { useEffect } from 'react'
import { useCallStore } from '../../stores/callStore'
import { applyRemoteGain, applySinkId } from '../../services/antiloud'
import { unlockAudio } from '../../services/audioUnlock'

const clampVolume = (v?: number) => (typeof v === 'number' && !Number.isNaN(v) ? Math.min(1, Math.max(0, v)) : 1)

const setSrc = (id: string, stream: MediaStream | null) => {
  const el = document.getElementById(id) as HTMLAudioElement | null
  if (el && el.srcObject !== stream) el.srcObject = stream
}

// Camada de audio persistente: renderiza os elementos <audio> das chamadas no
// nivel do App (nao dentro da view de call). Assim, ao navegar para qualquer
// outra parte do site durante uma call, o audio das pessoas continua tocando
// (e o micro continua captando) — antes a view desmontava e o som sumia.
export function CallAudioLayer() {
  const activeCall = useCallStore(s => s.activeCall)
  const remoteStreams = useCallStore(s => s.remoteStreams)
  const remoteScreenStreams = useCallStore(s => s.remoteScreenStreams)
  const screenStream = useCallStore(s => s.screenStream)
  const volumes = useCallStore(s => s.volumes)
  const deafened = useCallStore(s => s.deafened)

  const remoteUserIds = Object.keys(remoteStreams)
  const remoteScreenIds = Object.keys(remoteScreenStreams)

  // Reproduz todo o audio remoto e tenta de novo periodicamente (autoplay).
  useEffect(() => {
    if (!activeCall) return
    const playAll = () => {
      unlockAudio()
      for (const userId of Object.keys(useCallStore.getState().remoteStreams)) {
        const el = document.getElementById(`call-audio-${userId}`) as HTMLAudioElement | null
        if (el && el.paused) void el.play().catch(() => { })
      }
      for (const userId of Object.keys(useCallStore.getState().remoteScreenStreams)) {
        const el = document.getElementById(`call-screen-audio-${userId}`) as HTMLAudioElement | null
        if (el && el.paused) void el.play().catch(() => { })
      }

    }
    playAll()
    const timer = window.setInterval(playAll, 1500)
    return () => window.clearInterval(timer)
  }, [activeCall])

  // Liga as streams aos elementos de audio.
  useEffect(() => {
    for (const [userId, stream] of Object.entries(remoteStreams)) {
      setSrc(`call-audio-${userId}`, stream)
    }
    for (const [userId, stream] of Object.entries(remoteScreenStreams)) {
      setSrc(`call-screen-audio-${userId}`, stream)
    }
    setSrc('call-screen-audio-local', screenStream)
  }, [remoteStreams, remoteScreenStreams, screenStream])

  // Aplica volume/ganho por usuario, surdez e o dispositivo de saida.
  useEffect(() => {
    const output = localStorage.getItem('friends-space:output')
    for (const userId of Object.keys(remoteStreams)) {
      const el = document.getElementById(`call-audio-${userId}`) as HTMLAudioElement | null
      if (el) {
        applyRemoteGain(el, deafened ? 0 : clampVolume(volumes[userId]))
        if (el) applySinkId(el, output)
      }
    }
    for (const userId of Object.keys(remoteScreenStreams)) {
      const el = document.getElementById(`call-screen-audio-${userId}`) as HTMLAudioElement | null
      if (el) {
        el.volume = deafened ? 0 : clampVolume(volumes[`screen:${userId}`])
        applySinkId(el, output)
      }
    }
    const local = document.getElementById('call-screen-audio-local') as HTMLAudioElement | null
    if (local) {
      local.volume = 0
      applySinkId(local, output)
    }
  }, [volumes, remoteStreams, remoteScreenStreams, deafened, screenStream])

  // Reaplica o dispositivo de saida quando o usuario trocar de fone na call.
  useEffect(() => {
    const apply = () => {
      const output = localStorage.getItem('friends-space:output')
      for (const userId of Object.keys(useCallStore.getState().remoteStreams)) {
        const el = document.getElementById(`call-audio-${userId}`) as HTMLAudioElement | null
        if (el) applySinkId(el, output)
      }
      for (const userId of Object.keys(useCallStore.getState().remoteScreenStreams)) {
        const el = document.getElementById(`call-screen-audio-${userId}`) as HTMLAudioElement | null
        if (el) applySinkId(el, output)
      }
      const local = document.getElementById('call-screen-audio-local') as HTMLAudioElement | null
      if (local) applySinkId(local, output)
    }
    window.addEventListener('friends-space:output-changed', apply)
    return () => window.removeEventListener('friends-space:output-changed', apply)
  }, [])

  if (!activeCall) return null

  return (
    <>
      {remoteUserIds.map(userId => (
        <audio key={`call-audio-${userId}`} id={`call-audio-${userId}`} autoPlay playsInline style={{ position: 'absolute', width: 1, height: 1, left: -9999, opacity: 0.01 }} />
      ))}
      {remoteScreenIds.map(userId => (
        <audio key={`call-screen-audio-${userId}`} id={`call-screen-audio-${userId}`} autoPlay playsInline style={{ position: 'absolute', width: 1, height: 1, left: -9999, opacity: 0.01 }} />
      ))}
      {screenStream && (
        <audio id="call-screen-audio-local" autoPlay playsInline style={{ position: 'absolute', width: 1, height: 1, left: -9999, opacity: 0.01 }} />
      )}
    </>
  )
}
