import { Fa } from '../../utils/fa'
import { assetUrl } from '../../utils/assets'
import { useUserStore } from '../../stores/userStore'
import { getAstroTier } from '../../utils/astro'

export function AstroPromo({ onPlans }: { onPlans?: () => void }) {
  const { currentUser } = useUserStore()
  if (getAstroTier(currentUser) !== 'none') return null
  return (
    <div className="fs-astro">
      <img src={assetUrl('astro-bg.png')} alt="ASTRO" className="fs-astro-bg" />
      <div className="fs-astro-content">
        <div className="fs-astro-title">
          <span>ASTRO</span>
        </div>
        <p>Desbloqueie recursos exclusivos e leve sua experiencia ao maximo.</p>
        <button className="fs-astro-btn" onClick={onPlans}>
          Conhecer planos <Fa name="arrow-right" size={14} />
        </button>
      </div>
    </div>
  )
}
