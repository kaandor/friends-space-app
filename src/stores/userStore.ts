import { create } from 'zustand'
import type { User } from '../types'
import { getDb } from '../db'
import { loadBackendState, requestBackend, setSessionToken, getSessionToken } from '../services/backend'
import { onBackgroundTick } from '../services/backgroundTicker'
import type { GoogleProfile } from '../services/googleAuth'

const CURRENT_USER_KEY = 'friends-space:current-user-id'
const CURRENT_PROFILE_KEY = 'friends-space:profile-id'
const CURRENT_USER_DATA_KEY = 'friends-space:current-user'
let authEpoch = 0
let lastKnownUser: User | null = null

const ONLINE_THRESHOLD_MS = 45000
const HEARTBEAT_INTERVAL_MS = 15000
let heartbeatStarted = false
let heartbeatOff: (() => void) | null = null
let presenceTimer: number | null = null
let lastBeatAt = 0

export function isUserOnline(user: { lastSeenAt?: number } | null | undefined): boolean {
  if (!user || !user.lastSeenAt) return false
  return Date.now() - user.lastSeenAt < ONLINE_THRESHOLD_MS
}

async function sendHeartbeat() {
  const currentUser = useUserStore.getState().currentUser
  if (!currentUser) return
  const nowMs = Date.now()
  if (nowMs - lastBeatAt < HEARTBEAT_INTERVAL_MS) return
  lastBeatAt = nowMs
  try {
    const result = await requestBackend<{ lastSeenAt: number }>('heartbeat', { userId: currentUser.id })
    const prev = useUserStore.getState().currentUser
    if (prev && prev.id === currentUser.id) {
      const updated = { ...prev, lastSeenAt: result.lastSeenAt }
      useUserStore.setState({
        currentUser: updated,
        users: useUserStore.getState().users.map(u => u.id === updated.id ? { ...u, lastSeenAt: result.lastSeenAt } : u),
      })
    }
  } catch { }
}

function startPresencePoll() {
  if (presenceTimer !== null) return
  presenceTimer = window.setInterval(() => {
    if (document.hidden) return
    void useUserStore.getState().loadUsers()
  }, 10000)
}

function markOfflineBeacon() {
  try {
    const u = useUserStore.getState().currentUser
    if (!u) return
    const payload = JSON.stringify({ action: 'markOffline', userId: u.id })
    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([payload], { type: 'application/json' })
        navigator.sendBeacon('/api/app', blob)
        return
      } catch { }
    }
    fetch('/api/app', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => { })
  } catch { }
}

function startHeartbeat() {
  if (heartbeatStarted) return
  heartbeatStarted = true
  lastBeatAt = 0
  void sendHeartbeat()
  void useUserStore.getState().loadUsers().catch(() => { })
  heartbeatOff = onBackgroundTick(() => { void sendHeartbeat() })
  window.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', markOfflineBeacon)
  window.addEventListener('beforeunload', markOfflineBeacon)
  startPresencePoll()
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    lastBeatAt = 0
    void sendHeartbeat()
    void useUserStore.getState().loadUsers().catch(() => { })
  }
}

function stopHeartbeat() {
  window.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pagehide', markOfflineBeacon)
  window.removeEventListener('beforeunload', markOfflineBeacon)
  if (heartbeatOff) heartbeatOff()
  heartbeatOff = null
  if (presenceTimer !== null) {
    window.clearInterval(presenceTimer)
    presenceTimer = null
  }
  heartbeatStarted = false
}

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_DATA_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

function saveStoredUser(user: User | null) {
  if (!user) {
    localStorage.removeItem(CURRENT_USER_DATA_KEY)
    return
  }
  localStorage.setItem(CURRENT_USER_DATA_KEY, JSON.stringify(user))
}

let initialStoredUser = typeof window !== 'undefined' ? loadStoredUser() : null
lastKnownUser = initialStoredUser

export function getStickyUser() {
  return lastKnownUser || initialStoredUser
}

