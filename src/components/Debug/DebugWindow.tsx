import { Fa } from '../../utils/fa'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getCallDiagnostics, testTurnConnectivity, useCallStore } from '../../stores/callStore'
import type { CallDiagnostics, TurnTestResult } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'
import { getStreamPlanLabel } from '../../utils/astro'
import { requestBackend } from '../../services/backend'
import { isCleanAudioEnabledPref } from '../../services/rnnoise'
import { lastDiagCodes } from '../../utils/diagCodes'

const HISTORY_MAX = 40
const POLL_MS = 2500

function accentColor(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    if (v && v !== 'var(--accent)') return v
  } catch { }
  return '#00ff88'
}

function mutedColor(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim()
    if (v) return v
  } catch { }
  return '#888888'
}

function Spark({ data, unit, height = 72 }: { data: (number | null)[]; unit: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth
    const h = height
    canvas.width = Math.max(1, Math.floor(w * dpr))
    canvas.height = Math.max(1, Math.floor(h * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    const vals = data.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    const padL = 6
    const padT = 16
    const padB = 6
    if (vals.length < 2) {
      ctx.fillStyle = mutedColor()
      ctx.font = '11px system-ui'
      ctx.fillText(vals.length === 0 ? 'aguardando dados…' : 'coletando…', padL + 2, h / 2 + 4)
      return
    }
    const max = Math.max(...vals)
    const min = Math.min(...vals)
    const span = Math.max(max - min, 1)
    const plotW = w - padL - 30
    const plotH = h - padT - padB
    const step = plotW / Math.max(HISTORY_MAX - 1, 1)
    const accent = accentColor()
    const yOf = (v: number) => padT + plotH - ((v - min) / span) * plotH
    // grade horizontal
    ctx.strokeStyle = 'rgba(128,128,128,0.22)'
    ctx.lineWidth = 1
    for (let g = 0; g <= 3; g++) {
      const y = padT + (plotH * g) / 3
      ctx.beginPath()
      ctx.moveTo(padL, y)
      ctx.lineTo(padL + plotW, y)
      ctx.stroke()
    }
    // area + linha
    ctx.beginPath()
    let started = false
    let lastX = padL
    let lastY = padT + plotH
    data.forEach((v, i) => {
      if (v == null) return
      const x = padL + i * step
      const y = yOf(v)
      if (!started) { ctx.moveTo(x, y); started = true }
      else ctx.lineTo(x, y)
      lastX = x
      lastY = y
    })
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.lineTo(lastX, padT + plotH)
    ctx.lineTo(padL, padT + plotH)
    ctx.closePath()
    try {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH)
      grad.addColorStop(0, accent + '44')
      grad.addColorStop(1, accent + '00')
      ctx.fillStyle = grad
      ctx.fill()
    } catch { }
    // ponto atual
    ctx.beginPath()
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2)
    ctx.fillStyle = accent
    ctx.fill()
    // rotulos max/min fora da area do grafico
    ctx.fillStyle = mutedColor()
    ctx.font = '10px system-ui'
    ctx.fillText(`${Math.round(max)}${unit}`, padL + plotW + 4, padT + 8)
    ctx.fillText(`${Math.round(min)}${unit}`, padL + plotW + 4, padT + plotH)
  }, [data, unit, height])
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block' }} />
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--accent)' }} />
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{children}</span>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '5px 0', fontSize: 12.5, borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-primary)' }}>{children}</span>
    </div>
  )
}

function HeroTile({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 140, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color, lineHeight: 1.25 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{sub}</div>}
    </div>
  )
}

