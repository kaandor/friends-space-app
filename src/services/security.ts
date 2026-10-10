// Anti-Debug / F12 protection — DETERRENT apenas, nao uma barreira de seguranca real.
// Impede clique direito, mantem warnings no console, e alerta sobre DevTools.
// Nada disso substitui a validacao no backend (astroPaymentPending gate).

export function initSecurity() {
  // 1) Bloqueia clique direito (context menu)
  document.addEventListener('contextmenu', (e) => e.preventDefault())

  // 2) Mantem warnings no console (bloqueia console.clear)
  const origClear = console.clear.bind(console)
  console.clear = function clear() {
    // Chama o original mas re-adiciona o warning
    origClear()
    setTimeout(() => {
      console.log('%c🚨 Friends Space — Console bloqueado', 'font-size:13px;font-weight:bold;color:#ef4444')
      console.log('%cNao cole scripts de terceiros aqui. Seu acesso pode ser monitorado.', 'font-size:11px;color:#6b7280')
    }, 50)
  }

  // 3) Warning inicial (se o console ainda nao foi limpo)
  console.log('%c🚨 Friends Space — Console monitorado', 'font-size:13px;font-weight:bold;color:#ef4444')
  console.log('%cNao cole scripts de terceiros aqui. Seu acesso pode ser monitorado.', 'font-size:11px;color:#6b7280')
}