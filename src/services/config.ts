const DEFAULT_API_BASE_URL = 'https://friends-space-api.kaandrofootball.workers.dev'

export function getApiBaseUrl() {
  // Backend direto (o proxy same-origin do Pages está fora do ar para POST).
  // O backend aplica CORS allowlist + auth em toda action.
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.protocol) {
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      return window.location.origin.replace(/\/+$/, '')
    }
  }

  return DEFAULT_API_BASE_URL
}