function qualityColor(ms: number | null, okUnder: number, warnUnder: number): string {
  if (ms == null) return 'var(--text-muted)'
  if (ms < okUnder) return '#23a55a'
  if (ms < warnUnder) return '#f0b232'
  return '#f04747'
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// Impressão digital da sessão (Fase 3 "um print basta"): build, peers e
// último código numa linha + botão que copia o pacote completo.
function FingerprintBar({ buildId, connectedCount, totalPeers, signalErrors, connectionStates, diag }: {
  buildId: string
  connectedCount: number
  totalPeers: number
  signalErrors: Array<{ type: string; msg: string; ts: number }>
  connectionStates: Record<string, string>
  diag: CallDiagnostics | null
}) {
  const [copied, setCopied] = useState(false)
  const codes = lastDiagCodes()
  const last = codes.length > 0 ? codes[0] : null
  const print = `${buildId} · ${connectedCount}/${totalPeers} peers · último ${last ? last.code : (signalErrors.length > 0 ? signalErrors[signalErrors.length - 1].type : 'sem erros')}`
  const copyAll = useCallback(async () => {
    const payload = {
      v: 1,
      build: buildId,
      at: new Date().toISOString(),
      peers: `${connectedCount}/${totalPeers}`,
      connectionStates,
      serverLatencyMs: diag?.serverLatencyMs ?? null,
      signalRttMs: diag?.signalRttMs ?? null,
      presenceRttMs: diag?.presenceRttMs ?? null,
      codes: codes.map(c => ({ code: c.code, where: c.where, ts: c.ts })),
      signalErrors: (signalErrors || []).slice(-10),
      remote: diag?.remoteByPeer ?? {},
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 160) : '?',
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 1))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      try {
        window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Não deu para copiar — selecione o texto do diagnóstico' }))
      } catch { }
    }
  }, [buildId, connectedCount, totalPeers, connectionStates, diag, codes, signalErrors])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
      <Fa name="bug" size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={print}>
        {print}
      </span>
      <button
        onClick={() => { void copyAll() }}
        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
      >
        {copied ? 'Copiado!' : 'Copiar diagnóstico'}
      </button>
    </div>
  )
}

