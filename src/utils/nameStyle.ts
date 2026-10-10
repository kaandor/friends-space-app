import { getAstroTier } from './astro'

export const NAME_COLORS = [
  { id: 'default', label: 'Padrão', color: '' },
  { id: 'green', label: 'Verde', color: '#4ade80' },
  { id: 'gold', label: 'Dourado', color: '#f7d774' },
  { id: 'pink', label: 'Rosa', color: '#f9a8d4' },
  { id: 'blue', label: 'Azul', color: '#93c5fd' },
  { id: 'purple', label: 'Roxo', color: '#d8b4fe' },
  { id: 'red', label: 'Vermelho', color: '#f87171' },
  { id: 'cyan', label: 'Ciano', color: '#67e8f9' },
]

export type NameEffect = 'none' | 'shine' | 'neon'

interface NameUser {
  id?: string
  name?: string
  settings?: Record<string, unknown>
}

// Cor do nome (só vale para assinantes; gratuito sempre padrão)
export function nameColorOf(user: NameUser | null | undefined): string {
  if (!user || getAstroTier(user as { settings?: Record<string, unknown> }) === 'none') return ''
  const c = NAME_COLORS.find(x => x.id === String(user.settings?.nameColor || 'default'))
  return c?.color || ''
}

export function nameEffectOf(user: NameUser | null | undefined): NameEffect {
  if (!user || getAstroTier(user as { settings?: Record<string, unknown> }) === 'none') return 'none'
  const e = String(user.settings?.nameEffect || 'none')
  return e === 'shine' || e === 'neon' ? e : 'none'
}

// Emblema Astro ao lado do nome (assinante que não desativou)
export function hasAstroBadge(user: NameUser | null | undefined): boolean {
  if (!user || getAstroTier(user as { settings?: Record<string, unknown> }) === 'none') return false
  return user.settings?.astroBadge !== false
}

export function nameStyleOf(user: NameUser | null | undefined): React.CSSProperties {
  const color = nameColorOf(user)
  const effect = nameEffectOf(user)
  if (effect === 'neon' && color) return { color, textShadow: `0 0 8px ${color}, 0 0 18px ${color}55` }
  if (color) return { color }
  return {}
}

export function nameClassOf(user: NameUser | null | undefined): string {
  return nameEffectOf(user) === 'shine' ? 'fs-name-shine' : ''
}
