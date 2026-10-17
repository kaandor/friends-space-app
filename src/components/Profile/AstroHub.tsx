import { useState } from 'react'
import { Lock, Palette, Sparkles, Zap, BadgeCheck, Crown, ArrowRight } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'
import { ASTRO_PLANS, getAstroTier } from '../../utils/astro'
import { NAME_COLORS, nameEffectOf, hasAstroBadge, nameStyleOf, nameClassOf, type NameEffect } from '../../utils/nameStyle'
import { AstroPlansModal } from '../Home/AstroPlansModal'
import { AppearanceModal } from './AppearanceModal'
import { ThemeWorkshopModal } from './ThemeWorkshopModal'
import { SubscriptionTab } from './SubscriptionTab'

const STARS_1 = 'radial-gradient(1.5px 1.5px at 12% 30%, #fff 100%, transparent 100%), radial-gradient(1px 1px at 32% 70%, #fff 100%, transparent 100%), radial-gradient(1.5px 1.5px at 58% 22%, #fff 100%, transparent 100%), radial-gradient(1px 1px at 76% 60%, #fff 100%, transparent 100%), radial-gradient(2px 2px at 88% 32%, #fff 100%, transparent 100%)'
const STARS_2 = 'radial-gradient(1px 1px at 22% 55%, #fff 100%, transparent 100%), radial-gradient(1.5px 1.5px at 44% 12%, #fff 100%, transparent 100%), radial-gradient(1px 1px at 66% 82%, #fff 100%, transparent 100%), radial-gradient(1.5px 1.5px at 82% 45%, #fff 100%, transparent 100%)'

