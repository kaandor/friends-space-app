import { Fa } from '../../utils/fa'
import { useState } from 'react'
import { useUserStore } from '../../stores/userStore'
import { useServerStore } from '../../stores/serverStore'

interface HelpReportModalProps {
  open: boolean
  onClose: () => void
}

const CATEGORIES = [
  { key: 'bug', label: 'Bug / travamento', icon: 'bug' },
  { key: 'suggestion', label: 'Sugestao', icon: 'lightbulb' },
  { key: 'missing', label: 'Recurso faltando', icon: 'list-check' },
  { key: 'other', label: 'Outro', icon: 'ellipsis' },
]

// Formulario de ajuda/relato de experiencia — os relatos caem na aba
// "Suporte / Erros" do painel dev/suporte.
export function HelpReportModal({ open, onClose }: HelpReportModalProps) {
  const { currentUser } = useUserStore()
  const { createReport } = useServerStore()
  const [category, setCategory] = useState('bug')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (!open) return null

  const reset = () => {
    setCategory('bug')
    setDescription('')
    setError('')
    setDone(false)
    setBusy(false)
  }

  const submit = async () => {
    if (!currentUser) { setError('Voce precisa estar logado para relatar.'); return }
    if (!description.trim()) { setError('Descreva o que aconteceu.'); return }
    setError('')
    setBusy(true)
    try {
      const result = await createReport({
        reporterId: currentUser.id,
        type: 'help',
        target: { id: currentUser.id, name: currentUser.name },
        questionnaire: [CATEGORIES.find(c => c.key === category)?.label || 'Outro'],
        description: description.trim(),
      })
      if (result.error || !result.report) {
        setError(result.error || 'Erro ao enviar relato')
      } else {
        setDone(true)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3150, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 520, padding: 24, color: 'var(--text-primary)', boxShadow: '0 12px 48px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={() => { reset(); onClose() }} aria-label="Fechar" style={{ position: 'absolute', top: 14, right: 16, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18 }}>
          <Fa name="xmark" size={14} />
        </button>

        {done ? (
          <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1e2e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Fa name="check" size={24} style={{ color: '#4ade80' }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Relato enviado!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>
              Obrigado! Sua mensagem foi para a equipe de suporte e ajuda a melhorar o Friends Space.
            </p>
            <button
              onClick={() => { reset(); onClose() }}
              style={{ padding: '11px 24px', borderRadius: 9, background: 'var(--accent, #5865f2)', border: 'none', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, background: 'var(--bg-hover)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Fa name="circle-question" size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Ajuda</h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Relate um problema ou de uma sugestao</span>
              </div>
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 8px', fontWeight: 600 }}>O que voce quer reportar?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10,
                    background: category === cat.key ? 'var(--bg-hover)' : 'transparent',
                    border: `1px solid ${category === cat.key ? 'var(--accent)' : 'var(--border)'}`,
                    color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Fa name={cat.icon} size={13} style={{ color: 'var(--accent)' }} />
                  {cat.label}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 8px', fontWeight: 600 }}>Descreva o que aconteceu *</p>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Explique com detalhes: o que voce fez, o que esperava e o que aconteceu... (se for bug, diga se foi no site ou no app desktop)"
              rows={4}
              style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13.5, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />

            {error && <p style={{ color: '#f87171', fontSize: 12.5, marginTop: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { reset(); onClose() }}
                style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--bg-hover)', border: 'none', color: 'var(--text-secondary)', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => void submit()}
                disabled={busy}
                style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--accent, #5865f2)', border: 'none', color: '#000', fontSize: 13.5, cursor: busy ? 'default' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}
              >
                {busy ? <span className="inline-spinner" /> : <Fa name="paper-plane" size={12} />}
                Enviar relato
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
