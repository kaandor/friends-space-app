import type { GoogleProfile } from './googleAuth'

export interface KnownAccount {
  googleId: string
  email: string
  name: string
  photoUrl: string
  addedAt: number
  lastUsedAt: number
}

const KNOWN_ACCOUNTS_KEY = 'friends-space:known-accounts'

export function loadKnownAccounts(): KnownAccount[] {
  try {
    const raw = localStorage.getItem(KNOWN_ACCOUNTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return (parsed as KnownAccount[])
      .filter(account => account && typeof account.googleId === 'string' && typeof account.email === 'string')
      .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
  } catch {
    return []
  }
}

function saveKnownAccounts(accounts: KnownAccount[]) {
  try {
    localStorage.setItem(KNOWN_ACCOUNTS_KEY, JSON.stringify(accounts))
  } catch { }
}

// Registra/atualiza a conta na lista local (usada pelo seletor de contas do
// login). NUNCA guarda tokens — apenas o perfil publico do Google.
export function addKnownAccount(profile: GoogleProfile) {
  if (!profile?.googleId) return
  const now = Date.now()
  const accounts = loadKnownAccounts()
  const existing = accounts.find(account => account.googleId === profile.googleId)
  if (existing) {
    existing.email = profile.email || existing.email
    existing.name = profile.name || existing.name
    existing.photoUrl = profile.photoUrl || existing.photoUrl
    existing.lastUsedAt = now
  } else {
    accounts.push({
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
      photoUrl: profile.photoUrl,
      addedAt: now,
      lastUsedAt: now,
    })
  }
  accounts.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  // Limite de 3 contas: e o que cabe no card do login (sem scroll).
  saveKnownAccounts(accounts.slice(0, 3))
}

export function removeKnownAccount(googleId: string) {
  saveKnownAccounts(loadKnownAccounts().filter(account => account.googleId !== googleId))
}
