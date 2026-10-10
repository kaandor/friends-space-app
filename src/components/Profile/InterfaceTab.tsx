import { useState } from 'react'
import { Newspaper, TrendingUp, Users, Clapperboard, LayoutList } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'

export type UiSection = 'feed' | 'stories' | 'trending' | 'news' | 'suggested'

export const UI_SECTIONS: Array<{ key: UiSection; label: string; desc: string }> = [
  { key: 'feed', label: 'Feed', desc: 'Publicações de amigos, global e servidores.' },
  { key: 'stories', label: 'Stories', desc: 'Barra de stories no topo.' },
  { key: 'trending', label: 'O que está acontecendo', desc: 'Hashtags em alta no Friends Space.' },
  { key: 'news', label: 'Notícias do dia', desc: 'Painel de notícias externas.' },
  { key: 'suggested', label: 'Quem seguir', desc: 'Sugestões de servidores.' },
]

const ICONS: Record<UiSection, React.ReactNode> = {
  feed: <LayoutList size={16} strokeWidth={2} />,
  stories: <Clapperboard size={16} strokeWidth={2} />,
  trending: <TrendingUp size={16} strokeWidth={2} />,
  news: <Newspaper size={16} strokeWidth={2} />,
  suggested: <Users size={16} strokeWidth={2} />,
}

export function uiEnabled(user: { settings?: Record<string, unknown> } | null | undefined, key: UiSection): boolean {
  const ui = (user?.settings?.ui || {}) as Record<string, unknown>
  return ui[key] !== false
}

// Aba Interface: o usuário liga/desliga cada parte do feed.
export function InterfaceTab() {
  const { currentUser, updateUser } = useUserStore()
  const [busy, setBusy] = useState(false)

  const toggle = async (key: UiSection) => {
    if (!currentUser || busy) return
    setBusy(true)
    try {
      const ui = { ...((currentUser.settings || {}).ui as Record<string, unknown> || {}) }
      ui[key] = ui[key] === false ? true : false
      await updateUser({ settings: { ...(currentUser.settings || {}), ui } })
    } finally { setBusy(false) }
  }

  return (
    <div className="profile-form">
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800, margin: '4px 0' }}>Interface</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>Escolha o que aparece no seu feed.</p>
      </div>
      {UI_SECTIONS.map(s => {
        const on = uiEnabled(currentUser, s.key)
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: on ? 'var(--accent)' : 'var(--text-muted)' }}>{ICONS[s.key]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13.5 }}>{s.label}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{s.desc}</div>
            </div>
            <button onClick={() => void toggle(s.key)} title={on ? 'Desativar' : 'Ativar'}
              style={{ width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'var(--accent)' : 'var(--bg-tertiary)', position: 'relative', opacity: busy ? 0.6 : 1 }}>
              <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: on ? '#000' : 'var(--text-muted)', transition: 'left .15s' }} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
