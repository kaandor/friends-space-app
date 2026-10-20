import { Fa } from '../../utils/fa'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Report } from '../../types'
import { useUserStore } from '../../stores/userStore'
import { useServerStore } from '../../stores/serverStore'
import { listMyDefenses } from '../../services/tickets'
import { uploadToDrive, isDriveConnected } from '../../services/driveService'
import { TicketChat } from '../Support/TicketChat'

interface HelpReportModalProps {
  open: boolean
  onClose: () => void
}

const CATEGORIES = [
  { key: 'support', label: 'Suporte / problema', icon: 'headset', help: true },
  { key: 'user', label: 'Denúncia de usuário', icon: 'user-shield', help: false },
  { key: 'server', label: 'Denúncia de servidor', icon: 'shield', help: false },
  { key: 'complaint', label: 'Reclamação', icon: 'flag', help: true },
  { key: 'bug', label: 'Erro / bug', icon: 'bug', help: true },
  { key: 'suggestion', label: 'Sugestão', icon: 'lightbulb', help: true },
]

const CATEGORY_LABEL: Record<string, string> = {
  support: 'Suporte', user: 'Denúncia de usuário', server: 'Denúncia de servidor',
  complaint: 'Reclamação', bug: 'Erro / bug', suggestion: 'Sugestão',
  media: 'Mídia', message: 'Mensagem', help: 'Ajuda',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando suporte', responded: 'Respondido', open: 'Em atendimento',
  awaiting_user: 'Aguardando você', awaiting_support: 'Aguardando suporte',
  defense: 'Em defesa', resolved: 'Resolvido',
}

