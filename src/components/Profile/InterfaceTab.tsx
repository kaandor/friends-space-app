export type UiSection = 'feed' | 'stories' | 'trending' | 'news' | 'suggested'

export function uiEnabled(user: { settings?: Record<string, unknown> } | null | undefined, key: UiSection): boolean {
  const ui = (user?.settings?.ui || {}) as Record<string, unknown>
  return ui[key] !== false
}
