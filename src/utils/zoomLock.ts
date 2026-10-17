// Zoom travado em 125% com reconhecimento automatico de resolucao.
//
// Usa CSS `zoom` (com reflow, nao transform): o layout se recalcula e
// preenche qualquer janela — site, monitor 4K/HD ou app em modo janela,
// ate na janela mais pequena. O valor e sempre 125%; o reconhecimento
// serve para reaplicar a trava quando a resolucao/janela muda (troca de
// monitor, redimensionar, fullscreen, rotacao), pois o navegador pode
// recalcular o viewport nesses eventos.
//
// A tela de login roda a 100% (o card em position fixed estoura com o
// zoom): GoogleLoginView desliga a trava enquanto esta montado.
const LOCKED_ZOOM_PCT = '125%'

function zoomDisabled(): boolean {
  return Boolean((window as unknown as { __fsZoomDisabled?: boolean }).__fsZoomDisabled)
}

export function lockZoom(): void {
  try {
    if (zoomDisabled()) return
    document.documentElement.style.zoom = LOCKED_ZOOM_PCT
  } catch {
    // ambiente sem DOM (SSR/testes): ignora
  }
}

export function setZoomLockEnabled(value: boolean): void {
  try {
    ;(window as unknown as { __fsZoomDisabled?: boolean }).__fsZoomDisabled = !value
    document.documentElement.style.zoom = value ? LOCKED_ZOOM_PCT : '1'
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
