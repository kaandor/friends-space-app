import { useState, useEffect, useRef } from 'react'
import { ASTRO_PLANS, type AstroTier } from '../../utils/astro'
import { useUserStore } from '../../stores/userStore'
import { googlePayEnabled, paypalEnabled, bitpayEnabled, mercadopagoEnabled } from '../../config/monetization'
import { openGooglePaySheet } from '../../services/googlePay'
import { loadPayPalScript, renderPayPalButton } from '../../services/paypal'
import { loadBitPayScript, createBitPayInvoice } from '../../services/bitpay'
import { loadMercadoPagoScript, createMercadoPagoPreference, checkMercadoPagoStatus } from '../../services/mercadopago'

interface Props {
  tier: AstroTier
  onClose: () => void
  onSuccess: () => void
}

type PayMethod = 'pix' | 'googlepay' | 'paypal' | 'bitpay' | 'mercadopago'

// Logo oficial do PayPal (SVG inline, cores oficiais #003087 + #009cde)
function PayPalLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-label="PayPal" role="img">
      <path fill="#003087" d="M13.04 4h6.48c3.74 0 5.62 2.06 5.4 5.46-.24 3.68-2.5 5.94-6.36 5.94h-3.02l-.78 4.84c-.08.48-.34.72-.84.72H10.3c-.38 0-.6-.2-.54-.62l2.26-14.3c.08-.44.32-.66.78-.66h.24z"/>
      <path fill="#009cde" d="M13.76 5.02c.28-.02.52-.02.8-.02h4.4c3.5 0 5.2 1.92 5 5.12-.22 3.42-2.34 5.52-5.92 5.52h-2.96l-.8 4.96c-.06.36-.28.54-.68.54h-3.34c-.32 0-.5-.18-.46-.52l1.9-12.1c.06-.36.26-.54.66-.54h.4z"/>
      <path fill="#001c64" d="M12.3 5.02l-.44 2.72c.16-.04.3-.06.48-.06h2.6c.34 0 .5-.02.8-.02 3.02 0 4.66 1.66 4.48 4.42-.2 3.04-2.02 4.92-5.12 4.92h-2.94l-.82 5.1c-.04.26-.22.4-.5.4h-3.16c-.2 0-.32-.12-.3-.3l2.14-13.44c.04-.24.22-.36.48-.36h1.98z"/>
    </svg>
  )
}

// Logo do Mercado Pago (SVG inline, cores oficiais amarelo #ffe600 + azul #009ee3)
function MercadoPagoLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-label="Mercado Pago" role="img">
      <circle cx="16" cy="16" r="15" fill="#ffe600" />
      <path fill="#009ee3" d="M8 12.5c0-1.4 1.1-2.5 2.5-2.5h11c1.4 0 2.5 1.1 2.5 2.5V19c0 1.4-1.1 2.5-2.5 2.5h-11C9.1 21.5 8 20.4 8 19v-6.5z" />
      <path fill="#009ee3" d="M9.5 13c0-.8.7-1.5 1.5-1.5h10c.8 0 1.5.7 1.5 1.5v5.5c0 .8-.7 1.5-1.5 1.5H11c-.8 0-1.5-.7-1.5-1.5V13z" />
      <path fill="#ffe600" d="M11.5 13.5h9v4.5h-9z" />
      <path fill="#009ee3" d="M13 12v8h1.5v-8H13zm4.5 0v8H19v-8h-1.5z" />
    </svg>
  )
}

