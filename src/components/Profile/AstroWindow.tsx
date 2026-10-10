import { useEffect } from 'react'
import { X, Rocket } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'
import { ASTRO_PLANS, getAstroTier } from '../../utils/astro'
import { AstroHub } from './AstroHub'

interface Props { onClose: () => void }

// Janela Astro dedicada: casca própria (nada do editar-perfil), identidade
// espacial no cabeçalho e corpo claro no padrão atual do site.
export function AstroWindow({ onClose }: Props) {
  const { currentUser } = useUserStore()
  const tier = getAstroTier(currentUser)
  const paid = tier !== 'none'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="fs-modal-in" style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: '0 24px 80px rgba(0,0,0,.55)' }} onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative', padding: '26px 22px 20px', overflow: 'hidden', background: 'linear-gradient(135deg, #1a1035 0%, #2b1a5e 55%, #0b3d2e 100%)' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.5, backgroundImage: 'radial-gradient(1.5px 1.5px at 12% 30%, #fff 100%, transparent 100%), radial-gradient(1px 1px at 32% 70%, #fff 100%, transparent 100%), radial-gradient(1.5px 1.5px at 58% 22%, #fff 100%, transparent 100%), radial-gradient(1px 1px at 76% 60%, #fff 100%, transparent 100%), radial-gradient(2px 2px at 88% 32%, #fff 100%, transparent 100%), radial-gradient(1px 1px at 45% 85%, #fff 100%, transparent 100%)' }} />
          <button onClick={onClose} title="Fechar" className="fs-icon-btn"
            style={{ position: 'absolute', top: 12, right: 12, color: '#fff', width: 30, height: 30, background: 'rgba(0,0,0,.35)', zIndex: 2 }}>
            <X size={16} strokeWidth={2.5} />
          </button>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, zIndex: 1 }}>
            <span style={{ width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)' }}>
              <Rocket size={24} strokeWidth={2} color="#fff" />
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Astro</h2>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: paid ? '#000' : '#fff', background: paid ? 'var(--accent)' : 'rgba(255,255,255,.18)', borderRadius: 999, padding: '3px 10px' }}>
                  {paid ? ASTRO_PLANS[tier].name.toUpperCase() : 'GRATUITO'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,.75)' }}>
                {paid ? 'Sua central de plano e personalização' : 'Personalização e recursos exclusivos'}
              </p>
            </div>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 18px 20px' }}>
          <AstroHub />
        </div>
      </div>
    </div>
  )
}
