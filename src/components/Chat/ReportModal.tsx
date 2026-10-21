import { Fa } from '../../utils/fa'
import { useEffect, useMemo, useState } from 'react'
import type { Report } from '../../types'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { uploadToDrive, isDriveConnected } from '../../services/driveService'
import { DriveRequiredModal } from './DriveRequiredModal'
import { TicketChat } from '../Support/TicketChat'

const GREEN = '#4ade80'
const CARD = 'var(--bg-tertiary)'
const BORDER = 'var(--border)'

const TYPE_LABEL: Record<string, string> = {
  media: 'Midia',
  message: 'Mensagem',
  user: 'Usuario',
  server: 'Servidor',
}

const QUESTIONNAIRES: Record<string, string[]> = {
  media: [
    'Midia ilegal ou inadequada',
    'Midia com conteudo sexual ou +18',
    'Midia com violencia ou discriminacao',
    'Eu apareco / meus dados aparecem nessa midia',
    'Midia falsa ou enganosa',
  ],
  message: [
    'Assedio ou ameaca',
    'Conteudo ofensivo ou discriminatorio',
    'Spam ou propagandas',
    'Conteudo ilegal',
    'Divulgacao de dados pessoais',
  ],
  user: [
    'Comportamento abusivo ou assedio',
    'Perfil falso',
    'Divulgacao de dados pessoais',
    'Tentativa de golpe ou fraude',
    'Conteudo inapropriado no perfil',
  ],
  server: [
    'Servidor com conteudo ilegal',
    'Servidor promove odio ou discriminacao',
    'Servidor de golpe ou fraude',
    'Servidor com conteudo +18 para menores',
  ],
}

interface ReportModalProps {
  open: boolean
  type: 'media' | 'message' | 'user' | 'server' | null
  target: { id: string; name?: string; channelId?: string; serverId?: string; preview?: string } | null
  serverId?: string | null
  onClose: () => void
}