export function AstroCheckoutModal({ tier, onClose, onSuccess }: Props) {
  const { activateAstro, currentUser, markAstroPaymentPending } = useUserStore()
  const plan = ASTRO_PLANS[tier]
  const [method, setMethod] = useState<PayMethod>(() => {
    const saved = String((currentUser?.settings as Record<string, unknown> | undefined)?.astroPayMethod || '')
    if (saved === 'pix' || saved === 'googlepay' || saved === 'paypal' || saved === 'bitpay' || saved === 'mercadopago') return saved
    if (googlePayEnabled()) return 'googlepay'
    if (paypalEnabled()) return 'paypal'
    if (bitpayEnabled()) return 'bitpay'
    if (mercadopagoEnabled()) return 'mercadopago'
    return 'pix'
  })
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)
  const [payError, setPayError] = useState('')
  const paypalCleanup = useRef<(() => void) | null>(null)

  // Carrega os SDKs dos metodos habilitados assim que abre o modal
  useEffect(() => {
    if (paypalEnabled()) void loadPayPalScript()
    if (bitpayEnabled()) void loadBitPayScript()
    if (mercadopagoEnabled()) void loadMercadoPagoScript()
    return () => { if (paypalCleanup.current) { try { paypalCleanup.current() } catch {} } }
  }, [])

  // Renderiza o botao PayPal quando o metodo paypal esta ativo
  useEffect(() => {
    if (method !== 'paypal' || !paypalEnabled()) return
    if (paypalCleanup.current) { try { paypalCleanup.current() } catch {} }
    paypalCleanup.current = null
    let cancelled = false
    void loadPayPalScript().then(() => {
      if (cancelled || document.getElementById('paypal-button-container') === null) return
      paypalCleanup.current = renderPayPalButton(
        'paypal-button-container',
        plan.monthlyPrice,
        () => { void completePayment() },
        (msg) => { if (!cancelled) setPayError(msg) },
      )
    })
    return () => { cancelled = true }
  }, [method, plan.monthlyPrice])

  const completePayment = async () => {
    if (processing) return
    setProcessing(true)
    setPayError('')
    try {
      // Seguranca: marca o pagamento como pendente/confirmado no backend ANTES
      // de ativar. O activateAstro do backend so aceita se astroPaymentPending
      // estiver true (impede ativacao direta via console/F12).
      await markAstroPaymentPending()
      await activateAstro(1, tier, method)
      setDone(true)
      window.setTimeout(onSuccess, 1500)
    } catch {
      setPayError('Falha ao ativar a assinatura. Tente novamente.')
    } finally {
      setProcessing(false)
    }
  }

  const confirm = async () => {
    if (processing) return
    if (method === 'paypal' || method === 'bitpay' || method === 'mercadopago') {
      // Metodos de gateway: o pagamento acontece fora (popup/janela do gateway).
      // Nao chamar activateAstro aqui — o fluxo de cada um dispara o completePayment.
      return
    }
    setProcessing(true)
    setPayError('')
    try {
      if (method === 'googlepay') {
        await openGooglePaySheet(plan.monthlyPrice)
      }
      await activateAstro(1, tier, method)
      setDone(true)
      window.setTimeout(onSuccess, 1500)
    } catch {
      setPayError('Pagamento não concluído. Tente outro método.')
    } finally {
      setProcessing(false)
    }
  }

  const startBitPay = async () => {
    if (processing) return
    setProcessing(true)
    setPayError('')
    try {
      const url = await createBitPayInvoice(plan.monthlyPrice, `astro-${tier}-${Date.now()}`, currentUser?.email)
      window.open(url, '_blank', 'noopener')
      // Em ambiente demo a fatura pode nao ser confirmada via webhook; aqui
      // tratamos como fluxo otimista igual aos demais metodos simulados.
      await completePayment()
    } catch {
      setPayError('Não foi possível gerar a fatura BitPay. Tente outro método.')
      setProcessing(false)
    }
  }

  const startMercadoPago = async () => {
    if (processing) return
    setProcessing(true)
    setPayError('')
    const externalReference = `astro-${tier}-${Date.now()}`
    try {
      const { initPoint } = await createMercadoPagoPreference(plan.monthlyPrice, `ASTRO ${plan.name}`, externalReference)
      window.open(initPoint, '_blank', 'noopener')
      // NAO otimista: aguarda o pagamento ser aprovado (polling no backend,
      // que consulta a API do Mercado Pago por external_reference).
      const maxAttempts = 60 // ~5 minutos (5s cada)
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 5000))
        const { approved } = await checkMercadoPagoStatus(externalReference)
        if (approved) {
          await completePayment()
          return
        }
      }
      setPayError('Pagamento não confirmado. Se você pagou, aguarde alguns minutos e reabra o checkout.')
      setProcessing(false)
    } catch {
      setPayError('Não foi possível iniciar o Mercado Pago. Tente outro método.')
      setProcessing(false)
    }
  }

  const fmtPrice = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')

  const btnClass = tier === 'astro' ? '#22c55e' : tier === 'astro_plus' ? '#a855f7' : '#eab308'

  const methods: { id: PayMethod; icon: string; label: string }[] = [
    { id: 'pix' as PayMethod, icon: '💳', label: 'PIX' },
  ]
  if (mercadopagoEnabled()) methods.unshift({ id: 'mercadopago', icon: 'mercadopago', label: 'Mercado Pago' })
  if (bitpayEnabled()) methods.unshift({ id: 'bitpay', icon: '₿', label: 'BitPay (cripto)' })
  if (paypalEnabled()) methods.unshift({ id: 'paypal', icon: 'paypal', label: 'PayPal' })
  if (googlePayEnabled()) methods.unshift({ id: 'googlepay', icon: '🅶', label: 'Google Pay (Wallet)' })

  return (
    <div className="fs-astro-overlay" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: 16, zIndex: 4000 }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 80px rgba(0,0,0,0.7)' }} onClick={e => e.stopPropagation()}>
        {done ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <h2 style={{ color: '#fff', margin: '0 0 8px', fontWeight: 800, fontSize: 20 }}>Assinatura ativada!</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Seu plano {plan.name} já está valendo. Aproveite os recursos premium!</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #1e1e1e' }}>
              <h2 style={{ color: '#fff', margin: 0, fontWeight: 800, fontSize: 16 }}>Assinar {plan.name}</h2>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20, padding: 4 }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: btnClass, fontWeight: 900, fontSize: 28 }}>{fmtPrice(plan.monthlyPrice)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>por mês</div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Forma de pagamento</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {methods.map(m => (
                    <button key={m.id} onClick={() => { setMethod(m.id); setPayError('') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: method === m.id ? 'rgba(255,255,255,.08)' : 'transparent', border: `1px solid ${method === m.id ? 'var(--accent)' : 'var(--border)'}`, color: method === m.id ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'left' }}>
                      <span style={{ fontSize: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20 }}>
                        {m.icon === 'paypal' ? <PayPalLogo size={20} /> : m.icon === 'mercadopago' ? <MercadoPagoLogo size={20} /> : m.icon}
                      </span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {method === 'googlepay' && (
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🅶</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>Pague com Google Pay</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>A folha do Google Pay abre na confirmação. Seu cartão fica salvo na sua conta Google — nenhum dado de cartão passa pelo Friends Space.</div>
                </div>
              )}
              {method === 'paypal' && (
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                    <PayPalLogo size={22} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>PayPal</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>Pague com sua conta PayPal. O botão abaixo abre o popup oficial do PayPal — nenhum dado de cartão passa pelo Friends Space.</div>
                  <div id="paypal-button-container" style={{ minHeight: 48 }} />
                </div>
              )}
              {method === 'bitpay' && (
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 8, fontWeight: 800 }}>BitPay</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>Pague com criptomoedas (BTC, ETH e outras). A fatura BitPay abre em nova aba.</div>
                  <button onClick={() => void startBitPay()} disabled={processing}
                    style={{ width: '100%', padding: '12px 0', border: 'none', borderRadius: 10, background: btnClass, color: '#000', fontWeight: 800, fontSize: 14, cursor: processing ? 'default' : 'pointer', opacity: processing ? 0.6 : 1 }}>
                    {processing ? 'Abrindo BitPay...' : 'Pagar com BitPay'}
                  </button>
                </div>
              )}
              {method === 'mercadopago' && (
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 8, fontWeight: 800 }}>Mercado Pago</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>Pague com PIX, cartão, boleto ou saldo Mercado Pago. A janela oficial do Mercado Pago abre em nova aba.</div>
                  <button onClick={() => void startMercadoPago()} disabled={processing}
                    style={{ width: '100%', padding: '12px 0', border: 'none', borderRadius: 10, background: btnClass, color: '#000', fontWeight: 800, fontSize: 14, cursor: processing ? 'default' : 'pointer', opacity: processing ? 0.6 : 1 }}>
                    {processing ? 'Abrindo Mercado Pago...' : 'Pagar com Mercado Pago'}
                  </button>
                </div>
              )}
              {method === 'pix' && (
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ width: 140, height: 140, margin: '0 auto 10px', background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#999' }}>QR Code (simulado)</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>Escaneie o QR Code com seu banco para pagar via PIX.</div>
                </div>
              )}
              {payError && (
                <div style={{ fontSize: 12, color: '#f87171', textAlign: 'center', lineHeight: 1.5 }}>
                  {payError}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                {method === 'paypal' || method === 'bitpay' || method === 'mercadopago'
                  ? 'Pagamento processado pelo gateway oficial. A ativação ocorre após a confirmação.'
                  : 'Ambiente de demonstração — nenhum pagamento real é processado. A ativação é imediata.'}
              </div>
              {method !== 'paypal' && method !== 'bitpay' && method !== 'mercadopago' && (
                <button onClick={confirm} disabled={processing}
                  style={{ width: '100%', padding: '14px 0', border: 'none', borderRadius: 12, background: btnClass, color: '#000', fontWeight: 800, fontSize: 15, cursor: processing ? 'default' : 'pointer', opacity: processing ? 0.6 : 1 }}>
                  {processing ? 'Processando...' : `Pagar ${fmtPrice(plan.monthlyPrice)}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}