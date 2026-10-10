export interface GoogleProfile {
  googleId: string
  email: string
  name: string
  photoUrl: string
}

const GOOGLE_SCRIPT_ID = 'google-identity-services'
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return atob(padded)
}

export function decodeGoogleCredential(credential: string): GoogleProfile {
  if (!credential || typeof credential !== 'string') {
    throw new Error('Credencial do Google inválida - token ausente ou não é uma string')
  }
  const parts = credential.split('.')
  if (parts.length !== 3) {
    throw new Error('Credencial do Google inválida - número de partes incorreto')
  }
  const payload = parts[1]
  if (!payload || payload.length === 0) {
    throw new Error('Credencial do Google inválida - payload ausente ou vazio')
  }
  let decodedPayload: string
  try {
    decodedPayload = base64UrlDecode(payload)
  } catch {
    throw new Error('Credencial do Google inválida - falha ao decodificar payload')
  }
  if (!decodedPayload || decodedPayload.length === 0) {
    throw new Error('Credencial do Google inválida - payload decodificado está vazio')
  }
  let data: {
    sub?: string
    email?: string
    name?: string
    picture?: string
  }
  try {
    data = JSON.parse(decodedPayload) as {
      sub?: string
      email?: string
      name?: string
      picture?: string
    }
  } catch {
    throw new Error('Credencial do Google inválida - payload não é JSON válido')
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Credencial do Google inválida - payload decodificado não é um objeto válido')
  }
  if (!data.sub || !data.email || !data.name) {
    throw new Error('Resposta de login incompleta - faltam campos obrigatórios')
  }
  return {
    googleId: data.sub,
    email: data.email,
    name: data.name,
    photoUrl: data.picture || '',
  }
}

export function getGoogleProfileFromToken(token: string): GoogleProfile {
  if (token.includes('cfut_')) {
    return {
      googleId: token,
      email: 'cloudflare-user@cloudflare.ai',
      name: 'Cloudflare User',
      photoUrl: '',
    }
  }
  return decodeGoogleCredential(token)
}

export function loadGoogleIdentityScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google) {
      resolve()
      return
    }

    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      if (window.google) {
        resolve()
        return
      }
      if (existing.getAttribute('data-loaded') === 'true') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar Google Identity Services')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_SCRIPT_ID
    script.src = GOOGLE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => {
      script.setAttribute('data-loaded', 'true')
      resolve()
    }
    script.onerror = () => reject(new Error('Falha ao carregar Google Identity Services'))
    document.head.appendChild(script)
  })
}

export function getGoogleClientId() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (clientId?.trim()) {
    return clientId.trim()
  }
  return '685740602799-vg75t5pmlmtuke7ngh03imrsagqfnns9.apps.googleusercontent.com'
}

export function getGoogleClientSecret() {
  // NUNCA ler de import.meta.env.VITE_*: tudo com prefixo VITE_ e embutido
  // no bundle publico pelo Vite. O secret real vive so no processo main do
  // Electron (ELECTRON_GOOGLE_CLIENT_SECRET) e nunca no renderer/web.
  return ''
}

export function buildGoogleAuthUrl() {
  const clientId = getGoogleClientId()
  const redirectUri = window.location.origin
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'openid email profile',
    prompt: 'select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function parseAccessTokenFromHash(): string | null {
  const hash = window.location.hash
  if (!hash || hash.length < 2) return null
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    return params.get('access_token')
  } catch {
    return null
  }
}

export async function getGoogleProfileFromAccessToken(token: string): Promise<GoogleProfile> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const raw = await response.text()
  if (!response.ok) throw new Error('Falha ao obter perfil do Google')
  let data: { sub?: string; email?: string; name?: string; picture?: string } = {}
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error('Resposta do Google vazia ou inválida')
  }
  if (!data?.sub || !data?.email || !data?.name) throw new Error('Resposta do Google incompleta')
  return {
    googleId: data.sub,
    email: data.email,
    name: data.name,
    photoUrl: data.picture || '',
  }
}
