import { useState } from 'react'
import { Fa } from '../../utils/fa'
import { useUserStore } from '../../stores/userStore'
import { useServerStore } from '../../stores/serverStore'
import { ASTRO_PLANS, getAstroTier } from '../../utils/astro'

const METHODS = [
  { key: 'pix', label: 'Pix', icon: 'qrcode' },
  { key: 'googlepay', label: 'Google Pay', icon: 'google-pay' },
  { key: 'paypal', label: 'PayPal', icon: 'paypal' },
  { key: 'bitpay', label: 'BitPay', icon: 'bitcoin' },
  { key: 'mercadopago', label: 'Mercado Pago', icon: 'wallet' },
]

const MONTHS = [1, 3, 6, 12]

const SUPPORT_TOPICS = ['Cobrança indevida', 'Reembolso', 'Trocar de plano', 'Método de pagamento', 'Outro']

// Central da assinatura: status, renovar (1-12 meses), reembolso em 7 dias,
// metodo de pagamento, cancelar e ticket de suporte sobre a assinatura.
export function SubscriptionTab() {
  const { currentUser, renewAstro, refundAstro, setAstroPayMethod, cancelAstro, markAstroPaymentPending } = useUserStore()
  const { createReport } = useServerStore()
  const [months, setMonths] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmRefund, setConfirmRefund] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [topic, setTopic] = useState(SUPPORT_TOPICS[0])
  const [ticketMsg, setTicketMsg] = useState('')
  const [ticketId, setTicketId] = useState<string | null>(null)

  const tier = getAstroTier(currentUser)
  const settings = (currentUser?.settings || {}) as Record<string, unknown>
  const until = Number(settings.astroUntil || 0)
  const payMethod = String(settings.astroPayMethod || '')
  const firstPaid = Number(settings.astroFirstPaidAt) || Number(settings.astroPurchasedAt) || 0
  const refundLeft = firstPaid > 0 ? Math.max(0, 7 - (Date.now() - firstPaid) / 86400000) : 0
  const canRefund = tier !== 'none' && refundLeft > 0 && !settings.astroRefundedAt

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return
    setBusy(key)
    setMsg('')
    try { await fn() } finally { setBusy(null) }
  }

  const handleRenew = () => void run('renew', async () => {
    if (!currentUser) return
    await markAstroPaymentPending()
    const ok = await renewAstro(months)
    setMsg(ok ? `Assinatura renovada por ${months} ${months === 1 ? 'mês' : 'meses'}.` : 'Falha ao renovar. Tente novamente.')
  })

  const handleRefund = () => void run('refund', async () => {
    const ticket = await refundAstro()
    setConfirmRefund(false)
    if (ticket) {
      setTicketId(ticket)
      setMsg(`Reembolso solicitado. Ticket ${ticket} — o estorno cai conforme o método de pagamento.`)
    } else {
      setMsg('Não foi possível pedir o reembolso (prazo de 7 dias ou já processado).')
    }
  })

  const handleSupport = () => void run('support', async () => {
    if (!currentUser || !ticketMsg.trim()) return
    const id = 'ASTRO-' + Date.now().toString(36).toUpperCase()
    const res = await createReport({
      reporterId: currentUser.id,
      type: 'help',
      target: { id: currentUser.id, name: currentUser.name },
      questionnaire: ['Assinatura Astro', topic],
      description: `Ticket ${id}: ${ticketMsg.trim()}`,
    })
    if (!res.error && res.report) {
      setTicketId(id)
      setTicketMsg('')
      setSupportOpen(false)
      setMsg(`Ticket ${id} aberto. A equipe responde no painel de suporte.`)
    } else {
      setMsg(res.error || 'Erro ao abrir ticket.')
    }
  })

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--border)' }

  return (
    <div className="profile-form">
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 40 }}>🚀</div>
        <h3 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 800, margin: '8px 0 4px' }}>Assinatura Astro</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
          {tier === 'none' ? 'Você está no plano gratuito.' : `${ASTRO_PLANS[tier].name} · válido até ${until > 0 ? new Date(until).toLocaleDateString() : '—'}`}
        </p>
      </div>

      {msg && (
        <div style={{ background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.35)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: 'var(--text-primary)', marginBottom: 8 }}>
          {msg}
        </div>
      )}

      {tier !== 'none' && (
        <div style={row}>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13.5 }}>Renovar / adicionar meses</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Estende a validade atual, sem perder dias.</div>
          </div>
          <select value={months} onChange={e => setMonths(Number(e.target.value))}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }}>
            {MONTHS.map(m => <option key={m} value={m}>{m} {m === 1 ? 'mês' : 'meses'}</option>)}
          </select>
          <button onClick={handleRenew} disabled={busy === 'renew'} className="profile-save-btn" style={{ padding: '8px 16px' }}>
            {busy === 'renew' ? '...' : 'Renovar'}
          </button>
        </div>
      )}

      <div style={row}>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13.5 }}>Método de pagamento</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Usado como padrão no checkout.</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {METHODS.map(m => (
            <button key={m.key} title={m.label} onClick={() => void run('method', async () => { await setAstroPayMethod(m.key) })}
              style={{ padding: '7px 10px', borderRadius: 8, border: payMethod === m.key ? '1px solid var(--accent)' : '1px solid var(--border)', background: payMethod === m.key ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14 }}>
              <Fa name={m.icon} size={16} />
            </button>
          ))}
        </div>
      </div>

      {tier !== 'none' && (
        <div style={row}>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13.5 }}>Reembolso</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {canRefund ? `Disponível por mais ${Math.ceil(refundLeft)} ${Math.ceil(refundLeft) === 1 ? 'dia' : 'dias'} (7 dias após a compra).` : 'Disponível até 7 dias após a primeira compra.'}
            </div>
          </div>
          {confirmRefund ? (
            <span style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleRefund} disabled={busy === 'refund'} style={{ padding: '8px 14px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {busy === 'refund' ? '...' : 'Confirmar'}
              </button>
              <button onClick={() => setConfirmRefund(false)} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                Voltar
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmRefund(true)} disabled={!canRefund} className="profile-save-btn" style={{ padding: '8px 16px', opacity: canRefund ? 1 : 0.4 }}>
              Reembolsar
            </button>
          )}
        </div>
      )}

      {tier !== 'none' && (
        <div style={row}>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13.5 }}>Cancelar assinatura</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Volta ao gratuito na hora.</div>
          </div>
          {confirmCancel ? (
            <span style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => void run('cancel', async () => { await cancelAstro(); setConfirmCancel(false) })} disabled={busy === 'cancel'} style={{ padding: '8px 14px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {busy === 'cancel' ? '...' : 'Confirmar'}
              </button>
              <button onClick={() => setConfirmCancel(false)} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                Voltar
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmCancel(true)} style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Cancelar
            </button>
          )}
        </div>
      )}

      <div style={{ ...row, borderBottom: 'none' }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13.5 }}>Suporte da assinatura</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Abre um ticket com a equipe.</div>
        </div>
        <button onClick={() => { setTicketId(null); setSupportOpen(true) }} className="profile-save-btn" style={{ padding: '8px 16px' }}>
          Falar com suporte
        </button>
      </div>

      {supportOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSupportOpen(false)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 440, padding: 18 }} onClick={e => e.stopPropagation()}>
            <h4 style={{ color: 'var(--text-primary)', margin: '0 0 12px', fontSize: 15, fontWeight: 800 }}>Ticket de assinatura</h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {SUPPORT_TOPICS.map(t => (
                <button key={t} onClick={() => setTopic(t)}
                  style={{ padding: '7px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: topic === t ? 'var(--accent)' : 'var(--bg-tertiary)', color: topic === t ? '#000' : 'var(--text-secondary)' }}>
                  {t}
                </button>
              ))}
            </div>
            <textarea value={ticketMsg} onChange={e => setTicketMsg(e.target.value)} rows={4} maxLength={1000}
              placeholder="Descreva o problema com a assinatura..."
              style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', padding: 10, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setSupportOpen(false)} style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--bg-tertiary)', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                Fechar
              </button>
              <button onClick={handleSupport} disabled={busy === 'support' || !ticketMsg.trim()} className="profile-save-btn" style={{ padding: '9px 18px', opacity: !ticketMsg.trim() ? 0.5 : 1 }}>
                {busy === 'support' ? '...' : 'Abrir ticket'}
              </button>
            </div>
            {ticketId && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>Ticket {ticketId} aberto.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
