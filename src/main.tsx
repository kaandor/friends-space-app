import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initZoomLock } from './utils/zoomLock'
import { registerPwa } from './services/pwa'

const host = window.location.hostname
if (host.endsWith('.friends-space.pages.dev') && host !== 'friends-space.pages.dev') {
  window.location.replace(
    'https://friends-space.pages.dev' + window.location.pathname + window.location.search + window.location.hash
  )
} else {
  initZoomLock()
  registerPwa()
  watchForNewBuild()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

// Auto-recarga: se o site publicar uma build nova enquanto a aba esta aberta,
// recarrega sozinha (exceto no meio de chamada ou com o wizard aberto, para
// nao derrubar call nem perder rascunho). Antes, abas antigas ficavam dias
// rodando codigo velho e bugs ja corrigidos pareciam nao resolvidos.
function watchForNewBuild() {
  const current = typeof __BUILD_ID__ !== 'undefined' ? String(__BUILD_ID__) : ''
  if (!current) return
  if (!/^https?:$/.test(window.location.protocol)) return
  let checking = false
  const check = async () => {
    if (checking) return
    checking = true
    try {
      const r = await fetch('./version.json?ts=' + Date.now(), { cache: 'no-store' })
      if (!r.ok) return
      const v = await r.json() as { id?: string }
      if (!v?.id || v.id === current) return
      try {
        const { useCallStore } = await import('./stores/callStore')
        if (useCallStore.getState().activeCall) return
      } catch { }
      if (document.querySelector('.csw-overlay')) return
      window.location.reload()
    } catch { } finally {
      checking = false
    }
  }
  window.setTimeout(() => void check(), 10000)
  window.setInterval(() => void check(), 60000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check()
  })
  window.addEventListener('focus', () => void check())
}
