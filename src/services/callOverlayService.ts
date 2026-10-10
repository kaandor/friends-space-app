import { useCallStore } from '../stores/callStore'

// Overlay in-game (estilo Discord) — exclusivo Electron.
// Observa a call e envia via IPC os avatares de quem esta falando para a janela
// overlay transparente. Quando ninguem fala, o main esconde a janela ~2,5s depois.

interface ElectronApi {
  isElectron?: boolean
  setOverlay?: (users: { photoUrl: string; userName: string }[]) => void
}

let running = false
let prevSignature = ''

function getApi(): ElectronApi | null {
  const api = (window as unknown as { electronAPI?: ElectronApi }).electronAPI
  return api?.isElectron && typeof api.setOverlay === 'function' ? api : null
}

function pushState() {
  const api = getApi()
  if (!api) return
  const state = useCallStore.getState()
  if (!state.activeCall) return
  const speaking: { photoUrl: string; userName: string }[] = []
  for (const [userId, isSpeaking] of Object.entries(state.speakingUsers)) {
    if (!isSpeaking) continue
    const participant = state.participants.find(p => p.userId === userId)
    if (!participant) continue
    if (!participant.userPhoto) continue
    speaking.push({ photoUrl: participant.userPhoto, userName: participant.userName })
  }
  const signature = speaking.map(s => s.photoUrl).join('|')
  if (signature === prevSignature) return
  prevSignature = signature
  if (speaking.length === 0) {
    api.setOverlay!([])
    return
  }
  api.setOverlay!(speaking)
}

function subscribe() {
  const unsubs: (() => void)[] = []
  const callStore = useCallStore.subscribe((state, prev) => {
    if (state.speakingUsers === prev.speakingUsers && state.participants === prev.participants && state.activeCall === prev.activeCall) return
    pushState()
  })
  unsubs.push(callStore)
  const me = useCallStore.getState()
  if (!me.activeCall) prevSignature = ''
  pushState()
  return () => { unsubs.forEach(u => u()) }
}

export function startCallOverlay() {
  if (running) return
  if (!getApi()) return
  running = true
  const cleanup = subscribe()
  let lastActive = useCallStore.getState().activeCall
  const checkTimer = window.setInterval(() => {
    const active = useCallStore.getState().activeCall
    if (active !== lastActive) {
      lastActive = active
      if (!active) {
        prevSignature = ''
        getApi()?.setOverlay!([])
      }
    }
  }, 1000)
  window.addEventListener('beforeunload', () => {
    window.clearInterval(checkTimer)
    cleanup()
  })
}

export function notifyOverlaySilence() {
  // Forca o overlay a sumir imediatamente (sem esperar o timeout do main).
  const api = getApi()
  if (api) api.setOverlay!([])
  prevSignature = ''
}
