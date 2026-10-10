// Carregador do Google AdSense sob demanda (estilo X/Twitter no feed).
// So carrega o script adsbygoogle.js quando o publisher (ca-pub-...) estiver
// configurado nas env vars — sem ID, o app usa o AdSlot placeholder atual.
import { ADSENSE_CLIENT, ADSENSE_SLOT, adsEnabled } from '../config/monetization'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

let scriptLoaded = false
let loadPromise: Promise<void> | null = null

export function loadAdSenseScript(): Promise<void> {
  if (!adsEnabled()) return Promise.resolve()
  if (scriptLoaded) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-fs-adsense]')
    if (existing) {
      scriptLoaded = true
      resolve()
      return
    }
    const s = document.createElement('script')
    s.async = true
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
    s.crossOrigin = 'anonymous'
    s.dataset.fsAdsense = '1'
    s.onload = () => {
      scriptLoaded = true
      resolve()
    }
    s.onerror = () => {
      // Falha de rede/consentimento: segue sem ads, nunca quebra o feed.
      scriptLoaded = true
      resolve()
    }
    document.head.appendChild(s)
  })
  return loadPromise
}

// Renderiza o <ins> do AdSense e dispara o push. Chamar apos montar o node.
export function renderAdSlot(node: HTMLElement | null): void {
  if (!node || !adsEnabled()) return
  void loadAdSenseScript().then(() => {
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // best-effort: anúncio falhou silenciosamente
    }
  })
}

export function adUnitProps(): { client: string; slot: string } | null {
  if (!adsEnabled()) return null
  return { client: ADSENSE_CLIENT, slot: ADSENSE_SLOT }
}
