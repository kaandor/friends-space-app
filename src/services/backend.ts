import type { CallSession, DirectMessage, Friend, Message, Server, User } from '../types'
import { FALLBACK_API_BASE_URL, getApiBaseUrl, setApiBaseUrlOverride } from './config'

type AppData = {
  users: User[]
  servers: Server[]
  messages: Message[]
  friends: Friend[]
  directMessages: DirectMessage[]
  callSessions: CallSession[]
}

const PROFILE_KEY = 'friends-space:profile-id'
let stateCache: { data: AppData, loadedAt: number } | null = null
let stateRequest: Promise<AppData> | null = null
let stateCacheProfileId: string | null = null
const STATE_CACHE_MS = 0

function clearStateCache() {
  stateCache = null
  stateRequest = null
  stateCacheProfileId = null
}

function getProfileId() {
  return localStorage.getItem(PROFILE_KEY) || 'anonymous'
}

const SESSION_KEY = 'friends-space:session'
const SESSION_MAP_KEY = 'friends-space:sessions'
export function getSessionToken(uid?: string): string {
  try {
    if (uid) {
      const m = readTokenMap()
      if (m[uid]) return m[uid]
    }
    return localStorage.getItem(SESSION_KEY) || ''
  } catch { return '' }
}
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('friends-space:device')
    if (!id) {
      const r = new Uint32Array(4)
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(r)
      else for (let i = 0; i < 4; i++) r[i] = Math.floor(Math.random() * 4294967296)
      id = 'dev-' + Date.now().toString(36) + '-' + Array.from(r).map((x) => x.toString(36)).join('').slice(0, 12)
      localStorage.setItem('friends-space:device', id)
    }
    return id
  } catch { return '' }
}
let refreshAttemptAt = 0
function maybeRefreshSession(): void {
  try {
    const tok = getSessionToken()
    if (!tok) return
    const parts = tok.split('.')
    if (parts.length !== 2) return
    const payload = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')))
    const left = Number(payload.exp || 0) - Date.now()
    if (!(left > 0 && left < 7 * 24 * 60 * 60 * 1000)) return
    if (Date.now() - refreshAttemptAt < 3600000) return
    refreshAttemptAt = Date.now()
    void requestBackend('refreshSession', {}).catch(() => {})
  } catch {}
}
function readTokenMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SESSION_MAP_KEY) || '{}') } catch { return {} }
}
export function setSessionToken(token: string, uid?: string): void {
  try {
    if (!token) {
      localStorage.removeItem(SESSION_KEY)
      if (uid) {
        const m = readTokenMap()
        delete m[uid]
        localStorage.setItem(SESSION_MAP_KEY, JSON.stringify(m))
      }
      return
    }
    localStorage.setItem(SESSION_KEY, token)
    if (uid) {
      const m = readTokenMap()
      m[uid] = token
      localStorage.setItem(SESSION_MAP_KEY, JSON.stringify(m))
    }
  } catch { }
}