export default function DebugWindow({ onClose }: { onClose: () => void }) {
  const { currentUser } = useUserStore()
  const participants = useCallStore(s => s.participants)
  const connectionStates = useCallStore(s => s.connectionStates)
  const livekitActive = useCallStore(s => s.livekitActive)
  const sessionId = useCallStore(s => s.sessionId)
  const createdAt = useCallStore(s => s.createdAt)
  const activeCall = useCallStore(s => s.activeCall)
  const [diag, setDiag] = useState<CallDiagnostics | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [rttHist, setRttHist] = useState<(number | null)[]>([])
  const [downHist, setDownHist] = useState<(number | null)[]>([])
  const [bugText, setBugText] = useState('')
  const [bugState, setBugState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [turnTest, setTurnTest] = useState<{ running: boolean; text: string }>({ running: false, text: '' })
  const selftestResult = useCallStore(s => s.selftestResult)
  const [selftestRunning, setSelftestRunning] = useState(false)

  const runTurnTest = useCallback(async () => {
    if (turnTest.running) return
    setTurnTest({ running: true, text: 'testando…' })
    try {
      const r: TurnTestResult = await testTurnConnectivity()
      const parts = [`relay:${r.relay ? 'OK' : 'NÃO'}`, `srflx:${r.srflx ? 'OK' : 'NÃO'}`, `host:${r.host ? 'OK' : 'NÃO'}`]
      setTurnTest({ running: false, text: `${parts.join(' · ')} · ${r.source} · ${r.ms}ms${r.error ? ` (${r.error})` : ''}` })
    } catch {
      setTurnTest({ running: false, text: 'falhou' })
    }
  }, [turnTest.running])

  useEffect(() => {
    let mounted = true
    const refresh = async () => {
      try {
        const d = await getCallDiagnostics()
        if (!mounted) return
        setDiag(d)
        setRttHist(prev => [...prev, d.serverLatencyMs].slice(-HISTORY_MAX))
        const down = Object.values(d.remoteByPeer).reduce(
          (sum, p) => sum + (p.audioBitrateKbps || 0) + (p.videoBitrateKbps || 0), 0)
        setDownHist(prev => [...prev, down > 0 ? Math.round(down) : null].slice(-HISTORY_MAX))
      } catch { }
    }
    void refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const sendBug = useCallback(async () => {
    const text = bugText.trim()
    if (!text || bugState === 'sending') return
    setBugState('sending')
    try {
      const plan = getStreamPlanLabel(currentUser).label
      const auto = [
        `plano=${plan}`,
        `rtt=${diag?.serverLatencyMs ?? '?'}ms`,
        `peers=${diag ? Object.keys(diag.remoteByPeer).length : '?'}`,
        `livekit=${livekitActive ? 'on' : 'off'}`,
        `ua=${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : '?'}`,
      ].join(' ')
      await requestBackend('reportClientError', {
        where: 'debug-window',
        message: `${text.slice(0, 500)}\n[${auto}]`.slice(0, 950),
      })
      setBugState('sent')
      setBugText('')
      window.setTimeout(() => setBugState(prev => (prev === 'sent' ? 'idle' : prev)), 4000)
    } catch {
      setBugState('error')
      window.setTimeout(() => setBugState(prev => (prev === 'error' ? 'idle' : prev)), 4000)
    }
  }, [bugText, bugState, currentUser, diag, livekitActive])

  const peers = diag ? Object.entries(diag.remoteByPeer) : []
  const latencies = peers.map(([, d]) => d.latencyMs).filter((v): v is number => v != null)
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : null
  const totalLoss = peers.reduce((s, [, d]) => s + (d.audioLoss ?? 0) + (d.videoLoss ?? 0), 0)
  const connEntries = Object.entries(connectionStates)
  const connectedCount = connEntries.filter(([, st]) => st === 'connected').length
  const e2e = connEntries.length > 0 && connectedCount === connEntries.length
  const netType = (() => {
    try {
      const c = (navigator as unknown as { connection?: { effectiveType?: string } }).connection
      return c?.effectiveType || '—'
    } catch { return '—' }
  })()
  const buildId = (() => {
    try {
      return typeof __BUILD_ID__ !== 'undefined' ? String(__BUILD_ID__).slice(0, 16) : 'dev'
    } catch { return 'dev' }
  })()
  const nameOf = (peerId: string) => participants.find(p => p.userId === peerId)?.userName || `${peerId.slice(0, 8)}…`
  const elapsed = activeCall && createdAt && createdAt > 0 ? formatElapsed(now - createdAt) : '--:--'
  const watch = useCallStore(s => s.sessionWatch)
  const lastDown = downHist.length > 0 ? downHist[downHist.length - 1] : null

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(780px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.65)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: 'color-mix(in srgb, var(--accent) 16%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Fa name="bug" size={14} style={{ color: 'var(--accent)' }} />
          </span>
          <span style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--text-primary)' }}>Diagnóstico de conexão</span>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {new Date(now).toLocaleTimeString()}
          </span>
          <button onClick={onClose} title="Fechar (ESC)" style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, padding: '4px 9px' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FingerprintBar
            buildId={buildId}
            connectedCount={connectedCount}
            totalPeers={Math.max(connEntries.length, peers.length)}
            signalErrors={diag?.signalErrors ?? []}
            connectionStates={connectionStates}
            diag={diag}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <HeroTile
              label="Ping servidor"
              value={diag?.serverLatencyMs != null ? `${diag.serverLatencyMs}` : '—'}
              sub={diag?.serverLatencyMs != null ? 'ms · rede ' + netType : 'medindo…'}
              color={qualityColor(diag?.serverLatencyMs ?? null, 150, 400)}
            />
            <HeroTile
              label="Tempo na call"
              value={elapsed}
              sub={activeCall ? 'ao vivo · min:seg' : 'fora de call'}
              color={activeCall ? 'var(--text-primary)' : 'var(--text-muted)'}
            />
            <HeroTile
              label="Peers conectados"
              value={`${connectedCount}/${Math.max(connEntries.length, peers.length)}`}
              sub={livekitActive ? 'LiveKit ⚡ SFU' : 'P2P mesh'}
              color={e2e ? '#23a55a' : '#f0b232'}
            />
          </div>

          <section>
            <SectionTitle>Servidor · {navigator.onLine ? <b style={{ color: '#23a55a' }}>online</b> : <b style={{ color: '#f04747' }}>offline</b>}</SectionTitle>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
              <Spark data={rttHist} unit="ms" />
              <Row label="Ping servidor (poll 2.5s)">
                <b style={{ color: qualityColor(diag?.serverLatencyMs ?? null, 150, 400) }}>
                  {diag?.serverLatencyMs != null ? `${diag.serverLatencyMs} ms` : '—'}
                </b>
              </Row>
              <Row label="RTT signaling (offer/answer)">
                <b style={{ color: qualityColor(diag?.signalRttMs ?? null, 400, 1200) }}>
                  {diag?.signalRttMs != null ? `${diag.signalRttMs} ms` : '—'}
                </b>
              </Row>
              <Row label="RTT presença (upsert 8s)">
                <b style={{ color: qualityColor(diag?.presenceRttMs ?? null, 600, 1500) }}>
                  {diag?.presenceRttMs != null ? `${diag.presenceRttMs} ms` : '—'}
                </b>
              </Row>
              <Row label="Ping médio / máximo (voz)">
                <b style={{ color: qualityColor(avgLatency, 150, 400) }}>
                  {avgLatency != null ? `${avgLatency} ms` : '—'} / {maxLatency != null ? `${maxLatency} ms` : '—'}
                </b>
              </Row>
              <Row label="Controle remoto">
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <b style={{ color: selftestResult ? (selftestResult.ping === 'pong ok' ? 'var(--accent)' : '#f0b232') : 'var(--text-muted)', fontSize: 12 }}>
                    {selftestRunning ? 'testando...' : selftestResult
                      ? `DC ${selftestResult.dc} · ${selftestResult.ping} · ${selftestResult.inject}`
                      : 'não testado'}
                  </b>
                  <button
                    onClick={() => {
                      if (selftestRunning) return
                      setSelftestRunning(true)
                      void useCallStore.getState().runControlSelftest().catch(() => { }).finally(() => setSelftestRunning(false))
                    }}
                    disabled={selftestRunning}
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: selftestRunning ? 'wait' : 'pointer', opacity: selftestRunning ? 0.6 : 1 }}
                  >
                    {selftestRunning ? '...' : 'Testar controle'}
                  </button>
                </span>
              </Row>
              <Row label="TURN (relay)">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b style={{ color: turnTest.text.includes('relay:OK') ? '#23a55a' : turnTest.text ? '#f0b232' : 'var(--text-muted)', fontSize: 12 }}>
                    {turnTest.text || 'não testado'}
                  </b>
                  <button
                    onClick={() => { void runTurnTest() }}
                    disabled={turnTest.running}
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: turnTest.running ? 'wait' : 'pointer', opacity: turnTest.running ? 0.6 : 1 }}
                  >
                    {turnTest.running ? '…' : 'Testar'}
                  </button>
                </span>
              </Row>
              {diag && diag.signalErrors.length > 0 && (
                <div style={{ marginTop: 6, padding: 8, background: 'rgba(240,71,71,0.1)', borderRadius: 8, fontSize: 11 }}>
                  <div style={{ color: '#f04747', fontWeight: 700 }}>Erros de sinal ({diag.signalErrors.length})</div>
                  {diag.signalErrors.slice(-4).map((e, i) => (
                    <div key={i} style={{ fontFamily: 'monospace', color: '#f47' }}>{e.type}: {e.msg}</div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {watch && (watch.slowPeerIds.length > 0 || watch.screenMissingFor.length > 0) && (
            <div style={{ background: 'rgba(240,178,50,0.08)', border: '1px solid rgba(240,178,50,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
              <div style={{ color: '#f0b232', fontWeight: 800, marginBottom: 4 }}>Vigia do servidor</div>
              {watch.slowPeerIds.map(pid => (
                <div key={'s' + pid} style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>conectando devagar: {nameOf(pid)}</div>
              ))}
              {watch.screenMissingFor.map(pid => (
                <div key={'v' + pid} style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>tela nao chega em {nameOf(pid)} — ressincronizando</div>
              ))}
            </div>
          )}
          <section>
            <SectionTitle>Voz e vídeo · {e2e ? <b style={{ color: '#23a55a' }}>ponta a ponta ativa</b> : <b style={{ color: '#f0b232' }}>sincronizando</b>}</SectionTitle>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
              <Spark data={downHist} unit="kbps" />
              <Row label="Download voz+vídeo"><b style={{ color: 'var(--accent)' }}>{lastDown != null ? `${lastDown} kbps` : '—'}</b></Row>
              <Row label="Usuários na call"><b style={{ color: '#23a55a' }}>{participants.length} {participants.length === 1 ? 'pessoa' : 'pessoas'}</b></Row>
              <Row label="Perda total de pacotes">
                <b style={{ color: totalLoss > 0 ? '#f04747' : '#23a55a' }}>{totalLoss > 0 ? `${totalLoss} perdidos` : '0'}</b>
              </Row>
              <Row label="Mic local"><b style={{ color: diag && diag.localMicEnabled && diag.localAudioTracks > 0 ? '#23a55a' : '#f23f43' }}>{diag ? `${diag.localAudioTracks} track(s)${diag.localMicEnabled ? ' · ativo' : ' · desligado'}` : '—'}</b></Row>
              {peers.length === 0 && (
                <div style={{ color: '#f0b232', fontSize: 12, padding: '6px 0' }}>Nenhum peer conectado ainda — os dados por pessoa aparecem aqui.</div>
              )}
              {peers.map(([peerId, d]) => (
                <div key={peerId} style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 8, padding: '8px 12px', background: 'var(--bg-tertiary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.connectionState === 'connected' ? '#23a55a' : '#f0b232' }} />
                    <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>{nameOf(peerId)}</b>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{d.connectionState}{d.iceState ? ` · ICE ${d.iceState}` : ''}</span>
                  </div>
                  <Row label="RTT / jitter">
                    <span><b style={{ color: qualityColor(d.latencyMs ?? null, 150, 400) }}>{d.latencyMs != null ? `${d.latencyMs} ms` : '—'}</b> / <b style={{ color: qualityColor(d.jitterMs ?? null, 30, 80) }}>{d.jitterMs != null ? `${d.jitterMs} ms` : '—'}</b></span>
                  </Row>
                  <Row label="Bitrate down (a+v)">
                    <span>{d.audioBitrateKbps != null || d.videoBitrateKbps != null ? `${d.audioBitrateKbps ?? '—'} + ${d.videoBitrateKbps ?? '—'} kbps` : '—'}</span>
                  </Row>
                  <Row label="Perda a/v · vídeo">
                    <span style={{ color: (d.audioLoss ?? 0) + (d.videoLoss ?? 0) > 0 ? '#f04747' : 'var(--text-primary)' }}>
                      {d.audioLoss ?? '—'}/{d.videoLoss ?? '—'} · {d.videoFps != null ? `${d.videoFps} fps` : 'só voz'}
                    </span>
                  </Row>
                  <Row label="Rota"><span style={{ fontSize: 11 }}>{[d.candidates && d.candidates.includes('relay') ? 'relay🛟' : '', d.remoteCandidateType, d.dataChannelState ? `DC ${d.dataChannelState}` : '', d.audioCodec ? d.audioCodec.split('/')[1] : ''].filter(Boolean).join(' · ') || '—'}</span></Row>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle>App</SectionTitle>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 14px' }}>
              <Row label="Plano"><b style={{ color: getStreamPlanLabel(currentUser).color }}>{getStreamPlanLabel(currentUser).label}</b></Row>
              <Row label="Sessão"><span>{sessionId ? `${sessionId.slice(0, 8)}…` : '—'}</span></Row>
              <Row label="Build"><span>{buildId}</span></Row>
              <Row label="Áudio limpo"><span>{isCleanAudioEnabledPref() ? 'ativado ✨' : 'desligado'}</span></Row>
            </div>
          </section>

          <section>
            <SectionTitle>Reportar bug aos devs</SectionTitle>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
              <textarea
                value={bugText}
                onChange={e => setBugText(e.target.value)}
                placeholder="Descreva o que aconteceu (ex.: voz travando na call com 3 pessoas)… Os dados acima vão junto automaticamente."
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <button
                  onClick={() => { void sendBug() }}
                  disabled={!bugText.trim() || bugState === 'sending'}
                  style={{ background: 'var(--accent)', color: '#04120a', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 800, cursor: bugText.trim() && bugState !== 'sending' ? 'pointer' : 'not-allowed', opacity: bugText.trim() ? 1 : 0.5 }}
                >
                  {bugState === 'sending' ? 'Enviando…' : '🐞 Enviar aos devs'}
                </button>
                {bugState === 'sent' && <span style={{ color: '#23a55a', fontSize: 12, fontWeight: 700 }}>Recebido, valeu! ✓</span>}
                {bugState === 'error' && <span style={{ color: '#f04747', fontSize: 12, fontWeight: 700 }}>Falhou — tente de novo</span>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