// Central Astro com identidade propria: ceu espacial animado, perks em
// lista editorial numerada, preview ao vivo em destaque.
export function AstroHub() {
  const { currentUser, updateUser } = useUserStore()
  const [showPlans, setShowPlans] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showWorkshop, setShowWorkshop] = useState(false)
  const [busy, setBusy] = useState(false)

  const tier = getAstroTier(currentUser)
  const paid = tier !== 'none'
  const plan = paid ? ASTRO_PLANS[tier] : null
  const planColor = plan?.color || '#eab308'
  const settings = (currentUser?.settings || {}) as Record<string, unknown>
  const until = Number(settings.astroUntil || 0)
  const daysLeft = until > 0 ? Math.max(0, Math.ceil((until - Date.now()) / 86400000)) : 0

  const saveSettings = async (patch: Record<string, unknown>) => {
    if (!currentUser || busy) return
    setBusy(true)
    try {
      await updateUser({ settings: { ...(currentUser.settings || {}), ...patch } })
    } finally { setBusy(false) }
  }

  const currentColor = String(settings.nameColor || 'default')
  const currentEffect = nameEffectOf(currentUser) as NameEffect
  const badgeOn = hasAstroBadge(currentUser)

  const perkRow = (num: string, icon: React.ReactNode, title: string, desc: string, body: React.ReactNode, locked: boolean) => (
    <div style={{ display: 'flex', gap: 12, padding: '14px 4px', borderBottom: '1px solid var(--border)', alignItems: 'flex-start', opacity: busy ? 0.7 : 1 }}>
      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-muted)', paddingTop: 8, minWidth: 20 }}>{num}</span>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: paid ? `color-mix(in srgb, ${planColor} 15%, transparent)` : 'var(--bg-secondary)', border: `1px solid ${paid ? `color-mix(in srgb, ${planColor} 35%, transparent)` : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: paid ? planColor : 'var(--text-muted)', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 14 }}>{title}</span>
          {locked && (
            <button onClick={() => setShowPlans(true)} title="Desbloquear com ASTRO"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: '#04120a', background: planColor, border: 'none', borderRadius: 999, padding: '3px 9px', cursor: 'pointer' }}>
              <Lock size={10} strokeWidth={3} /> ASTRO
            </button>
          )}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '2px 0 10px' }}>{desc}</div>
        <div style={{ position: 'relative' }} onClick={locked ? undefined : e => e.stopPropagation()}>
          <div style={{ filter: locked ? 'blur(4px)' : 'none', opacity: locked ? 0.6 : 1, pointerEvents: locked ? 'none' : 'auto', userSelect: locked ? 'none' : 'auto' }}>
            {body}
          </div>
          {locked && (
            <button onClick={() => setShowPlans(true)}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', textShadow: '0 1px 8px rgba(0,0,0,.8)' }}>
              <Lock size={12} strokeWidth={3} style={{ marginRight: 6 }} /> Desbloquear
            </button>
          )}
        </div>
      </div>
    </div>
  )

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
              <>
                <button onClick={() => setShowPlans(true)} style={{ flex: 1, padding: '10px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, background: planColor, color: '#04120a' }}>
                  Trocar de plano
                </button>
                <button onClick={() => setShowAppearance(true)} style={{ flex: 1, padding: '10px 0', borderRadius: 11, cursor: 'pointer', fontWeight: 800, fontSize: 13, background: 'rgba(0,0,0,.35)', color: '#fff', border: '1px solid rgba(255,255,255,.25)' }}>
                  Personalizar
                </button>
              </>
            ) : (
              <button onClick={() => setShowPlans(true)} style={{ flex: 1, padding: '11px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13.5, background: planColor, color: '#04120a', boxShadow: `0 6px 24px color-mix(in srgb, ${planColor} 45%, transparent)` }}>
                <Crown size={14} strokeWidth={2.5} style={{ marginRight: 7, verticalAlign: -2 }} />
                Ver planos
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Perks numerados */}
      <div style={{ padding: '0 2px' }}>
        {perkRow('01', <Palette size={16} strokeWidth={2} />, 'Aparência', 'Temas, fontes, cores e fundo do perfil.',
          <button onClick={() => setShowAppearance(true)} style={{ padding: '8px 18px', fontSize: 12, fontWeight: 800, borderRadius: 9, border: 'none', cursor: 'pointer', background: planColor, color: '#04120a' }}>Abrir editor</button>, !paid)}
        {perkRow('02', <Sparkles size={16} strokeWidth={2} />, 'Cor do nome', 'Sua cor em todo o app.',
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {NAME_COLORS.map(c => (
              <button key={c.id} title={c.label} onClick={() => void saveSettings({ nameColor: c.id })}
                style={{ width: 28, height: 28, borderRadius: '50%', border: currentColor === c.id ? `2px solid ${planColor}` : '1px solid var(--border)', background: c.color || 'var(--bg-secondary)', cursor: 'pointer', opacity: busy ? 0.6 : 1, boxShadow: currentColor === c.id ? `0 0 10px color-mix(in srgb, ${planColor} 60%, transparent)` : 'none' }} />
            ))}
          </div>, !paid)}
        {perkRow('03', <Zap size={16} strokeWidth={2} />, 'Efeito no nome', 'Brilho animado ou neon — veja no topo.',
          <div style={{ display: 'flex', gap: 6 }}>
            {([['none', 'Nenhum'], ['shine', 'Brilho'], ['neon', 'Neon']] as [NameEffect, string][]).map(([v, label]) => (
              <button key={v} onClick={() => void saveSettings({ nameEffect: v })}
                style={{ padding: '7px 13px', borderRadius: 999, border: currentEffect === v ? 'none' : '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: currentEffect === v ? planColor : 'transparent', color: currentEffect === v ? '#04120a' : 'var(--text-secondary)', opacity: busy ? 0.6 : 1 }}>
                {label}
              </button>
            ))}
          </div>, !paid)}
        {perkRow('04', <BadgeCheck size={16} strokeWidth={2} />, 'Emblema Astro', 'Selo ao lado do seu nome.',
          <button onClick={() => void saveSettings({ astroBadge: !badgeOn })}
            style={{ padding: '7px 15px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: badgeOn ? planColor : 'transparent', border: badgeOn ? 'none' : '1px solid var(--border)', color: badgeOn ? '#04120a' : 'var(--text-secondary)', opacity: busy ? 0.6 : 1 }}>
            {badgeOn ? 'Ativado' : 'Desativado'}
          </button>, !paid)}
      </div>

      <button onClick={() => { if (paid) setShowWorkshop(true); else setShowPlans(true) }}
        style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 14%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Palette size={16} strokeWidth={2} color="var(--text-primary)" />
        </span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 800, fontSize: 13.5 }}>Workshop de temas</span>
          <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12 }}>Crie, aplique e compartilhe temas. Loja em breve.</span>
        </span>
        <ArrowRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>

      <div style={{ marginTop: 12 }}>
        {paid ? (
          <SubscriptionTab />
        ) : (
          <div onClick={() => setShowPlans(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer' }}>
            <Lock size={16} strokeWidth={2} color="var(--text-primary)" />
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 13.5 }}>Minha assinatura</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Renovar, reembolsar, trocar plano, pagamento e suporte.</div>
            </div>
            <ArrowRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </div>
        )}
      </div>

      {showPlans && <AstroPlansModal onClose={() => setShowPlans(false)} />}
      {showAppearance && paid && <AppearanceModal onClose={() => setShowAppearance(false)} />}
      {showWorkshop && paid && <ThemeWorkshopModal onClose={() => setShowWorkshop(false)} />}
    </div>
  )
}

// Reaproveitado no lock do workshop quando gratuito
export function AstroLockTag() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: 'var(--text-primary)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', borderRadius: 999, padding: '3px 9px', marginLeft: 8, verticalAlign: 2 }}>
      <Lock size={10} strokeWidth={3} /> ASTRO
    </span>
  )
}
