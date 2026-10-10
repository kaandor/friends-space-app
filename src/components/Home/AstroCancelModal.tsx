import { useState } from 'react'
import { ASTRO_PLANS, getAstroTier } from '../../utils/astro'
import { useUserStore } from '../../stores/userStore'

interface Props {
  onClose: () => void
  onCancelled: () => void
}

export function AstroCancelModal({ onClose, onCancelled }: Props) {
  const { currentUser, cancelAstro } = useUserStore()
  const [confirmStep, setConfirmStep] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [done, setDone] = useState(false)

  const tier = getAstroTier(currentUser)
  const plan = tier !== 'none' ? ASTRO_PLANS[tier] : null

  const handleCancel = async () => {
    if (cancelling) return
    setCancelling(true)
    try {
      await cancelAstro()
      setDone(true)
      window.setTimeout(onCancelled, 1500)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="fs-astro-overlay" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: 16, zIndex: 4000 }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 80px rgba(0,0,0,0.7)' }} onClick={e => e.stopPropagation()}>
        {done ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <h2 style={{ color: '#fff', margin: '0 0 8px', fontWeight: 800, fontSize: 20 }}>Assinatura cancelada</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Seu plano voltou para o gratuito. O tema do site já foi regredido e os recursos premium foram desativados.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #1e1e1e' }}>
              <h2 style={{ color: '#fff', margin: 0, fontWeight: 800, fontSize: 16 }}>Cancelar assinatura</h2>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20, padding: 4 }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {plan && (
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>Cancelando</div>
                  <div style={{ color: plan.color, fontWeight: 900, fontSize: 18 }}>{plan.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>R$ {plan.monthlyPrice.toFixed(2).replace('.', ',')}/mês</div>
                </div>
              )}
              {!confirmStep ? (
                <>
                  <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 12, padding: 14 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <b style={{ color: '#ef4444' }}>Ao cancelar:</b>
                    </p>
                    <ul style={{ margin: '8px 0 0', padding: '0 0 0 18px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      <li>O tema do site volta para o plano gratuito</li>
                      <li>Molduras premium saem do seu perfil</li>
                      <li>Upload limitado a 25 MB</li>
                      <li>Streaming limitado a 480p / 30 FPS</li>
                      <li>Limite de servidores: 2</li>
                    </ul>
                  </div>
                  <button onClick={() => setConfirmStep(true)}
                    style={{ width: '100%', padding: '14px 0', border: 'none', borderRadius: 12, background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                    Quero cancelar
                  </button>
                  <button onClick={onClose}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 4 }}>
                    Manter assinatura
                  </button>
                </>
              ) : (
                <>
                  <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.5)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#ef4444', fontWeight: 700, lineHeight: 1.5 }}>
                      Tem certeza? Esta ação é imediata e irreversível.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleCancel} disabled={cancelling}
                      style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: 10, background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 14, cursor: cancelling ? 'default' : 'pointer', opacity: cancelling ? 0.6 : 1 }}>
                      {cancelling ? 'Cancelando...' : 'Sim, cancelar'}
                    </button>
                    <button onClick={() => setConfirmStep(false)} disabled={cancelling}
                      style={{ flex: 1, padding: '12px 0', border: '1px solid var(--border)', borderRadius: 10, background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 14, cursor: cancelling ? 'default' : 'pointer' }}>
                      Voltar
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}