import type { CSSProperties } from 'react'
import { Circle, CircleMinus, Moon } from 'lucide-react'

export type UserStatusId = 'online' | 'away' | 'dnd' | 'invisible'

export const USER_STATUS: Record<UserStatusId, { label: string; description: string; color: string }> = {
  online: { label: 'Disponível', description: 'Online e pronto para conversar', color: '#22c55e' },
  away: { label: 'Ausente', description: 'Longe do teclado', color: '#f0b232' },
  dnd: { label: 'Não perturbar', description: 'Silencia notificações e avisos', color: '#f23f43' },
  invisible: { label: 'Invisível', description: 'Aparece offline para todos', color: '#80848e' },
}

export const USER_STATUS_COLOR: Record<UserStatusId, string> = {
  online: USER_STATUS.online.color,
  away: USER_STATUS.away.color,
  dnd: USER_STATUS.dnd.color,
  invisible: USER_STATUS.invisible.color,
}

// Lê o status das settings do usuário. Valores desconhecidos (contas antigas
// podem ter gravado chaves em português) caem no padrão "online".
export function statusFromSettings(settings: unknown): UserStatusId {
  const s = (settings || {}) as Record<string, unknown>
  const raw = typeof s.status === 'string' ? s.status : ''
  return raw in USER_STATUS ? (raw as UserStatusId) : 'online'
}

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`

const ICON_SVG: Record<UserStatusId, string> = {
  online: svg(`<circle cx="12" cy="12" r="10" fill="${USER_STATUS.online.color}"/>`),
  away: svg(`<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill="${USER_STATUS.away.color}"/>`),
  dnd: svg(`<circle cx="12" cy="12" r="9.5" fill="none" stroke="${USER_STATUS.dnd.color}" stroke-width="3"/><path d="M7.5 12h9" stroke="${USER_STATUS.dnd.color}" stroke-width="3" stroke-linecap="round"/>`),
  invisible: svg(`<circle cx="12" cy="12" r="9.5" fill="none" stroke="${USER_STATUS.invisible.color}" stroke-width="3"/>`),
}

// Variáveis CSS usadas pelo perfil grande (.pfm-left .ape-avatar-wrap::after):
// a cor e o próprio ícone entram como data-URI para o pseudo-elemento.
export function statusCssVars(status: UserStatusId): CSSProperties {
  return {
    '--pfm-status': USER_STATUS_COLOR[status],
    '--pfm-status-icon': `url("data:image/svg+xml,${encodeURIComponent(ICON_SVG[status])}")`,
  } as CSSProperties
}

export function StatusIcon({ status, size = 10, className, style }: {
  status: UserStatusId
  size?: number
  className?: string
  style?: CSSProperties
}) {
  const color = USER_STATUS_COLOR[status]
  const common = { size, className, style: { display: 'block' as const, ...style } }
  if (status === 'away') return <Moon {...common} color={color} fill={color} strokeWidth={2} />
  if (status === 'dnd') return <CircleMinus {...common} color={color} strokeWidth={2.5} />
  if (status === 'invisible') return <Circle {...common} color={color} strokeWidth={2.5} />
  return <Circle {...common} color={color} fill={color} strokeWidth={2} />
}
