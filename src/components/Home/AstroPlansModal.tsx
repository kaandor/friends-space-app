import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { Check, X, Lock, Star, Sparkles, Crown, Gem, CalendarDays, Zap, Palette, Shield } from 'lucide-react'
import { ASTRO_PLANS, ASTRO_ORDER, getAstroTier, type AstroTier } from '../../utils/astro'
import { useUserStore } from '../../stores/userStore'
import { assetUrl } from '../../utils/assets'
import { AstroCheckoutModal } from './AstroCheckoutModal'
import { AstroCancelModal } from './AstroCancelModal'

interface AstroPlansModalProps {
  onClose: () => void
  onSubscribe?: (tier: AstroTier) => Promise<void> | void
}

const VISUALS: Record<AstroTier, { color: string; icon: ReactNode }> = {
  astro: { color: '#38bdf8', icon: <Star size={18} strokeWidth={2.2} /> },
  astro_plus: { color: '#a855f7', icon: <Sparkles size={18} strokeWidth={2.2} /> },
  astro_ultimate: { color: '#f59e0b', icon: <Crown size={18} strokeWidth={2.2} /> },
}

const ULTIMATE_FEATURES = [
  'Tudo do ASTRO Plus',
  'Limites ainda maiores',
  'Efeitos e insígnias exclusivos',
  'Prioridade máxima',
  'Suporte dedicado',
  'Novos recursos em primeira mão',
]

const COMPARE_ROWS: Array<{ label: string; free: string | boolean; astro: string | boolean; astroplus: string | boolean; astroplus2: string | boolean }> = [
  { label: 'Upload de arquivos', free: 'Até 25 MB', astro: 'Até 250 MB', astroplus: 'Até 1 GB', astroplus2: 'Até 5 GB' },
  { label: 'Streaming', free: '480p / 30 FPS', astro: '1080p / 60 FPS', astroplus: '2K / 60 FPS', astroplus2: '2K / 60 FPS' },
  { label: 'Molduras premium', free: false, astro: false, astroplus: true, astroplus2: true },
  { label: 'Recursos Beta', free: false, astro: false, astroplus: true, astroplus2: true },
]

type Billing = 'monthly' | 'yearly'

function renderCell(value: string | boolean) {
  if (value === true) return <Check size={14} strokeWidth={2.6} color="#4ade80" />
  if (value === false) return <span style={{ color: 'rgba(255,255,255,.3)' }}>–</span>
  return <>{value}</>
}

function SaibaMaisModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fs-astro-overlay" style={{ zIndex: 3700 }} onClick={onClose}>
      <div className="fs-astro-modal" style={{ maxWidth: 512 }} onClick={e => e.stopPropagation()}>
        <div className="fs-astro-modalhead">
          <div className="fs-astro-modaltitle">
            <Star size={17} color="#38bdf8" />
            <span>Como funciona o armazenamento</span>
          </div>
          <button className="fs-astro-modalx" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="fs-astro-modalbody">
          <div className="fs-astro-modalitem">
            <div className="fs-astro-modalicon" style={{ background: 'rgba(56,189,248,0.12)' }}>
              <Star size={15} color="#38bdf8" />
            </div>
            <div>
              <p className="fs-astro-modaltitle2">Seus arquivos ficam no seu Google Drive</p>
              <p className="fs-astro-modalp">
                O Friends Space <b>não armazena</b> seus arquivos em servidores próprios. Tudo que você envia vai diretamente para uma pasta chamada{' '}
                <b style={{ color: '#38bdf8' }}>"Friends Space"</b> no seu próprio Google Drive.
              </p>
            </div>
          </div>
          <div className="fs-astro-modalitem">
            <div className="fs-astro-modalicon" style={{ background: 'rgba(168,85,247,0.12)' }}>
              <Zap size={15} color="#a855f7" />
            </div>
            <div>
              <p className="fs-astro-modaltitle2">Space Ultra Transfer</p>
              <p className="fs-astro-modalp">
                Nossa tecnologia de transferência comprime, fragmenta e envia seus arquivos em paralelo, chegando a ser{' '}
                <b>até 10x mais rápido</b> que um upload convencional ao Google Drive.
              </p>
            </div>
          </div>
          <div className="fs-astro-modalitem">
            <div className="fs-astro-modalicon" style={{ background: 'rgba(245,158,11,0.12)' }}>
              <Shield size={15} color="#f59e0b" />
            </div>
            <div>
              <p className="fs-astro-modaltitle2">Privacidade total</p>
              <p className="fs-astro-modalp">
                Como os arquivos ficam no <b>seu Google Drive</b>, só você (e quem você autorizar) tem acesso.
              </p>
            </div>
          </div>
        </div>
        <div className="fs-astro-modalfoot">
          <button className="fs-astro-modalfootbtn" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  )
}

function SemFidelidadeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fs-astro-overlay" style={{ zIndex: 3700 }} onClick={onClose}>
      <div className="fs-astro-modal" style={{ maxWidth: 448 }} onClick={e => e.stopPropagation()}>
        <div className="fs-astro-modalhead">
          <div className="fs-astro-modaltitle">
            <Lock size={16} color="#38bdf8" />
            <span>Sem fidelidade</span>
          </div>
          <button className="fs-astro-modalx" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="fs-astro-modalbody">
          <p className="fs-astro-modalp" style={{ margin: 0 }}>
            Você pode cancelar quando quiser, sem multa e sem burocracia. A assinatura permanece ativa até o final do período já pago.
          </p>
        </div>
        <div className="fs-astro-modalfoot">
          <button className="fs-astro-modalfootbtn" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  )
}

export function AstroPlansModal({ onClose, onSubscribe }: AstroPlansModalProps) {
  const { currentUser } = useUserStore()
  const [billing, setBilling] = useState<Billing>('monthly')
  const [saibaMais, setSaibaMais] = useState(false)
  const [semFidelidade, setSemFidelidade] = useState(false)
  const [checkoutTier, setCheckoutTier] = useState<AstroTier | null>(null)
  const [showCancelScreen, setShowCancelScreen] = useState(false)
  const activeTier = getAstroTier(currentUser)
  const activeColor = activeTier !== 'none' ? VISUALS[activeTier].color : '#38bdf8'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const subscribe = (tier: AstroTier) => {
    if (onSubscribe) {
      void onSubscribe(tier)
      return
    }
    setCheckoutTier(tier)
  }

  const fmtPrice = (value: number) => 'R$ ' + value.toFixed(2).replace('.', ',')

  return (
    <div className="fsp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fsp-page" onMouseDown={e => e.stopPropagation()}>
        <style>{`
          .fsp-overlay { position: fixed; inset: 0; z-index: 3500; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(2,4,12,.78); backdrop-filter: blur(8px); }
          .fsp-page { position: relative; width: 100%; max-width: 1180px; max-height: 94vh; overflow-y: auto; overflow-x: hidden; border-radius: 22px; border: 1px solid rgba(120,170,255,.25); box-shadow: 0 30px 120px rgba(0,0,0,.8); color: #fff; background: radial-gradient(900px 420px at 12% -10%, rgba(56,189,248,.16), transparent 60%), radial-gradient(800px 500px at 92% 0%, rgba(168,85,247,.14), transparent 55%), #050a17 url('${assetUrl('astro-bg.png')}') center/cover no-repeat; }
          .fsp-page::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(3,6,16,.34) 0%, rgba(3,6,16,.7) 45%, rgba(3,6,16,.92) 100%); pointer-events: none; border-radius: 22px; }
          .fsp-inner { position: relative; z-index: 1; padding: 16px 26px 0; }
          .fsp-head { display: flex; align-items: center; gap: 10px; padding: 2px 0 12px; }
          .fsp-wordmark { height: 32px; width: auto; object-fit: contain; filter: drop-shadow(0 4px 18px rgba(56,189,248,.35)); }
          .fsp-beta { font-size: 9.5px; font-weight: 800; letter-spacing: .08em; color: #7dd3fc; background: rgba(56,189,248,.12); border: 1px solid rgba(56,189,248,.45); padding: 3px 8px; border-radius: 6px; }
          .fsp-flex { flex: 1; }
          .fsp-close { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14); color: rgba(255,255,255,.75); width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .15s; }
          .fsp-close:hover { background: rgba(255,255,255,.14); color: #fff; }
          .fsp-content { display: grid; grid-template-columns: 296px minmax(0, 1fr); gap: 26px; padding: 4px 0 18px; }
          @media (max-width: 1080px) { .fsp-content { grid-template-columns: 1fr; gap: 18px; } }
          .fsp-hero { position: relative; padding: 6px 2px 0; }
          .fsp-eyebrow { display: inline-block; font-size: 9.5px; font-weight: 800; letter-spacing: .12em; color: #7dd3fc; border: 1px solid rgba(56,189,248,.45); border-radius: 6px; padding: 4px 9px; background: rgba(56,189,248,.1); }
          .fsp-hero h1 { font-size: 33px; line-height: 1.08; font-weight: 900; letter-spacing: -.02em; margin: 13px 0 10px; color: #fff; }
          .fsp-hero h1 span { color: #38bdf8; text-shadow: 0 0 26px rgba(56,189,248,.55); }
          .fsp-hero > p { font-size: 12.5px; line-height: 1.55; color: #aebad6; margin: 0 0 16px; max-width: 280px; }
          .fsp-perks { list-style: none; display: flex; flex-direction: column; gap: 11px; margin: 0 0 6px; padding: 0; }
          .fsp-perks li { display: flex; gap: 10px; align-items: flex-start; }
          .fsp-perk-ic { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; border: 1px solid; }
          .fsp-perks strong { display: block; font-size: 12.5px; color: #fff; }
          .fsp-perks small { display: block; font-size: 10.5px; color: #8fa0c4; line-height: 1.35; }
          .fsp-mascot { margin-top: 4px; display: flex; justify-content: flex-start; }
          .fsp-mascot img { width: 186px; height: auto; filter: drop-shadow(0 18px 40px rgba(41,163,255,.35)); }
          .fsp-hero-foot { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: #8fa0c4; margin: 0; }
          .fsp-plans-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; margin-bottom: 10px; }
          .fsp-billing { display: flex; gap: 4px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 3px; }
          .fsp-billing button { background: none; border: 1px solid transparent; color: #93a3c4; font-size: 10.5px; font-weight: 700; padding: 4px 11px; border-radius: 999px; cursor: pointer; }
          .fsp-billing button.is-on { background: rgba(56,189,248,.18); color: #7dd3fc; border-color: rgba(56,189,248,.5); }
          .fsp-billing em { font-style: normal; font-size: 8.5px; color: #4ade80; margin-left: 4px; }
          .fsp-activebar { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: #aebad6; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 4px 5px 4px 11px; }
          .fsp-activebar button { background: rgba(239,68,68,.16); border: 1px solid rgba(239,68,68,.45); color: #fca5a5; font-size: 10px; font-weight: 700; border-radius: 999px; padding: 4px 10px; cursor: pointer; }
          .fsp-activebar button:hover { background: rgba(239,68,68,.26); }
          .fsp-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
          @media (max-width: 1280px) { .fsp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
          @media (max-width: 640px) { .fsp-grid { grid-template-columns: 1fr; } }
          .fsp-card { --pc: #38bdf8; position: relative; display: flex; flex-direction: column; gap: 10px; background: rgba(7,13,28,.78); border: 1px solid color-mix(in srgb, var(--pc) 42%, rgba(255,255,255,.1)); border-radius: 16px; padding: 16px 13px 14px; backdrop-filter: blur(6px); }
          .fsp-card.is-popular { box-shadow: 0 0 0 1px color-mix(in srgb, var(--pc) 60%, transparent), 0 18px 50px rgba(168,85,247,.28); }
          .fsp-card.is-ultimate { border-color: rgba(255,255,255,.6); box-shadow: 0 0 0 1px rgba(255,255,255,.16), 0 18px 50px rgba(255,255,255,.07); }
          .fsp-pop { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); background: #a855f7; color: #fff; font-size: 8.5px; font-weight: 800; letter-spacing: .06em; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
          .fsp-pop-white { background: #fff; color: #0a1020; }
          .fsp-card-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; padding-top: 6px; }
          .fsp-plan-ic { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--pc); border: 2px solid color-mix(in srgb, var(--pc) 65%, transparent); box-shadow: 0 0 22px color-mix(in srgb, var(--pc) 45%, transparent); margin-bottom: 4px; }
          .fsp-card-head h2 { font-size: 16.5px; font-weight: 900; letter-spacing: -.01em; margin: 0; color: var(--pc); }
          .fsp-card-head p { font-size: 10.5px; color: #93a3c4; line-height: 1.35; margin: 0; min-height: 26px; }
          .fsp-price { text-align: center; padding: 2px 0; }
          .fsp-price-main { font-size: 22px; font-weight: 900; color: #fff; line-height: 1.05; }
          .fsp-price-main span { font-size: 11px; font-weight: 500; color: #93a3c4; margin-left: 2px; }
          .fsp-price-year { font-size: 10px; color: #93a3c4; margin-top: 3px; }
          .fsp-price-year em { font-style: normal; background: rgba(74,222,128,.14); color: #4ade80; border: 1px solid rgba(74,222,128,.35); border-radius: 999px; padding: 1px 6px; margin-left: 4px; font-size: 8.5px; font-weight: 700; }
          .fsp-subscribe { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 9px 0; border-radius: 10px; border: 1px solid transparent; background: var(--pc); color: #06101f; font-size: 12px; font-weight: 800; cursor: pointer; transition: filter .15s; }
          .fsp-subscribe:hover { filter: brightness(1.08); }
          .fsp-subscribe:disabled { cursor: default; opacity: .6; }
          .fsp-card.is-ultimate .fsp-subscribe { background: transparent; color: #e6ecff; border-color: rgba(255,255,255,.55); opacity: 1; }
          .fsp-feats { list-style: none; display: flex; flex-direction: column; gap: 6px; margin: 2px 0 0; padding: 0; }
          .fsp-feats li { display: flex; align-items: flex-start; gap: 6px; font-size: 10.8px; line-height: 1.35; color: #b9c4dd; }
          .fsp-feats svg { flex: none; margin-top: 2px; color: var(--pc); }
          .fsp-compare { position: relative; z-index: 1; padding: 6px 26px 18px; }
          .fsp-compare h3 { font-size: 15px; font-weight: 800; color: #fff; margin: 0 0 10px; }
          .fsp-tablewrap { overflow-x: auto; background: rgba(7,13,28,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 14px; }
          .fsp-table { width: 100%; border-collapse: collapse; min-width: 640px; }
          .fsp-table th, .fsp-table td { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.07); font-size: 12px; text-align: center; white-space: nowrap; }
          .fsp-table tr:last-child td { border-bottom: none; }
          .fsp-table th:first-child, .fsp-table td:first-child { text-align: left; color: #93a3c4; font-weight: 600; }
          .fsp-table th { font-size: 11px; font-weight: 800; color: #c7d2ea; }
          .fsp-table td { color: #b9c4dd; }
          .fsp-thplan { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; }
          .fsp-dotc { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
          .fsp-foot { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 26px 16px; border-top: 1px solid rgba(255,255,255,.08); font-size: 11px; color: #8fa0c4; }
          .fsp-foot button { background: none; border: none; color: #7dd3fc; font-size: 11px; font-weight: 600; cursor: pointer; padding: 0; }
          .fsp-foot button:hover { text-decoration: underline; }
          .fsp-foot-pengu { width: 22px; height: 22px; object-fit: contain; }
          .fsp-foot .fsp-beta { padding: 2px 6px; font-size: 8px; }

          .fs-astro-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.78); padding: 16px; }
          .fs-astro-modal { position: relative; background: #081123; border: 1px solid rgba(120,170,255,.22); border-radius: 16px; width: 100%; overflow: hidden; color: #fff; box-shadow: 0 24px 90px rgba(0,0,0,.7); }
          .fs-astro-modalhead { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid rgba(255,255,255,.08); }
          .fs-astro-modaltitle { display: flex; align-items: center; gap: 10px; color: #fff; font-weight: 700; font-size: 14px; }
          .fs-astro-modalx { color: #8fa0c4; background: none; border: none; cursor: pointer; display: flex; padding: 4px; }
          .fs-astro-modalx:hover { color: #fff; }
          .fs-astro-modalbody { padding: 18px 22px; display: flex; flex-direction: column; gap: 18px; }
          .fs-astro-modalitem { display: flex; gap: 12px; }
          .fs-astro-modalicon { flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
          .fs-astro-modaltitle2 { color: #fff; font-size: 12px; font-weight: 700; margin: 0 0 4px 0; }
          .fs-astro-modalp { color: #93a3c4; font-size: 12px; line-height: 1.62; margin: 0; }
          .fs-astro-modalp b { color: #fff; }
          .fs-astro-modalfoot { padding: 0 22px 18px; }
          .fs-astro-modalfootbtn { width: 100%; padding: 10px 0; border-radius: 12px; border: none; background: #38bdf8; color: #06101f; font-weight: 800; font-size: 13px; cursor: pointer; }
          .fs-astro-modalfootbtn:hover { filter: brightness(1.08); }
        `}</style>

        <div className="fsp-inner">
          <header className="fsp-head">
            <img src={assetUrl('friends-space-logo.png')} alt="Friends Space" className="fsp-wordmark" />
            <span className="fsp-beta">BETA</span>
            <span className="fsp-flex" />
            <button className="fsp-close" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
          </header>

          <div className="fsp-content">
            <aside className="fsp-hero">
              <span className="fsp-eyebrow">ASSINATURA</span>
              <h1>Leve sua experiência<br />para o <span>próximo nível</span></h1>
              <p>Aproveite todos os recursos premium, personalize seu perfil e tenha uma experiência ainda mais completa no Friends Space.</p>
              <ul className="fsp-perks">
                <li>
                  <span className="fsp-perk-ic" style={{ color: '#38bdf8', borderColor: 'rgba(56,189,248,.45)', background: 'rgba(56,189,248,.1)' }}><Gem size={13} /></span>
                  <div><strong>Mais recursos</strong><small>Acesso a funcionalidades exclusivas.</small></div>
                </li>
                <li>
                  <span className="fsp-perk-ic" style={{ color: '#a855f7', borderColor: 'rgba(168,85,247,.45)', background: 'rgba(168,85,247,.1)' }}><Palette size={13} /></span>
                  <div><strong>Personalização total</strong><small>Deixe seu perfil do seu jeito.</small></div>
                </li>
                <li>
                  <span className="fsp-perk-ic" style={{ color: '#38bdf8', borderColor: 'rgba(56,189,248,.45)', background: 'rgba(56,189,248,.1)' }}><Zap size={13} /></span>
                  <div><strong>Melhor desempenho</strong><small>Menos limites, mais liberdade.</small></div>
                </li>
                <li>
                  <span className="fsp-perk-ic" style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,.45)', background: 'rgba(245,158,11,.1)' }}><Shield size={13} /></span>
                  <div><strong>Suporte prioritário</strong><small>Conte com a gente sempre que precisar.</small></div>
                </li>
              </ul>
              <div className="fsp-mascot">
                <img src={assetUrl('penguin-logo.png')} alt="" />
              </div>
              <p className="fsp-hero-foot"><Crown size={11} color="#38bdf8" /> Assine agora e faça parte do maior.</p>
            </aside>

            <main className="fsp-plans">
              <div className="fsp-plans-top">
                <div className="fsp-billing" role="tablist" aria-label="Período de cobrança">
                  <button role="tab" aria-selected={billing === 'monthly'} className={billing === 'monthly' ? 'is-on' : ''} onClick={() => setBilling('monthly')}>Mensal</button>
                  <button role="tab" aria-selected={billing === 'yearly'} className={billing === 'yearly' ? 'is-on' : ''} onClick={() => setBilling('yearly')}>Anual <em>-17%</em></button>
                </div>
                {activeTier !== 'none' && (
                  <div className="fsp-activebar">
                    <span>Plano atual: <strong style={{ color: activeColor }}>{ASTRO_PLANS[activeTier].name}</strong></span>
                    <button onClick={() => setShowCancelScreen(true)}>Cancelar assinatura</button>
                  </div>
                )}
              </div>

              <div className="fsp-grid">
                {ASTRO_ORDER.map(tier => {
                  const plan = ASTRO_PLANS[tier]
                  const visual = VISUALS[tier]
                  const isActive = activeTier === tier
                  const popular = tier === 'astro_plus'
                  return (
                    <div key={tier} className={`fsp-card ${popular ? 'is-popular' : ''}`} style={{ '--pc': visual.color } as CSSProperties}>
                      {popular && <span className="fsp-pop">MAIS POPULAR</span>}
                      <div className="fsp-card-head">
                        <span className="fsp-plan-ic">{visual.icon}</span>
                        <h2>{plan.name}</h2>
                        <p>{plan.tagline}</p>
                      </div>
                      <div className="fsp-price">
                        {billing === 'monthly' ? (
                          <>
                            <div className="fsp-price-main">{fmtPrice(plan.monthlyPrice)}<span>/mês</span></div>
                            <div className="fsp-price-year">ou {fmtPrice(plan.yearlyPrice)} /ano <em>-17%</em></div>
                          </>
                        ) : (
                          <>
                            <div className="fsp-price-main">{fmtPrice(plan.yearlyPrice / 12)}<span>/mês</span></div>
                            <div className="fsp-price-year">{fmtPrice(plan.yearlyPrice)} /ano à vista <em>-17%</em></div>
                          </>
                        )}
                      </div>
                      <button className="fsp-subscribe" onClick={() => { if (!isActive) subscribe(tier) }} disabled={checkoutTier !== null || isActive}>
                        <CalendarDays size={14} /> {isActive ? 'Seu plano atual' : 'Assinar'}
                      </button>
                      <ul className="fsp-feats">
                        {plan.features.map(feature => (
                          <li key={feature}><Check size={13} strokeWidth={2.6} /><span>{feature}</span></li>
                        ))}
                      </ul>
                    </div>
                  )
                })}

                <div className="fsp-card is-ultimate" style={{ '--pc': '#ffffff' } as CSSProperties}>
                  <span className="fsp-pop fsp-pop-white">EM DESENVOLVIMENTO</span>
                  <div className="fsp-card-head">
                    <span className="fsp-plan-ic"><Gem size={18} strokeWidth={2.2} /></span>
                    <h2>ASTRO Ultimate</h2>
                    <p>A experiência definitiva do Friends Space.</p>
                  </div>
                  <div className="fsp-price">
                    <div className="fsp-price-main" style={{ fontSize: 19 }}>Em breve</div>
                    <div className="fsp-price-year">Novo plano em desenvolvimento</div>
                  </div>
                  <button className="fsp-subscribe" disabled>Em desenvolvimento</button>
                  <ul className="fsp-feats">
                    {ULTIMATE_FEATURES.map(feature => (
                      <li key={feature}><Check size={13} strokeWidth={2.6} /><span>{feature}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            </main>
          </div>

          <div className="fsp-compare">
            <h3>Comparação de planos</h3>
            <div className="fsp-tablewrap">
              <table className="fsp-table">
                <thead>
                  <tr>
                    <th>Recurso</th>
                    <th>Gratuito</th>
                    <th><span className="fsp-thplan" style={{ color: '#38bdf8' }}><span className="fsp-dotc" style={{ background: '#38bdf8' }} />ASTRO</span></th>
                    <th><span className="fsp-thplan" style={{ color: '#a855f7' }}><span className="fsp-dotc" style={{ background: '#a855f7' }} />ASTRO+</span></th>
                    <th><span className="fsp-thplan" style={{ color: '#f59e0b' }}><span className="fsp-dotc" style={{ background: '#f59e0b' }} />ASTRO Plus</span></th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map(row => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{renderCell(row.free)}</td>
                      <td>{renderCell(row.astro)}</td>
                      <td>{renderCell(row.astroplus)}</td>
                      <td>{renderCell(row.astroplus2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="fsp-foot">
            <Lock size={12} />
            <span>Pagamento seguro com o Google Drive</span>
            <span style={{ opacity: .4 }}>|</span>
            <button onClick={() => setSaibaMais(true)}>Como funciona o armazenamento</button>
            <button onClick={() => setSemFidelidade(true)}>Sem fidelidade</button>
            <span className="fsp-flex" />
            <img src={assetUrl('penguin-logo.png')} alt="" className="fsp-foot-pengu" />
            <span>Todos os direitos reservados</span>
            <span className="fsp-beta">BETA</span>
          </footer>
        </div>

        {saibaMais && <SaibaMaisModal onClose={() => setSaibaMais(false)} />}
        {semFidelidade && <SemFidelidadeModal onClose={() => setSemFidelidade(false)} />}
        {checkoutTier && (
          <AstroCheckoutModal
            tier={checkoutTier}
            onClose={() => setCheckoutTier(null)}
            onSuccess={() => setCheckoutTier(null)}
          />
        )}
        {showCancelScreen && (
          <AstroCancelModal
            onClose={() => setShowCancelScreen(false)}
            onCancelled={() => setShowCancelScreen(false)}
          />
        )}
      </div>
    </div>
  )
}
