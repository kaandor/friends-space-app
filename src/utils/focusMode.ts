const FOCUS_KEY = 'friends-space:focus-mode'

export function readFocusMode(): boolean {
  try {
    return localStorage.getItem(FOCUS_KEY) === '1'
  } catch {
    return false
  }
}

export function applyFocusMode(enabled: boolean) {
  try {
    localStorage.setItem(FOCUS_KEY, enabled ? '1' : '0')
  } catch { }
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('fs-focus-mode', enabled)
  }
}

export function toggleFocusMode(): boolean {
  const enabled = !readFocusMode()
  applyFocusMode(enabled)
  try {
    window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: enabled ? 'Modo foco ativado. Ctrl+Shift+F para sair.' : 'Modo foco desativado.' }))
  } catch { }
  return enabled
}
