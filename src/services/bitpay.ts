// BitPay — botão de pagamento em cripto para checkout ASTRO.
// Carrega o BitPay JavaScript SDK e cria uma fatura (invoice) na abertura do
// checkout. O usuário paga no modal BitPay (BTC, ETH etc.) e, ao confirmar,
// ativa o Astro no backend.

const BITPAY_TOKEN = import.meta.env.VITE_BITPAY_TOKEN as string | undefined
const BITPAY_ENV = import.meta.env.VITE_BITPAY_ENV as string | undefined || 'test'
const CURRENCY = 'BRL'

let scriptLoaded = false
let loadPromise: Promise<void> | null = null

export function bitpayEnabled(): boolean {
  return Boolean(BITPAY_TOKEN)
}

export function loadBitPayScript(): Promise<void> {
  if (!BITPAY_TOKEN) return Promise.resolve()
  if (scriptLoaded) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-fs-bitpay]')
    if (existing) { scriptLoaded = true; resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://bitpay.com/js/bitpay.js'
    s.async = true
    s.dataset.fsBitpay = '1'
    s.onload = () => { scriptLoaded = true; resolve() }
    s.onerror = () => { scriptLoaded = false; resolve() }
    document.head.appendChild(s)
  })
  return loadPromise
}

// Cria a fatura via API do BitPay. Retorna a url de pagamento.
export async function createBitPayInvoice(
  amount: number,
  orderId: string,
  notificationEmail?: string,
): Promise<string> {
  const env = BITPAY_ENV === 'prod' ? 'production' : 'test'
  const res = await fetch(`https://${env === 'production' ? 'bitpay.com' : 'test.bitpay.com'}/invoices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: BITPAY_TOKEN,
      price: amount,
      currency: CURRENCY,
      orderId,
      buyerEmail: notificationEmail || '',
      notificationURL: `${window.location.origin}/api/payment/bitpay`,
      redirectURL: window.location.origin,
    }),
  })
  if (!res.ok) throw new Error(`BitPay: HTTP ${res.status}`)
  const data = await res.json()
  const invoice = data.data
  if (!invoice || !invoice.url) throw new Error('BitPay: fatura sem URL')
  return invoice.url
}

// Verifica o status da fatura no backend (o app confirma via webhook).
export async function verifyBitPayInvoice(invoiceId: string): Promise<{ confirmed: boolean }> {
  const res = await fetch(`/api/payment/bitpay-status?invoiceId=${encodeURIComponent(invoiceId)}`)
  if (!res.ok) return { confirmed: false }
  const data = await res.json()
  return { confirmed: Boolean(data && data.confirmed) }
}