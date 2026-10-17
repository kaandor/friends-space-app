// Zoom travado em 125% com reconhecimento automatico de resolucao.
//
// Usa CSS `zoom` (com reflow, nao transform): o layout se recalcula e
// preenche qualquer janela — site, monitor 4K/HD ou app em modo janela,
// ate na janela mais pequena. O valor e sempre 125%; o reconhecimento
// serve para reaplicar a trava quando a resolucao/janela muda (troca de
// monitor, redimensionar, fullscreen, rotacao), pois o navegador pode
// recalcular o viewport nesses eventos.
const LOCKED_ZOOM_PCT = '125%'

export function lockZoom(): void {
  try {
    document.documentElement.style.zoom = LOCKED_ZOOM_PCT
  } catch {
    // ambiente sem DOM (SSR/testes): ignora
  }
}

export function initZoomLock(): () => void {
  lockZoom()
  const reassert = () => lockZoom()
  window.addEventListener('resize', reassert)
  window.addEventListener('orientationchange', reassert)
  document.addEventListener('fullscreenchange', reassert)
  return () => {
    window.removeEventListener('resize', reassert)
    window.removeEventListener('orientationchange', reassert)
    document.removeEventListener('fullscreenchange', reassert)
  }
}
