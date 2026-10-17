import type { AstroTier } from '../../../utils/astro'

export type Plan = 'free' | 'astro' | 'astroPlus' | 'astroPlusGold'

export type CatalogKind = 'nameplate' | 'avatar' | 'frame' | 'effect'

export interface CatalogItem {
  id: string
  name: string
  kind: CatalogKind
  detail: string
  plans: Plan[]
}

export const TIER_TO_PLAN: Record<AstroTier | 'none', Plan> = {
  none: 'free',
  astro: 'astro',
  astro_plus: 'astroPlus',
  astro_ultimate: 'astroPlusGold',
}

export const DECORATIONS: CatalogItem[] = [
  { id: 'none', name: 'Nenhuma', kind: 'avatar', detail: 'Sem decoração', plans: ['free', 'astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'pulsar', name: 'Pulsar', kind: 'avatar', detail: 'Exclusivo do ASTRO', plans: ['astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'aurora', name: 'Aurora', kind: 'avatar', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'nebulosa', name: 'Nebulosa', kind: 'avatar', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'estelar', name: 'Estelar', kind: 'avatar', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'supernova', name: 'Supernova', kind: 'avatar', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'galaxia', name: 'Galáxia', kind: 'avatar', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'infinito', name: 'Infinito', kind: 'avatar', detail: 'Exclusivo do ASTRO PLUS', plans: ['astroPlusGold'] },
]

export const NAMEPLATES: CatalogItem[] = [
  { id: 'none', name: 'Nenhuma', kind: 'nameplate', detail: 'Sem placa', plans: ['free', 'astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'astro', name: 'Astro', kind: 'nameplate', detail: 'Exclusivo do ASTRO', plans: ['astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'orbita', name: 'Órbita', kind: 'nameplate', detail: 'Exclusivo do ASTRO', plans: ['astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'cometa', name: 'Cometa', kind: 'nameplate', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'aurora', name: 'Aurora', kind: 'nameplate', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'nebulosa', name: 'Nebulosa', kind: 'nameplate', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'galaxia', name: 'Galáxia', kind: 'nameplate', detail: 'Exclusivo do ASTRO PLUS', plans: ['astroPlusGold'] },
  { id: 'infinito', name: 'Infinito', kind: 'nameplate', detail: 'Exclusivo do ASTRO PLUS', plans: ['astroPlusGold'] },
]

export const PROFILE_FRAMES: CatalogItem[] = [
  { id: 'none', name: 'Nenhuma', kind: 'frame', detail: 'Sem moldura', plans: ['free', 'astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'brilho', name: 'Brilho', kind: 'frame', detail: 'Exclusivo do ASTRO', plans: ['astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'pulsar', name: 'Pulsar', kind: 'frame', detail: 'Exclusivo do ASTRO', plans: ['astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'aurora', name: 'Aurora', kind: 'frame', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'nebulosa', name: 'Nebulosa', kind: 'frame', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'galaxia', name: 'Galáxia', kind: 'frame', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'infinito', name: 'Infinito', kind: 'frame', detail: 'Exclusivo do ASTRO PLUS', plans: ['astroPlusGold'] },
]

export const PROFILE_EFFECTS: CatalogItem[] = [
  { id: 'none', name: 'Nenhum', kind: 'effect', detail: 'Sem efeito', plans: ['free', 'astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'estrelas', name: 'Estrelas', kind: 'effect', detail: 'Exclusivo do ASTRO', plans: ['astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'orbitas', name: 'Órbitas', kind: 'effect', detail: 'Exclusivo do ASTRO', plans: ['astro', 'astroPlus', 'astroPlusGold'] },
  { id: 'aurora', name: 'Aurora', kind: 'effect', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'nebulosa', name: 'Nebulosa', kind: 'effect', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'plasma', name: 'Plasma', kind: 'effect', detail: 'Exclusivo do ASTRO+', plans: ['astroPlus', 'astroPlusGold'] },
  { id: 'singularidade', name: 'Singularidade', kind: 'effect', detail: 'Exclusivo do ASTRO PLUS', plans: ['astroPlusGold'] },
]

export const KIND_LABEL: Record<CatalogKind, string> = {
  nameplate: 'Placa de identificação',
  avatar: 'Decoração de avatar',
  frame: 'Moldura de perfil',
  effect: 'Efeito de perfil',
}

export const KIND_TITLE: Record<CatalogKind, string> = {
  nameplate: 'Alterar placa de identificação',
  avatar: 'Mudar decoração de avatar',
  frame: 'Alterar moldura de perfil',
  effect: 'Alterar o efeito do perfil',
}

export const KIND_CATALOG: Record<CatalogKind, CatalogItem[]> = {
  nameplate: NAMEPLATES,
  avatar: DECORATIONS,
  frame: PROFILE_FRAMES,
  effect: PROFILE_EFFECTS,
}

export const ALL_SHOP_ITEMS: CatalogItem[] = [
  ...DECORATIONS,
  ...NAMEPLATES,
  ...PROFILE_FRAMES,
  ...PROFILE_EFFECTS,
].filter((item) => item.id !== 'none')

export function catalogItem(kind: CatalogKind, id: string): CatalogItem {
  return KIND_CATALOG[kind].find((item) => item.id === id) || KIND_CATALOG[kind][0]
}

export function isUnlocked(item: CatalogItem, plan: Plan): boolean {
  return item.plans.includes(plan)
}

export function skinClass(kind: CatalogKind, id: string): string {
  if (id === 'none') return ''
  if (kind === 'avatar') return `profile-frame-${id}`
  if (kind === 'nameplate') return `ape-plate-${id}`
  if (kind === 'frame') return `ape-frame-${id}`
  return `ape-effect-${id}`
}

export interface WishlistEntry { kind: CatalogKind; id: string }

export function parseWishlist(raw: unknown): WishlistEntry[] {
  if (!Array.isArray(raw)) return []
  const out: WishlistEntry[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const kind = (entry as { kind?: unknown }).kind
    const id = (entry as { id?: unknown }).id
    if (typeof kind !== 'string' || typeof id !== 'string') continue
    if (!(kind in KIND_CATALOG)) continue
    if (id === 'none') continue
    if (!KIND_CATALOG[kind as CatalogKind].some((item) => item.id === id)) continue
    out.push({ kind: kind as CatalogKind, id })
  }
  return out
}
