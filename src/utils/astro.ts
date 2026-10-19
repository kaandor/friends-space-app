export type AstroTier = 'astro' | 'astro_plus' | 'astro_ultimate'
export type AstroTierOrNone = AstroTier | 'none'
export type CallQuality = '480p' | '720p' | '1080p' | '2k' | '4k'

export interface AstroPlanDef {
  tier: AstroTier
  name: string
  shortName: string
  color: string
  badge: string
  tagline: string
  monthlyPrice: number
  yearlyPrice: number
  features: string[]
  maxUploadMB: number
  maxStreamQuality: CallQuality
  maxStreamFps: 30 | 60
  maxBitrateKbps: number
  maxScreenHeight: number
}

export const ASTRO_ORDER: AstroTier[] = ['astro', 'astro_plus', 'astro_ultimate']

export const ASTRO_PLANS: Record<AstroTier, AstroPlanDef> = {
  astro: {
    tier: 'astro',
    name: 'ASTRO',
    shortName: 'ASTRO',
    color: '#22c55e',
    badge: 'ASTRO',
    tagline: 'O essencial para personalizar sua experiencia.',
    monthlyPrice: 4.99,
    yearlyPrice: 49.9,
    maxUploadMB: 250,
    maxStreamQuality: '1080p',
    maxStreamFps: 60,
    maxBitrateKbps: 8000,
    maxScreenHeight: 1080,
    features: [
      'Insígnia ASTRO',
      'Upload de arquivos até 250 MB',
      'Streaming em 1080p / 60 FPS (app desktop)',
      'Banner de perfil personalizado',
      'Avatar animado',
      'Emojis exclusivos',
      'Mais espaço para o "Sobre mim"',
      'Plano de fundo do perfil',
      'Acesso antecipado a alguns recursos',
    ],
  },
  astro_plus: {
    tier: 'astro_plus',
    name: 'ASTRO+',
    shortName: 'ASTRO+',
    color: '#a855f7',
    badge: 'ASTRO+',
    tagline: 'Mais qualidade, mais liberdade e recursos avancados.',
    monthlyPrice: 9.99,
    yearlyPrice: 99.9,
    maxUploadMB: 1024,
    maxStreamQuality: '2k',
    maxStreamFps: 60,
    maxBitrateKbps: 16000,
    maxScreenHeight: 1080,
    features: [
      'Tudo do plano ASTRO',
      'Insígnia ASTRO+',
      'Upload de arquivos até 1 GB',
      'Streaming em 2K / 60 FPS',
      'Compartilhamento de tela em maior qualidade',
      'Biblioteca ampliada de temas',
      'Molduras premium para avatar',
      'Efeitos exclusivos para o perfil',
      'Acesso aos recursos Beta',
      'Acesso antecipado a novos recursos',
    ],
  },
  astro_ultimate: {
    tier: 'astro_ultimate',
    name: 'ASTRO Plus',
    shortName: 'ASTRO Plus',
    color: '#eab308',
    badge: 'ASTRO Plus',
    tagline: 'A experiencia premium definitiva do Friends Space.',
    monthlyPrice: 14.99,
    yearlyPrice: 149.9,
    maxUploadMB: 5120,
    maxStreamQuality: '4k',
    maxStreamFps: 60,
    maxBitrateKbps: 45000,
    maxScreenHeight: 2160,
    features: [
      'Tudo do plano ASTRO+',
      'Insígnia ASTRO Plus',
      'Upload de arquivos até 5 GB',
      'Streaming em 4K / 60 FPS',
      'Perfil totalmente personalizavel',
      'Nome com efeito animado',
      'Efeitos exclusivos em mensagens',
      'Todas as molduras premium',
      'Insígnias exclusivas por tempo de assinatura',
      'Prioridade no acesso a recursos experimentais',
    ],
  },
}

export function getAstroTier(user?: { settings?: Record<string, unknown> } | null): AstroTierOrNone {
  if (!user) return 'none'
  const s = user.settings || {}
  if (s.astro !== true && s.astro !== 'true') return 'none'
  const until = Number(s.astroUntil || 0)
  if (until > 0 && until < Date.now()) return 'none'
  const tier = s.astroTier
  return ASTRO_ORDER.includes(tier as AstroTier) ? (tier as AstroTier) : 'astro'
}

export function getAstroPlan(user?: { settings?: Record<string, unknown> } | null): AstroPlanDef | null {
  const tier = getAstroTier(user)
  return tier === 'none' ? null : ASTRO_PLANS[tier]
}

export function getMaxUploadMB(user?: { settings?: Record<string, unknown> } | null): number {
  return getAstroPlan(user)?.maxUploadMB ?? 25
}

