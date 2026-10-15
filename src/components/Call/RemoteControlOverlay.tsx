import { useCallback, useEffect, useRef, useState } from 'react'
import { useCallStore } from '../../stores/callStore'
import { Fa } from '../../utils/fa'

export interface RemoteControlInput {
  it: 'move' | 'moveRel' | 'button' | 'wheel' | 'key'
  x?: number
  y?: number
  dx?: number
  dy?: number
  button?: string
  down?: boolean
  deltaY?: number
  key?: string
}

// Overlay de controle remoto estilo AnyDesk/RustDesk: cursor REAL do PC
// controlado, barra de ferramentas (teclado, clipboard, audio, tela, game,
// sair), modo game com mouse relativo + countdown do tempo concedido.
export function RemoteControlOverlay({ onInput, onExit, onFullscreen }: {
  onInput: (input: RemoteControlInput) => void
  onExit: () => void
  onFullscreen: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastSent = useRef(0)
  const lastRel = useRef(0)
  const pressed = useRef(new Set<string>())
  const remoteCursor = useCallStore(s => s.remoteCursor)
  const controlEndsAt = useCallStore(s => s.controlEndsAt)
  const controlGrants = useCallStore(s => s.controlGrants)
  const controlLinkOk = useCallStore(s => s.controlLinkOk)
  const lastInputAckAt = useCallStore(s => s.lastInputAckAt)
  const [gameMode, setGameMode] = useState(false)
  const [locked, setLocked] = useState(false)
  const [muted, setMuted] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Tela cheia 100% limpa: barra some sozinha apos 3.5s parado e VOLTA ao
  // mover o mouse (atalhos sempre alcancaveis, nunca travam a visao).
  const [isFs, setIsFs] = useState(false)
  const [idleHide, setIdleHide] = useState(false)
  const idleTimer = useRef<number | null>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])
  useEffect(() => {
    const onFs = () => {
      try { setIsFs(Boolean(document.fullscreenElement)) } catch { }
      setIdleHide(false)
    }
    try { setIsFs(Boolean(document.fullscreenElement)) } catch { }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  useEffect(() => {
    if (!isFs) { setIdleHide(false); return }
    const poke = () => {
      setIdleHide(false)
      try { if (idleTimer.current !== null) window.clearTimeout(idleTimer.current) } catch { }
      idleTimer.current = window.setTimeout(() => setIdleHide(true), 3500)
    }
    poke()
    const el = ref.current
    el?.addEventListener('mousemove', poke)
    return () => {
      el?.removeEventListener('mousemove', poke)
      try { if (idleTimer.current !== null) window.clearTimeout(idleTimer.current) } catch { }
    }
  }, [isFs])

  // Countdown do tempo concedido pelo dono.
  useEffect(() => {
    if (!controlEndsAt) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [controlEndsAt])

  // Solta teclas presas ao sair/perder foco/desmontar (anti stuck keys).
  const releaseAllKeys = useCallback(() => {
    try {
      for (const k of pressed.current) {
        try { onInput({ it: 'key', key: k, down: false }) } catch { }
      }
    } catch { }
    pressed.current.clear()
  }, [onInput])
  useEffect(() => () => { try { releaseAllKeys() } catch { } }, [releaseAllKeys])

  // Pointer lock do modo game (Esc solta e desliga o modo).
  useEffect(() => {
    const onChange = () => {
      const isLocked = document.pointerLockElement === ref.current
      setLocked(isLocked)
      if (!isLocked) {
        setGameMode(false)
        try { releaseAllKeys() } catch { }
      }
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [releaseAllKeys])

  const coords = (e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const video = el.parentElement?.querySelector('video') as HTMLVideoElement | null
    let cx = rect.left
    let cy = rect.top
    let cw = rect.width
    let ch = rect.height
    // A tela usa objectFit FILL durante o controle (estica) e CONTAIN fora
    // dele: com fill nao ha letterbox — usar o rect cheio. Antes o calculo
    // sempre descontava letterbox (contain) e a mira deslocava/travava.
    let fill = false
    try { fill = !!video && getComputedStyle(video).objectFit === 'fill' } catch { }
    if (video && video.videoWidth && video.videoHeight && !fill) {
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
    // Modo game travado: movimento RELATIVO (movementX/Y) — games com
    // raw input / camera livre precisam disso, absoluto nao funciona.
    if (gameMode && locked) {
      const t = Date.now()
      if (t - lastRel.current < 16) return
      lastRel.current = t
      const dx = (e as unknown as { movementX?: number }).movementX || 0
      const dy = (e as unknown as { movementY?: number }).movementY || 0
      if (dx !== 0 || dy !== 0) onInput({ it: 'moveRel', dx: Math.round(dx * 2), dy: Math.round(dy * 2) })
      return
    }
    const t = Date.now()
    if (t - lastSent.current < 20) return // LIGHT SPEED: 50 comandos/s
    lastSent.current = t
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

  const sendKey = (key: string, down: boolean) => {
    if (down) pressed.current.add(key)
    else pressed.current.delete(key)
    onInput({ it: 'key', key, down })
  }

  const pasteClipboard = useCallback(() => {
    // Le NOSSA area de transferencia e envia ao PC controlado (permissao
    // do dono vale no receptor; sem clipboard la, ele ignora).
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Navegador bloqueou ler a área de transferência' })) } catch { }
        return
      }
      void navigator.clipboard.readText().then(text => {
        if (!text) return
        try { useCallStore.getState().sendClipboard(text) } catch { }
      }).catch(() => {
        try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Navegador bloqueou ler a área de transferência' })) } catch { }
      })
    } catch { }
  }, [])

  const toggleGame = useCallback(() => {
    const el = ref.current
    if (!gameMode) {
      setGameMode(true)
      try { el?.requestPointerLock() } catch { }
      try { ref.current?.focus() } catch { }
    } else {
      try { document.exitPointerLock?.() } catch { }
      setGameMode(false)
      try { releaseAllKeys() } catch { }
    }
  }, [gameMode, releaseAllKeys])

  const remaining = controlEndsAt ? Math.max(0, controlEndsAt - now) : null
  const remainingLabel = remaining === null
    ? 'ilimitado'
    : `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`

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

  const toolBtn = (active?: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5, background: active ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
    color: active ? '#04120a' : '#fff', border: 'none', borderRadius: 7, padding: '6px 9px',
    fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  })

  return (
    <div
      ref={ref}
      tabIndex={0}
      onMouseMove={handleMove}
      onMouseDown={e => handleButton(e, true)}
      onMouseUp={e => handleButton(e, false)}
      onMouseLeave={() => onInput({ it: 'button', button: 'left', down: false })}
      onBlur={() => { try { releaseAllKeys() } catch { } }}
      onWheel={e => { e.preventDefault(); e.stopPropagation(); onInput({ it: 'wheel', deltaY: e.deltaY }) }}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        if (e.shiftKey && e.ctrlKey) return
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Tab' && !gameMode) return
        if (e.repeat) return
        sendKey(e.key, true)
      }}
      onKeyUp={e => {
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Tab' && !gameMode) return
        sendKey(e.key, false)
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 45,
        cursor: gameMode && locked ? 'none' : 'none',
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

      {/* Barra do controlador (estilo RustDesk) — some no fullscreen parado */}
      <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: 6, pointerEvents: isFs && idleHide ? 'none' : 'auto', opacity: isFs && idleHide ? 0 : 1, transition: 'opacity 0.3s', zIndex: 47 }}>
        <button title="Focar teclado (digitar no PC remoto)" onClick={() => { try { ref.current?.focus() } catch { } }} style={toolBtn(false)}>
          <Fa name="keyboard" size={12} /> Teclado
        </button>
        <button title="Enviar minha área de transferência ao PC remoto" onClick={pasteClipboard} style={toolBtn(false)}>
          <Fa name="clipboard" size={12} /> Colar
        </button>
        <button title={muted ? 'Ativar áudio da tela' : 'Mutar áudio da tela'} onClick={() => { try { useCallStore.getState().toggleScreenMute() } catch { } setMuted(m => !m) }} style={toolBtn(muted)}>
          <Fa name={muted ? 'volume-xmark' : 'volume-high'} size={12} /> {muted ? 'Mudo' : 'Áudio'}
        </button>
        <button title="Tela cheia" onClick={onFullscreen} style={toolBtn(false)}>
          <Fa name="expand" size={12} /> Tela
        </button>
        <button title={gameMode ? 'Sair do modo game' : 'Modo game: mouse relativo + 60fps'} onClick={toggleGame} style={toolBtn(gameMode)}>
          <Fa name="gamepad" size={12} /> {gameMode ? (locked ? 'Game ●' : 'Game…') : 'Game'}
        </button>
        <button title="Parar controle (Ctrl+Shift+C)" onClick={onExit} style={{ ...toolBtn(false), background: '#ed4245' }}>
          <Fa name="xmark" size={12} /> Sair
        </button>
      </div>

      {/* Ajuda + countdown + atalhos — some no fullscreen parado */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: '5px 12px', color: 'var(--text-secondary)', fontSize: 10.5, pointerEvents: 'none', whiteSpace: 'normal', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, maxWidth: 'calc(100% - 24px)', textAlign: 'center', opacity: isFs && idleHide ? 0 : 1, transition: 'opacity 0.3s' }}>
        <span><b style={{ color: '#fff' }}>Ctrl+Shift+C</b> parar controle</span>
        <span><b style={{ color: '#fff' }}>Ctrl+Shift+Z</b> sair do remoto</span>
        <span title={controlLinkOk === false ? 'PC remoto sem resposta' : lastInputAckAt && Date.now() - lastInputAckAt < 8000 ? 'Comandos chegando no PC remoto' : 'Enlace com o PC remoto'}>
          <b style={{ color: controlLinkOk === false ? '#f04747' : lastInputAckAt && Date.now() - lastInputAckAt < 8000 ? '#00ff88' : '#f0b232' }}>
            {controlLinkOk === false ? 'sem resposta' : lastInputAckAt && Date.now() - lastInputAckAt < 8000 ? 'controlando' : 'ligando…'}
          </b>
        </span>
        <span title="Tempo concedido pelo dono">⏱ <b style={{ color: controlEndsAt && remaining !== null && remaining < 60000 ? '#f0b232' : '#fff' }}>{remainingLabel}</b></span>
        {controlGrants && (!controlGrants.mouse || !controlGrants.keyboard) && (
          <span title="Permissões do dono">
            {!controlGrants.mouse && '🚫🖱'}
            {!controlGrants.keyboard && '🚫⌨'}
          </span>
        )}
      </div>
    </div>
  )
}
