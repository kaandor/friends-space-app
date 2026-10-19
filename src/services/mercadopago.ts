// Mercado Pago — botão de pagamento (Checkout Pro) para checkout ASTRO.
// Carrega o SDK do Mercado Pago, abre o Checkout Pro (janela de pagamento
// oficial: PIX, cartão, boleto, saldo MP) e, ao retornar, ativa o Astro.
//
// ATIVACAO NAO-OTIMISTA: o Astro so e ativado quando o backend confirma o
// pagamento (via polling de /api/payment/mercadopago-status). Nada e ativado
// na hora em que a janela abre.

const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string | undefined
const CURRENCY = 'BRL'

let scriptLoaded = false
let loadPromise: Promise<void> | null = null

export function loadMercadoPagoScript(): Promise<void> {
  if (!MP_PUBLIC_KEY) return Promise.resolve()
  if (scriptLoaded) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-fs-mp]')
    if (existing) { scriptLoaded = true; resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://sdk.mercadopago.com/js/v2'
    s.async = true
    s.dataset.fsMp = '1'
    s.onload = () => { scriptLoaded = true; resolve() }
    s.onerror = () => { scriptLoaded = false; resolve() }
    document.head.appendChild(s)
  })
  return loadPromise
}

// Cria uma preferência de pagamento via backend e abre o Checkout Pro.
// Retorna a URL de pagamento (ou abre direto se o backend devolver init_point).
export async function createMercadoPagoPreference(
  amount: number,
  title: string,
  orderId: string,
): Promise<{ initPoint: string }> {
  const res = await fetch(`/api/payment/mercadopago-create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount, title, orderId, currency: CURRENCY }),
  })
  if (!res.ok) throw new Error(`Mercado Pago: HTTP ${res.status}`)
  const data = await res.json()
  if (!data || !data.init_point) throw new Error('Mercado Pago: preferência sem URL')
  return { initPoint: data.init_point }
}

// Consulta o status do pagamento no backend (que consulta a API do MP por
// external_reference). Retorna true apenas quando o pagamento foi aprovado.
export async function checkMercadoPagoStatus(externalReference: string): Promise<{ approved: boolean; status: string }> {
  try {
    const res = await fetch(`/api/payment/mercadopago-status?externalReference=${encodeURIComponent(externalReference)}`)
    if (!res.ok) return { approved: false, status: 'error' }
    const data = await res.json()
    return { approved: Boolean(data && data.approved), status: String(data?.status || '') }
  } catch {
    return { approved: false, status: 'error' }
  }
}