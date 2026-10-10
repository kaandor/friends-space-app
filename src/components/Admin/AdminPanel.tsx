import { useCallback, useEffect, useState } from 'react'
import type { Server, User } from '../../types'
import { useUserStore } from '../../stores/userStore'
import {
  banUser, cleanupCallSession, findUserById, getAdminId, listAllReports, listCallSessionsAdmin,
  respondReport, setServerVerified, setUserSupport, setUserVerified, transferServerOwner,
  unbanUser, userIsDev, userIsSupport, type AdminReport, type CallSessionAdmin, adminSetAstro,
  setUserDev,
  approveUser, listPendingUsers,
  getUserDiagnostics, rejectUser, listBans, banIp, unbanIp, unbanDevice,
  adminCancelAstro, type AdminAstroTier,
  listClientErrors, type ClientErrorEntry,
} from '../../services/admin'
import { Flag, CircleAlert, ShieldCheck, UserCog, Server as ServerIcon, Phone, Rocket, Headset, Gavel, RectangleHorizontal, RotateCw, BadgeCheck, Code2, LayoutDashboard, Bug, Search, type LucideIcon } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { requestBackend } from '../../services/backend'
import { ASTRO_PLANS, getAstroTier } from '../../utils/astro'

const GREEN = '#4ade80'
const RED = '#f23f43'
const AMBER = '#f0b232'

export type Tab = 'overview' | 'reports' | 'complaints' | 'verification' | 'profiles' | 'servers' | 'calls' | 'support' | 'errors' | 'astro' | 'moderacao' | 'ads'

const TABS: { key: Tab; icon: LucideIcon; label: string; group: string; support?: boolean; dev?: boolean }[] = [
  { key: 'overview', icon: LayoutDashboard, label: 'Visão geral', group: '' },
  { key: 'reports', icon: Flag, label: 'Denuncias', group: 'Moderação' },
  { key: 'complaints', icon: CircleAlert, label: 'Reclamacoes', group: 'Moderação' },
  { key: 'moderacao', icon: Gavel, label: 'Moderação', group: 'Moderação', dev: true },
  { key: 'verification', icon: ShieldCheck, label: 'Contas em verificacao', group: 'Moderação' },
  { key: 'profiles', icon: UserCog, label: 'Ajuda com perfis', group: 'Gerenciamento' },
  { key: 'servers', icon: ServerIcon, label: 'Servidores verificados', group: 'Gerenciamento' },
  { key: 'calls', icon: Phone, label: 'Call ao vivo', group: 'Gerenciamento', dev: true },
  { key: 'astro', icon: Rocket, label: 'Astro', group: 'Gerenciamento', dev: true },
  { key: 'ads', icon: RectangleHorizontal, label: 'Anúncios', group: 'Gerenciamento', dev: true },
  { key: 'support', icon: Headset, label: 'Suporte / Erros', group: 'Suporte' },
  { key: 'errors', icon: Bug, label: 'Erros / Bugs', group: 'Suporte' },
]

const TAB_GROUPS = ['', 'Moderação', 'Gerenciamento', 'Suporte']

const TYPE_LABEL: Record<string, string> = {
  media: 'Midia', message: 'Mensagem', user: 'Usuario', server: 'Servidor',
}

