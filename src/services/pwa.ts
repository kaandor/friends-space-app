interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let installPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<(available: boolean) => void>()

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  installPrompt = event as BeforeInstallPromptEvent
  for (const listener of listeners) listener(true)
})

window.addEventListener('appinstalled', () => {
  installPrompt = null
  for (const listener of listeners) listener(false)
})

export function registerPwa() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { })
  })
}

export function pwaInstallAvailable(): boolean {
  return Boolean(installPrompt)
}

export function onPwaInstallAvailability(listener: (available: boolean) => void): () => void {
  listeners.add(listener)
  listener(Boolean(installPrompt))
  return () => listeners.delete(listener)
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!installPrompt) return false
  const prompt = installPrompt
  installPrompt = null
  for (const listener of listeners) listener(false)
  try {
    await prompt.prompt()
    const choice = await prompt.userChoice
    return choice.outcome === 'accepted'
  } catch {
    return false
  }
}

export function isStandalonePwa(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  } catch {
    return false
  }
}