// Bloqueio do plano: retorna mensagem de erro se o arquivo exceder o limite de
// upload do plano do usuario. Null = pode enviar.
export function assertUploadLimit(user?: { settings?: Record<string, unknown> } | null, fileSizeBytes?: number): string | null {
  if (!fileSizeBytes) return null
  const maxMB = getMaxUploadMB(user)
  const maxBytes = maxMB * 1024 * 1024
  if (fileSizeBytes > maxBytes) {
    const plan = getAstroTier(user)
    const planName = plan === 'none' ? 'grátis' : ASTRO_PLANS[plan].shortName
    return `Arquivo muito grande (máx. ${maxMB} MB no plano ${planName}). Assine ASTRO para enviar arquivos maiores.`
  }
  return null
}

export const FREE_SERVER_LIMIT = 2
export const ASTRO_SERVER_LIMIT = 10
export const ASTRO_PLUS_SERVER_LIMIT = 20

export function getServerLimit(user?: { settings?: Record<string, unknown> } | null): number {
  const tier = getAstroTier(user)
  if (tier === 'none') return FREE_SERVER_LIMIT
  if (tier === 'astro_ultimate') return Infinity
  if (tier === 'astro_plus') return ASTRO_PLUS_SERVER_LIMIT
  return ASTRO_SERVER_LIMIT
}

const QUALITY_ORDER: CallQuality[] = ['480p', '720p', '1080p', '2k', '4k']

// Nome amigavel do plano do usuario (para exibicao na transmicao / debug).
export function getStreamPlanLabel(user?: { settings?: Record<string, unknown> } | null): { label: string; color: string } {
  const tier = getAstroTier(user)
  if (tier === 'none') return { label: 'Gratuito', color: '#80848e' }
  const plan = ASTRO_PLANS[tier]
  return { label: plan.shortName, color: plan.color }
}

// Retorna true se o bitrate excede o limite do plano (para travar com cadeado).
export function isBitrateBlocked(user?: { settings?: Record<string, unknown> } | null, kbps?: number): boolean {
  if (!kbps) return false
  return kbps > getMaxBitrateKbps(user)
}

// Retorna true se o fps excede o limite do plano.
export function isFpsBlocked(user?: { settings?: Record<string, unknown> } | null, fps?: 30 | 60): boolean {
  if (!fps) return false
  return fps > getMaxStreamFps(user)
}

// App desktop (Electron) x navegador: o Chrome limita captura a 720p30,
// entao 1080p/2k/60fps sao exclusivos do app. No navegador o teto e sempre
// 720p30 (gratuito ou pago); no app vale o teto do plano.
export function isDesktopApp(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron)
  } catch { return false }
}

// Retorna a maior qualidade de stream que o plano do usuario permite.
export function getMaxStreamQuality(user?: { settings?: Record<string, unknown> } | null): CallQuality {
  const q = getAstroPlan(user)?.maxStreamQuality ?? '720p'
  if (!isDesktopApp() && QUALITY_ORDER.indexOf(q) > QUALITY_ORDER.indexOf('720p')) return '720p'
  return q
}

// Retorna o maior fps de stream permitido.
export function getMaxStreamFps(user?: { settings?: Record<string, unknown> } | null): 30 | 60 {
  const f = getAstroPlan(user)?.maxStreamFps ?? 30
  if (!isDesktopApp() && f > 30) return 30
  return f
}

// Retorna o bitrate maximo de envio do plano (kbps). Free = adequado p/ 720p.
export function getMaxBitrateKbps(user?: { settings?: Record<string, unknown> } | null): number {
  const b = getAstroPlan(user)?.maxBitrateKbps ?? 6000
  return isDesktopApp() ? b : Math.min(b, 6000)
}

// Bloqueia selecao de qualidade acima do plano. Retorna a qualidade permitida.
export function clampStreamQuality(user?: { settings?: Record<string, unknown> } | null, quality?: CallQuality): CallQuality {
  const max = getMaxStreamQuality(user)
  if (!quality) return max
  const allowedIdx = QUALITY_ORDER.indexOf(max)
  const chosenIdx = QUALITY_ORDER.indexOf(quality)
  return chosenIdx <= allowedIdx ? quality : max
}

// Bloqueia selecao de fps acima do plano.
export function clampStreamFps(user?: { settings?: Record<string, unknown> } | null, fps?: 30 | 60): 30 | 60 {
  const max = getMaxStreamFps(user)
  return fps && fps <= max ? fps : max
}

// Retorna true se a qualidade excede o limite do plano.
export function isQualityBlocked(user?: { settings?: Record<string, unknown> } | null, quality?: CallQuality): boolean {
  if (!quality) return false
  const max = getMaxStreamQuality(user)
  return QUALITY_ORDER.indexOf(quality) > QUALITY_ORDER.indexOf(max)
}
