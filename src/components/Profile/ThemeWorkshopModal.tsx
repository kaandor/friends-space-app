import { useEffect, useState } from 'react'
import { Lock, Palette, Send, Trash2, Check, Store } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'
import { requestBackend } from '../../services/backend'

export interface UserTheme {
  id: string
  ownerId: string
  ownerName: string
  name: string
  kind: 'solid' | 'animated'
  accent: string
  bg: string
  bg2: string
  text: string
  createdAt: number
}

interface Props { onClose: () => void }

// Workshop de temas: criar (sólido/animado), aplicar, compartilhar com quem
// tem Astro. A loja (venda, 5% Friends Space) está em beta bloqueada.
export function ThemeWorkshopModal({ onClose }: Props) {
  const { currentUser, updateUser } = useUserStore()
  const [tab, setTab] = useState<'mine' | 'granted' | 'store'>('mine')
  const [mine, setMine] = useState<UserTheme[]>([])
  const [granted, setGranted] = useState<UserTheme[]>([])
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'solid' | 'animated'>('solid')
  const [accent, setAccent] = useState('#29A3FF')
  const [bg, setBg] = useState('#0a0a0a')
  const [bg2, setBg2] = useState('#111111')
  const [text, setText] = useState('#f0f3f4')
  const [shareCode, setShareCode] = useState('')
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!currentUser) return
    try {
      const r = await requestBackend<{ mine: UserTheme[]; granted: UserTheme[] }>('getThemes', { userId: currentUser.id })
      setMine(r?.mine || [])
      setGranted(r?.granted || [])
    } catch { /* ignore */ }
  }
  useEffect(() => { void load() }, [])

  const appliedId = String((currentUser?.settings as Record<string, unknown> | undefined)?.appliedThemeId || '')

  const handleSave = async () => {
    if (!currentUser || !name.trim() || busy) return
    setBusy(true)
    setMsg('')
    try {
      const r = await requestBackend<{ theme: UserTheme }>('saveTheme', {
        userId: currentUser.id,
        theme: { name: name.trim(), kind, accent, bg, bg2, text },
      })
      if (r?.theme) {
        setName('')
        await load()
        setMsg('Tema criado!')
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally { setBusy(false) }
  }

  const handleDelete = async (id: string) => {
    if (!currentUser || !window.confirm('Excluir este tema?')) return
    await requestBackend('deleteTheme', { userId: currentUser.id, themeId: id }).catch(() => null)
    if (appliedId === id) {
      await updateUser({ settings: { ...(currentUser.settings || {}), appliedTheme: null, appliedThemeId: '' } }).catch(() => null)
    }
    void load()
  }

  const handleApply = async (t: UserTheme) => {
    if (!currentUser) return
    try {
      await requestBackend('applyTheme', { userId: currentUser.id, themeId: t.id })
      await updateUser({})
      setMsg(`Tema "${t.name}" aplicado!`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Tema não liberado para você.')
    }
  }

  const handleRemoveTheme = async () => {
    if (!currentUser) return
    await updateUser({ settings: { ...(currentUser.settings || {}), appliedTheme: null, appliedThemeId: '' } }).catch(() => null)
    setMsg('Tema removido, visual padrão de volta.')
  }

  const handleShare = async (t: UserTheme) => {
    if (!currentUser || !shareCode.trim()) return
    setSharingId(t.id)
    setMsg('')
    try {
      const r = await requestBackend<{ toName: string }>('shareTheme', { userId: currentUser.id, themeId: t.id, toCode: shareCode.trim() })
      setMsg(`Tema enviado para ${r?.toName || 'o usuário'}!`)
      setShareCode('')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao compartilhar.')
    } finally { setSharingId(null) }
  }

  const swatch = (theme: UserTheme) => (
    <div style={{
      width: 44, height: 44, borderRadius: 10, flexShrink: 0, border: '1px solid var(--border)',
      background: theme.kind === 'animated'
        ? `linear-gradient(135deg, ${theme.accent}, ${theme.bg2}, ${theme.accent})`
        : theme.accent,
    }} />
  )

  const themeRow = (t: UserTheme, own: boolean) => (
    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      {swatch(t)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.name} {t.kind === 'animated' && <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>✨ animado</span>}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>por {own ? 'você' : t.ownerName}</div>
        {own && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={sharingId === t.id ? shareCode : ''} onChange={e => { setSharingId(t.id); setShareCode(e.target.value) }}
              placeholder="Código do amigo Astro..." maxLength={20}
              style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
            <button onClick={() => { setShareCode(sharingId === t.id ? shareCode : ''); void handleShare({ ...t }) }} title="Enviar tema"
              style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', cursor: 'pointer' }}>
              <Send size={13} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {appliedId === t.id ? (
          <button onClick={() => void handleRemoveTheme()} title="Tema aplicado"
            style={{ padding: '6px 12px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={12} strokeWidth={3} /> Aplicado
          </button>
        ) : (
          <button onClick={() => void handleApply(t)}
            style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
            Aplicar
          </button>
        )}
        {own && (
          <button onClick={() => void handleDelete(t.id)} title="Excluir"
            style={{ padding: '6px 12px', borderRadius: 999, border: 'none', background: 'transparent', color: '#ef4444', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
            <Trash2 size={12} strokeWidth={2} /> Excluir
          </button>
        )}
      </div>
    </div>
  )

  const colorInput = (label: string, value: string, set: (v: string) => void) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
      <input type="color" value={value} onChange={e => set(e.target.value)} style={{ width: 30, height: 26, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', cursor: 'pointer', padding: 0 }} />
      {label}
    </label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="fs-modal-in" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 0' }}>
          <Palette size={16} strokeWidth={2} color="var(--text-primary)" />
          <h4 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, margin: 0, flex: 1 }}>Workshop de temas</h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '12px 16px 0' }}>
          {([['mine', 'Meus temas'], ['granted', 'Recebidos'], ['store', 'Loja']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: tab === k ? 'var(--accent)' : 'var(--bg-tertiary)', color: tab === k ? '#000' : 'var(--text-secondary)' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 16px 16px' }}>
          {msg && <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700, marginBottom: 8 }}>{msg}</div>}

          {tab === 'mine' && (
            <>
              <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Nome do tema..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {(['solid', 'animated'] as const).map(k => (
                    <button key={k} onClick={() => setKind(k)}
                      style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: kind === k ? 'var(--accent)' : 'var(--bg-secondary)', color: kind === k ? '#000' : 'var(--text-secondary)' }}>
                      {k === 'solid' ? 'Sólido' : '✨ Animado'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {colorInput('Destaque', accent, setAccent)}
                  {colorInput('Fundo', bg, setBg)}
                  {colorInput('Fundo 2', bg2, setBg2)}
                  {colorInput('Texto', text, setText)}
                </div>
                <button onClick={() => void handleSave()} disabled={busy || !name.trim()}
                  style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: !name.trim() ? 0.5 : 1 }}>
                  {busy ? 'Salvando...' : 'Criar tema'}
                </button>
              </div>
              {mine.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Você ainda não criou temas.</p>}
              {mine.map(t => themeRow(t, true))}
            </>
          )}

          {tab === 'granted' && (
            <>
              {granted.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Nenhum tema recebido. Só usuários Astro podem receber temas de amigos.</p>}
              {granted.map(t => themeRow(t, false))}
            </>
          )}

          {tab === 'store' && (
            <div style={{ position: 'relative', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, textAlign: 'center', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 2, padding: 16 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#000', background: 'var(--accent)', borderRadius: 999, padding: '6px 14px' }}>
                  <Lock size={13} strokeWidth={3} /> EM DESENVOLVIMENTO
                </span>
                <Store size={28} strokeWidth={1.5} color="var(--text-muted)" />
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, margin: 0 }}>Loja de temas e molduras</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  Em breve você poderá vender seus temas e molduras aqui.<br />O Friends Space fica com 5% de cada venda.
                </p>
              </div>
              <div style={{ visibility: 'hidden' }}>
                <p style={{ fontSize: 13, fontWeight: 700 }}>Loja de temas e molduras</p>
                <p style={{ fontSize: 12 }}>Em breve você poderá vender seus temas e molduras aqui. O Friends Space fica com 5% de cada venda.</p>
                <p style={{ fontSize: 12 }}>Espaço reservado</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
