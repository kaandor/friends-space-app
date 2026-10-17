import { useState } from 'react'
import { Lock, Crown, ArrowRight } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'
import { ASTRO_PLANS, getAstroTier } from '../../utils/astro'
import { nameClassOf, nameStyleOf } from '../../utils/nameStyle'
import { AstroPlansModal } from '../Home/AstroPlansModal'
import { SubscriptionTab } from './SubscriptionTab'

const STARS_1 = 'radial-gradient(1.5px 1.5px at 12% 30%, #fff 100%, transparent 100%), radial-gradient(1px 1px at 32% 70%, #fff 100%, transparent 100%), radial-gradient(1.5px 1.5px at 58% 22%, #fff 100%, transparent 100%), radial-gradient(1px 1px at 76% 60%, #fff 100%, transparent 100%), radial-gradient(2px 2px at 88% 32%, #fff 100%, transparent 100%)'
const STARS_2 = 'radial-gradient(1px 1px at 22% 55%, #fff 100%, transparent 100%), radial-gradient(1.5px 1.5px at 44% 12%, #fff 100%, transparent 100%), radial-gradient(1px 1px at 66% 82%, #fff 100%, transparent 100%), radial-gradient(1.5px 1.5px at 82% 45%, #fff 100%, transparent 100%)'

// Central Astro: assinatura e planos, tudo junto. A personalização (aparência,
// cor/efeito do nome, emblema e temas) fica em Configurações → Aparência.
export function AstroHub() {
  const { currentUser } = useUserStore()
  const [showPlans, setShowPlans] = useState(false)

  const tier = getAstroTier(currentUser)
  const paid = tier !== 'none'
  const plan = paid ? ASTRO_PLANS[tier] : null
  const planColor = plan?.color || '#eab308'
  const settings = (currentUser?.settings || {}) as Record<string, unknown>
  const until = Number(settings.astroUntil || 0)
  const daysLeft = until > 0 ? Math.max(0, Math.ceil((until - Date.now()) / 86400000)) : 0

  return (
    <div className="profile-form">
      {/* Hero espacial */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, border: `1px solid color-mix(in srgb, ${planColor} 30%, var(--border))`, marginBottom: 6, background: `radial-gradient(130% 150% at 88% -20%, color-mix(in srgb, ${planColor} 42%, transparent), transparent 55%), radial-gradient(110% 130% at -10% 115%, color-mix(in srgb, ${planColor} 24%, transparent), transparent 52%), var(--bg-tertiary)` }}>
        <div className="fs-astrohub-stars" style={{ position: 'absolute', inset: 0, backgroundImage: STARS_1, pointerEvents: 'none' }} />
        <div className="fs-astrohub-stars2" style={{ position: 'absolute', inset: 0, backgroundImage: STARS_2, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', padding: '20px 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 14, background: `color-mix(in srgb, ${planColor} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${planColor} 35%, transparent)`, flexShrink: 0 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={planColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2, color: planColor, textTransform: 'uppercase' }}>
                {paid ? plan?.badge : 'Friends Space Astro'}
              </div>
              <div className={nameClassOf(currentUser)} style={{ fontSize: 27, fontWeight: 900, letterSpacing: -0.5, color: 'var(--text-primary)', ...nameStyleOf(currentUser), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                {currentUser?.name || 'Você'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                {paid
                  ? <>válido até <b style={{ color: 'var(--text-primary)' }}>{until > 0 ? new Date(until).toLocaleDateString() : '—'}</b> · <b style={{ color: planColor }}>{daysLeft} dias restantes</b></>
                  : 'Sua identidade cósmica começa aqui.'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {paid ? (
              <button onClick={() => setShowPlans(true)} style={{ flex: 1, padding: '10px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, background: planColor, color: '#04120a' }}>
                Trocar de plano
              </button>
            ) : (
              <button onClick={() => setShowPlans(true)} style={{ flex: 1, padding: '11px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13.5, background: planColor, color: '#04120a', boxShadow: `0 6px 24px color-mix(in srgb, ${planColor} 45%, transparent)` }}>
                <Crown size={14} strokeWidth={2.5} style={{ marginRight: 7, verticalAlign: -2 }} />
                Ver planos
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {paid ? (
          <SubscriptionTab />
        ) : (
          <div onClick={() => setShowPlans(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer' }}>
            <Lock size={16} strokeWidth={2} color="var(--text-primary)" />
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 13.5 }}>Minha assinatura</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Assinar, renovar, reembolsar, trocar plano, pagamento e suporte.</div>
            </div>
            <ArrowRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </div>
        )}
      </div>

      {showPlans && <AstroPlansModal onClose={() => setShowPlans(false)} />}
    </div>
  )
}
