const DEFAULT_API_BASE_URL = 'https://friends-space-api.kaandrofootball.workers.dev'

// O backend real roda como Pages Function (functions/api/[[path]].js) na
// MESMA origem do site — rota ~4x mais rapida que o workers.dev no Brasil.
// Se as Functions estiverem indisponiveis (402/5xx), o backend.ts seta
// apiBaseOverride para o Worker dev e tudo continua por la.
let apiBaseOverride = ''
export function setApiBaseUrlOverride(next: string | null) {
  if (next) {
    if (apiBaseOverride !== next) apiBaseOverride = next.replace(/\/+$/, '')
  } else {
    apiBaseOverride = ''
  }
}

export function hasApiBaseOverride() {
  return apiBaseOverride !== ''
}

export function getApiBaseUrl() {
  if (apiBaseOverride) return apiBaseOverride
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (typeof window !== 'undefined' && window.location?.hostname
    && /(^|\.)(friends-space\.pages\.dev)$/.test(window.location.hostname)) {
    return window.location.origin.replace(/\/+$/, '')
  }
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

export const FALLBACK_API_BASE_URL = DEFAULT_API_BASE_URL
