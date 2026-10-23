import { Fa } from '../../utils/fa'
import { useEffect, useRef, useState } from 'react'
import { Lock, Maximize2, Unlock } from 'lucide-react'
import { useCallStore } from '../../stores/callStore'

export type CameraMode = 'casual' | 'empresa' | 'full'
export type CameraPosition = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'

export const CAMERA_MODE_KEY = 'friends-space:camera-mode'
export const CAMERA_POSITION_KEY = 'friends-space:camera-position'
export const CAMERA_LAYOUT_KEY = 'friends-space:camera-pip-layout'

export const CAMERA_POSITIONS: { value: CameraPosition; label: string; icon: string }[] = [
  { value: 'tl', label: 'Canto sup. esquerdo', icon: 'arrow-up-left' },
  { value: 'tc', label: 'Topo centralizado', icon: 'arrow-up' },
  { value: 'tr', label: 'Canto sup. direito', icon: 'arrow-up-right' },
  { value: 'bl', label: 'Canto inf. esquerdo', icon: 'arrow-down-left' },
  { value: 'bc', label: 'Base centralizada', icon: 'arrow-down' },
  { value: 'br', label: 'Canto inf. direito', icon: 'arrow-down-right' },
]

function parseMode(value: string | null): CameraMode {
  return value === 'casual' || value === 'empresa' || value === 'full' ? value : 'casual'
}

function parsePosition(value: string | null): CameraPosition {
  return value && CAMERA_POSITIONS.some(item => item.value === value) ? value as CameraPosition : 'br'
}

let cameraMode: CameraMode = parseMode(typeof localStorage === 'undefined' ? null : localStorage.getItem(CAMERA_MODE_KEY))
let cameraPosition: CameraPosition = parsePosition(typeof localStorage === 'undefined' ? null : localStorage.getItem(CAMERA_POSITION_KEY))
const cameraListeners = new Set<() => void>()

function emitCameraChange() {
  for (const listener of cameraListeners) {
    try { listener() } catch { }
  }
}

export function getCameraMode(): CameraMode { return cameraMode }
export function getCameraPosition(): CameraPosition { return cameraPosition }

export function setCameraMode(mode: CameraMode) {
  cameraMode = mode
  try { localStorage.setItem(CAMERA_MODE_KEY, mode) } catch { }
  emitCameraChange()
}

export function setCameraPosition(position: CameraPosition) {
  cameraPosition = position
  try { localStorage.setItem(CAMERA_POSITION_KEY, position) } catch { }
  try { localStorage.removeItem(CAMERA_LAYOUT_KEY) } catch { }
  emitCameraChange()
}

function useCameraSettings() {
  const [state, setState] = useState({ mode: cameraMode, position: cameraPosition })
  useEffect(() => {
    const update = () => setState({ mode: cameraMode, position: cameraPosition })
    cameraListeners.add(update)
    return () => { cameraListeners.delete(update) }
  }, [])
  return state
}

interface PipLayout { x: number; y: number; width: number; height: number; locked: boolean }

function defaultLayout(position: CameraPosition, mode: CameraMode): PipLayout {
  const width = mode === 'empresa' ? 248 : 190
  const height = Math.round(width * 9 / 16)
  const gap = 18
  const maxX = typeof window === 'undefined' ? 900 : window.innerWidth - width - gap
  const maxY = typeof window === 'undefined' ? 600 : window.innerHeight - height - 92
  const x = position === 'tl' || position === 'bl' ? gap : position === 'tc' || position === 'bc' ? Math.round((window.innerWidth - width) / 2) : maxX
  const y = position === 'tl' || position === 'tc' || position === 'tr' ? gap : maxY
  return { x, y, width, height, locked: false }
}

function loadLayout(position: CameraPosition, mode: CameraMode): PipLayout {
  try {
    const raw = localStorage.getItem(CAMERA_LAYOUT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PipLayout>
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
        return { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height, locked: Boolean(parsed.locked) }
      }
    }
  } catch { }
  return defaultLayout(position, mode)
}

function saveLayout(layout: PipLayout) {
  try { localStorage.setItem(CAMERA_LAYOUT_KEY, JSON.stringify(layout)) } catch { }
}

