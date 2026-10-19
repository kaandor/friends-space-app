import { useEffect, useState, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import { ASTRO_PLANS, getAstroTier, type AstroTier } from '../../utils/astro'
import { useUserStore } from '../../stores/userStore'
import { assetUrl } from '../../utils/assets'
import { AstroCheckoutModal } from './AstroCheckoutModal'

interface AstroPlansModalProps {
  onClose: () => void
  onSubscribe?: (tier: AstroTier) => Promise<void> | void
}

const CARD_OVERLAYS: Array<{ tier: AstroTier; left: number; width: number }> = [
  { tier: 'astro', left: 28.84, width: 16.39 },
  { tier: 'astro_plus', left: 46.69, width: 16.64 },
  { tier: 'astro_ultimate', left: 64.54, width: 16.88 },
]

const OLD_PRICES: Record<AstroTier, string> = {
  astro: 'R$ 14,90',
  astro_plus: 'R$ 24,90',
  astro_ultimate: 'R$ 39,90',
}

const BUTTON_COLORS: Record<AstroTier, string> = {
  astro: '#38bdf8',
  astro_plus: '#a855f7',
  astro_ultimate: '#f59e0b',
}

export function AstroPlansModal({ onClose, onSubscribe }: AstroPlansModalProps) {
  const { currentUser } = useUserStore()
  const [checkoutTier, setCheckoutTier] = useState<AstroTier | null>(null)
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
    <div className="fsp-art-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <style>{`
        .fsp-art-overlay { position: fixed; inset: 0; z-index: 3500; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(2,4,12,.82); backdrop-filter: blur(8px); }
        .fsp-art-modal { position: relative; width: min(1520px, 96vw, calc((94vh - 44px) * 1.7246)); padding: 12px; border-radius: 24px; border: 1px solid rgba(120,170,255,.28); background: #030816 url('${assetUrl('astro-wallpaper.webp')}') center/cover no-repeat; box-shadow: 0 30px 120px rgba(0,0,0,.85); box-sizing: border-box; }
        .fsp-art-frame { position: relative; width: 100%; container-type: inline-size; }
        .fsp-art-frame > img { display: block; width: 100%; height: auto; border-radius: 16px; user-select: none; filter: drop-shadow(0 18px 55px rgba(0,0,0,.5)); }
        .fsp-art-close { position: absolute; top: 10.2%; right: 2.1%; display: flex; align-items: center; justify-content: center; width: 2.4cqw; height: 2.4cqw; min-width: 26px; min-height: 26px; border-radius: 50%; border: 1px solid rgba(255,255,255,.3); background: rgba(8,17,35,.72); color: rgba(255,255,255,.85); cursor: pointer; transition: all .15s; z-index: 3; }
        .fsp-art-close:hover { background: rgba(255,255,255,.16); color: #fff; }
        .fsp-art-close svg { width: 1.1cqw; height: 1.1cqw; min-width: 14px; min-height: 14px; }
        .fsp-pricecard { position: absolute; top: 25.6%; height: 11.2%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #fff; padding: 0 .45cqw; box-sizing: border-box; z-index: 2; }
        .fsp-oldprice { font-size: .7cqw; line-height: 1.1; color: #8fa0c4; margin-bottom: .06cqw; }
        .fsp-oldprice s { color: #fca5a5; opacity: .85; }
        .fsp-newprice { font-size: 1.84cqw; font-weight: 900; line-height: 1; letter-spacing: -.01em; }
        .fsp-newprice span { font-size: .77cqw; font-weight: 600; color: #cbd5e1; margin-left: .3cqw; }
        .fsp-yearprice { font-size: .76cqw; line-height: 1.2; color: #cbd5e1; margin-top: .08cqw; }
        .fsp-yearprice em { font-style: normal; background: #1d4ed8; color: #dbeafe; border-radius: 999px; padding: .07cqw .24cqw; font-size: .54cqw; font-weight: 800; margin-left: .16cqw; }
        .fsp-buy { display: flex; align-items: center; justify-content: center; width: calc(100% - .7cqw); height: 1.72cqw; min-height: 22px; margin-top: .22cqw; border: none; border-radius: .3cqw; background: var(--pc); color: #06101f; font-weight: 900; font-size: .8cqw; cursor: pointer; transition: filter .15s; }
        .fsp-buy:hover { filter: brightness(1.08); }
        .fsp-buy.is-active { background: transparent; border: 1px solid color-mix(in srgb, var(--pc) 70%, transparent); color: var(--pc); cursor: default; }
      `}</style>
      <div className="fsp-art-modal">
        <div className="fsp-art-frame">
          <img src={assetUrl('astro-art.webp')} alt="Planos ASTRO do Friends Space" draggable={false} />
          <button className="fsp-art-close" onClick={onClose} aria-label="Fechar"><X /></button>
          {CARD_OVERLAYS.map(({ tier, left, width }) => {
            const plan = ASTRO_PLANS[tier]
            const isActive = activeTier === tier
            return (
              <div
                key={tier}
                className="fsp-pricecard"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <div className="fsp-oldprice">de <s>{OLD_PRICES[tier]}</s></div>
                <div className="fsp-newprice">{fmtPrice(plan.monthlyPrice)}<span>/mês</span></div>
                <div className="fsp-yearprice">ou {fmtPrice(plan.yearlyPrice)} /ano <em>-17%</em></div>
                <button
                  className={`fsp-buy${isActive ? ' is-active' : ''}`}
                  style={{ '--pc': BUTTON_COLORS[tier] } as CSSProperties}
                  disabled={isActive}
                  onClick={() => { if (!isActive) subscribe(tier) }}
                >
                  {isActive ? 'Seu plano atual' : 'Assinar'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
      {checkoutTier && (
        <AstroCheckoutModal
          tier={checkoutTier}
          onClose={() => setCheckoutTier(null)}
          onSuccess={() => setCheckoutTier(null)}
        />
      )}
    </div>
  )
}