interface UserState {
  currentUser: User | null
  users: User[]
  loadCurrentUser: () => Promise<void>
  signInWithGoogle: (profile: GoogleProfile, idToken?: string, accessToken?: string) => Promise<User>
  signInWithName: (name: string) => Promise<User>
  signOut: () => Promise<void>
  handleSessionExpired: () => void
  trySilentReauth: () => Promise<boolean>
  updateUser: (data: Partial<User>) => Promise<void>
  getUserById: (id: string) => Promise<User | undefined>
  loadUsers: () => Promise<void>
  activateAstro: (months?: number, tier?: 'astro' | 'astro_plus' | 'astro_ultimate', method?: string) => Promise<void>
  renewAstro: (months?: number) => Promise<boolean>
  refundAstro: () => Promise<string | null>
  setAstroPayMethod: (method: string) => Promise<void>
  cancelAstro: () => Promise<void>
  markAstroPaymentPending: () => Promise<void>
}

let sessionDead = false
export const useUserStore = create<UserState>((set, get) => ({
  currentUser: initialStoredUser,
  users: initialStoredUser ? [initialStoredUser] : [],
  loadCurrentUser: async () => {
    const signedOut = localStorage.getItem('friends-space:signed-out') === '1'
    const requestEpoch = authEpoch
    const profileId = localStorage.getItem(CURRENT_PROFILE_KEY)
    const storedUser = loadStoredUser()
    const stickyUser = storedUser || lastKnownUser || get().currentUser
    if (sessionDead && !getSessionToken()) {
      // Sessão morreu (401): não ressuscita o sticky — senão outro refresh
      // reloga sozinho, toma 401 de novo e o toast repete "toda hora".
      set({ currentUser: null })
      stopHeartbeat()
      return
    }
    if (signedOut && !profileId) {
      // Auto-cura: flag stale de um logout indevido antigo NÃO pode expulsar
      // quem tem sessão salva. Logout real limpa o sticky junto.
      const stickyHere = storedUser || lastKnownUser || get().currentUser
      if (stickyHere) {
        try { localStorage.removeItem('friends-space:signed-out') } catch { }
      } else {
        set({ currentUser: null, users: [] })
        stopHeartbeat()
        return
      }
    }
    if (!profileId) {
      if (requestEpoch !== authEpoch) return
      if (stickyUser) {
        localStorage.setItem(CURRENT_PROFILE_KEY, stickyUser.googleId || stickyUser.id)
        localStorage.setItem(CURRENT_USER_KEY, stickyUser.id)
        lastKnownUser = stickyUser
        set({ currentUser: stickyUser, users: [stickyUser] })
        startHeartbeat()
        return
      }
      if (requestEpoch !== authEpoch) return
      set({ currentUser: null, users: [] })
      stopHeartbeat()
      return
    }
    const existingCurrentUser = get().currentUser
    const existingUsers = get().users
    const currentUserId = localStorage.getItem(CURRENT_USER_KEY)
    let users: User[] = []
    let fromBackend = true
    try {
      const state = await loadBackendState()
      users = state.users
    } catch (e) {
      if (e instanceof Error && /Sessão expirada/.test(e.message)) {
        try {
          localStorage.removeItem('friends-space:session')
          localStorage.removeItem(CURRENT_USER_DATA_KEY)
          saveStoredUser(null)
        } catch {}
        lastKnownUser = null
        if (requestEpoch !== authEpoch) return
        set({ currentUser: null, users: [] })
        stopHeartbeat()
        return
      }
      fromBackend = false
      users = await getDb(profileId).users.toArray()
    }
    if (requestEpoch !== authEpoch) return
    if (fromBackend && currentUserId && !profileId.startsWith('guest') && !users.some(user => user.id === currentUserId)) {
      // NUNCA desloga aqui: o backend pode responder sem o usuario (cold start
      // parcial, lag de replicacao, merge de perfis). Deslogar expulsava a
      // pessoa sozinha no meio da call (e ela virava fantasma pros outros).
      // Mantem a sessao local (sticky) — o proximo refresh reconcilia.
      console.warn('[auth] backend sem o usuario atual; mantendo sessao local')
    }
    const currentUser = users.find(user => user.id === currentUserId)
      || (existingCurrentUser?.id === currentUserId ? existingCurrentUser : null)
      || (storedUser?.id === currentUserId ? storedUser : null)
      || (lastKnownUser?.id === currentUserId ? lastKnownUser : null)
      || storedUser
      || existingCurrentUser
      || lastKnownUser
      || null

    const nextUsers = users.length > 0 ? users : (storedUser ? [storedUser] : (lastKnownUser ? [lastKnownUser] : existingUsers))
    if (currentUser) {
      localStorage.setItem(CURRENT_PROFILE_KEY, profileId)
      localStorage.setItem(CURRENT_USER_KEY, currentUser.id)
      saveStoredUser(currentUser)
      lastKnownUser = currentUser
    }
    if (requestEpoch !== authEpoch) return
    set({ currentUser, users: nextUsers })
    if (currentUser) startHeartbeat()
    else stopHeartbeat()
  },
  signInWithGoogle: async (profile, idToken?: string, accessToken?: string) => {
    authEpoch += 1
    const requestEpoch = authEpoch
    const result = await requestBackend<{ user: User, users: User[] }>('signInWithGoogle', {
      profileId: profile.googleId,
      profile,
      idToken,
      accessToken,
    })
    if (requestEpoch !== authEpoch) return result.user
    localStorage.removeItem('friends-space:signed-out')
    localStorage.setItem(CURRENT_PROFILE_KEY, result.user.googleId || result.user.id)
    localStorage.setItem(CURRENT_USER_KEY, result.user.id)
    saveStoredUser(result.user)
    lastKnownUser = result.user
    initialStoredUser = result.user
    await getDb(result.user.googleId || result.user.id).users.bulkPut(result.users)
    set({ currentUser: result.user, users: result.users })
    sessionDead = false
    startHeartbeat()
    return result.user
  },
  signInWithName: async (name: string) => {
    authEpoch += 1
    const requestEpoch = authEpoch
    const result = await requestBackend<{ user: User, users: User[] }>('signInWithName', { name })
    if (requestEpoch !== authEpoch) return result.user
    localStorage.removeItem('friends-space:signed-out')
    localStorage.setItem(CURRENT_PROFILE_KEY, result.user.id)
    localStorage.setItem(CURRENT_USER_KEY, result.user.id)
    saveStoredUser(result.user)
    lastKnownUser = result.user
    initialStoredUser = result.user
    await getDb(result.user.id).users.bulkPut(result.users)
    set({ currentUser: result.user, users: result.users })
    sessionDead = false
    startHeartbeat()
    return result.user
  },

  signOut: async () => {
    authEpoch += 1
    localStorage.removeItem(CURRENT_USER_KEY)
    localStorage.removeItem(CURRENT_PROFILE_KEY)
    localStorage.removeItem(CURRENT_USER_DATA_KEY)
    setSessionToken('', get().currentUser?.id || undefined)
    localStorage.setItem('friends-space:signed-out', '1')
    saveStoredUser(null)
    lastKnownUser = null
    initialStoredUser = null
    stopHeartbeat()
    set({ currentUser: null, users: [] })
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }
  },
handleSessionExpired: () => {
    authEpoch += 1
    sessionDead = true
    setSessionToken('', get().currentUser?.id || undefined)
    stopHeartbeat()
    set({ currentUser: null })
  },
  trySilentReauth: async () => {
    const u = get().currentUser
    if (!u) return false
    if (getSessionToken()) return true
    try {
      if (u.authProvider === 'google') return false
      if (u.id.startsWith('guest-') || u.authProvider === 'guest') return false
      else if (u.name) { await get().signInWithName(u.name) }
      else return false
      return Boolean(getSessionToken())
    } catch { return false }
  },
  updateUser: async (data: Partial<User>) => {
    const requestEpoch = authEpoch
    const user = get().currentUser
    if (!user) return
    let updated = { ...user, ...data }
    try {
      const result = await requestBackend<{ user: User, users: User[] }>('updateUser', { id: user.id, data })
      if (requestEpoch !== authEpoch) return
      updated = result.user
      set({ currentUser: updated, users: result.users })
      saveStoredUser(updated)
      lastKnownUser = updated
      await getDb(localStorage.getItem(CURRENT_PROFILE_KEY) || updated.googleId || updated.id).users.bulkPut(result.users)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('não encontrado') || message.includes('nao encontrado')) {

        // NUNCA desloga aqui (mesmo motivo acima): mantem local + avisa.
        try {
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Perfil ainda sincronizando. Tente de novo.' }))
        } catch { }
      } else {
        try {
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Falha ao sincronizar perfil. Salvo localmente.' }))
        } catch { }
      }
      await getDb(localStorage.getItem(CURRENT_PROFILE_KEY) || updated.googleId || updated.id).users.put(updated)
    }
    set({
      currentUser: updated,
      users: get().users.map(u => u.id === updated.id ? updated : u),
    })
    lastKnownUser = updated
  },
  getUserById: async (id: string) => {
    try {
      return await requestBackend<User | undefined>('getUser', { id })
    } catch {
      return getDb(localStorage.getItem(CURRENT_PROFILE_KEY) || 'anonymous').users.get(id)
    }
  },
  loadUsers: async () => {
    const requestEpoch = authEpoch
    try {
      const result = await requestBackend<{ users: User[] }>('directoryState', {},)
      if (requestEpoch !== authEpoch) return
      const prev = get().users
      const changed = prev.length !== result.users.length
        || prev.some((user, index) => {
          const next = result.users[index]
          return !next || next.id !== user.id || next.lastSeenAt !== user.lastSeenAt
        })
      if (!changed) return
      set({ users: result.users })
    } catch {
      if (requestEpoch !== authEpoch) return
      const prevUsers = get().users
      if (prevUsers.length > 0) return
      set({ users: [] })
    }
  },
  activateAstro: async (months = 1, tier: 'astro' | 'astro_plus' | 'astro_ultimate' = 'astro', method = '') => {
    const me = get().currentUser
    if (!me) return
    try {
      const result = await requestBackend<{ user: User, users: User[] }>('activateAstro', { userId: me.id, months, tier, method })
      const { playSound } = await import('../services/sounds')
      playSound('astro')
      set({ currentUser: result.user, users: result.users })
      saveStoredUser(result.user)
      lastKnownUser = result.user
    } catch {
      return
    }
  },
  renewAstro: async (months = 1) => {
    const me = get().currentUser
    if (!me) return false
    try {
      const result = await requestBackend<{ user: User, users: User[] }>('renewAstro', { userId: me.id, months, method: String((me.settings as Record<string, unknown> | undefined)?.astroPayMethod || '') })
      set({ currentUser: result.user, users: result.users })
      saveStoredUser(result.user)
      lastKnownUser = result.user
      return true
    } catch {
      return false
    }
  },
  refundAstro: async () => {
    const me = get().currentUser
    if (!me) return null
    try {
      const result = await requestBackend<{ user: User, users: User[], ticket: string }>('refundAstro', { userId: me.id })
      set({ currentUser: result.user, users: result.users })
      saveStoredUser(result.user)
      lastKnownUser = result.user
      return result.ticket || null
    } catch {
      return null
    }
  },
  setAstroPayMethod: async (method: string) => {
    const me = get().currentUser
    if (!me) return
    try {
      const result = await requestBackend<{ user: User, users: User[] }>('setAstroPayMethod', { userId: me.id, method })
      set({ currentUser: result.user, users: result.users })
      saveStoredUser(result.user)
      lastKnownUser = result.user
    } catch {
      return
    }
  },
  cancelAstro: async () => {
    const me = get().currentUser
    if (!me) return
    try {
      const result = await requestBackend<{ user: User, users: User[] }>('cancelAstro', { userId: me.id })
      set({ currentUser: result.user, users: result.users })
      saveStoredUser(result.user)
      lastKnownUser = result.user
    } catch {
      return
    }
  },
  markAstroPaymentPending: async () => {
    const me = get().currentUser
    if (!me) return
    try {
      const result = await requestBackend<{ user: User, users: User[] }>('markAstroPaymentPending', { userId: me.id })
      if (result?.user) {
        set({ currentUser: result.user, users: result.users })
        saveStoredUser(result.user)
        lastKnownUser = result.user
      }
    } catch {
      // flag continua podendo ser setada no fluxo de pagamento; nao quebra o checkout
      return
    }
  },
}))
