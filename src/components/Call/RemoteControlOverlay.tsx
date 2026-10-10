import { useEffect, useRef } from 'react'
import { useCallStore } from '../../stores/callStore'

export interface RemoteControlInput {
  it: 'move' | 'button' | 'wheel' | 'key'
  x?: number
  y?: number
  button?: string
  down?: boolean
  deltaY?: number
  key?: string
}

// Overlay de controle remoto estilo AnyDesk: mostra o cursor REAL do PC
// controlado (via data channel) e injeta mouse/teclado com escala correta.
export function RemoteControlOverlay({ onInput }: {
  onInput: (input: RemoteControlInput) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastSent = useRef(0)
  const remoteCursor = useCallStore(s => s.remoteCursor)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const coords = (e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const video = el.parentElement?.querySelector('video') as HTMLVideoElement | null
    let cx = rect.left
    let cy = rect.top
    let cw = rect.width
    let ch = rect.height
    if (video && video.videoWidth && video.videoHeight) {
      const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight)
      cw = video.videoWidth * scale
      ch = video.videoHeight * scale
      cx = rect.left + (rect.width - cw) / 2
      cy = rect.top + (rect.height - ch) / 2
    }
    return {
      x: Math.min(1, Math.max(0, (e.clientX - cx) / (cw || 1))),
      y: Math.min(1, Math.max(0, (e.clientY - cy) / (ch || 1))),
    }
  }

  const handleMove = (e: React.MouseEvent) => {
    const now = Date.now()
    if (now - lastSent.current < 33) return
    lastSent.current = now
    const { x, y } = coords(e)
    onInput({ it: 'move', x, y })
  }

  const handleButton = (e: React.MouseEvent, down: boolean) => {
    e.preventDefault()
    const { x, y } = coords(e)
    const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left'
    onInput({ it: 'move', x, y })
    onInput({ it: 'button', button, down })
  }

  const hostScale = remoteCursor && remoteCursor.width && remoteCursor.height
    ? { scaleX: 1 / remoteCursor.width, scaleY: 1 / remoteCursor.height }
    : null
  const cursorStyle: React.CSSProperties | undefined = hostScale && remoteCursor
    ? {
        left: Math.min(1, Math.max(0, remoteCursor.x * hostScale.scaleX)) * 100 + '%',
        top: Math.min(1, Math.max(0, remoteCursor.y * hostScale.scaleY)) * 100 + '%',
        opacity: remoteCursor.visible ? 1 : 0,
      }
    : { display: 'none' }

  return (
    <div
      ref={ref}
      tabIndex={0}
      onMouseMove={handleMove}
      onMouseDown={e => handleButton(e, true)}
      onMouseUp={e => handleButton(e, false)}
      onMouseLeave={() => onInput({ it: 'button', button: 'left', down: false })}
      onWheel={e => { e.preventDefault(); e.stopPropagation(); onInput({ it: 'wheel', deltaY: e.deltaY }) }}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        if (e.shiftKey && e.ctrlKey) return
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Tab') return
        onInput({ it: 'key', key: e.key, down: true })
      }}
      onKeyUp={e => {
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Tab') return
        onInput({ it: 'key', key: e.key, down: false })
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 45,
        cursor: 'none',
        background: 'transparent',
        touchAction: 'none',
      }}
    >
      {/* Cursor real do PC controlado (estilo AnyDesk) */}
      <div
        style={{
          position: 'absolute',
          width: 18,
          height: 18,
          pointerEvents: 'none',
          zIndex: 46,
          filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.9))',
          transition: 'left 0.03s linear, top 0.03s linear',
          ...cursorStyle,
        }}
      >
        <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
          <path d="M4 2 L4 20 L8.6 15.9 L11.8 21.2 L14.4 19.9 L11.2 14.6 L16 14.5 Z" fill="#fff" stroke="#111" strokeWidth="1.4" />
          <path d="M4 2 L4 20 L8.6 15.9 L11.8 21.2 L14.4 19.9 L11.2 14.6 L16 14.5 Z" fill="#00ff88" opacity="0.35" />
        </svg>
      </div>

      {/* Ajuda discreta (sem botoes): saida e apenas por teclado */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: '5px 12px', color: 'var(--text-secondary)', fontSize: 10.5, pointerEvents: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span><b style={{ color: '#fff' }}>Ctrl+Shift+C</b> parar controle</span>
        <span><b style={{ color: '#fff' }}>Ctrl+Shift+Z</b> sair do remoto</span>
      </div>
    </div>
  )
}
