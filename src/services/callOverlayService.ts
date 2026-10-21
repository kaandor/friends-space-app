import { useCallStore } from '../stores/callStore'
import { useServerStore } from '../stores/serverStore'
import { useUserStore } from '../stores/userStore'
import { activityKindForApp } from './activityService'

// Call board in-game (estilo Discord) — exclusivo Electron.
// Mostra todos os membros da call numa janela transparente sobre outros apps.
// O usuario escolhe em Configuracoes > Voz e audio:
//   'games' = somente em jogos (padrao)
//   'all'   = em todos os apps e janelas (menos o proprio Friends Space)
//   'off'   = desativado

export type CallOverlayMode = 'off' | 'games' | 'all'

export interface CallBoardMember {
  userId: string
  userName: string
  photoUrl: string
  speaking: boolean
  muted: boolean
  deafened: boolean
  isSelf: boolean
}

interface OverlayPayload {
  visible: boolean
  members: CallBoardMember[]
  title: string
  subtitle: string
  sessionId: string
}

interface ElectronApi {
  isElectron?: boolean
  setOverlay?: (data: OverlayPayload) => void
  getActiveApp?: () => Promise<{ name: string; title?: string } | null>
  onOverlayRefresh?: (cb: () => void) => () => void
}

const FRIENDS_SPACE_SENTINEL = '__friends_space__'
const ACTIVE_APP_POLL_MS = 3000

let running = false
let prevSignature = ''
let appAllowed = false
let appName = ''
let appTitle = ''

function getApi(): ElectronApi | null {
  const api = (window as unknown as { electronAPI?: ElectronApi }).electronAPI
  return api?.isElectron && typeof api.setOverlay === 'function' ? api : null
}

function overlayMode(): CallOverlayMode {
  const user = useUserStore.getState().currentUser
  const raw = user && user.settings ? user.settings.callOverlayMode : undefined
  if (raw === 'all' || raw === 'off') return raw
  return 'games'
}

function isAllowed(mode: CallOverlayMode, app: { name: string; title?: string } | null): boolean {
  if (mode === 'off') return false
  if (!app || !app.name) return false
  if (app.name === FRIENDS_SPACE_SENTINEL) return false
  if (mode === 'all') return true
  return activityKindForApp(app.name) === 'game'
}

function boardMembers(): CallBoardMember[] {
  const state = useCallStore.getState()
  const me = useUserStore.getState().currentUser
  const members: CallBoardMember[] = []
  const seen = new Set<string>()
  if (me) {
    members.push({
      userId: me.id,
      userName: me.name || 'Você',
      photoUrl: me.photoUrl || '',
      speaking: Boolean(state.speakingUsers[me.id]),
      muted: state.muted,
      deafened: state.deafened,
      isSelf: true,
    })
    seen.add(me.id)
  }
  for (const participant of state.participants) {
    if (!participant.userId || seen.has(participant.userId)) continue
    seen.add(participant.userId)
    members.push({
      userId: participant.userId,
      userName: participant.userName || 'Amigo',
      photoUrl: participant.userPhoto || '',
      speaking: Boolean(state.speakingUsers[participant.userId]),
      muted: Boolean(participant.muted),
      deafened: Boolean(participant.deafened),
      isSelf: Boolean(me && participant.userId === me.id),
    })
  }
  return members
}

function channelTitle(): string {
  const state = useCallStore.getState()
  if (!state.channelId || state.channelId === 'dm' || !state.serverId || state.serverId === 'dm') return 'Chamada privada'
  const server = useServerStore.getState().servers.find(s => s.id === state.serverId)
  const channel = server?.channels?.find(c => c.id === state.channelId)
  return channel?.name || state.channelId
}

function pushState(force = false) {
  const api = getApi()
  if (!api) return
  const state = useCallStore.getState()
  const mode = overlayMode()
  const show = Boolean(state.activeCall) && appAllowed && isAllowed(mode, { name: appName, title: appTitle })
  const members = show ? boardMembers() : []
  const payload: OverlayPayload = {
    visible: show && members.length > 0,
    members,
    title: 'Voz conectada',
    subtitle: show ? `${channelTitle()} · ${members.length} na call` : '',
    sessionId: show ? (state.sessionId || '') : '',
  }
  const signature = JSON.stringify({ mode, appName, appTitle, members })
  if (signature === prevSignature && !force) return
  prevSignature = signature
  api.setOverlay!(payload)
}

async function refreshActiveApp() {
  const api = getApi()
  if (!api || typeof api.getActiveApp !== 'function') return
  const mode = overlayMode()
  if (mode === 'off' || !useCallStore.getState().activeCall) {
    appAllowed = false
    appName = ''
    appTitle = ''
    pushState()
    return
  }
  try {
    const app = await api.getActiveApp!()
    appName = app?.name || ''
    appTitle = app?.title || ''
    appAllowed = isAllowed(mode, app)
  } catch {
    appName = ''
    appTitle = ''
    appAllowed = false
  }
  pushState()
}

function subscribe() {
  const unsubs: (() => void)[] = []
  unsubs.push(useCallStore.subscribe((state, prev) => {
    if (state.activeCall !== prev.activeCall) {
      if (state.activeCall) void refreshActiveApp()
      else {
        appAllowed = false
        appName = ''
        appTitle = ''
        pushState(true)
      }
      return
    }
    if (state.speakingUsers === prev.speakingUsers
      && state.participants === prev.participants
      && state.muted === prev.muted
      && state.deafened === prev.deafened
      && state.channelId === prev.channelId) return
    pushState()
  }))
  unsubs.push(useUserStore.subscribe((state, prev) => {
    if (state.currentUser === prev.currentUser) return
    void refreshActiveApp()
  }))
  const api = getApi()
  if (api && typeof api.onOverlayRefresh === 'function') {
    unsubs.push(api.onOverlayRefresh(() => {
      window.setTimeout(() => { void refreshActiveApp() }, 140)
    }))
  }
  return () => { unsubs.forEach(u => u()) }
}

export function startCallOverlay() {
  if (running) return
  if (!getApi()) return
  running = true
  const cleanup = subscribe()
  void refreshActiveApp()
  const appTimer = window.setInterval(() => { void refreshActiveApp() }, ACTIVE_APP_POLL_MS)
  const callTimer = window.setInterval(() => {
    const active = useCallStore.getState().activeCall
    if (!active) {
      appName = ''
      appTitle = ''
      appAllowed = false
      prevSignature = ''
      getApi()?.setOverlay!({ visible: false, members: [], title: '', subtitle: '', sessionId: '' })
    }
  }, 1000)
  window.addEventListener('beforeunload', () => {
    window.clearInterval(appTimer)
    window.clearInterval(callTimer)
    cleanup()
  })
}
