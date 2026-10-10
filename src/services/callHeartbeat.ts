import { getApiBaseUrl } from './config'

export type HeartbeatStatus = 'connecting' | 'connected' | 'disconnected'

const BLINK_MS = 100

export function createCallHeartbeat(onChange: (s: HeartbeatStatus) => void) {
  let destroyed = false
  let status: HeartbeatStatus = 'connecting'
  let blink: ReturnType<typeof setInterval> | null = null
  let ping: ReturnType<typeof setInterval> | null = null

  const emit = (s: HeartbeatStatus) => {
    if (status === s) return
    status = s
    onChange(s)
  }

  // "Pulso" visual a cada 0,1s: alterna um tick local para o indicador tremer.
  // Isso mantém a UI "viva" e sinaliza que a call está ativa, sem spam de rede.
  let tick = 0
  blink = window.setInterval(() => {
    tick = (tick + 1) % 2
    const btn = document.getElementById('call-heartbeat-dot') as HTMLElement | null
    if (btn) btn.dataset.pulse = String(tick)
  }, BLINK_MS)

  const doPing = async () => {
    try {
      const url = `${getApiBaseUrl()}/api/app?health=1&profileId=anonymous&_ts=${Date.now()}`
      const response = await fetch(url, { cache: 'no-store' })
      emit(response.ok ? 'connected' : 'disconnected')
    } catch {
      emit('disconnected')
    }
  }

  ping = window.setInterval(() => { void doPing() }, 30000)
  void doPing()

  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      if (blink !== null) window.clearInterval(blink)
      if (ping !== null) window.clearInterval(ping)
    },
  }
}