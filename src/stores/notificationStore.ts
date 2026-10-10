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

function allowed(type: string): boolean {
  const me = useUserStore.getState().currentUser
  if (!me) return false
  const s = (me.settings || {}) as Record<string, unknown>
  const map: Record<string, string> = {
    'dm': 'notifDm',
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
      const fresh: ToastItem[] = []
      for (const n of result) {
        if (prevIds.has(n.id)) continue
        if (lastSeenIds.has(n.id)) continue
        if (n.fromUserId === me.id) continue
        lastSeenIds.add(n.id)
        if (n.type === 'call-invite' || n.type === 'call-invite-response' || n.type === 'call-waiting') {
          fresh.push({ ...n, toastId: `${n.id}-${Date.now()}` })
          continue
        }
        if (allowed(n.type)) fresh.push({ ...n, toastId: `${n.id}-${Date.now()}` })
      }
      if (fresh.length > 0) {
        for (const toast of fresh) playSoundForType(toast.type)
        set({ toasts: [...get().toasts.slice(-4), ...fresh] })
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
