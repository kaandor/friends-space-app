// Google Pay (Google Wallet) — folha de pagamento no checkout ASTRO.
// So ativa quando o Merchant ID estiver configurado (VITE_GOOGLEPAY_MERCHANT_ID).
// IMPORTANTE: sem um gateway/processador (Stripe, Mercado Pago etc.) o token
// do Google Pay nao vira dinheiro de verdade — o fluxo atual ativa a
// assinatura na confirmacao, igual aos metodos simulados (PIX/cartao/boleto).
// ATENCAO: NAO declarar window.google aqui — src/types/google.d.ts ja tipa o
// google.accounts (GIS) e uma segunda declaracao conflita no tsc. Usar as any.
import { GOOGLEPAY_MERCHANT_ID, googlePayEnabled } from '../config/monetization'

// Acessa o Google Pay sem conflitar com o google.accounts do login (GIS).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gpayApi(): any | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = (window as any).google
  return g && g.payments && g.payments.api ? g.payments.api : null
}

let scriptLoaded = false
let loadPromise: Promise<void> | null = null

export function loadGooglePayScript(): Promise<void> {
  if (!googlePayEnabled()) return Promise.resolve()
  if (scriptLoaded) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-fs-gpay]')
    if (existing) {
      scriptLoaded = true
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = 'https://pay.google.com/gp/p/js/pay.js'
    s.async = true
    s.dataset.fsGpay = '1'
    s.onload = () => {
      scriptLoaded = true
      resolve()
    }
    s.onerror = () => {
      scriptLoaded = true
      resolve()
    }
    document.head.appendChild(s)
  })
  return loadPromise
}

function baseRequest(): Record<string, unknown> {
  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [
      {
        type: 'CARD',
        parameters: {
          allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
          allowedCardNetworks: ['MASTERCARD', 'VISA', 'ELO', 'HIPERCARD', 'AMEX'],
        },
        tokenizationSpecification: {
          // Sem gateway real, usa o DIRECT (token nao processavel) — o fluxo
          // fica pronto para trocar por STRIPE/etc. quando houver processador.
          type: 'DIRECT',
          parameters: {
            protocolVersion: 'ECv2',
            publicKey: 'BCcGyv3mEfU3lBpq6lZ7LxK2VJ8QdTz1Yw4Rn0Hs9mXaNpOiKj5LbGcDf6Se8VhUyMkQe2R',
          },
        },
      },
    ],
    merchantInfo: {
      merchantId: GOOGLEPAY_MERCHANT_ID,
      merchantName: 'Friends Space',
    },
    transactionInfo: {
      totalPriceStatus: 'FINAL',
      totalPrice: '0.01',
      currencyCode: 'BRL',
      countryCode: 'BR',
    },
  }
}

// Abre a folha do Google Pay. Resolve com o PaymentData ou rejeita.
export async function openGooglePaySheet(priceBRL: number): Promise<unknown> {
  await loadGooglePayScript()
  const api = gpayApi()
  if (!api || typeof api.PaymentsClient !== 'function') throw new Error('Google Pay indisponivel')
  const client = new api.PaymentsClient({ environment: 'PRODUCTION' })
  const request = baseRequest()
  ;(request.transactionInfo as Record<string, unknown>).totalPrice = priceBRL.toFixed(2)
  return client.loadPaymentData(request)
}
