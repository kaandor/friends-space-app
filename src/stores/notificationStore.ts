import { create } from 'zustand'
import type { AppNotification } from '../types'
import { requestBackend } from '../services/backend'
import { playSoundForType } from '../services/sounds'
import { useUserStore } from './userStore'

const POLL_INTERVAL_MS = 15000

interface ToastItem extends AppNotification {
  toastId: string
}

interface NotificationState {
  notifications: AppNotification[]
  toasts: ToastItem[]
  unread: number
  loadNotifications: () => Promise<void>
  markAllRead: () => Promise<void>
  dismissToast: (toastId: string) => void
  startPolling: () => void
  stopPolling: () => void
}

let pollingTimer: number | null = null
let lastSeenIds = new Set<string>()
let initialLoadDone = false
// Dedupe por conteúdo: mesmo (type|title|body|from) em <30s não gera novo toast.
// Corrige backend que recria notificação com id novo mas conteúdo igual.
const recentToastKeys = new Map<string, number>()
const TOAST_DEDUPE_MS = 30000
let lastSoundAt = 0
const SOUND_THROTTLE_MS = 3000

function toastKey(n: AppNotification): string {
  return `${n.type}|${n.title || ''}|${n.body || ''}|${n.fromUserId || ''}`
}

function isDuplicateToast(n: AppNotification): boolean {
  const key = toastKey(n)
  const now = Date.now()
  const last = recentToastKeys.get(key) || 0
  if (now - last < TOAST_DEDUPE_MS) return true
  recentToastKeys.set(key, now)
  // Limpa chaves antigas para não crescer infinito
  if (recentToastKeys.size > 100) {
    for (const [k, t] of recentToastKeys) {
      if (now - t > TOAST_DEDUPE_MS) recentToastKeys.delete(k)
    }
  }
  return false
}

function allowed(type: string): boolean {
  const me = useUserStore.getState().currentUser
  if (!me) return false
  const s = (me.settings || {}) as Record<string, unknown>
  const map: Record<string, string> = {
    'dm': 'notifDm',
    'mention': 'notifMentions',
    'server-message': 'notifServerMessages',
    'server-event': 'notifServerEvents',
    'call-join': 'notifCallAlerts',
    'call-leave': 'notifCallAlerts',
    'screen-start': 'notifCallAlerts',
    'screen-stop': 'notifCallAlerts',
    'call-invite': 'notifCallInvites',
    'call-invite-response': 'notifCallInvites',
    'call-waiting': 'notifCallInvites',
    'folder-share': 'notifServerMessages',
    'friend-accept': 'notifFriendAlerts',
    'pending-user': 'notifFriendAlerts',
    'server-invite': 'notifServerMessages',
    'friend-request': 'notifFriendAlerts',
    'online': 'notifFriendAlerts',
    'status': 'notifFriendAlerts',
    'astro': 'notifAstro',
    'astro-gift': 'notifAstro',
  }
  const key = map[type]
  if (!key) return true
  const value = s[key]
  if (value === false) return false
  if (value === 'off') return false
  return true
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  toasts: [],
  unread: 0,
  loadNotifications: async () => {
    const me = useUserStore.getState().currentUser
    if (!me) return
    try {
      const result = await requestBackend<AppNotification[]>('loadNotifications', { userId: me.id })
      if (!initialLoadDone) {
        for (const n of result) lastSeenIds.add(n.id)
        initialLoadDone = true
        set({
          notifications: result,
          unread: result.filter((n) => !n.read).length,
        })
        return
      }
      const prevIds = new Set(get().notifications.map((n) => n.id))
      const visibleToastKeys = new Set(get().toasts.map((t) => toastKey(t)))
      const fresh: ToastItem[] = []
      for (const n of result) {
        if (prevIds.has(n.id)) continue
        if (lastSeenIds.has(n.id)) continue
        if (n.fromUserId === me.id) continue
        lastSeenIds.add(n.id)
        // Já tem toast visível com mesmo conteúdo? Ignora.
        if (visibleToastKeys.has(toastKey(n))) continue
        // Mesmo conteúdo nos últimos 30s? Ignora (backend duplicou).
        if (isDuplicateToast(n)) continue
        if (n.type === 'call-invite' || n.type === 'call-invite-response' || n.type === 'call-waiting') {
          const item = { ...n, toastId: n.id }
          fresh.push(item)
          visibleToastKeys.add(toastKey(n))
          continue
        }
        if (allowed(n.type)) {
          const item = { ...n, toastId: n.id }
          fresh.push(item)
          visibleToastKeys.add(toastKey(n))
        }
      }
      if (fresh.length > 0) {
        // Som com throttle: 1x a cada 3s no máximo
        const now = Date.now()
        if (now - lastSoundAt > SOUND_THROTTLE_MS) {
          lastSoundAt = now
          playSoundForType(fresh[0].type)
        }
        // Cap em 3 toasts visíveis (era slice(-4) + sem limite real)
        set({ toasts: [...get().toasts, ...fresh].slice(-3) })
      }
      set({
        notifications: result,
        unread: result.filter((n) => !n.read).length,
      })
    } catch {
      return
    }
  },
  markAllRead: async () => {
    const me = useUserStore.getState().currentUser
    if (!me) return
    try {
      await requestBackend('markNotificationsRead', { userId: me.id })
    } catch {
      return
    }
    set({ unread: 0, notifications: get().notifications.map((n) => ({ ...n, read: true })) })
  },
  dismissToast: (toastId) => {
    set({ toasts: get().toasts.filter((t) => t.toastId !== toastId) })
  },
  startPolling: () => {
    if (pollingTimer !== null) return
    initialLoadDone = false
    lastSeenIds.clear()
    void get().loadNotifications()
    pollingTimer = window.setInterval(() => { void get().loadNotifications() }, POLL_INTERVAL_MS)
  },
  stopPolling: () => {
    if (pollingTimer !== null) {
      window.clearInterval(pollingTimer)
      pollingTimer = null
    }
  },
}))
