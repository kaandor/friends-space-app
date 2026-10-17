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

// Site travado em 125% de zoom (com reflow): reaplica a trava sempre que
// a resolucao ou a janela muda (app em modo janela incluso).
initZoomLock()

const host = window.location.hostname
if (host.endsWith('.friends-space.pages.dev') && host !== 'friends-space.pages.dev') {
  window.location.replace(
    'https://friends-space.pages.dev' + window.location.pathname + window.location.search + window.location.hash
  )
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