async function requestBackendWithRetry<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  clearStateCache()
  const retryable = /^(state|directoryState|load|search|get|heartbeat|upsertCallSession|sendCallSignal|sendMessage|sendDirectMessage|sendFriendRequest)/.test(action)
  let lastError: unknown = new Error('Servidor indisponivel')
  for (let attempt = 0; attempt < (retryable ? 3 : 1); attempt += 1) {
    const controller = new AbortController()
    // 25s de folga (antes 12s): em rede movel ou cold start do Vercel, um
    // request de signaling pode demorar. Timeout curto derrubava o offer antes
    // de chegar (sintoma: zero signals no backend + loop de close/recriar).
    const timeout = window.setTimeout(() => controller.abort(), 25000)
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/app`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, profileId: getProfileId(), cv: (typeof __BUILD_ID__ !== 'undefined' ? String(__BUILD_ID__) : ''), sessionToken: getSessionToken((payload as unknown as { userId?: string; fromUserId?: string })?.userId || (payload as unknown as { userId?: string; fromUserId?: string })?.fromUserId), deviceId: getDeviceId(), ...payload }),
        signal: controller.signal,
      })
      const raw = await response.text()
      let body: { ok?: boolean; error?: string; result?: unknown } = {}
      try {
        body = raw ? JSON.parse(raw) : {}
      } catch {
        body = {}
      }
      if (!response.ok || !body.ok) {
        const err = new Error(body.error || `Servidor respondeu ${response.status}`)
        if (response.status === 401 || /Sessão expirada/.test(err.message)) {
          try {
            const last = Number((window as unknown as { __fsSessEv?: number }).__fsSessEv || 0)
            if (Date.now() - last > 60000) {
              (window as unknown as { __fsSessEv?: number }).__fsSessEv = Date.now()
              window.dispatchEvent(new CustomEvent('friends-space:auth-fail', { detail: (typeof err !== 'undefined' && err instanceof Error) ? err.message : '' })); window.dispatchEvent(new CustomEvent('friends-space:session-expired'))
            }
          } catch { }
        }
        throw err
      }
      void maybeRefreshSession()
      const __res = body.result as Record<string, unknown> | null
      if (__res && typeof __res === 'object' && typeof (__res as { sessionToken?: unknown }).sessionToken === 'string' && (__res as { sessionToken: string }).sessionToken) {
        const __tok = (__res as { sessionToken: string }).sessionToken
        const __uid = (__res as unknown as { user?: { id?: string } }).user?.id
        setSessionToken(__tok, __uid)
      }
      return body.result as T
    } catch (error) {
      const __m = error instanceof Error ? error.message : ''
      // Pages Function indisponivel (quota/5xx/402): desvia para o Worker dev
      // na proxima tentativa (mesma chamada, sem perder o request).
      if (/^40[245]/.test(__m) || /Servidor respondeu 40[245]/.test(__m)
        || /Failed to fetch/.test(__m) || /indisponível/.test(__m)) {
        let base = ''
        try { base = getApiBaseUrl() } catch { }
        if (base && window.location?.origin && base === window.location.origin.replace(/\/+$/, '')) {
          setApiBaseUrlOverride(FALLBACK_API_BASE_URL)
        }
      }
      if (/Sessão expirada|\(403\)/.test(__m)) throw error; lastError = error
      if (attempt < (retryable ? 3 : 1) - 1) await new Promise(resolve => window.setTimeout(resolve, 350 * (attempt + 1)))
    } finally {
      window.clearTimeout(timeout)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Servidor indisponivel')
}

export async function requestBackend<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  return requestBackendWithRetry<T>(action, payload)
}

export async function pingBackend(): Promise<boolean> {
  try {
    const url = `${getApiBaseUrl()}/api/app?profileId=anonymous&_ts=${Date.now()}`
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
    })
    void response.status
    return true
  } catch {
    return false
  }
}

export async function searchDirectory(query: string, userId?: string) {
  return requestBackend<{ users: User[], servers: Server[] }>('searchDirectory', { query, userId })
}

export async function loadBackendState(): Promise<AppData> {
  const profileId = getProfileId()
  if (stateCache && stateCacheProfileId === profileId && Date.now() - stateCache.loadedAt < STATE_CACHE_MS) {
    return stateCache.data
  }
  if (stateRequest) return stateRequest

  stateRequest = fetch(`${getApiBaseUrl()}/api/app?profileId=${encodeURIComponent(profileId)}&sessionToken=${encodeURIComponent(getSessionToken())}&_ts=${Date.now()}`, {
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Servidor indisponível')
      const data = await response.json() as AppData
      stateCache = { data, loadedAt: Date.now() }
      stateCacheProfileId = profileId
      return data
    })
    .finally(() => {
      stateRequest = null
    })

  return stateRequest
}
