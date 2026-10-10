import { useState } from 'react'
import { useUserStore } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'

interface AstroGiftModalProps {
  onClose: () => void
}

export function AstroGiftModal({ onClose }: AstroGiftModalProps) {
  const { currentUser, cancelAstro, activateAstro } = useUserStore()
  const { t } = useLangStore()
  const settings = (currentUser?.settings || {}) as Record<string, unknown>
  const astro = settings['astro'] === true || settings['astro'] === 'true'
  const [busy, setBusy] = useState(false)

  const toggleAstro = async () => {
    setBusy(true)
    try {
      if (astro) {
        await cancelAstro()
      } else {
        await activateAstro(1)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: 'calc(100% - 32px)', background: 'linear-gradient(160deg, #1a1035, #111214)', border: '1px solid #5b3fa0', borderRadius: 16, padding: 32, textAlign: 'center', color: '#fff', boxShadow: '0 20px 60px rgba(160,32,240,0.35)' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>
          <i className="fa-solid fa-rocket" style={{ color: '#a855f7' }} />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>FRIENDS SPACE <span style={{ color: '#a855f7' }}>ASTRO</span></h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
          Desbloqueie temas exclusivos, insignia ASTRO no perfil, icons personalizados e recursos premium no futuro.
        </p>
        <button
          onClick={() => void toggleAstro()}
          disabled={busy}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 10, cursor: 'pointer',
            background: astro ? 'rgba(255,255,255,0.12)' : 'linear-gradient(90deg, #a855f7, #6d28d9)',
            color: '#fff', border: astro ? '1px solid #a855f7' : 'none', fontSize: 15, fontWeight: 800,
          }}
        >
          {busy ? t('astro.processing') : astro ? t('astro.deactivate') : t('astro.activate')}
        </button>
        <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          {astro ? t('astro.activeNote') : t('astro.demoNote')}
        </div>
      </div>
    </div>
  )
}
