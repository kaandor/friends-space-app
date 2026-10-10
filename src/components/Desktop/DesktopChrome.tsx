import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { assetUrl } from '../../utils/assets'

const dragRegion = { WebkitAppRegion: 'drag' } as unknown as CSSProperties
const noDrag = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties

// Title bar customizada do app desktop (janela sem moldura nativa, estilo
// Discord/AnyDesk). Só aparece quando rodando dentro do Electron.
export function DesktopChrome() {
  const [isElectron, setIsElectron] = useState(false)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { isElectron?: boolean; windowControl?: (a: string) => void; onWindowState?: (cb: (s: string) => void) => () => void } }).electronAPI
    if (!api?.isElectron) return
    setIsElectron(true)
    const off = api.onWindowState ? api.onWindowState(state => setMaximized(state === 'maximized')) : undefined
    return () => { if (off) off() }
  }, [])

  if (!isElectron) return null

  const api = (window as unknown as { electronAPI?: { windowControl?: (a: string) => void } }).electronAPI

  return (
    <div
      style={{
        height: 38,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#0d0e10',
        borderBottom: '1px solid var(--border)',
        userSelect: 'none',
        ...dragRegion,
        zIndex: 5000,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
        <img src={assetUrl('Logo.png')} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700 }}>Friends Space</span>
      </div>
      <div style={{ display: 'flex', ...noDrag }}>
        <button
          onClick={() => api?.windowControl?.('minimize')}
          title="Minimizar"
          style={{ width: 44, height: 38, background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
        >
          —
        </button>
        <button
          onClick={() => api?.windowControl?.('maximize')}
          title={maximized ? 'Restaurar' : 'Maximizar'}
          style={{ width: 44, height: 38, background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
        >
          {maximized ? '❐' : '□'}
        </button>
        <button
          onClick={() => api?.windowControl?.('close')}
          title="Fechar"
          style={{ width: 44, height: 38, background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}
          onMouseEnter={e => { e.currentTarget.style.background = '#e81123'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