export function CameraOverlay({ videoId = 'call-video-camera-mini' }: { videoId?: string }) {
  const localStream = useCallStore(s => s.localStream)
  const cameraOn = useCallStore(s => s.cameraOn)
  const screenStream = useCallStore(s => s.screenStream)
  const remoteScreenStreams = useCallStore(s => s.remoteScreenStreams)
  const { mode, position } = useCameraSettings()
  const [layout, setLayout] = useState<PipLayout>(() => loadLayout(cameraPosition, cameraMode))
  const [hovered, setHovered] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (!localStream) return
    const element = document.getElementById(videoId) as HTMLVideoElement | null
    if (element && element.srcObject !== localStream) element.srcObject = localStream
  }, [localStream, videoId])

  useEffect(() => {
    setLayout(loadLayout(position, mode))
  }, [position, mode])

  const hasCamera = cameraOn && Boolean(localStream?.getVideoTracks().length)
  if (!hasCamera) return null

  const screenActive = Boolean(screenStream) || Object.keys(remoteScreenStreams).length > 0
  const fullMode = mode === 'full' && !screenActive

  if (fullMode) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: '#000', overflow: 'hidden' }}>
        <video id={videoId} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scaleX(-1)', background: '#000' }} />
      </div>
    )
  }

  const updateLayout = (next: PipLayout) => {
    setLayout(next)
    saveLayout(next)
  }

  const startDrag = (event: React.PointerEvent) => {
    if (layout.locked) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { startX: event.clientX, startY: event.clientY, originX: layout.x, originY: layout.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return
    const drag = dragRef.current
    const maxX = Math.max(6, window.innerWidth - layout.width - 6)
    const maxY = Math.max(6, window.innerHeight - layout.height - 78)
    updateLayout({ ...layout, x: Math.min(maxX, Math.max(6, drag.originX + event.clientX - drag.startX)), y: Math.min(maxY, Math.max(6, drag.originY + event.clientY - drag.startY)) })
  }

  const endDrag = () => { dragRef.current = null }

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = { startX: event.clientX, startY: event.clientY, width: layout.width, height: layout.height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveResize = (event: React.PointerEvent) => {
    if (!resizeRef.current) return
    const resize = resizeRef.current
    const ratio = 16 / 9
    const width = Math.min(520, Math.max(128, resize.width + event.clientX - resize.startX))
    updateLayout({ ...layout, width, height: Math.round(width / ratio) })
  }

  const endResize = () => { resizeRef.current = null }

  return (
    <div
      className={`camera-pip${layout.locked ? ' is-locked' : ''}${hovered ? ' is-hovered' : ''}`}
      style={{ position: 'fixed', left: layout.x, top: layout.y, width: layout.width, height: layout.height, zIndex: 480, borderRadius: mode === 'empresa' ? 8 : 14, border: '2px solid rgba(255,255,255,.22)', boxShadow: '0 14px 36px rgba(0,0,0,.55)', overflow: 'hidden', background: '#000', touchAction: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      title={layout.locked ? 'Câmera bloqueada' : 'Arraste a câmera; use o canto para redimensionar'}
    >
      <video id={videoId} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', background: '#000', pointerEvents: 'none' }} />
      {mode === 'empresa' && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.56)', padding: '4px 9px', fontSize: 10.5, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Fa name="video" size={9} /> Você
        </div>
      )}
      {(screenActive || hovered || layout.locked) && (
        <div style={{ position: 'absolute', top: 4, left: 4, display: 'flex', gap: 4 }}>
          <button
            title={layout.locked ? 'Desbloquear câmera' : 'Bloquear câmera'}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => { event.stopPropagation(); updateLayout({ ...layout, locked: !layout.locked }) }}
            style={{ width: 25, height: 25, borderRadius: 7, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(0,0,0,.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {layout.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
          {screenActive && (
            <button
              title="Restaurar câmera"
              onPointerDown={event => event.stopPropagation()}
              onClick={event => { event.stopPropagation(); updateLayout(defaultLayout(position, mode)) }}
              style={{ width: 25, height: 25, borderRadius: 7, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(0,0,0,.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Maximize2 size={12} />
            </button>
          )}
        </div>
      )}
      {!layout.locked && screenActive && (
        <div
          className="camera-pip-resize"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          style={{ position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, cursor: 'nwse-resize', background: 'linear-gradient(135deg, transparent 48%, rgba(255,255,255,.55) 50%, rgba(255,255,255,.55) 62%, transparent 64%)' }}
          title="Redimensionar câmera"
        />
      )}
    </div>
  )
}
