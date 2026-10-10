// Push notifications (Web Push): registra o service worker, assina com VAPID
// e envia a assinatura para o backend. Com isso, chamadas/mensagens chegam
// como notificacao do sistema mesmo com o navegador fechado.
import { requestBackend } from './backend'

// Chave publica VAPID do Friends Space (gerada em 24/08/2026).
const VAPID_PUBLIC_KEY = 'BHXAhzSnG8HBjv4epbJL6lbRxGNQ0TRBPq4NEToo5qOMI1Kq2jBIiQKf48Pl2JpuPvSGOm9W0Wm9ocxiv49a6z8'

const PUSH_STATE_KEY = 'friends-space:push-subscribed'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buf = new ArrayBuffer(raw.length)
  const output = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

// Assina para push e envia a assinatura ao backend. Retorna true se ativo.
export async function enablePushNotifications(userId: string): Promise<boolean> {
  try {
    if (!pushSupported()) return false
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false
    const registration = await registerServiceWorker()
    if (!registration) return false
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      })
    }
    // Envia (ou reenvia) a assinatura para o backend, vinculada ao usuario.
    const payload = {
      userId,
      subscription: {
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys || {},
        expirationTime: subscription.expirationTime ?? null,
      },
    }
    await requestBackend('savePushSubscription', payload).catch(() => null)
    try { localStorage.setItem(PUSH_STATE_KEY, '1') } catch { }
    return true
  } catch {
    return false
  }
}

export async function disablePushNotifications(userId: string): Promise<void> {
  try {
    if (!pushSupported()) return
    const registration = await registerServiceWorker()
    const subscription = registration && await registration.pushManager.getSubscription()
    if (subscription) await subscription.unsubscribe()
    await requestBackend('removePushSubscription', { userId, endpoint: subscription?.endpoint || '' }).catch(() => null)
    try { localStorage.removeItem(PUSH_STATE_KEY) } catch { }
  } catch { }
}

export function pushEnabledLocally(): boolean {
  try { return localStorage.getItem(PUSH_STATE_KEY) === '1' } catch { return false }
}
