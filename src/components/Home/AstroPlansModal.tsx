import { useEffect, useState, type ReactNode } from 'react'
import { ASTRO_PLANS, ASTRO_ORDER, getAstroTier, type AstroTier } from '../../utils/astro'
import { useUserStore } from '../../stores/userStore'
import { assetUrl } from '../../utils/assets'
import { AstroCheckoutModal } from './AstroCheckoutModal'
import { AstroCancelModal } from './AstroCancelModal'

interface AstroPlansModalProps {
  onClose: () => void
  onSubscribe?: (tier: AstroTier) => Promise<void> | void
}

const GREEN = '#4ade80'
const PURPLE = '#a855f7'
const AMBER = '#f59e0b'

const PLAN_VISUAL: Record<AstroTier, { color: string; border: string; btnClass: string }> = {
  astro: { color: GREEN, border: '#2a4a2a', btnClass: 'fs-astro-btn-green' },
  astro_plus: { color: PURPLE, border: '#3a1a6a', btnClass: 'fs-astro-btn-purple' },
  astro_ultimate: { color: AMBER, border: '#4a3a0a', btnClass: 'fs-astro-btn-amber' },
}

const COMPARE_ROWS: Array<{ label: string; free: string | boolean; astro: string | boolean; astroplus: string | boolean; astroplus2: string | boolean }> = [
  { label: 'Upload de arquivos', free: 'Até 25 MB', astro: 'Até 250 MB', astroplus: 'Até 1 GB', astroplus2: 'Até 5 GB' },
  { label: 'Streaming', free: '480p / 30 FPS', astro: '1080p / 60 FPS', astroplus: '2K / 60 FPS', astroplus2: '2K / 60 FPS' },
  { label: 'Molduras premium', free: false, astro: false, astroplus: true, astroplus2: true },
  { label: 'Recursos Beta', free: false, astro: false, astroplus: true, astroplus2: true },
]

type Billing = 'monthly' | 'yearly'

function Check() {
  return (
    <svg className="fs-astro-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function X() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function Cloud({ size = 16, color = '#9ca3af' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
    </svg>
  )
}