function fmt(ts: number) {
  return new Date(ts).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function HelpReportModal({ open, onClose }: HelpReportModalProps) {
  const { currentUser } = useUserStore()
  const { createReport, getMyReports } = useServerStore()
  const [tab, setTab] = useState<'new' | 'tickets'>('new')
  const [category, setCategory] = useState('support')
  const [subject, setSubject] = useState('')
  const [target, setTarget] = useState('')
  const [description, setDescription] = useState('')
  const [proofLink, setProofLink] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [myReports, setMyReports] = useState<Report[]>([])
  const [defenses, setDefenses] = useState<Report[]>([])
  const [defenseIds, setDefenseIds] = useState<Set<string>>(new Set())
  const [chat, setChat] = useState<{ report: Report; mode: 'user' | 'defense' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const needsTarget = category === 'user' || category === 'server'
  const needsProof = category === 'user' || category === 'server' || category === 'complaint'

  const loadTickets = useCallback(async () => {
    if (!currentUser) return
    const [reports, defenseReports] = await Promise.all([getMyReports(), listMyDefenses()])
    setMyReports(reports || [])
    setDefenses(defenseReports || [])
    setDefenseIds(new Set((defenseReports || []).map(item => item.id)))
  }, [currentUser, getMyReports])

  useEffect(() => {
    if (!open) return
    void loadTickets()
  }, [open, loadTickets])

  if (!open) return null

  const reset = () => {
    setTab('new')
    setCategory('support')
    setSubject('')
    setTarget('')
    setDescription('')
    setProofLink('')
    setFiles([])
    setError('')
    setDone(false)
    setBusy(false)
    setChat(null)
  }

  const submit = async () => {
    if (!currentUser) { setError('Você precisa estar logado para abrir um ticket.'); return }
    if (!subject.trim()) { setError('Escreva um título para o ticket.'); return }
    if (!description.trim()) { setError('Descreva o que aconteceu.'); return }
    if (needsTarget && !target.trim()) { setError('Informe o ID ou @ do usuário/servidor denunciado.'); return }
    if (needsProof && files.length === 0 && !proofLink.trim()) {
      setError('Anexe pelo menos uma prova (imagem, vídeo, áudio, arquivo ou link).')
      return
    }
    setError('')
    setBusy(true)
    try {
      const evidence = [] as { url: string; name: string; type: string }[]
      if (files.length > 0) {
        if (!isDriveConnected()) { setError('Conecte o Drive para anexar arquivos de prova.'); return }
        for (const file of files.slice(0, 6)) {
          const url = await uploadToDrive(file, `ticket-${Date.now()}-${file.name}`, file.type, 'tickets')
          if (url) evidence.push({ url, name: file.name, type: file.type || 'file' })
        }
      }
      if (proofLink.trim() && /^https?:\/\//i.test(proofLink.trim())) {
        evidence.push({ url: proofLink.trim(), name: 'Link de prova', type: 'link' })
      }
      const result = await createReport({
        reporterId: currentUser.id,
        type: needsTarget ? (category as 'user' | 'server') : 'help',
        target: needsTarget
          ? { id: target.trim(), name: target.trim() }
          : { id: currentUser.id, name: currentUser.name },
        questionnaire: [CATEGORY_LABEL[category] || 'Ajuda'],
        description: `${subject.trim()}\n\n${description.trim()}`,
        proofUrl: evidence[0]?.url || '',
        evidence,
        subject: subject.trim(),
      })
      if (result.error || !result.report) {
        setError(result.error || 'Erro ao abrir ticket')
      } else {
        setDone(true)
        setChat({ report: result.report, mode: 'user' })
        void loadTickets()
      }
    } finally {
      setBusy(false)
    }
  }

  const tickets = [...myReports, ...defenses].filter((item, index, list) => list.findIndex(x => x.id === item.id) === index)
  const activeTicket = chat?.report

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 3150, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: 16 }} onClick={() => { reset(); onClose() }}>
        <div style={{ position: 'relative', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', padding: 24, color: 'var(--text-primary)', boxShadow: '0 12px 48px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { reset(); onClose() }} aria-label="Fechar" style={{ position: 'absolute', top: 14, right: 16, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18 }}><Fa name="xmark" size={14} /></button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, background: 'var(--bg-hover)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Fa name="circle-question" size={18} style={{ color: 'var(--text-primary)' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Ajuda e suporte</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Abra um ticket, anexe provas e converse com a equipe</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <button onClick={() => setTab('new')} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${tab === 'new' ? 'var(--accent)' : 'var(--border)'}`, background: tab === 'new' ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Abrir ticket</button>
            <button onClick={() => { setTab('tickets'); void loadTickets() }} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${tab === 'tickets' ? 'var(--accent)' : 'var(--border)'}`, background: tab === 'tickets' ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Meus tickets ({myReports.length + defenseIds.size})
            </button>
          </div>

          {tab === 'tickets' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tickets.length === 0 && defenseIds.size === 0 && <div style={{ padding: 18, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Nenhum ticket seu ainda.</div>}
              {tickets.map(ticket => (
                <button key={ticket.id} onClick={() => setChat({ report: ticket, mode: defenseIds.has(ticket.id) ? 'defense' : 'user' })} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{CATEGORY_LABEL[ticket.questionnaire?.[0]?.toLowerCase()] || ticket.questionnaire?.[0] || 'Ticket'}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ticket.status === 'resolved' ? '#4ade80' : ticket.defenseOpen ? '#c084fc' : '#60a5fa' }}>{STATUS_LABEL[ticket.status] || ticket.status}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-muted)' }}>{fmt(ticket.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject || ticket.description.slice(0, 70) || 'Ticket'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{ticket.messages?.length || 0} mensagem(ns)</div>
                </button>
              ))}
              {[...defenseIds].filter(id => !myReports.some(item => item.id === id)).length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>Você também tem chamadas de defesa. Toque em “Atualizar” ou reabra esta janela para carregá-las.</div>
              )}
              <button onClick={() => void loadTickets()} style={{ marginTop: 4, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Atualizar tickets</button>
            </div>
          ) : done ? (
            <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1e2e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><Fa name="check" size={24} style={{ color: '#4ade80' }} /></div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Ticket aberto!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>A equipe de suporte recebeu seu pedido. Use o chat para conversar e enviar mais provas.</p>
              <button onClick={() => { setDone(false); setTab('tickets'); void loadTickets() }} style={{ padding: '10px 20px', borderRadius: 9, background: 'var(--accent, #5865f2)', border: 'none', color: '#000', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Ver meus tickets</button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px', fontWeight: 600 }}>O que você quer fazer?</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 14 }}>
                {CATEGORIES.map(item => (
                  <button key={item.key} onClick={() => setCategory(item.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 10px', borderRadius: 9, background: category === item.key ? 'var(--bg-hover)' : 'transparent', border: `1px solid ${category === item.key ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                    <Fa name={item.icon} size={12} /> {item.label}
                  </button>
                ))}
              </div>

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>Título do ticket *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex.: Não consigo entrar em call" style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', padding: '9px 11px', fontSize: 13, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />

              {needsTarget && (
                <>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>{category === 'server' ? 'ID ou nome do servidor denunciado *' : 'ID, @ ou nome do usuário denunciado *'}</label>
                  <input value={target} onChange={e => setTarget(e.target.value)} placeholder={category === 'server' ? 'ID do servidor' : '@usuario ou ID'} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', padding: '9px 11px', fontSize: 13, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
                </>
              )}

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>Descreva com detalhes *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="O que aconteceu? Quem estava envolvido? Quando? Quanto mais detalhes, melhor." rows={4} style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', padding: '9px 11px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', margin: '12px 0 5px' }}>Provas {needsProof ? '*' : '(opcional)'}</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.rar" multiple hidden onChange={e => { if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files || [])].slice(0, 6)); e.target.value = '' }} />
                <button onClick={() => fileRef.current?.click()} style={{ padding: '8px 11px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Fa name="paperclip" size={11} /> Anexar imagens/vídeos/áudios</button>
                {files.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--text-muted)', alignSelf: 'center' }}>{files.length} arquivo(s)</span>}
              </div>
              <input value={proofLink} onChange={e => setProofLink(e.target.value)} placeholder="Ou cole um link de prova (https://...)" style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', padding: '9px 11px', fontSize: 12.5, marginTop: 7, boxSizing: 'border-box', outline: 'none' }} />
              {files.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                  {files.map((file, index) => (
                    <span key={`${file.name}-${index}`} style={{ fontSize: 10.5, padding: '3px 7px', borderRadius: 999, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{file.name.slice(0, 32)}</span>
                  ))}
                </div>
              )}

              {error && <p style={{ color: '#f87171', fontSize: 12.5, marginTop: 12 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                <button onClick={() => { reset(); onClose() }} style={{ padding: '9px 15px', borderRadius: 9, background: 'var(--bg-hover)', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={() => void submit()} disabled={busy} style={{ padding: '9px 17px', borderRadius: 9, background: 'var(--accent, #5865f2)', border: 'none', color: '#000', fontSize: 13, cursor: busy ? 'default' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, opacity: busy ? 0.7 : 1 }}>
                  {busy ? <span className="inline-spinner" /> : <Fa name="paper-plane" size={11} />} Abrir ticket
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {activeTicket && (
        <TicketChat
          report={activeTicket}
          mode={chat?.mode || 'user'}
          onClose={() => { setChat(null); void loadTickets() }}
          onUpdated={updated => { setChat({ report: updated, mode: chat?.mode || 'user' }); void loadTickets() }}
        />
      )}
    </>
  )
}
