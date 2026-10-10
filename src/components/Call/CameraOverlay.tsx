import { useEffect, useState } from 'react'
import { useCallStore } from '../../stores/callStore'

// Camera local na call: modos "casual" (PIP pequeno arredondado), "empresa"
// (PIP maior com moldura e nome) e "tela cheia" (camera preenchendo a call).
// A posicao do PIP tem 6 opcoes. A escolha fica salva no navegador e e
// compartilhada com o menu da camera via um micro-store.

export type CameraMode = 'casual' | 'empresa' | 'full'
export type CameraPosition = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'

export const CAMERA_MODE_KEY = 'friends-space:camera-mode'
export const CAMERA_POSITION_KEY = 'friends-space:camera-position'

export const CAMERA_POSITIONS: { value: CameraPosition; label: string; icon: string }[] = [
  { value: 'tl', label: 'Canto sup. esquerdo', icon: 'fa-solid fa-arrow-up-left' },
  { value: 'tc', label: 'Topo centralizado', icon: 'fa-solid fa-arrow-up' },
  { value: 'tr', label: 'Canto sup. direito', icon: 'fa-solid fa-arrow-up-right' },
  { value: 'bl', label: 'Canto inf. esquerdo', icon: 'fa-solid fa-arrow-down-left' },
  { value: 'bc', label: 'Base centralizada', icon: 'fa-solid fa-arrow-down' },
  { value: 'br', label: 'Canto inf. direito', icon: 'fa-solid fa-arrow-down-right' },
]

const POSITION_STYLE: Record<CameraPosition, React.CSSProperties> = {
  tl: { top: 16, left: 16 },
  tc: { top: 16, left: '50%', transform: 'translateX(-50%)' },
  tr: { top: 16, right: 16 },
  bl: { bottom: 16, left: 16 },
  bc: { bottom: 16, left: '50%', transform: 'translateX(-50%)' },
  br: { bottom: 16, right: 16 },
}

function parseMode(value: string | null): CameraMode {
  return value === 'casual' || value === 'empresa' || value === 'full' ? value : 'casual'
}

function parsePosition(value: string | null): CameraPosition {
  return value && POSITION_STYLE[value as CameraPosition] ? value as CameraPosition : 'br'
}

let cameraMode: CameraMode = parseMode(typeof localStorage === 'undefined' ? null : localStorage.getItem(CAMERA_MODE_KEY))
let cameraPosition: CameraPosition = parsePosition(typeof localStorage === 'undefined' ? null : localStorage.getItem(CAMERA_POSITION_KEY))
const cameraListeners = new Set<() => void>()

function emitCameraChange() {
  for (const listener of cameraListeners) {
    try { listener() } catch { }
  }
}

export function getCameraMode(): CameraMode {
  return cameraMode
}

export function getCameraPosition(): CameraPosition {
  return cameraPosition
}

export function setCameraMode(mode: CameraMode) {
  cameraMode = mode
  try { localStorage.setItem(CAMERA_MODE_KEY, mode) } catch { }
  emitCameraChange()
}

export function setCameraPosition(position: CameraPosition) {
  cameraPosition = position
  try { localStorage.setItem(CAMERA_POSITION_KEY, position) } catch { }
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

export function CameraOverlay({ videoId = 'call-video-camera-mini' }: { videoId?: string }) {
  const localStream = useCallStore(s => s.localStream)
  const screenStream = useCallStore(s => s.screenStream)
  const remoteScreenStreams = useCallStore(s => s.remoteScreenStreams)
  const { mode, position } = useCameraSettings()

  useEffect(() => {
    if (!localStream) return
    const el = document.getElementById(videoId) as HTMLVideoElement | null
    if (el && el.srcObject !== localStream) el.srcObject = localStream
  }, [localStream, videoId])

  const hasCamera = Boolean(localStream?.getVideoTracks().length)
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

  const style = POSITION_STYLE[position]
  const pipStyle: React.CSSProperties = mode === 'empresa'
    ? { width: 224, height: 126, borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)' }
    : { width: 168, height: 95, borderRadius: 10, border: '2px solid rgba(255,255,255,0.15)' }

  return (
    <div style={{ position: 'absolute', zIndex: 40, ...style, ...pipStyle, boxShadow: '0 6px 20px rgba(0,0,0,0.45)', overflow: 'hidden', background: '#000', pointerEvents: 'none' }}>
      <video id={videoId} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', background: '#000' }} />
      {mode === 'empresa' && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', padding: '3px 8px', fontSize: 10.5, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-video" style={{ fontSize: 9 }} /> Você
        </div>
      )}
    </div>
  )
}