function Shield({ size = 14, color = GREEN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function Zap({ size = 14, color = GREEN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function Folder({ size = 14, color = GREEN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function Lock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function InfoItem({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="fs-astro-infoitem">
      <span className="fs-astro-infoicon">{icon}</span>
      <span className="fs-astro-infotext">{text}</span>
    </div>
  )
}

function renderCell(value: string | boolean) {
  if (value === true) return <Check />
  if (value === false) return <span style={{ color: 'var(--text-muted)' }}>–</span>
  return <>{value}</>
}

function SaibaMaisModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fs-astro-overlay" style={{ zIndex: 3700 }} onClick={onClose}>
      <div className="fs-astro-modal" style={{ maxWidth: 512 }} onClick={e => e.stopPropagation()}>
        <div className="fs-astro-modalhead">
          <div className="fs-astro-modaltitle">
            <Cloud size={18} color={GREEN} />
            <span>Como funciona o armazenamento</span>
          </div>
          <button className="fs-astro-modalx" onClick={onClose} aria-label="Fechar"><X /></button>
        </div>
        <div className="fs-astro-modalbody">
          <div className="fs-astro-modalitem">
            <div className="fs-astro-modalicon" style={{ background: 'rgba(74,222,128,0.1)' }}>
              <Cloud size={15} color={GREEN} />
            </div>
            <div>
              <p className="fs-astro-modaltitle2">Seus arquivos ficam no seu Google Drive</p>
              <p className="fs-astro-modalp">
                O Friends Space <b style={{ color: 'var(--text-primary)' }}>não armazena</b> seus arquivos em servidores próprios. Tudo que você envia vai diretamente para uma pasta chamada{' '}
                <b style={{ color: GREEN }}>"Friends Space"</b> no seu próprio Google Drive.
              </p>
            </div>
          </div>
          <div className="fs-astro-modalitem">
            <div className="fs-astro-modalicon" style={{ background: 'rgba(168,85,247,0.1)' }}>
              <Zap size={15} color={PURPLE} />
            </div>
            <div>
              <p className="fs-astro-modaltitle2">Space Ultra Transfer</p>
              <p className="fs-astro-modalp">
                Nossa tecnologia de transferência comprime, fragmenta e envia seus arquivos em paralelo, chegando a ser{' '}
                <b style={{ color: 'var(--text-primary)' }}>até 10x mais rápido</b> que um upload convencional ao Google Drive.
              </p>
            </div>
          </div>
          <div className="fs-astro-modalitem">
            <div className="fs-astro-modalicon" style={{ background: 'rgba(245,158,11,0.1)' }}>
              <Shield size={15} color={AMBER} />
            </div>
            <div>
              <p className="fs-astro-modaltitle2">Privacidade total</p>
              <p className="fs-astro-modalp">
                Como os arquivos ficam no <b style={{ color: 'var(--text-primary)' }}>seu Google Drive</b>, só você (e quem você autorizar) tem acesso.
              </p>
            </div>
          </div>
        </div>
        <div className="fs-astro-modalfoot">
          <button className="fs-astro-btn-green" style={{ width: '100%', padding: '10px 0', borderRadius: 12, fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer' }} onClick={onClose}>
            Entendi
          </button>
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
            <Lock />
            <span>Sem fidelidade</span>
          </div>
          <button className="fs-astro-modalx" onClick={onClose} aria-label="Fechar"><X /></button>
        </div>
        <div className="fs-astro-modalbody">
          <p className="fs-astro-modalp" style={{ margin: 0 }}>
            Você pode cancelar quando quiser, sem multa e sem burocracia. A assinatura permanece ativa até o final do período já pago.
          </p>
        </div>
        <div className="fs-astro-modalfoot">
          <button className="fs-astro-btn-green" style={{ width: '100%', padding: '10px 0', borderRadius: 12, fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer' }} onClick={onClose}>
            Entendi
          </button>
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
    <div className="fs-astro-overlay" style={{ zIndex: 3500 }} onClick={onClose}>
      <div className="fs-astro-page" onClick={e => e.stopPropagation()}>
        <style>{`
          .fs-astro-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.75); padding: 16px; }
          .fs-astro-page { position: relative; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 1152px; max-height: 94vh; overflow-y: auto; box-shadow: 0 20px 80px rgba(0,0,0,0.7); }

          .fs-astro-hero { position: relative; height: 220px; overflow: hidden; border-top-left-radius: 16px; border-top-right-radius: 16px; }
          @media (max-width: 640px) { .fs-astro-hero { height: 280px; } }
          .fs-astro-herobg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; z-index: 0; }
          .fs-astro-herograd { position: absolute; inset: 0; background: linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 50%, transparent 100%); z-index: 1; }
          .fs-astro-herofade { position: absolute; bottom: 0; left: 0; right: 0; height: 60px; background: linear-gradient(to top, var(--bg-tertiary) 0%, transparent 100%); z-index: 1; }
          .fs-astro-herochars { position: absolute; bottom: 0; right: 0; height: 100%; object-fit: contain; object-position: bottom right; z-index: 2; }
          .fs-astro-herotitle { position: absolute; top: 36px; left: 36px; z-index: 3; display: flex; align-items: center; gap: 12px; }
          .fs-astro-herotitle span { color: ${GREEN}; font-weight: 900; letter-spacing: -0.025em; font-size: 36px; line-height: 1; }
          .fs-astro-herosub { position: absolute; top: 102px; left: 36px; z-index: 3; color: var(--text-primary); font-size: 14px; line-height: 1.375; margin: 0; }
          .fs-astro-herotabs { position: absolute; top: 148px; left: 36px; z-index: 3; display: flex; flex-wrap: wrap; gap: 8px; max-width: calc(100% - 72px); }
          .fs-astro-herox { position: absolute; top: 18px; right: 18px; z-index: 4; color: rgba(255,255,255,0.6); background: none; border: none; cursor: pointer; padding: 4px; display: flex; transition: color .15s; }
          .fs-astro-herox:hover { color: #fff; }

          .fs-astro-btn-green { background: ${GREEN}; color: #000; }
          .fs-astro-btn-green:hover { background: #22c55e; }
          .fs-astro-btn-purple { background: ${PURPLE}; color: #fff; }
          .fs-astro-btn-purple:hover { background: #9333ea; }
          .fs-astro-btn-amber { background: ${AMBER}; color: #000; }
          .fs-astro-btn-amber:hover { background: #d97706; }

          .fs-astro-tab { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.4); color: var(--text-secondary); white-space: nowrap; cursor: pointer; transition: all .15s; }
          .fs-astro-tab:hover { border-color: rgba(255,255,255,0.5); color: #fff; }
          .fs-astro-tab.fs-astro-tab-active { background: rgba(74,222,128,0.2); border-color: ${GREEN}; color: ${GREEN}; }

          .fs-astro-body { display: flex; flex-direction: column; gap: 0; padding: 20px 28px 24px; }
          @media (min-width: 1024px) { .fs-astro-body { flex-direction: row; } }
          .fs-astro-side { width: 100%; display: flex; flex-direction: column; gap: 16px; padding-right: 0; margin-bottom: 24px; }
          @media (min-width: 1024px) { .fs-astro-side { width: 220px; flex-shrink: 0; padding-right: 20px; margin-bottom: 0; } }
          .fs-astro-sidetitle { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
          .fs-astro-sidetitle h3 { color: var(--text-primary); font-weight: 700; font-size: 14px; margin: 0; }
          .fs-astro-sidep { color: var(--text-muted); font-size: 12px; line-height: 1.625; margin: 0; }
          .fs-astro-infoitems { display: flex; flex-direction: column; gap: 8px; }
          .fs-astro-infoitem { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--text-secondary); }
          .fs-astro-infoicon { flex-shrink: 0; margin-top: 2px; display: flex; }
          .fs-astro-infotext { line-height: 1.375; }
          .fs-astro-about { background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; }
          .fs-astro-abouttitle { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
          .fs-astro-abouttitle span { color: var(--text-primary); font-weight: 700; font-size: 12px; }
          .fs-astro-saibamais { background: none; border: none; padding: 0; color: ${GREEN}; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; text-align: left; }
          .fs-astro-saibamais:hover { text-decoration: underline; }

          .fs-astro-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
          .fs-astro-subrow { display: grid; grid-template-columns: 1fr; gap: 12px; }
          @media (min-width: 640px) { .fs-astro-subrow { grid-template-columns: 1fr 1fr 1fr; } }
          .fs-astro-subscribe { width: 100%; transition: background .15s; }
          .fs-astro-cards { display: grid; grid-template-columns: 1fr; gap: 16px; }
          @media (min-width: 640px) { .fs-astro-cards { grid-template-columns: 1fr 1fr 1fr; } }
          .fs-astro-card { position: relative; display: flex; flex-direction: column; gap: 16px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
          .fs-astro-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: ${PURPLE}; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 12px; border-radius: 999px; white-space: nowrap; }
          .fs-astro-cardhead { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; padding-top: 8px; }
          .fs-astro-cardhead img { object-fit: contain; }
          .fs-astro-cardhead h2 { font-weight: 900; font-size: 20px; margin: 0; }
          .fs-astro-cardhead p { color: var(--text-muted); font-size: 12px; line-height: 1.375; margin: 0; }
          .fs-astro-price { text-align: center; }
          .fs-astro-price > div:first-child { color: var(--text-primary); font-weight: 900; font-size: 24px; }
          .fs-astro-price > div:first-child span { color: var(--text-muted); font-weight: 400; font-size: 14px; }
          .fs-astro-priceyear { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 4px; }
          .fs-astro-priceyear span:first-child { color: var(--text-muted); font-size: 12px; }
          .fs-astro-discount { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--text-primary); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; }
          .fs-astro-features { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
          .fs-astro-features li { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--text-secondary); }
          .fs-astro-check { flex-shrink: 0; margin-top: 2px; }

          .fs-astro-compare { padding: 0 28px 28px; }
          .fs-astro-compare h3 { color: var(--text-primary); font-weight: 700; font-size: 16px; margin: 0 0 16px 0; }
          .fs-astro-tablewrap { overflow-x: auto; }
          .fs-astro-table { width: 100%; border-collapse: collapse; min-width: 640px; }
          .fs-astro-th-label { text-align: left; color: var(--text-muted); font-weight: 600; padding: 0 16px 12px 0; width: 160px; border-bottom: 1px solid var(--border); }
          .fs-astro-th { text-align: center; color: var(--text-muted); font-weight: 600; padding: 0 8px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
          .fs-astro-th .fs-astro-thlogo { display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-weight: 700; }
          .fs-astro-td-label { color: var(--text-secondary); padding: 12px 16px 12px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
          .fs-astro-td { text-align: center; color: var(--text-secondary); padding: 12px 8px; border-bottom: 1px solid var(--border); font-size: 13px; white-space: nowrap; }

          .fs-astro-foot { border-top: 1px solid var(--border); padding: 16px 28px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-muted); font-size: 12px; flex-wrap: wrap; }
          .fs-astro-foot button { background: none; border: none; padding: 0; color: ${GREEN}; font-weight: 600; cursor: pointer; }
          .fs-astro-foot button:hover { text-decoration: underline; }

          .fs-astro-modal { position: relative; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 16px; width: 100%; overflow: hidden; }
          .fs-astro-modalhead { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border); }
          .fs-astro-modaltitle { display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-weight: 700; font-size: 14px; }
          .fs-astro-modalx { color: var(--text-muted); background: none; border: none; cursor: pointer; display: flex; padding: 4px; transition: color .15s; }
          .fs-astro-modalx:hover { color: var(--text-primary); }
          .fs-astro-modalbody { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }
          .fs-astro-modalitem { display: flex; gap: 12px; }
          .fs-astro-modalicon { flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
          .fs-astro-modaltitle2 { color: var(--text-primary); font-size: 12px; font-weight: 700; margin: 0 0 4px 0; }
          .fs-astro-modalp { color: var(--text-muted); font-size: 12px; line-height: 1.625; margin: 0; }
          .fs-astro-modalfoot { padding: 0 24px 20px; }
          .fs-astro-cancelbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.35); border-radius: 12px; padding: 10px 14px; flex-wrap: wrap; }
          .fs-astro-cancelbar p { margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
          .fs-astro-cancelbar b { color: var(--text-primary); }
          .fs-astro-cancel-actions { display: flex; gap: 8px; flex-shrink: 0; }
          .fs-astro-cancel-btn { background: #ef4444; color: #fff; border: none; border-radius: 10px; padding: 8px 14px; font-weight: 700; font-size: 12px; cursor: pointer; white-space: nowrap; }
          .fs-astro-cancel-btn:hover { background: #dc2626; }
        `}</style>

        <div className="fs-astro-hero">
          <img src={assetUrl('astro-bg.png')} alt="" className="fs-astro-herobg" />
          <div className="fs-astro-herograd" />
          <div className="fs-astro-herofade" />
          <img src={assetUrl('astro-chars.png')} alt="" className="fs-astro-herochars" />

          <div className="fs-astro-herotitle">
            <img src={assetUrl('astro-logo.png')} alt="" height={42} style={{ objectFit: 'contain', width: 'auto' }} />
            <span>ASTRO</span>
          </div>
          <p className="fs-astro-herosub">Recursos exclusivos para turbinar sua experiência no Friends Space.</p>
          <div className="fs-astro-herotabs" role="tablist" aria-label="Período de cobrança">
            {(['monthly', 'yearly'] as const).map(b => (
              <button
                key={b}
                role="tab"
                aria-selected={billing === b}
                className={`fs-astro-tab ${billing === b ? 'fs-astro-tab-active' : ''}`}
                onClick={() => setBilling(b)}
              >
                {b === 'monthly' ? 'Mensal' : 'Anual −17%'}
              </button>
            ))}
          </div>
          <button className="fs-astro-herox" onClick={onClose} aria-label="Fechar"><X /></button>
        </div>

        <div className="fs-astro-body">
          <div className="fs-astro-side">
            <div>
              <div className="fs-astro-sidetitle">
                <Cloud />
                <h3>Seus arquivos, seu Google Drive</h3>
              </div>
              <p className="fs-astro-sidep">
                O Friends Space não armazena seus arquivos em servidores próprios e não possui banco de dados dedicado para mídias.
              </p>
            </div>
            <p className="fs-astro-sidep">
              Utilizamos o <b style={{ color: GREEN }}>Space Ultra Transfer</b>, nosso sistema de transferência de alta velocidade, que envia seus arquivos diretamente para o seu Google Drive com segurança.
            </p>
            <div className="fs-astro-infoitems">
              <InfoItem icon={<Cloud size={14} color={GREEN} />} text="Arquivos armazenados no seu Google Drive" />
              <InfoItem icon={<Shield />} text="Sua privacidade é 100% garantida" />
              <InfoItem icon={<Zap />} text="Transferências até 10x mais rápidas" />
              <InfoItem icon={<Folder />} text='Pasta "Friends Space" criada automaticamente no seu Google Drive' />
            </div>
            <div className="fs-astro-about">
              <div className="fs-astro-abouttitle">
                <Zap size={13} color={AMBER} />
                <span>Sobre os planos ASTRO</span>
              </div>
              <p className="fs-astro-sidep" style={{ margin: 0 }}>
                Os planos não aumentam o armazenamento do seu Google Drive. Eles apenas aumentam os limites de envio de arquivos e compartilham através do sistema do Friends Space.
              </p>
              <button className="fs-astro-saibamais" onClick={() => setSaibaMais(true)}>
                Saiba mais sobre como funciona
                <ArrowRight />
              </button>
            </div>
          </div>

          <div className="fs-astro-main">
            {activeTier !== 'none' && (
              <div className="fs-astro-cancelbar">
                <p>
                  <b>Plano atual: {ASTRO_PLANS[activeTier].name}</b>
                  {' — cancele quando quiser. Ao cancelar, o tema do site volta para o gratuito e os recursos premium saem na hora.'}
                </p>
                <div className="fs-astro-cancel-actions">
                  <button className="fs-astro-cancel-btn" onClick={() => setShowCancelScreen(true)}>Cancelar assinatura</button>
                </div>
              </div>
            )}
            <div className="fs-astro-subrow">
              {ASTRO_ORDER.map(tier => {
                const plan = ASTRO_PLANS[tier]
                const visual = PLAN_VISUAL[tier]
                const isActive = activeTier === tier
                return (
                  <button
                    key={tier}
                    className={`fs-astro-subscribe ${visual.btnClass}`}
                    onClick={() => { if (!isActive) subscribe(tier) }}
                    disabled={checkoutTier !== null || isActive}
                    style={{ padding: '12px 0', borderRadius: 12, fontWeight: 800, fontSize: 14, border: 'none', cursor: checkoutTier !== null || isActive ? 'default' : 'pointer', opacity: isActive ? 0.75 : 1 }}
                  >
                    {isActive ? 'Seu plano atual' : `Assinar ${plan.name}`}
                  </button>
                )
              })}
            </div>

            <div className="fs-astro-cards">
              {ASTRO_ORDER.map(tier => {
                const plan = ASTRO_PLANS[tier]
                const visual = PLAN_VISUAL[tier]
                const popular = tier === 'astro_plus'
                return (
                  <div key={tier} className="fs-astro-card" style={{ borderColor: popular ? PURPLE : visual.border }}>
                    {popular && <div className="fs-astro-badge">MAIS POPULAR</div>}
                    <div className="fs-astro-cardhead">
                      <img src={assetUrl('astro-logo.png')} alt={plan.name} height={36} style={{ objectFit: 'contain', width: 'auto' }} />
                      <h2 style={{ color: visual.color }}>{plan.name}</h2>
                      <p>{plan.tagline}</p>
                    </div>
                    <div className="fs-astro-price">
                      <div>
                        {billing === 'monthly'
                          ? <>{fmtPrice(plan.monthlyPrice)} <span>/mês</span></>
                          : <>{fmtPrice(plan.yearlyPrice / 12)} <span>/mês</span></>}
                      </div>
                      <div className="fs-astro-priceyear">
                        {billing === 'monthly'
                          ? <><span>ou {fmtPrice(plan.yearlyPrice)} /ano</span><span className="fs-astro-discount">-17%</span></>
                          : <><span>{fmtPrice(plan.yearlyPrice)} /ano à vista</span><span className="fs-astro-discount">-17%</span></>}
                      </div>
                    </div>
                    <ul className="fs-astro-features">
                      {plan.features.map((feature) => (
                        <li key={feature}>
                          <Check />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="fs-astro-compare">
          <h3>Comparação de planos</h3>
          <div className="fs-astro-tablewrap">
            <table className="fs-astro-table">
              <thead>
                <tr>
                  <th className="fs-astro-th-label">Recurso</th>
                  <th className="fs-astro-th">Gratuito</th>
                  <th className="fs-astro-th"><span className="fs-astro-thlogo" style={{ color: GREEN }}><img src={assetUrl('astro-logo.png')} height={16} style={{ objectFit: 'contain', width: 'auto' }} alt="" />ASTRO</span></th>
                  <th className="fs-astro-th"><span className="fs-astro-thlogo" style={{ color: PURPLE }}><img src={assetUrl('astro-logo.png')} height={16} style={{ objectFit: 'contain', width: 'auto' }} alt="" />ASTRO+</span></th>
                  <th className="fs-astro-th"><span className="fs-astro-thlogo" style={{ color: AMBER }}><img src={assetUrl('astro-logo.png')} height={16} style={{ objectFit: 'contain', width: 'auto' }} alt="" />ASTRO Plus</span></th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className="fs-astro-td-label">{row.label}</td>
                    <td className="fs-astro-td" style={{ color: '#9ca3af' }}>{renderCell(row.free)}</td>
                    <td className="fs-astro-td">{renderCell(row.astro)}</td>
                    <td className="fs-astro-td">{renderCell(row.astroplus)}</td>
                    <td className="fs-astro-td">{renderCell(row.astroplus2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fs-astro-foot">
          <Lock />
          <span>Pagamento seguro. Cancele quando quiser. </span>
          <button onClick={() => setSemFidelidade(true)}>Sem fidelidade.</button>
        </div>
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
  )
}
