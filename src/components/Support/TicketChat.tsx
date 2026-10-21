import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Gavel, Link2, Loader2, MessageSquare, Paperclip, RefreshCw, Send, Shield, X } from 'lucide-react'
import type { Report, ReportAttachment } from '../../types'
import { uploadToDrive, isDriveConnected } from '../../services/driveService'
import { sendReportMessage, setReportStatus, voteReport, type TicketStatus } from '../../services/tickets'
import { userIsDev } from '../../services/admin'
import { useUserStore } from '../../stores/userStore'

type ChatMode = 'user' | 'support' | 'defense'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando suporte',
  responded: 'Respondido',
  open: 'Em atendimento',
  awaiting_user: 'Aguardando você',
  awaiting_support: 'Aguardando suporte',
  defense: 'Em defesa',
  council: 'No conselho',
  resolved: 'Resolvido',
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#f0b232',
  responded: '#4ade80',
  open: '#60a5fa',
  awaiting_user: '#f0b232',
  awaiting_support: '#60a5fa',
  defense: '#c084fc',
  council: '#f59e0b',
  resolved: '#4ade80',
}

const PUNISHMENT_SCOPE: Record<string, 'global' | 'chats' | 'calls' | 'cam' | 'servers' | 'dmCalls'> = {
  'Banimento geral': 'global',
  'Banimento de chats': 'chats',
  'Banimento de calls': 'calls',
  'Banimento de call com câmera': 'cam',
  'Banimento de servidores': 'servers',
  'Banimento de calls em DM': 'dmCalls',
  'Suspensão (global)': 'global',
}

const CANNED_MESSAGES = [
  'Bom dia! Eu sou do suporte do Friends Space e vim resolver o seu problema.',
  'Boa tarde! Eu sou do suporte do Friends Space e vim resolver o seu problema.',
  'Boa noite! Eu sou do suporte do Friends Space e vim resolver o seu problema.',
  'Queria saber como posso ajudar a resolver o seu problema.',
  'Estamos analisando o seu caso com atenção. Já já retornamos com uma resposta.',
  'Precisamos que você envie provas (imagens, vídeos, áudios ou links) para continuarmos.',
  'O usuário denunciado foi banido e está tomando as consequências.',
  'O usuário denunciado foi suspenso e está tomando as consequências.',
  'Muito obrigado pela compreensão. Qualquer dúvida, estamos por aqui.',
]

