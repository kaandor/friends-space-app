// Configuracao central de monetizacao (Google AdSense + Google Pay/Wallet).
// Os IDs reais ficam nas env vars VITE_* (publicas no bundle, sem segredo):
//   VITE_ADSENSE_CLIENT        ex.: ca-pub-1234567890123456
//   VITE_ADSENSE_SLOT          ex.: 9876543210 (ad unit ID)
//   VITE_GOOGLEPAY_MERCHANT_ID ex.: 1234567890123456789 (merchant do Google Pay)
// Ate o Kaandro colar os IDs, o app funciona com os placeholders atuais
// (AdSlot visual + checkout simulado) sem quebrar nada.

export const ADSENSE_CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined) || ''
export const ADSENSE_SLOT = (import.meta.env.VITE_ADSENSE_SLOT as string | undefined) || ''
export const GOOGLEPAY_MERCHANT_ID = (import.meta.env.VITE_GOOGLEPAY_MERCHANT_ID as string | undefined) || ''
export const PAYPAL_CLIENT_ID = (import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined) || ''
export const BITPAY_TOKEN = (import.meta.env.VITE_BITPAY_TOKEN as string | undefined) || ''
export const MERCADOPAGO_PUBLIC_KEY = (import.meta.env.VITE_MP_PUBLIC_KEY as string | undefined) || ''

export function adsEnabled(): boolean {
  return ADSENSE_CLIENT.startsWith('ca-pub-') && ADSENSE_SLOT.length > 0
}

export function googlePayEnabled(): boolean {
  return GOOGLEPAY_MERCHANT_ID.length > 0
}

export function paypalEnabled(): boolean {
  return PAYPAL_CLIENT_ID.length > 0
}

export function bitpayEnabled(): boolean {
  return BITPAY_TOKEN.length > 0
}

export function mercadopagoEnabled(): boolean {
  return MERCADOPAGO_PUBLIC_KEY.length > 0
}