function fmtDate(ts?: number) {
  if (!ts) return '-'
  return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function ModalHeader({ icon: Icon, title, subtitle, onClose, action }: { icon?: LucideIcon; title: string; subtitle: string; onClose: () => void; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      {Icon && (
        <span style={{ width: 38, height: 38, borderRadius: 11, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={18} style={{ color: 'var(--accent)' }} />
        </span>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.2 }}>{title}</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
      </div>
      {action}
      <button onClick={onClose} title="Fechar (ESC)" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', width: 30, height: 30, borderRadius: 9, fontSize: 15, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>
    </div>
  )
}

function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9000, background: 'var(--bg-tertiary)', border: `1px solid ${GREEN}`, color: 'var(--text-primary)', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
      {msg}
    </div>
  )
}

function ReportCard({ report, onRespond, onBan }: {
  report: AdminReport
  onRespond: (id: string, text: string) => void
  onBan: (id: string) => void
}) {
  const [response, setResponse] = useState(report.response || '')
  const [open, setOpen] = useState(false)
  const qs = report.questionnaire?.join(', ') || ''
  return (
    <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: 'var(--bg-secondary)', color: 'var(--accent)', textTransform: 'uppercase' }}>{TYPE_LABEL[report.type] || report.type}</span>
        <span style={{ fontSize: 11, color: report.status === 'pending' ? AMBER : GREEN, fontWeight: 700 }}>
          {report.status === 'pending' ? 'Pendente' : 'Respondida'}
        </span>
        {report.complained && <span style={{ fontSize: 11, color: RED, fontWeight: 700 }}>Reclamou</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(report.createdAt)}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, marginTop: 6 }}>
        {report.reporterName || report.reporterId}
        {report.target?.name && <> → {report.target.name}</>}
        {report.target?.serverId && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> (server)</span>}
      </div>
      {qs && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Motivos: {qs}</div>}
      {report.description && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>{report.description}</div>}
      {report.complaintMessage && <div style={{ fontSize: 12, color: RED, marginTop: 4 }}>Reclamacao: {report.complaintMessage}</div>}
      {report.response && <div style={{ fontSize: 12, color: GREEN, marginTop: 4 }}>Resposta: {report.response}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <input
          value={response}
          onChange={e => setResponse(e.target.value)}
          placeholder="Resposta da equipe..."
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 8, background: 'var(--bg-secondary)',
            color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 12.5, outline: 'none',
          }}
        />
        <button onClick={() => onRespond(report.id, response)} style={{ padding: '7px 12px', borderRadius: 8, background: GREEN, color: '#04120a', border: 'none', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
          Responder
        </button>
        <button onClick={() => setOpen(o => !o)} style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer' }}>
          {open ? 'Ocultar' : 'Detalhes'}
        </button>
        {report.type === 'user' && report.target?.id && (
          <button onClick={() => onBan(report.target.id)} style={{ padding: '7px 10px', borderRadius: 8, background: 'transparent', color: RED, border: '1px solid ' + RED + '66', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Banir usuario
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          <div>Reporter ID: {report.reporterId}</div>
          <div>Target ID: {report.target?.id}</div>
          {report.proofUrl && <div>Prova: <a href={report.proofUrl} target="_blank" rel="noreferrer" style={{ color: GREEN }}>{report.proofUrl.slice(0, 60)}</a></div>}
          {report.target?.messageId && <div>Message ID: {report.target.messageId}</div>}
        </div>
      )}
    </div>
  )
}

export function AdminPanel({ open, onClose, initialTab }: { open: boolean; onClose: () => void; initialTab?: Tab }) {
  const { currentUser } = useUserStore()
  const [freshDev, setFreshDev] = useState(false)
  useEffect(() => {
    if (!open || !currentUser) return
    void (async () => {
      try {
        const list = await findUserById(currentUser.id)
        const me = (list || []).find((x: User) => x.id === currentUser.id)
        if (me && userIsDev(me)) setFreshDev(true)
      } catch {}
    })()
  }, [open, currentUser])
  const isDevFlag = userIsDev(currentUser) || freshDev
  const isSupportFlag = userIsSupport(currentUser)
  const canModerate = isDevFlag || isSupportFlag
  const [tab, setTab] = useState<Tab>(initialTab || 'overview')
  const [toast, setToast] = useState<string | null>(null)

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }, [])

  const [reports, setReports] = useState<AdminReport[]>([])
  const [complaints, setComplaints] = useState<AdminReport[]>([])
  const [servers, setServers] = useState<Server[]>([])
  const [calls, setCalls] = useState<CallSessionAdmin[]>([])
  const [clientErrors, setClientErrors] = useState<ClientErrorEntry[]>([])
  const [tabQuery, setTabQuery] = useState('')
  const [initialLoading, setInitialLoading] = useState(false)

  // Anúncios de stories (1/5 vídeos grátis, 1/10 Astro): vídeo curto ou banner
  interface StoryAd { id: string; kind: 'video' | 'image'; mediaUrl: string; linkUrl?: string; title?: string; seconds?: number; active?: boolean }
  const [ads, setAds] = useState<StoryAd[]>([])
  const [adMedia, setAdMedia] = useState('')
  const [adKind, setAdKind] = useState<'video' | 'image'>('video')
  const [adTitle, setAdTitle] = useState('')
  const [adLink, setAdLink] = useState('')
  const [adSeconds, setAdSeconds] = useState('8')
  const loadAds = useCallback(async () => {
    if (!currentUser) return
    try {
      const res = await requestBackend<{ ads: StoryAd[] }>('getStoryAds', {})
      setAds(res?.ads || [])
    } catch { /* ignore */ }
  }, [currentUser])
  useEffect(() => { if (tab === 'ads') void loadAds() }, [tab, loadAds])
  // Moderação: pendentes, diagnósticos e bloqueios
  const [pendingList, setPendingList] = useState<User[]>([])
  const [banIps, setBanIps] = useState<{ id: string; reason: string; createdAt: number }[]>([])
  const [banDevices, setBanDevices] = useState<{ id: string; reason: string; createdAt: number }[]>([])
  const [diagId, setDiagId] = useState<string | null>(null)
  const [diag, setDiag] = useState<{ user: any; stats: any } | null>(null)
  const [banIpInput, setBanIpInput] = useState('')
  const [banIpReason, setBanIpReason] = useState('')
  const loadMod = useCallback(async () => {
    if (!isDevFlag) return
    setPendingList(await listPendingUsers())
    const bans = await listBans()
    setBanIps(bans.ips)
    setBanDevices(bans.devices)
  }, [isDevFlag])
  const openDiag = async (userId: string) => {
    if (diagId === userId) { setDiagId(null); setDiag(null); return }
    setDiagId(userId)
    setDiag(null)
    const r = await getUserDiagnostics(userId)
    if (r.ok) setDiag({ user: r.user, stats: r.stats })
    else notify(r.error || 'Erro no diagnóstico')
  }
  const handleApproveEntry = async (u: User) => {
    const r = await approveUser(u.id)
    notify(r.ok ? 'Conta aprovada' : (r.error || 'Erro'))
    if (r.ok) { setPendingList(prev => prev.filter(x => x.id !== u.id)); setDiag(null); setDiagId(null) }
  }
  const handleRejectEntry = async (u: { id: string; name: string }) => {
    if (!window.confirm(`Rejeitar e apagar a conta de ${u.name}?`)) return
    const r = await rejectUser(u.id)
    notify(r.ok ? 'Conta rejeitada e apagada' : (r.error || 'Erro'))
    if (r.ok) { setPendingList(prev => prev.filter(x => x.id !== u.id)); setDiag(null); setDiagId(null) }
  }

  // Busca de perfis
  const [query, setQuery] = useState('')
  const [foundUsers, setFoundUsers] = useState<User[]>([])

  // Servidores verificados
  const [verifyServerId, setVerifyServerId] = useState('')
  const [verifyServerPartner, setVerifyServerPartner] = useState('')

  // Transferencia
  const [transferServerId, setTransferServerId] = useState('')
  const [transferOwnerId, setTransferOwnerId] = useState('')

  // Call ao vivo
  const [callStatus, setCallStatus] = useState('')

  const loadReports = useCallback(async () => {
    if (!canModerate) return
    const all = await listAllReports(false)
    setReports(all.filter(r => r.status === 'pending'))
    setComplaints(all.filter(r => r.complained || r.complaintMessage))
  }, [canModerate])

  const loadServers = useCallback(async () => {
    const state = await loadBackendStateSafe()
    setServers(state.servers)
  }, [])

  const loadCalls = useCallback(async () => {
    if (!isDevFlag) return
    setCalls(await listCallSessionsAdmin())
  }, [isDevFlag])

  const loadErrors = useCallback(async () => {
    if (!canModerate) return
    setClientErrors(await listClientErrors())
  }, [canModerate])

  useEffect(() => {
    if (!open) return
    setTab(initialTab || 'overview')
    setTabQuery('')
    setInitialLoading(true)
    void Promise.allSettled([
      loadReports(),
      loadServers(),
      loadAds(),
      loadErrors(),
      isDevFlag ? loadCalls() : Promise.resolve(),
      isDevFlag ? loadMod() : Promise.resolve(),
    ]).finally(() => setInitialLoading(false))
  }, [open, loadReports, loadServers, loadCalls, loadMod, loadAds, loadErrors, isDevFlag, initialTab])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open && tab === 'moderacao') void loadMod()
  }, [open, tab, loadMod])

  const handleRespond = async (id: string, text: string) => {
    const res = await respondReport(id, text)
    if (res.ok) {
      notify('Denuncia respondida')
      void loadReports()
    } else {
      notify(res.error || 'Erro')
    }
  }

  const handleBan = async (userId: string) => {
    if (!window.confirm('Banir este usuario?')) return
    const reason = window.prompt('Motivo do banimento:') || ''
    const res = await banUser(userId, reason)
    notify(res.ok ? 'Usuario banido' : (res.error || 'Erro'))
  }

  const searchUsers = async () => {
    if (!query.trim()) return
    setFoundUsers(await findUserById(query.trim()))
  }

  const toggleVerified = async (u: User) => {
    const next = !u.flags?.verified
    const res = await setUserVerified(u.id, next)
    if (res.ok) {
      notify(next ? 'Conta verificada' : 'Verificacao removida')
      setFoundUsers(prev => prev.map(x => x.id === u.id ? { ...x, flags: { ...(x.flags || {}), verified: next } } : x))
    } else {
      notify(res.error || 'Erro')
    }
  }

  const toggleSupport = async (u: User) => {
    const next = !u.flags?.support
    const res = await setUserSupport(u.id, next)
    if (res.ok) {
      notify(next ? 'Promovido a suporte' : 'Suporte removido')
      setFoundUsers(prev => prev.map(x => x.id === u.id ? { ...x, flags: { ...(x.flags || {}), support: next } } : x))
    } else {
      notify(res.error || 'Erro')
    }
  }

  const toggleBan = async (u: User) => {
    if (u.flags?.banned) {
      const res = await unbanUser(u.id)
      notify(res.ok ? 'Desbanido' : (res.error || 'Erro'))
      setFoundUsers(prev => prev.map(x => x.id === u.id ? { ...x, flags: { ...(x.flags || {}), banned: false } } : x))
    } else {
      const reason = window.prompt('Motivo do banimento:') || ''
      const res = await banUser(u.id, reason)
      notify(res.ok ? 'Usuario banido' : (res.error || 'Erro'))
      setFoundUsers(prev => prev.map(x => x.id === u.id ? { ...x, flags: { ...(x.flags || {}), banned: true } } : x))
    }
  }

  const handleVerifyServer = async () => {
    if (!verifyServerId.trim()) return
    const res = await setServerVerified(verifyServerId.trim(), true, verifyServerPartner.trim() || undefined)
    if (res.ok) {
      notify('Servidor verificado')
      setVerifyServerId('')
      setVerifyServerPartner('')
      void loadServers()
    } else {
      notify(res.error || 'Erro')
    }
  }

  const handleUnverifyServer = async (s: Server) => {
    const res = await setServerVerified(s.id, false)
    notify(res.ok ? 'Verificacao removida' : (res.error || 'Erro'))
    void loadServers()
  }

  const handleTransfer = async () => {
    if (!transferServerId.trim() || !transferOwnerId.trim()) {
      notify('Informe o server e o novo dono')
      return
    }
    if (!window.confirm('Transferir o dono deste servidor?')) return
    const res = await transferServerOwner(transferServerId.trim(), transferOwnerId.trim())
    notify(res.ok ? 'Dono transferido' : (res.error || 'Erro'))
    if (res.ok) {
      setTransferServerId('')
      setTransferOwnerId('')
    }
  }

  const handleCleanupCall = async (sessionId: string, label: string) => {
    if (!window.confirm(`Limpar a chamada de ${label}? Isso remove a sessao e os sinais travados.`)) return
    const res = await cleanupCallSession(sessionId)
    notify(res.ok ? `Chamada limpa (${res.removed} itens)` : (res.error || 'Erro'))
    void loadCalls()
  }

  if (!open) return null
  if (!canModerate && !userIsSupport(currentUser)) return null

  const tabBadge = (key: Tab): number => {
    switch (key) {
      case 'reports': return reports.length
      case 'complaints': return complaints.length
      case 'moderacao': return pendingList.length + banIps.length + banDevices.length
      case 'calls': return calls.length
      case 'ads': return ads.length
      case 'errors': return clientErrors.length
      case 'servers': return servers.filter(s => s.verified).length
      default: return 0
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', padding: 16 }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} className="fs-admin-window" style={{ width: 'min(960px, 96vw)', height: 'min(660px, calc(100vh - 48px))', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 18, display: 'flex', overflow: 'hidden', boxShadow: '0 28px 90px rgba(0,0,0,0.65)' }}>
          {/* Sidebar */}
          <div className="fs-admin-sidebar" style={{ width: 224, flexShrink: 0, background: 'var(--bg-secondary)', padding: '18px 12px', display: 'flex', flexDirection: 'column', gap: 3, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px 14px' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 16%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isDevFlag
                  ? <Code2 size={17} strokeWidth={2.5} style={{ color: 'var(--accent)' }} />
                  : <i className="fa-solid fa-headset" style={{ color: 'var(--accent)', fontSize: 15 }} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{isDevFlag ? 'Painel Dev' : 'Painel Suporte'}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{isDevFlag ? 'acesso total' : 'acesso de suporte'}</div>
              </div>
            </div>
            <div style={{ position: 'relative', padding: '0 8px 10px' }}>
              <Search size={13} style={{ position: 'absolute', left: 18, top: 9, color: 'var(--text-muted)' }} />
              <input
                value={tabQuery}
                onChange={e => setTabQuery(e.target.value)}
                placeholder="Buscar…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px 7px 30px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 12.5, outline: 'none' }}
              />
            </div>
            {TAB_GROUPS.map(group => {
              const items = TABS.filter(tb =>
                tb.group === group &&
                (!tb.support || isSupportFlag) &&
                (!tb.dev || isDevFlag) &&
                (tabQuery.trim() === '' || tb.label.toLowerCase().includes(tabQuery.trim().toLowerCase()))
              )
              if (items.length === 0) return null
              return (
                <div key={group || 'top'} style={{ marginBottom: group ? 6 : 0 }}>
                  {group !== '' && (
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '8px 10px 4px' }}>{group}</div>
                  )}
                  {items.map(tb => {
                    const active = tab === tb.key
                    const count = tabBadge(tb.key)
                    return (
                      <button
                        key={tb.key}
                        onClick={() => setTab(tb.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, width: '100%', boxSizing: 'border-box',
                          background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                          border: active ? '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' : '1px solid transparent',
                          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', textAlign: 'left', marginBottom: 1,
                        }}
                      >
                        {(() => { const I = tb.icon; return <I size={15} strokeWidth={2} style={{ color: active ? 'var(--accent)' : undefined, flexShrink: 0 }} /> })()}
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tb.label}</span>
                        {count > 0 && (
                          <span style={{ fontSize: 10.5, fontWeight: 800, minWidth: 20, textAlign: 'center', padding: '2px 6px', borderRadius: 999, background: 'var(--accent)', color: '#04120a' }}>{count > 99 ? '99+' : count}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
            <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-muted)', padding: '0 8px', lineHeight: 1.5 }}>
              Hierarquia: dev &gt; suporte
            </div>
          </div>

          {/* Content */}
          <div className="fs-admin-content" style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
            {tab === 'overview' && (
              <>
                <ModalHeader icon={LayoutDashboard} title={isDevFlag ? 'Painel Dev' : 'Painel Suporte'} subtitle={isDevFlag ? 'Resumo da operação. Toque num cartão para agir.' : 'Resumo dos atendimentos. Toque num cartão para agir.'} onClose={onClose} />
                {initialLoading ? <Skeleton lines={4} /> : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                      <OverviewCard icon={Flag} label="Denúncias pendentes" value={reports.length} color={AMBER} onClick={() => setTab('reports')} />
                      <OverviewCard icon={CircleAlert} label="Reclamações" value={complaints.length} color={complaints.length > 0 ? RED : 'var(--text-muted)'} onClick={() => setTab('complaints')} />
                      {isDevFlag && <OverviewCard icon={Gavel} label="Contas recentes" value={pendingList.length} color={GREEN} onClick={() => setTab('moderacao')} />}
                      {isDevFlag && <OverviewCard icon={Phone} label="Calls ativas" value={calls.length} color={calls.length > 0 ? GREEN : 'var(--text-muted)'} onClick={() => setTab('calls')} />}
                      <OverviewCard icon={ServerIcon} label="Servidores verificados" value={servers.filter(s => s.verified).length} color={GREEN} onClick={() => setTab('servers')} />
                      {isDevFlag && <OverviewCard icon={RectangleHorizontal} label="Anúncios" value={ads.length} color={GREEN} onClick={() => setTab('ads')} />}
                      <OverviewCard icon={Headset} label="Suporte / Erros" value={null} color={GREEN} onClick={() => setTab('support')} />
                      <OverviewCard icon={Bug} label="Erros / Bugs" value={clientErrors.length} color={clientErrors.length > 0 ? RED : 'var(--text-muted)'} onClick={() => setTab('errors')} />
                      {isDevFlag && <OverviewCard icon={Rocket} label="Astro" value={null} color={GREEN} onClick={() => setTab('astro')} />}
                    </div>
                {(reports.length > 0 || complaints.length > 0 || pendingList.length > 0 || clientErrors.length > 0) && (
                  <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', fontSize: 12.5, color: 'var(--text-primary)' }}>
                    Há <b>{reports.length + complaints.length + pendingList.length + clientErrors.length}</b> item(ns) precisando de atenção.
                  </div>
                )}
                </>
                )}
              </>
            )}

            {tab === 'reports' && (
              <>
                <ModalHeader icon={Flag} title="Denuncias" subtitle="Todas as denuncias pendentes de resposta." onClose={onClose} />
                <button onClick={() => void loadReports()} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                  <RotateCw size={13} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: -2 }} />Atualizar
                </button>
                {initialLoading ? <Skeleton /> : reports.length === 0 ? <Empty label="Nenhuma denuncia pendente." /> : reports.map(r => (
                  <ReportCard key={r.id} report={r} onRespond={handleRespond} onBan={handleBan} />
                ))}
              </>
            )}

            {tab === 'complaints' && (
              <>
                <ModalHeader icon={CircleAlert} title="Reclamacoes" subtitle="Denuncias que o usuario reclamou de nao respondida." onClose={onClose} />
                <button onClick={() => void loadReports()} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                  <RotateCw size={13} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: -2 }} />Atualizar
                </button>
                {initialLoading ? <Skeleton /> : complaints.length === 0 ? <Empty label="Nenhuma reclamacao." /> : complaints.map(r => (
                  <ReportCard key={r.id} report={r} onRespond={handleRespond} onBan={handleBan} />
                ))}
              </>
            )}

            {tab === 'verification' && (
              <>
                <ModalHeader icon={ShieldCheck} title="Contas em verificacao" subtitle="Contas verificadas, suporte e banidas. Clique no ID de um usuario para ajuda." onClose={onClose} />
                {foundUsers.length === 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void searchUsers() }}
                      placeholder="ID, friendCode, email ou nome..."
                      style={{ flex: 1, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
                    />
                    <button onClick={() => void searchUsers()} style={{ padding: '9px 16px', borderRadius: 8, background: GREEN, color: '#04120a', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Buscar</button>
                    <button onClick={() => void (async () => { const list = await listPendingUsers(); setFoundUsers(list) })()} style={{ padding: '9px 16px', borderRadius: 8, background: AMBER, color: '#04120a', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Pendentes</button>
                  </div>
                )}
                {foundUsers.map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Avatar src={u.photoUrl} name={u.name} size={36} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.friendCode} · {u.id.slice(0, 13)}…</div>
                    </div>
                    {u.flags?.verified && <Badge color={GREEN}>VERIFICADO</Badge>}
                    {u.flags?.support && <Badge color={AMBER}>SUPORTE</Badge>}
                    {u.flags?.dev && <Badge color={GREEN}>DEV</Badge>}
                    {u.flags?.banned && <Badge color={RED}>BANIDO</Badge>}
                    {isDevFlag && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {u.approved === false && (
                          <SmallBtn onClick={() => void (async () => { const r = await approveUser(u.id); notify(r.ok ? 'Conta aprovada' : (r.error || 'Erro')); if (r.ok) setFoundUsers(prev => prev.filter((x) => x.id !== u.id)) })()} color={GREEN}>
                            Aprovar entrada
                          </SmallBtn>
                        )}
                        <SmallBtn onClick={() => void toggleVerified(u)} color={u.flags?.verified ? 'var(--bg-secondary)' : GREEN}>
                          {u.flags?.verified ? 'Desverificar' : 'Verificar'}
                        </SmallBtn>
                        <SmallBtn onClick={() => void toggleSupport(u)} color={u.flags?.support ? 'var(--bg-secondary)' : AMBER}>
                          {u.flags?.support ? 'Remover suporte' : 'Fazer suporte'}
                        </SmallBtn>
                        <SmallBtn onClick={() => void (async () => { if (!window.confirm(u.flags?.dev ? `Remover DEV de ${u.name}?` : `Tornar ${u.name} DEV? Acesso total!`)) return; const r = await setUserDev(u.id, !u.flags?.dev); notify(r.ok ? 'Dev atualizado' : (r.error || 'Erro')); if (r.ok) setFoundUsers(prev => prev.map(x => x.id === u.id ? { ...x, flags: { ...(x.flags || {}), dev: !u.flags?.dev } } : x)) })()} color={u.flags?.dev ? 'var(--bg-secondary)' : RED}>
                          {u.flags?.dev ? 'Remover dev' : 'Fazer dev'}
                        </SmallBtn>
                        <SmallBtn onClick={() => void toggleBan(u)} color={u.flags?.banned ? GREEN : RED}>
                          {u.flags?.banned ? 'Desbanir' : 'Banir'}
                        </SmallBtn>
                      </div>
                    )}
                  </div>
                ))}
                {foundUsers.length === 0 && <Empty label="Busque um usuario para verificar, promover a suporte ou banir." />}
              </>
            )}

            {tab === 'moderacao' && (
              <>
                <ModalHeader icon={Gavel} title="Moderação" subtitle="Pendentes com diagnóstico, e bloqueios de rede." onClose={onClose} />
                <button onClick={() => void loadMod()} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                  <RotateCw size={13} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: -2 }} />Atualizar
                </button>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 8px' }}>Contas recentes ({pendingList.length})</h3>
                {pendingList.length === 0 && <Empty label="Nenhuma conta nova nos últimos 7 dias." />}
                {pendingList.map(u => (
                  <div key={u.id} style={{ padding: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar src={u.photoUrl} name={u.name} size={36} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.friendCode} · {u.id.slice(0, 13)}…</div>
                      </div>
                      <SmallBtn onClick={() => void openDiag(u.id)} color="var(--bg-secondary)">Diagnóstico</SmallBtn>
                      <SmallBtn onClick={() => void handleApproveEntry(u)} color={GREEN}>Aprovar</SmallBtn>
                      <SmallBtn onClick={() => void handleRejectEntry(u)} color={RED}>Rejeitar</SmallBtn>
                    </div>
                    {diagId === u.id && (
                      <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        {!diag ? 'Carregando diagnóstico...' : (
                          <>
                            <div><b>Criada:</b> {diag.user.createdAt ? new Date(diag.user.createdAt).toLocaleString() : '-'} · <b>Visto:</b> {diag.user.lastSeenAt ? new Date(diag.user.lastSeenAt).toLocaleString() : 'nunca'}</div>
                            <div><b>Email:</b> {diag.user.email || '-'} · <b>IP cadastro:</b> {diag.stats && diag.user.signupIp ? diag.user.signupIp : '-'} · <b>Último IP:</b> {diag.user.lastIp || '-'}</div>
                            <div><b>Mensagens:</b> {diag.stats?.messages ?? '-'} · <b>Amigos:</b> {diag.stats?.friends ?? '-'} · <b>Denúncias feitas/sofridas:</b> {diag.stats?.reportsMade ?? '-'}/{diag.stats?.reportsAgainst ?? '-'}</div>
                            <div><b>Servidores (dono):</b> {(diag.stats?.serversOwned || []).map((s: any) => s.name).join(', ') || '-'} · <b>Membro de:</b> {diag.stats?.serversMember ?? '-'}</div>
                            <div><b>Outras contas no mesmo IP:</b> {(diag.stats?.sameIpAccounts || []).map((x: any) => x.name).join(', ') || 'nenhuma'} · <b>Bloqueios do IP:</b> {diag.stats?.deniesFromIp ?? 0}</div>
                            <div><b>Score de risco:</b> {diag.stats?.riskScore ?? '-'} {(diag.stats?.riskReasons || []).join(', ') && <span style={{ color: 'var(--text-muted)' }}>({(diag.stats?.riskReasons || []).join(', ')})</span>}</div>
                            <div style={{ marginTop: 6, color: (diag.stats?.deniesFromIp || 0) > 0 || (diag.stats?.sameIpAccounts || []).length > 1 ? RED : GREEN, fontWeight: 700 }}>
                              {(diag.stats?.deniesFromIp || 0) > 0 || (diag.stats?.sameIpAccounts || []).length > 1 ? '⚠ Sinais de abuso — investigue antes de aprovar' : '✓ Sem sinais de abuso'}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', margin: '16px 0 8px' }}>Bloqueios de rede</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={banIpInput} onChange={e => setBanIpInput(e.target.value)} placeholder="IP para banir..." style={{ flex: 1, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                  <input value={banIpReason} onChange={e => setBanIpReason(e.target.value)} placeholder="Motivo" style={{ flex: 1, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                  <button onClick={() => void (async () => { if (!banIpInput.trim()) return; const r = await banIp(banIpInput.trim(), banIpReason.trim()); notify(r.ok ? 'IP banido' : (r.error || 'Erro')); if (r.ok) { setBanIpInput(''); setBanIpReason(''); void loadMod() } })()} style={{ padding: '9px 16px', borderRadius: 8, background: RED, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Banir IP</button>
                </div>
                {banIps.map(b => (
                  <div key={'ip' + b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, fontSize: 12 }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{b.id}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{b.reason}</span>
                    <button onClick={() => void (async () => { await unbanIp(b.id); void loadMod() })()} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Desbanir</button>
                  </div>
                ))}
                {banDevices.map(b => (
                  <div key={'dev' + b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, fontSize: 12 }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{String(b.id).slice(0, 24)}…</span>
                    <span style={{ color: 'var(--text-muted)' }}>{b.reason}</span>
                    <button onClick={() => void (async () => { await unbanDevice(b.id); void loadMod() })()} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Desbanir</button>
                  </div>
                ))}
                {(banIps.length === 0 && banDevices.length === 0) && <Empty label="Nenhum bloqueio ativo." />}
              </>
            )}

            {tab === 'ads' && (
              <>
                <ModalHeader icon={RectangleHorizontal} title="Anúncios nos stories" subtitle="Grátis: 1 a cada 5 vídeos. Astro: 1 a cada 10. Até 60s, rotação aleatória, com botão pular." onClose={onClose} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setAdKind('video')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: adKind === 'video' ? 'var(--accent)' : 'var(--bg-secondary)', color: adKind === 'video' ? '#000' : 'var(--text-secondary)' }}>Vídeo curto</button>
                    <button onClick={() => setAdKind('image')} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: adKind === 'image' ? 'var(--accent)' : 'var(--bg-secondary)', color: adKind === 'image' ? '#000' : 'var(--text-secondary)' }}>Banner</button>
                    <input value={adSeconds} onChange={e => setAdSeconds(e.target.value)} title="Segundos (3-60)" placeholder="8s" style={{ width: 56, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 12, outline: 'none' }} />
                  </div>
                  <input value={adMedia} onChange={e => setAdMedia(e.target.value)} placeholder="URL da mídia (mp4 ou imagem)..." style={{ padding: '9px 10px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={adTitle} onChange={e => setAdTitle(e.target.value)} placeholder="Título (opcional)" style={{ flex: 1, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                    <input value={adLink} onChange={e => setAdLink(e.target.value)} placeholder="Link (opcional)" style={{ flex: 1, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }} />
                  </div>
                  <button onClick={() => void (async () => {
                    if (!adMedia.trim() || !currentUser) return
                    const r = await requestBackend('saveStoryAd', { userId: currentUser.id, mediaUrl: adMedia.trim(), kind: adKind, title: adTitle.trim(), linkUrl: adLink.trim(), seconds: Number(adSeconds) || 8 }).catch(() => null)
                    notify(r ? 'Anúncio salvo' : 'Erro ao salvar')
                    if (r) { setAdMedia(''); setAdTitle(''); setAdLink(''); void loadAds() }
                  })()} style={{ padding: '9px 0', borderRadius: 8, background: GREEN, color: '#04120a', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Adicionar anúncio</button>
                  <button onClick={() => { try { sessionStorage.setItem('fs:storyVideosSeen', '4') } catch { /* ignore */ } notify('Pronto: o próximo vídeo que você assistir mostra o anúncio') }} style={{ padding: '9px 0', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Testar agora no próximo vídeo</button>
                </div>
                {ads.length === 0 && <Empty label="Nenhum anúncio cadastrado — o viewer mostra o card AdSense padrão." />}
                {ads.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                    {a.kind === 'video'
                      ? <span style={{ fontSize: 11, fontWeight: 800, background: 'var(--accent)', color: '#000', borderRadius: 6, padding: '3px 8px' }}>VÍDEO {a.seconds || 8}s</span>
                      : <span style={{ fontSize: 11, fontWeight: 800, background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, padding: '3px 8px', border: '1px solid var(--border)' }}>BANNER</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || a.mediaUrl.slice(0, 50)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.mediaUrl.slice(0, 60)}</div>
                    </div>
                    <button onClick={() => void (async () => { if (currentUser) await requestBackend('deleteStoryAd', { userId: currentUser.id, adId: a.id }).catch(() => null); void loadAds() })()} style={{ background: 'none', border: '1px solid var(--border)', color: RED, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Excluir</button>
                  </div>
                ))}
              </>
            )}

            {tab === 'profiles' && (
              <>
                <ModalHeader icon={UserCog} title="Ajuda com perfis" subtitle="Busque por ID, friendCode, email ou nome para ver e gerenciar uma conta." onClose={onClose} />
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void searchUsers() }}
                    placeholder="ID, friendCode, email ou nome..."
                    style={{ flex: 1, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
                  />
                  <button onClick={() => void searchUsers()} style={{ padding: '9px 16px', borderRadius: 8, background: GREEN, color: '#04120a', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Buscar</button>
                </div>
                {foundUsers.map(u => (
                  <div key={u.id} style={{ padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar src={u.photoUrl} name={u.name} size={42} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>@{u.friendCode}</div>
                        {u.email && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{u.email}</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        {u.flags?.verified && <Badge color={GREEN}>VERIFICADO</Badge>}
                        {u.flags?.support && <Badge color={AMBER}>SUPORTE</Badge>}
                        {u.flags?.dev && <Badge color={GREEN}>DEV</Badge>}
                        {u.flags?.banned && <Badge color={RED}>BANIDO {u.banReason ? `· ${u.banReason}` : ''}</Badge>}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      ID: {u.id} · Entrou em {fmtDate(u.createdAt)} · Google: {u.authProvider === 'google' ? 'sim' : 'nao'}
                    </div>
                    {isDevFlag && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <SmallBtn onClick={() => void toggleVerified(u)} color={u.flags?.verified ? 'var(--bg-secondary)' : GREEN}>
                          {u.flags?.verified ? 'Remover verificacao' : 'Verificar'}
                        </SmallBtn>
                        <SmallBtn onClick={() => void toggleSupport(u)} color={u.flags?.support ? 'var(--bg-secondary)' : AMBER}>
                          {u.flags?.support ? 'Remover suporte' : 'Promover a suporte'}
                        </SmallBtn>
                        <SmallBtn onClick={() => void toggleBan(u)} color={u.flags?.banned ? GREEN : RED}>
                          {u.flags?.banned ? 'Desbanir' : 'Banir'}
                        </SmallBtn>
                      </div>
                    )}
                  </div>
                ))}
                {foundUsers.length === 0 && <Empty label="Busque um usuario para ajuda." />}
              </>
            )}

            {tab === 'servers' && (
              <>
                <ModalHeader icon={ServerIcon} title="Servidores verificados" subtitle="Adicione ou remova o selo verificado de servidores por ID." onClose={onClose} />
                {isDevFlag && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <input
                      value={verifyServerId}
                      onChange={e => setVerifyServerId(e.target.value)}
                      placeholder="Server ID ou invite code"
                      style={{ flex: 1, minWidth: 180, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
                    />
                    <input
                      value={verifyServerPartner}
                      onChange={e => setVerifyServerPartner(e.target.value)}
                      placeholder="Nome do parceiro (opcional)"
                      style={{ flex: 1, minWidth: 150, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
                    />
                    <button onClick={() => void handleVerifyServer()} style={{ padding: '9px 16px', borderRadius: 8, background: GREEN, color: '#04120a', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                      <BadgeCheck size={13} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: -2 }} />Verificar servidor
                    </button>
                  </div>
                )}
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Verificados agora</div>
                  {servers.filter(s => s.verified).length === 0
                  ? <Empty label="Nenhum servidor verificado." />
                  : servers.filter(s => s.verified).map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                      <Avatar src={s.photoUrl} name={s.name} size={36} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{s.name} {s.partner && <span style={{ color: AMBER, fontSize: 11 }}>· PARCEIRO {s.partner}</span>}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.id} · {s.members?.length || 0} membros</div>
                      </div>
                      {isDevFlag && <SmallBtn onClick={() => void handleUnverifyServer(s)} color="var(--bg-secondary)">Remover</SmallBtn>}
                    </div>
                  ))}
                {isDevFlag && (
                  <>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginTop: 18 }}>Transferir dono de servidor</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        value={transferServerId}
                        onChange={e => setTransferServerId(e.target.value)}
                        placeholder="Server ID"
                        style={{ flex: 1, minWidth: 160, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
                      />
                      <input
                        value={transferOwnerId}
                        onChange={e => setTransferOwnerId(e.target.value)}
                        placeholder="Novo dono (userId)"
                        style={{ flex: 1, minWidth: 160, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
                      />
                      <button onClick={() => void handleTransfer()} style={{ padding: '9px 16px', borderRadius: 8, background: AMBER, color: '#1a1200', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                        Transferir
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {tab === 'calls' && isDevFlag && (
              <>
                <ModalHeader icon={Phone} title="Call ao vivo" subtitle="Sessoes de chamada ativas. Inspecione e limpe chamadas travadas sem deploy." onClose={onClose} />
                <button onClick={() => void loadCalls()} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                  <RotateCw size={13} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: -2 }} />Atualizar estado das chamadas
                </button>
                {calls.length === 0 ? <Empty label="Nenhuma sessao de chamada ativa." /> : calls.map(s => (
                  <div key={s.id} style={{ padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{s.callMode === 'video' ? 'Video' : 'Audio'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.memberNames?.join(', ') || s.participantIds?.join(', ') || 'sem membros'}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(s.updatedAt || s.createdAt)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Session: {s.id}</div>
                      <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, background: 'var(--bg-secondary)', color: (s.signalCount || 0) > 0 ? GREEN : 'var(--text-muted)' }}>
                        {s.signalCount || 0} sinais WebRTC
                      </span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <SmallBtn onClick={() => setCallStatus(s.id === callStatus ? '' : s.id)} color="var(--bg-secondary)">Detalhes</SmallBtn>
                        <SmallBtn onClick={() => void handleCleanupCall(s.id, s.memberNames?.join(', ') || 'call')} color={RED}>Limpar chamada</SmallBtn>
                      </div>
                    </div>
                    {callStatus === s.id && (
                      <pre style={{ margin: '8px 0 0', fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: 10, borderRadius: 8, overflow: 'auto', maxHeight: 180, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {JSON.stringify({ id: s.id, callMode: s.callMode, hostUserId: s.hostUserId, participantIds: s.participantIds, quality: s.quality, fps: s.fps, bitrateKbps: s.bitrateKbps, createdAt: s.createdAt, updatedAt: s.updatedAt }, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </>
            )}

            {tab === 'astro' && isDevFlag && (
              <AstroTab onToast={setToast} onClose={onClose} />
            )}

            {tab === 'support' && (
              <SupportTab
                adminId={getAdminId()}
                onToast={setToast}
                onClose={onClose}
              />
            )}

            {tab === 'errors' && (
              <>
                <ModalHeader icon={Bug} title="Erros / Bugs" subtitle="Falhas automáticas e reports enviados pelo botão 🐞 (últimas 24h)." onClose={onClose} />
                <button onClick={() => void loadErrors()} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                  <RotateCw size={13} strokeWidth={2.5} style={{ marginRight: 6, verticalAlign: -2 }} />Atualizar
                </button>
                {initialLoading ? <Skeleton /> : clientErrors.length === 0 ? <Empty label="Nenhum erro nas últimas 24h. Tudo limpo." /> : clientErrors.map(e => (
                  <div key={e.id} style={{ padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: e.where === 'debug-window' ? 'var(--accent)' : 'var(--bg-secondary)', color: e.where === 'debug-window' ? '#04120a' : 'var(--accent)', textTransform: 'uppercase' }}>
                        {e.where === 'debug-window' ? '🐞 report' : e.where}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                        {e.ts ? new Date(e.ts).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-primary)', marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.message}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>user {String(e.userId).slice(0, 13)}…</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
      <Toast msg={toast} />
    </>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'var(--bg-secondary)', color, border: `1px solid ${color}66`, letterSpacing: 0.5 }}>
      {children}
    </span>
  )
}

function SmallBtn({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{ padding: '7px 11px', borderRadius: 8, background: 'var(--bg-secondary)', border: `1px solid ${color}66`, color, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
      {children}
    </button>
  )
}

function Empty({ label }: { label: string }) {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{label}</div>
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Carregando…">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="fs-skeleton" style={{ height: 58, borderRadius: 10 }} />
      ))}
    </div>
  )
}

function OverviewCard({ icon: Icon, label, value, color, onClick }: { icon: LucideIcon; label: string; value: number | null; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', borderRadius: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <span style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} style={{ color }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-primary)', lineHeight: 1.1 }}>
          {value == null ? '→' : value}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </span>
    </button>
  )
}

async function loadBackendStateSafe() {
  const { loadBackendState } = await import('../../services/backend')
  try {
    return await loadBackendState()
  } catch {
    return { servers: [] as Server[], users: [] as User[], messages: [], friends: [], directMessages: [], callSessions: [] }
  }
}

// Aba "Suporte / Erros" — lista todos os relatos de ajuda (botao Ajuda)
// enviados pelos usuarios, com opcao de responder.
function SupportTab({ onToast, onClose }: { adminId: string; onToast: (msg: string) => void; onClose: () => void }) {
  const [helpReports, setHelpReports] = useState<AdminReport[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const all = await listAllReports(false)
    setHelpReports(all.filter(r => r.type === 'help'))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const respond = async (id: string, text: string) => {
    if (!text.trim()) { onToast('Escreva uma resposta antes de responder.'); return }
    setBusy(true)
    const res = await respondReport(id, text.trim())
    setBusy(false)
    onToast(res.ok ? 'Relato respondido' : (res.error || 'Erro ao responder'))
    if (res.ok) void load()
  }

  return (
    <>
      <ModalHeader icon={Headset} title="Suporte / Erros" subtitle="Relatos enviados pelo botao Ajuda. Responda para o usuario ver a resposta." onClose={onClose} />
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
        {helpReports.length === 0 ? 'Nenhum relato de ajuda ainda.' : `${helpReports.length} relato(s) de ajuda.`}
      </div>
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
        {helpReports.length === 0 ? (
          <Empty label="Nenhum relato de ajuda enviado." />
        ) : (
          helpReports.map(report => (
            <ReportCard
              key={report.id}
              report={report}
              onRespond={(id, text) => void respond(id, text)}
              onBan={() => { onToast('Para banir um usuario, use a aba de denuncias.') }}
            />
          ))
        )}
      </div>
      {busy && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Enviando...</div>}
    </>
  )
}

// Aba "Astro" (somente dev) — ativa/cancela assinatura ASTRO de qualquer conta.
function AstroTab({ onToast, onClose }: { onToast: (msg: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [foundUsers, setFoundUsers] = useState<User[]>([])
  const [months, setMonths] = useState(1)
  const [tier, setTier] = useState<AdminAstroTier>('astro')

  const search = async () => {
    if (!query.trim()) return
    setFoundUsers(await findUserById(query.trim()))
  }

  const grant = async (targetId: string, name: string) => {
    if (!window.confirm(`Ativar ${ASTRO_PLANS[tier].shortName} por ${months} ${months === 1 ? 'mes' : 'meses'} para ${name}?`)) return
    const res = await adminSetAstro(targetId, months, tier)
    onToast(res.ok ? `Astro ativado para ${name}` : (res.error || 'Erro ao ativar Astro'))
    if (res.ok) void search()
  }

  const cancel = async (targetId: string, name: string) => {
    if (!window.confirm(`Cancelar o Astro de ${name}? O tema volta para o gratuito na hora.`)) return
    const res = await adminCancelAstro(targetId)
    onToast(res.ok ? `Astro cancelado para ${name}` : (res.error || 'Erro ao cancelar Astro'))
    if (res.ok) void search()
  }

  return (
    <>
      <ModalHeader icon={Rocket} title="Astro" subtitle="Gerencie assinaturas ASTRO de qualquer conta. Somente dev usa esta aba." onClose={onClose} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void search() }}
          placeholder="ID, friendCode, email ou nome..."
          style={{ flex: 1, minWidth: 180, padding: '9px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
        />
        <button onClick={() => void search()} style={{ padding: '9px 16px', borderRadius: 8, background: GREEN, color: '#04120a', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Buscar</button>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Plano:</span>
        {(['astro', 'astro_plus', 'astro_ultimate'] as AdminAstroTier[]).map(tt => (
          <button
            key={tt}
            onClick={() => setTier(tt)}
            style={{
              padding: '7px 12px', borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
              background: tier === tt ? ASTRO_PLANS[tt].color : 'var(--bg-secondary)',
              color: tier === tt ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${tier === tt ? ASTRO_PLANS[tt].color : 'var(--border)'}`,
            }}
          >
            {ASTRO_PLANS[tt].shortName}
          </button>
        ))}
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Meses:</span>
        <input
          type="number"
          min={1}
          max={120}
          value={months}
          onChange={e => setMonths(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
          style={{ width: 70, padding: '7px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
        />
      </div>
      {foundUsers.map(u => {
        const tierNow = getAstroTier(u)
        const plan = tierNow === 'none' ? null : ASTRO_PLANS[tierNow]
        return (
          <div key={u.id} style={{ padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Avatar src={u.photoUrl} name={u.name} size={36} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.friendCode} · {u.id.slice(0, 13)}…</div>
              </div>
              {plan ? <Badge color={plan.color}>{plan.badge}</Badge> : <Badge color="var(--text-muted)">GRATIS</Badge>}
              <div style={{ display: 'flex', gap: 6 }}>
                <SmallBtn onClick={() => void grant(u.id, u.name)} color={GREEN}>Ativar Astro</SmallBtn>
                <SmallBtn onClick={() => void cancel(u.id, u.name)} color={RED}>Cancelar</SmallBtn>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {plan
                ? `${plan.name} ativo ate ${new Date(Number(u.settings?.astroUntil) || Date.now()).toLocaleDateString()}`
                : 'Sem Astro'}
            </div>
          </div>
        )
      })}
      {foundUsers.length === 0 && <Empty label="Busque um usuario para gerenciar o Astro." />}
    </>
  )
}
