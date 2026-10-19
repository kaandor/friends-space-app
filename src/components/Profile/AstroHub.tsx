import { useState } from 'react'
import { Check, Crown } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'
import { ASTRO_PLANS, getAstroTier } from '../../utils/astro'
import { AstroPlansModal } from '../Home/AstroPlansModal'
import { SubscriptionTab } from './SubscriptionTab'

// Central Astro minimalista: status do plano, o que o assinante tem acesso e,
// para assinantes, os controles da assinatura em linhas discretas.
export function AstroHub() {
  const { currentUser } = useUserStore()
  const [showPlans, setShowPlans] = useState(false)

  const tier = getAstroTier(currentUser)
  const paid = tier !== 'none'
  const plan = paid ? ASTRO_PLANS[tier] : null
  const planColor = plan?.color || '#eab308'
  const listColor = paid ? planColor : ASTRO_PLANS.astro.color
  const settings = (currentUser?.settings || {}) as Record<string, unknown>
  const until = Number(settings.astroUntil || 0)
  const daysLeft = until > 0 ? Math.max(0, Math.ceil((until - Date.now()) / 86400000)) : 0
  const features = paid ? plan!.features : ASTRO_PLANS.astro.features.slice(0, 6)

  return (
    <div className="profile-form">
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-tertiary)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: paid ? planColor : 'var(--text-muted)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 14 }}>
            {paid ? plan!.name : 'Plano gratuito'}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 1 }}>
            {paid
              ? <>válido até {until > 0 ? new Date(until).toLocaleDateString() : '—'} · <span style={{ color: planColor, fontWeight: 700 }}>{daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}</span></>
              : 'Astro desbloqueia personalização e recursos exclusivos.'}
          </div>
        </div>
        {paid && (
          <button onClick={() => setShowPlans(true)} style={{ padding: '7px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
            Trocar de plano
          </button>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 9 }}>
          {paid ? 'O que você tem acesso' : 'O que você desbloqueia'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {features.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <Check size={14} strokeWidth={2.5} color={listColor} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{f}</span>
            </div>
          ))}
        </div>
        {!paid && (
          <>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 9 }}>ASTRO+ e ASTRO Plus liberam ainda mais recursos.</div>
            <button onClick={() => setShowPlans(true)} style={{ marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, background: planColor, color: '#04120a' }}>
              <Crown size={14} strokeWidth={2.5} style={{ marginRight: 7, verticalAlign: -2 }} />
              Ver planos
            </button>
          </>
        )}
      </div>

      {paid && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Assinatura
          </div>
          <SubscriptionTab />
        </div>
      )}

      {showPlans && <AstroPlansModal onClose={() => setShowPlans(false)} />}
    </div>
  )
}
