// PrivacyModal — janela de privacidade standalone (sem abas de perfil).
// Abre direto do menu Configurações (engrenagem → Privacidade) com a
// interface portada de "friends-space-privacidade". Salva via updateUser.
import { useEffect } from 'react'
import { useUserStore } from '../../stores/userStore'
import { PrivacySettings } from './PrivacySettings'
import './privacymodal.css'

export function PrivacyModal({ onClose }: { onClose: () => void }) {
  const { currentUser, updateUser } = useUserStore()
  const userSettings = (currentUser?.settings || {}) as Record<string, string | boolean | undefined>

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleSave = async (patch: Record<string, string | boolean>) => {
    try {
      await updateUser({ settings: { ...userSettings, ...patch } })
    } catch {
      /* erro silencioso: o ProfileView mostra o sync state em caso de falha */
    }
  }

  return (
    <div className="fs-privacy-modal" onClick={onClose}>
      <div className="fs-privacy-modal-window" role="dialog" aria-modal="true" aria-labelledby="fs-privacy-modal-title" onClick={(event) => event.stopPropagation()}>
        <button className="fs-privacy-modal-close" type="button" aria-label="Fechar janela de privacidade" onClick={onClose}>
          ×
        </button>
        <div id="fs-privacy-modal-title" hidden>Privacidade</div>
        <PrivacySettings userSettings={userSettings} onSaveAll={handleSave} />
      </div>
    </div>
  )
}
