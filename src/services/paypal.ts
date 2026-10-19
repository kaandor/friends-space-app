// PayPal — botão de pagamento para checkout ASTRO.
// Carrega o PayPal JS SDK e renderiza o Smart Button no container.
// Fluxo: clique → popup PayPal → aprovação → activateAstro no backend.

const CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined
const CURRENCY = 'BRL'

let scriptLoaded = false
let loadPromise: Promise<void> | null = null

export function loadPayPalScript(): Promise<void> {
  if (!CLIENT_ID) return Promise.resolve()
  if (scriptLoaded) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-fs-paypal]')
    if (existing) { scriptLoaded = true; resolve(); return }
    const s = document.createElement('script')
    s.src = `https://www.paypal.com/sdk/js?client-id=${CLIENT_ID}&currency=${CURRENCY}`
    s.async = true
    s.dataset.fsPaypal = '1'
    s.onload = () => { scriptLoaded = true; resolve() }
    s.onerror = () => { scriptLoaded = false; resolve() }
    document.head.appendChild(s)
  })
  return loadPromise
}

// Renderiza o botao PayPal no container. Retorna uma funcao p/ limpar.
export function renderPayPalButton(
  containerId: string,
  amount: number,
  onSuccess: () => void,
  onError: (msg: string) => void,
): () => void {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paypal = (window as any).paypal
  if (!paypal) {
    onError('PayPal não carregado')
    return () => {}
  }
  try {
    const buttons = paypal.Buttons({
      style: { layout: 'horizontal', color: 'gold', shape: 'pill', label: 'paypal' },
      createOrder: (_data: unknown, actions: { order: { create: (p: { purchase_units: { amount: { value: string; currency_code: string } }[] }) => Promise<string> } }) => {
        return actions.order.create({
          purchase_units: [{ amount: { value: amount.toFixed(2), currency_code: CURRENCY } }],
        })
      },
      onApprove: (_data: unknown, actions: { order: { capture: () => Promise<unknown> } }) => {
        return actions.order.capture().then(() => onSuccess())
      },
      onError: (err: unknown) => {
        onError(String(err || 'Erro no PayPal'))
      },
    })
    buttons.render(`#${containerId}`)
    return () => { try { buttons.close?.() } catch {} }
  } catch (err) {
    onError(String(err || 'Erro ao renderizar PayPal'))
    return () => {}
  }
}