export function ReportModal({ open, type, target, serverId, onClose }: ReportModalProps) {
  const { createReport, getMyReports, reportUnanswered } = useServerStore()
  const { currentUser } = useUserStore()
  const [step, setStep] = useState<'form' | 'done' | 'myreports'>('form')
  const [picked, setPicked] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [driveModal, setDriveModal] = useState(false)
  const [myReports, setMyReports] = useState<Report[]>([])
  const [complaintFor, setComplaintFor] = useState<Report | null>(null)
  const [complaintMessage, setComplaintMessage] = useState('')
  const [chatReport, setChatReport] = useState<Report | null>(null)

  useEffect(() => {
    if (open) {
      setStep('form')
      setPicked([])
      setDescription('')
      setProofFile(null)
      setUploading(false)
      setError('')
      setMyReports([])
      setComplaintFor(null)
      setComplaintMessage('')
    }
  }, [open, type, target?.id])

  const options = useMemo(() => (type ? QUESTIONNAIRES[type] || [] : []), [type])

  if (!open || !type) return null

  const toggleQuestion = (q: string) => {
    setPicked(prev => prev.includes(q) ? prev.filter(item => item !== q) : [...prev, q])
  }

  const openMyReports = async () => {
    setMyReports(await getMyReports())
    setStep('myreports')
  }

  const submit = async () => {
    if (!currentUser) return
    if (!description.trim()) {
      setError('Descreva o que aconteceu.')
      return
    }
    if ((type === 'user' || type === 'server') && !proofFile) {
      setError('Anexe uma prova (imagem, vídeo, áudio ou arquivo) para denunciar um usuário ou servidor.')
      return
    }
    setError('')
    setUploading(true)
    try {
      let proofUrl = ''
      if (proofFile) {
        if (!isDriveConnected()) {
          setUploading(false)
          setDriveModal(true)
          return
        }
        proofUrl = (await uploadToDrive(proofFile, `prova-${Date.now()}-${proofFile.name}`, proofFile.type, 'denuncias')) || ''
      }
      const result = await createReport({
        reporterId: currentUser.id,
        type,
        target: target || { id: '' },
        questionnaire: picked,
        description: description.trim(),
        proofUrl,
        scope: serverId ? 'server' : 'global',
        serverId: serverId || '',
      })
      if (result.error || !result.report) {
        setError(result.error || 'Erro ao enviar denuncia')
      } else {
        setStep('done')
      }
    } finally {
      setUploading(false)
    }
  }

  const fileInputLabel = proofFile ? proofFile.name : (type === 'user' || type === 'server') ? 'Anexar prova (obrigatória)' : 'Anexar prova (opcional)'

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', background: 'var(--bg-tertiary)', border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} aria-label="Fechar" style={{ position: 'absolute', top: 16, right: 16, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, zIndex: 10 }}>
          <Fa name="xmark" size={14} />
        </button>

        <div style={{ padding: '24px 28px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, background: '#3b1f1f', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Fa name="flag" size={18} style={{ color: '#f87171' }} />
            </div>
            <h1 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, margin: 0 }}>
              {step === 'myreports' ? 'Minhas denuncias' : `Denunciar ${TYPE_LABEL[type] || 'conteudo'}`}
            </h1>
          </div>
          {step !== 'myreports' && target?.name && (
            <p style={{ color: '#9ca3af', fontSize: 13, margin: '8px 0 0', lineHeight: 1.5 }}>
              Sobre: <b style={{ color: GREEN }}>{target.name}</b>
              {target.preview ? ` - "${target.preview.slice(0, 80)}"` : ''}
            </p>
          )}
        </div>

        <div style={{ padding: '20px 28px 24px', overflowY: 'auto' }}>
          {step === 'form' && (
            <>
              <p style={{ color: '#d1d5db', fontSize: 13.5, margin: '0 0 10px', fontWeight: 600 }}>O que aconteceu? (marque os itens que se aplicam)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {options.map(q => (
                  <label key={q} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: CARD, border: `1px solid ${picked.includes(q) ? GREEN : BORDER}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={picked.includes(q)}
                      onChange={() => toggleQuestion(q)}
                      style={{ marginTop: 2, accentColor: GREEN }}
                    />
                    <span style={{ color: 'var(--text-primary)', fontSize: 13.5 }}>{q}</span>
                  </label>
                ))}
              </div>

              <p style={{ color: '#d1d5db', fontSize: 13.5, margin: '0 0 8px', fontWeight: 600 }}>Descreva o que aconteceu *</p>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Explique com detalhes o que aconteceu..."
                rows={3}
                style={{ width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13.5, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />

              <p style={{ color: '#d1d5db', fontSize: 13.5, margin: '14px 0 8px', fontWeight: 600 }}>Prova (opcional)</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', overflow: 'hidden' }}>
                  <Fa name="paperclip" size={13} style={{ color: GREEN }} />
                  <span style={{ color: '#9ca3af', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileInputLabel}</span>
                  <input type="file" accept="image/*,video/*,application/pdf" style={{ display: 'none' }} onChange={e => setProofFile(e.target.files?.[0] || null)} />
                </label>
                {proofFile && (
                  <button onClick={() => setProofFile(null)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                    Remover
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16, background: '#1e2e1e', border: `1px solid #2c4a2c`, borderRadius: 10, padding: '10px 12px', alignItems: 'flex-start' }}>
                <Fa name="clock" size={13} style={{ color: GREEN, marginTop: 2 }} />
                <span style={{ color: '#c6e6c6', fontSize: 12.5, lineHeight: 1.5 }}>
                  O Friends Space responde em ate <b>uma semana</b>. Se demorar, voce podera fazer uma <b>reclamacao de denuncia nao respondida</b>.
                </span>
              </div>

              {error && <p style={{ color: '#f87171', fontSize: 12.5, marginTop: 12 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                <button
                  onClick={onClose}
                  style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--bg-hover)', border: 'none', color: '#d1d5db', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void submit()}
                  disabled={uploading}
                  style={{ padding: '10px 16px', borderRadius: 10, background: GREEN, border: 'none', color: '#04120a', fontSize: 13.5, cursor: uploading ? 'default' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, opacity: uploading ? 0.7 : 1 }}
                >
                  {uploading ? <span className="inline-spinner" /> : <Fa name="paper-plane" size={12} />}
                  Enviar denuncia
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1e2e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Fa name="check" size={24} style={{ color: GREEN }} />
              </div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Denuncia enviada!</h2>
              <p style={{ color: '#9ca3af', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>
                A equipe do Friends Space vai analisar e responde em ate <b style={{ color: GREEN }}>uma semana</b>.
                Se a resposta demorar, voce pode registrar uma reclamacao de denuncia nao respondida.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => void openMyReports()}
                  style={{ padding: '11px 16px', borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}
                >
                  <Fa name="list-check" size={14} style={{ marginRight: 8, color: GREEN }} />
                  Ver minhas denuncias
                </button>
                <button
                  onClick={onClose}
                  style={{ padding: '11px 16px', borderRadius: 10, background: GREEN, border: 'none', color: '#04120a', fontSize: 13.5, cursor: 'pointer', fontWeight: 700 }}
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          {step === 'myreports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {complaintFor ? (
                <>
                  <p style={{ color: '#d1d5db', fontSize: 13.5, margin: '0 0 8px', fontWeight: 600 }}>
                    Reclamacao de denuncia nao respondida
                  </p>
                  <textarea
                    value={complaintMessage}
                    onChange={e => setComplaintMessage(e.target.value)}
                    placeholder="Explique por que a resposta demorou e o que voce espera..."
                    rows={3}
                    style={{ width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13.5, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      onClick={() => setComplaintFor(null)}
                      style={{ padding: '9px 14px', borderRadius: 10, background: 'var(--bg-hover)', border: 'none', color: '#d1d5db', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Voltar
                    </button>
                    <button
                      onClick={async () => {
                        if (!complaintMessage.trim() || !currentUser) return
                        const result = await reportUnanswered(complaintFor.id, complaintMessage.trim())
                        if (result.error) {
                          setError(result.error)
                          return
                        }
                        setMyReports(await getMyReports())
                        setComplaintFor(null)
                        setComplaintMessage('')
                      }}
                      disabled={!complaintMessage.trim()}
                      style={{ padding: '9px 14px', borderRadius: 10, background: GREEN, border: 'none', color: '#04120a', fontSize: 13, cursor: 'pointer', fontWeight: 700, opacity: complaintMessage.trim() ? 1 : 0.6 }}
                    >
                      Enviar reclamacao
                    </button>
                  </div>
                </>
              ) : myReports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <Fa name="inbox" size={32} style={{  color: '#3a3d42', marginBottom: 10 }} />
                  <p style={{ color: '#9ca3af', fontSize: 13.5, margin: 0 }}>Voce ainda nao fez nenhuma denuncia.</p>
                </div>
              ) : (
                myReports.map(report => (
                  <div key={report.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 700, textTransform: 'capitalize' }}>
                        {TYPE_LABEL[report.type] || report.type}
                        {report.target.name ? ` - ${report.target.name}` : ''}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                        background: report.status === 'responded' ? '#1e2e1e' : '#3b2a1f',
                        color: report.status === 'responded' ? GREEN : '#fbbf24',
                      }}>
                        {report.status === 'responded' ? 'Respondida' : 'Pendente'}
                      </span>
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>
                      {new Date(report.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <p style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.5, margin: '0 0 6px' }}>{report.description}</p>
                    {report.response && (
                      <div style={{ background: '#1e2e1e', border: `1px solid #2c4a2c`, borderRadius: 8, padding: '8px 10px', color: '#c6e6c6', fontSize: 12.5, lineHeight: 1.5 }}>
                        <b style={{ color: GREEN }}>Resposta do FS:</b> {report.response}
                      </div>
                    )}
                    <button
                      onClick={() => setChatReport(report)}
                      style={{ marginTop: 8, marginRight: 6, padding: '7px 12px', borderRadius: 8, background: '#12283d', border: '1px solid #2563eb55', color: '#93c5fd', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
                    >
                      Abrir chat do ticket
                    </button>
                    {report.status === 'pending' && !report.complained && (
                      <button
                        onClick={() => setComplaintFor(report)}
                        style={{ marginTop: 8, padding: '7px 12px', borderRadius: 8, background: '#3b2a1f', border: 'none', color: '#fbbf24', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                      >
                        <Fa name="rotate-left" size={14} style={{ marginRight: 6 }} />
                        Reclamacao de denuncia nao respondida
                      </button>
                    )}
                    {report.complained && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#fbbf24' }}>
                        <Fa name="check-circle" size={14} style={{ marginRight: 6 }} />
                        Reclamacao enviada - a equipe foi avisada.
                      </div>
                    )}
                  </div>
                ))
              )}
              {!complaintFor && (
                <button
                  onClick={() => setStep('done')}
                  style={{ marginTop: 4, padding: '10px 16px', borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: '#d1d5db', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                >
                  Voltar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {chatReport && (
        <TicketChat
          report={chatReport}
          mode="user"
          onClose={() => setChatReport(null)}
          onUpdated={updated => {
            setChatReport(updated)
            setMyReports(prev => prev.map(item => item.id === updated.id ? updated : item))
          }}
        />
      )}

      <DriveRequiredModal
        open={driveModal}
        onClose={() => { setDriveModal(false); setUploading(false) }}
        onConnected={() => { setDriveModal(false); setUploading(false) }}
        file={proofFile}
      />
    </div>
  )
}
