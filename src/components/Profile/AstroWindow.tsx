import { useEffect } from 'react'
import { X, Rocket } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'
import { ASTRO_PLANS, getAstroTier } from '../../utils/astro'
import { AstroHub } from './AstroHub'

interface Props { onClose: () => void }

// Janela Astro minimalista: cabeçalho limpo (ícone + nome + selo do plano) e o
// conteúdo direto do hub (status, benefícios e assinatura).
export function AstroWindow({ onClose }: Props) {
  const { currentUser } = useUserStore()
  const tier = getAstroTier(currentUser)
  const paid = tier !== 'none'
  const accent = paid ? ASTRO_PLANS[tier].color : 'var(--text-secondary)'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="fs-modal-in" style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: '0 24px 80px rgba(0,0,0,.55)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Rocket size={17} strokeWidth={2.2} color={accent} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Astro</h2>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: accent, border: `1px solid color-mix(in srgb, ${paid ? accent : 'var(--border)'} 60%, transparent)`, borderRadius: 999, padding: '2px 9px' }}>
            {paid ? ASTRO_PLANS[tier].name.toUpperCase() : 'GRATUITO'}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} title="Fechar" className="fs-icon-btn" style={{ color: 'var(--text-secondary)', width: 28, height: 28 }}>
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 18px 18px' }}>
          <AstroHub />
        </div>
      </div>
    </div>
  )
}
