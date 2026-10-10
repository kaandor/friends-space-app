import { useState, useRef, useCallback, useEffect } from 'react'

interface ImageCropperProps {
  image: string
  shape: 'circle' | 'rect'
  aspectRatio: number
  onCrop: (dataUrl: string) => void
  onCancel: () => void
}

export function ImageCropper({ image, shape, aspectRatio, onCrop, onCancel }: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 })

  const [resizing, setResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0 })
  const [scaleStart, setScaleStart] = useState(1)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = image
  }, [image])

  const cropW = 300
  const cropH = shape === 'circle' ? cropW : cropW / aspectRatio

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setOffsetStart({ ...offset })
  }

  const handleResizeDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    setResizing(true)
    setResizeStart({ x: e.clientX, y: e.clientY })
    setScaleStart(scale)
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      setOffset({ x: offsetStart.x + dx, y: offsetStart.y + dy })
    }
    if (resizing) {
      const dx = e.clientX - resizeStart.x
      const dy = e.clientY - resizeStart.y
      const delta = (dx + dy) / 200
      const newScale = Math.max(0.2, Math.min(5, scaleStart + delta))
      setScale(newScale)
    }
  }, [dragging, resizing, dragStart, offsetStart, resizeStart, scaleStart])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
    setResizing(false)
  }, [])

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp])

  const handleCrop = () => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const outW = shape === 'circle' ? 256 : 768
    const outH = shape === 'circle' ? 256 : 256
    canvas.width = outW
    canvas.height = outH

    if (shape === 'circle') {
      ctx.beginPath()
      ctx.arc(outW / 2, outH / 2, outW / 2, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
    }

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, outW, outH)

    const imgAspect = img.naturalWidth / img.naturalHeight
    const displayW = cropW * scale
    const displayH = displayW / imgAspect

    const imgX = (cropW - displayW) / 2 + offset.x
    const imgY = (cropH - displayH) / 2 + offset.y

    const ratioX = outW / cropW
    const ratioY = outH / cropH

    ctx.drawImage(img, imgX * ratioX, imgY * ratioY, displayW * ratioX, displayH * ratioY)

    onCrop(canvas.toDataURL('image/png'))
  }

  const displayImgW = cropW * scale
  const displayImgH = imgNatural.w > 0 ? displayImgW / (imgNatural.w / imgNatural.h) : cropW * scale

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Ajustar imagem</h3>

        <div
          onMouseDown={handleMouseDown}
          style={{
            width: cropW,
            height: cropH,
            borderRadius: shape === 'circle' ? '50%' : 8,
            overflow: 'hidden',
            background: '#111',
            margin: '0 auto',
            cursor: dragging ? 'grabbing' : 'grab',
            position: 'relative',
            border: '2px solid var(--border)',
          }}
        >
          <img
            src={image}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              top: (cropH - displayImgH) / 2 + offset.y,
              left: (cropW - displayImgW) / 2 + offset.x,
              width: displayImgW,
              height: displayImgH,
              pointerEvents: 'none',
            }}
          />

          <div
            onMouseDown={handleResizeDown}
            style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: 4,
              background: 'var(--accent)',
              cursor: 'nwse-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <i className="fa-solid fa-up-right-and-down-left-from-center" style={{ fontSize: 9, color: '#000' }} />
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          Arraste pra mover • Arraste o canto verde pra redimensionar
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={handleCrop} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Confirmar
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
