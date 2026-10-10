import { useEffect, useRef } from 'react'
import type { AppNotification } from '../types'
import { useNotificationStore } from '../stores/notificationStore'
import { useCallStore } from '../stores/callStore'
import { Avatar } from './ui/Avatar'

const TOAST_DURATION_MS = 7000

function ToastCard({ toast }: { toast: AppNotification & { toastId: string } }) {
  const dismissToast = useNotificationStore(s => s.dismissToast)
  const { acceptCallInvite, rejectCallInvite } = useCallStore()
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    timerRef.current = window.setTimeout(() => dismissToast(toast.toastId), TOAST_DURATION_MS)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [toast.toastId, dismissToast])

  const isCallInvite = toast.type === 'call-invite' || toast.type === 'call-waiting'

  return (
    <div className="fs-toast" role="status">
      <div className="fs-toast-body">
        <Avatar src={toast.fromPhoto} name={toast.fromName} size={34} />
        <div className="fs-toast-text">
          <div className="fs-toast-title">{toast.title}</div>
          {toast.body ? <div className="fs-toast-desc">{toast.body}</div> : null}
        </div>
      </div>
      {isCallInvite && (
        <div className="fs-toast-actions">
          <button
            className="fs-toast-btn fs-toast-btn-primary"
            onClick={() => { dismissToast(toast.toastId); void acceptCallInvite({ fromUserId: toast.fromUserId, fromName: toast.fromName, fromPhoto: toast.fromPhoto, data: toast.data }) }}
          >
            Entrar
          </button>
          <button
            className="fs-toast-btn"
            onClick={() => { dismissToast(toast.toastId); void rejectCallInvite({ fromUserId: toast.fromUserId, data: toast.data }) }}
          >
            Recusar
          </button>
        </div>
      )}
      <button className="fs-toast-close" onClick={() => dismissToast(toast.toastId)} aria-label="Fechar">
        <i className="fa-solid fa-xmark" />
      </button>
    </div>
  )
}

export function NotificationToasts() {
  const toasts = useNotificationStore(s => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="fs-toast-stack">
      {toasts.map(toast => <ToastCard key={toast.toastId} toast={toast} />)}
    </div>
  )
}