function fmt(ts: number) {
  return new Date(ts).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function AttachmentCard({ item }: { item: ReportAttachment }) {
  const type = item.type || ''
  if (type.startsWith('image/')) {
    return (
      <a href={item.url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6 }}>
        <img src={item.url} alt={item.name} style={{ maxWidth: 240, maxHeight: 170, borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
      </a>
    )
  }
  if (type.startsWith('video/')) {
    return <video src={item.url} controls style={{ maxWidth: 280, borderRadius: 8, marginTop: 6, display: 'block' }} />
  }
  if (type.startsWith('audio/')) {
    return <audio src={item.url} controls style={{ maxWidth: 280, marginTop: 6, display: 'block' }} />
  }
  return (
    <a href={item.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, color: '#60a5fa', fontSize: 12.5, wordBreak: 'break-all' }}>
      <Link2 size={13} /> {item.name || 'Abrir prova'}
    </a>
  )
}

interface TicketChatProps {
  report: Report
  mode: ChatMode
  onClose: () => void
  onUpdated?: (report: Report) => void
  onRefresh?: () => void
  onBan?: (targetId: string) => void
  onEscalate?: () => void
}

export function TicketChat({ report, mode, onClose, onUpdated, onRefresh, onBan, onEscalate }: TicketChatProps) {
  const me = useUserStore(s => s.currentUser)
  const [ticket, setTicket] = useState(report)
  const [text, setText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [verdict, setVerdict] = useState(report.verdict || '')
  const [punishment, setPunishment] = useState(report.punishment || '')
  const [punishMinutes, setPunishMinutes] = useState('0')
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setTicket(report) }, [report])
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [ticket.messages?.length])

  const messages = ticket.messages || []
  const status = ticket.status || 'pending'
  const color = STATUS_COLOR[status] || '#f0b232'
  const staff = mode === 'support'
  const resolved = status === 'resolved'

  const pickFiles = (files: FileList | null) => {
    if (!files) return
    const list = Array.from(files).slice(0, 4)
    if (!isDriveConnected()) {
      setError('Conecte o Drive (Configurações > Drive) para anexar imagens, vídeos ou áudios.')
      return
    }
    setError('')
    setPendingFiles(prev => [...prev, ...list].slice(0, 6))
  }

  const addLink = () => {
    const url = window.prompt('Cole o link da prova (imagem, vídeo, áudio ou texto):')
    if (!url || !/^https?:\/\//i.test(url.trim())) return
    setText(prev => `${prev}${prev ? '\n' : ''}Prova: ${url.trim()}`)
  }

  const send = async () => {
    if (busy || resolved) return
    if (!text.trim() && pendingFiles.length === 0) { setError('Escreva uma mensagem ou anexe uma prova.'); return }
    setBusy(true)
    setError('')
    try {
      const attachments: ReportAttachment[] = []
      for (const file of pendingFiles) {
        const url = await uploadToDrive(file, `ticket-${Date.now()}-${file.name}`, file.type, 'tickets')
        if (url) attachments.push({ url, name: file.name, type: file.type || 'file' })
      }
      const result = await sendReportMessage(ticket.id, text.trim(), attachments)
      if (!result.report) { setError(result.error || 'Erro ao enviar'); return }
      setTicket(result.report)
      setText('')
      setPendingFiles([])
      onUpdated?.(result.report)
    } finally {
      setBusy(false)
    }
  }

  const updateStatus = async (next: TicketStatus, options?: { defenseOpen?: boolean; verdict?: string; punishment?: string; punishmentScope?: 'global' | 'chats' | 'calls' | 'cam' | 'servers' | 'dmCalls' | ''; punishmentMinutes?: number; assign?: boolean }) => {
    setBusy(true)
    setError('')
    const result = await setReportStatus(ticket.id, next, options)
    setBusy(false)
    if (!result.report) { setError(result.error || 'Erro ao atualizar'); return }
    setTicket(result.report)
    onUpdated?.(result.report)
    onRefresh?.()
  }

  const resolve = async () => {
    if (!verdict.trim()) { setError('Escreva o veredito antes de encerrar.'); return }
    const scope = PUNISHMENT_SCOPE[punishment]
    const minutes = Math.max(0, Number(punishMinutes) || 0)
    if (punishment && !scope) { setError('Escolha uma consequência válida.'); return }
    await updateStatus('resolved', { verdict: verdict.trim(), punishment, punishmentScope: scope, punishmentMinutes: minutes })
  }

  const vote = async (value: 'guilty' | 'innocent') => {
    setBusy(true)
    setError('')
    const result = await voteReport(ticket.id, value)
    setBusy(false)
    if (!result.report) { setError(result.error || 'Erro ao votar'); return }
    setTicket(result.report)
    onUpdated?.(result.report)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.78)', padding: 14 }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(760px, 98vw)', height: 'min(720px, calc(100vh - 28px))', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 28px 90px rgba(0,0,0,0.7)' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {staff ? <Shield size={17} /> : <MessageSquare size={17} />}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.subject || ticket.target?.name || 'Ticket de atendimento'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {ticket.reporterName || (mode === 'defense' ? 'Equipe Friends Space' : 'Você')} · {fmt(ticket.createdAt)} · #{ticket.id.slice(0, 8)}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 999, color, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid ${color}55` }}>
            {STATUS_LABEL[status] || status}
          </span>
          {staff && ticket.assignedToName && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Atendente: {ticket.assignedToName}</span>}
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', width: 30, height: 30, borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', background: 'var(--bg-secondary)' }}>
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pedido original</div>
            {ticket.questionnaire?.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5 }}>Motivos: {ticket.questionnaire.join(', ')}</div>}
            {ticket.description && <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ticket.description}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(ticket.evidence || []).map((item, index) => <AttachmentCard key={`${item.url}-${index}`} item={item} />)}
            </div>
            {ticket.proofUrl && !(ticket.evidence || []).some(item => item.url === ticket.proofUrl) && (
              <AttachmentCard item={{ url: ticket.proofUrl, name: 'Prova anexada', type: 'link' }} />
            )}
            {ticket.target?.name && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>Envolvido: {ticket.target.name}</div>}
          </div>

          {mode === 'defense' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: 'color-mix(in srgb, #c084fc 10%, transparent)', border: '1px solid #c084fc55', marginBottom: 14, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <AlertTriangle size={16} style={{ color: '#c084fc', flexShrink: 1 }} />
              Você foi chamado a se defender. Envie sua versão e provas (imagens, vídeos, áudios ou links). A equipe e o conselho vão analisar.
            </div>
          )}

          {messages.length === 0 && (
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)', padding: '18px 0' }}>
              Nenhuma mensagem ainda. O suporte vai responder por aqui.
            </div>
          )}

          {messages.map(message => {
            const mine = message.authorId === me?.id
            const system = message.authorRole === 'system'
            if (system) {
              return (
                <div key={message.id} style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0', fontStyle: 'italic' }}>{message.content}</div>
              )
            }
            return (
              <div key={message.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                <div style={{ maxWidth: '82%', padding: '9px 12px', borderRadius: 12, background: mine ? 'color-mix(in srgb, var(--accent) 18%, var(--bg-tertiary))' : 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: message.authorRole === 'support' ? '#4ade80' : message.authorRole === 'target' ? '#c084fc' : 'var(--text-secondary)', marginBottom: 3 }}>
                    {message.authorName}{message.authorRole === 'support' ? ' · Suporte' : message.authorRole === 'target' ? ' · Defesa' : ''}
                  </div>
                  {message.content && <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(message.attachments || []).map((item, index) => <AttachmentCard key={`${item.url}-${index}`} item={item} />)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, textAlign: 'right' }}>{fmt(message.createdAt)}</div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {resolved ? (
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#4ade80' }}><CheckCircle2 size={16} /> Ticket encerrado</div>
            {ticket.verdict && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 5, whiteSpace: 'pre-wrap' }}>Veredito: {ticket.verdict}</div>}
            {ticket.punishment && <div style={{ fontSize: 12.5, color: '#f87171', marginTop: 3 }}>Consequência: {ticket.punishment}</div>}
            {staff && <button onClick={() => void updateStatus('open')} style={{ marginTop: 8, padding: '7px 11px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Reabrir ticket</button>}
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', background: 'var(--bg-primary)' }}>
            {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{error}</div>}
            {pendingFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {pendingFiles.map((file, index) => (
                  <span key={`${file.name}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '4px 8px', borderRadius: 999, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <Paperclip size={11} /> {file.name.slice(0, 28)}
                    <button onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== index))} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            {staff && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {CANNED_MESSAGES.map(canned => (
                  <button key={canned} onClick={() => setText(prev => prev ? `${prev}\n${canned}` : canned)} style={{ padding: '4px 8px', borderRadius: 999, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 10.5, cursor: 'pointer' }}>
                    {canned.slice(0, 26)}{canned.length > 26 ? '…' : ''}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                placeholder={mode === 'defense' ? 'Escreva sua defesa com detalhes...' : 'Escreva uma mensagem para o suporte...'}
                rows={2}
                style={{ flex: 1, resize: 'vertical', minHeight: 42, maxHeight: 120, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', padding: '9px 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
              <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.rar" multiple hidden onChange={e => { pickFiles(e.target.files); e.target.value = '' }} />
              <button onClick={() => fileRef.current?.click()} title="Anexar prova" style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Paperclip size={16} /></button>
              <button onClick={addLink} title="Adicionar link de prova" style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Link2 size={16} /></button>
              <button onClick={() => void send()} disabled={busy} title="Enviar" style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--accent)', border: 'none', color: '#04120a', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.65 : 1 }}>
                {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              </button>
            </div>
            {staff && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9, alignItems: 'center' }}>
                {ticket.status === 'council' && (
                  <div style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, #f59e0b 8%, transparent)', border: '1px solid #f59e0b44', marginBottom: 4 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#f59e0b' }}>
                      Conselho: {(ticket.councilVotes || []).filter(v => v.vote === 'guilty').length} culpa · {(ticket.councilVotes || []).filter(v => v.vote === 'innocent').length} inocente (mín. 3 votos)
                    </div>
                    {(ticket.councilVotes || []).map(v => (
                      <div key={v.userId} style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{v.userName}: {v.vote === 'guilty' ? 'culpado' : 'inocente'}{v.note ? ` — ${v.note}` : ''}</div>
                    ))}
                    {userIsDev(me) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => void vote('guilty')} style={{ padding: '5px 9px', borderRadius: 6, background: '#f23f43', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Votar culpado</button>
                        <button onClick={() => void vote('innocent')} style={{ padding: '5px 9px', borderRadius: 6, background: '#4ade80', border: 'none', color: '#04120a', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Votar inocente</button>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={() => void updateStatus('open', { assign: true })} style={{ padding: '6px 9px', borderRadius: 7, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11.5, cursor: 'pointer' }}>Assumir atendimento</button>
                <button onClick={() => void updateStatus('defense', { defenseOpen: true })} style={{ padding: '6px 9px', borderRadius: 7, background: 'color-mix(in srgb, #c084fc 12%, transparent)', border: '1px solid #c084fc55', color: '#c084fc', fontSize: 11.5, cursor: 'pointer' }}>Chamar defesa do denunciado</button>
                <button onClick={() => void updateStatus('council')} style={{ padding: '6px 9px', borderRadius: 7, background: 'color-mix(in srgb, #f59e0b 12%, transparent)', border: '1px solid #f59e0b55', color: '#f59e0b', fontSize: 11.5, cursor: 'pointer' }}>Enviar ao conselho</button>
                {onEscalate && (
                  <button onClick={onEscalate} style={{ padding: '6px 9px', borderRadius: 7, background: 'color-mix(in srgb, #f23f43 12%, transparent)', border: '1px solid #f23f4355', color: '#f23f43', fontSize: 11.5, cursor: 'pointer' }}>Escalar ao Friends Space</button>
                )}
                <button onClick={() => onRefresh?.()} title="Atualizar" style={{ padding: '6px 8px', borderRadius: 7, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}><RefreshCw size={12} /></button>
                <div style={{ flex: 1 }} />
                <input value={verdict} onChange={e => setVerdict(e.target.value)} placeholder="Veredito / decisão do conselho" style={{ flex: 1, minWidth: 180, padding: '6px 9px', borderRadius: 7, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11.5, outline: 'none' }} />
                <select value={punishment} onChange={e => setPunishment(e.target.value)} style={{ padding: '6px 9px', borderRadius: 7, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11.5 }}>
                  <option value="">Sem punição</option>
                  <option>Banimento geral</option>
                  <option>Banimento de chats</option>
                  <option>Banimento de calls</option>
                  <option>Banimento de call com câmera</option>
                  <option>Banimento de servidores</option>
                  <option>Banimento de calls em DM</option>
                  <option>Suspensão (global)</option>
                </select>
                <input value={punishMinutes} onChange={e => setPunishMinutes(e.target.value)} type="number" min={0} title="Duração em minutos (0 = permanente)" placeholder="min" style={{ width: 64, padding: '6px 7px', borderRadius: 7, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11.5 }} />
                <button onClick={() => void resolve()} disabled={busy} style={{ padding: '6px 10px', borderRadius: 7, background: '#4ade80', border: 'none', color: '#04120a', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Gavel size={12} /> Encerrar</button>
                {ticket.type === 'user' && ticket.target?.id && onBan && (
                  <button onClick={() => onBan(ticket.target.id)} style={{ padding: '6px 10px', borderRadius: 7, background: 'transparent', border: '1px solid #f23f4366', color: '#f23f43', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Banir</button>
                )}
              </div>
            )}
            {!staff && (
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 7 }}>
                Provas aceitas: imagens, vídeos, áudios, PDF, texto ou link. A equipe do Friends Space recebe tudo por aqui.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
