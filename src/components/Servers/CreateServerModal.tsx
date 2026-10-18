import { Fa } from '../../utils/fa'
import { useState, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { ImageCropper } from '../ui/ImageCropper'

export interface CreateServerRoleDraft { name: string; color: string }
export interface CreateServerEventDraft { title: string; date: string; description: string }

export interface CreateServerData {
  name: string
  photoUrl?: string
  bannerUrl?: string
  description?: string
  category?: string
  themes?: string[]
  frequency?: string
  minAge?: string
  toggles?: { public: boolean; verify: boolean; welcome: boolean; logs: boolean }
  rules?: string
  events?: CreateServerEventDraft[]
  textChannels?: string[]
  voiceChannels?: string[]
  categories?: string[]
  roles?: CreateServerRoleDraft[]
}

interface CreateServerModalProps {
  open: boolean
  onClose: () => void
  onCreate: (data: CreateServerData) => void
}

export function CreateServerModal({ open, onClose, onCreate }: CreateServerModalProps) {
  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [cropImage, setCropImage] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result as string)
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      if (file.type === 'image/gif') { setPhotoUrl(dataUrl); return }
      setCropImage(dataUrl)
    } catch { /* ignore */ }
  }

  const handleCropDone = (dataUrl: string) => {
    setPhotoUrl(dataUrl)
    setCropImage(null)
  }

  const handleCreate = () => {
    if (!name.trim()) { setError(true); return }
    onCreate({
      name: name.trim(),
      photoUrl: photoUrl || undefined,
    })
    handleClose()
  }

  const handleClose = () => {
    setName(''); setPhotoUrl(''); setError(false); setCropImage(null)
    onClose()
  }

  return (
    <>
      {cropImage && (
        <ImageCropper
          image={cropImage}
          shape="circle"
          aspectRatio={1}
          onCrop={handleCropDone}
          onCancel={() => setCropImage(null)}
        />
      )}

      <div className="fs-csrv-overlay" onMouseDown={e => e.target === e.currentTarget && handleClose()}>
        <div className="fs-csrv-modal fs-modal-in" role="dialog" aria-modal="true" aria-label="Criar servidor" onMouseDown={e => e.stopPropagation()}>
          <button type="button" className="fs-csrv-close" onClick={handleClose} aria-label="Fechar">
            <X size={16} strokeWidth={2.5} />
          </button>

          <header className="fs-csrv-head">
            <div className="fs-csrv-head-icon"><Fa name="tower-broadcast" size={20} /></div>
            <h2>Personalize seu servidor</h2>
            <p>Dê ao seu novo servidor um nome e um ícone. Você poderá mudar de qualquer forma depois.</p>
          </header>

          <div className="fs-csrv-body">
            <input
              ref={iconInputRef} type="file" accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { void handleFile(e) }}
            />
            <button type="button" className="fs-csrv-icon" onClick={() => iconInputRef.current?.click()} title="Adicionar um ícone">
              {photoUrl ? (
                <img src={photoUrl} alt="" />
              ) : (
                <span className="fs-csrv-icon-plus"><Plus size={26} strokeWidth={2.5} /></span>
              )}
              <span className="fs-csrv-icon-badge"><Plus size={13} strokeWidth={3} /></span>
            </button>
            <span className="fs-csrv-icon-label">Adicionar um ícone</span>

            <label className="fs-csrv-field">
              <span>Nome do servidor <em>*</em></span>
              <input
                type="text" value={name}
                onChange={e => { setName(e.target.value); setError(false) }}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                placeholder="Ex: Comunidade Gamer"
                maxLength={60}
                className={error ? 'is-error' : ''}
                autoFocus
              />
            </label>
            {error && <span className="fs-csrv-error">Digite um nome para o servidor.</span>}

            <p className="fs-csrv-hint">Canais, cargos e categorias já vêm prontos — ajuste tudo depois nas configurações do servidor.</p>
          </div>

          <footer className="fs-csrv-foot">
            <button type="button" className="fs-csrv-btn ghost" onClick={handleClose}>Cancelar</button>
            <button type="button" className="fs-csrv-btn primary" onClick={handleCreate} disabled={!name.trim()}>
              Criar servidor
            </button>
          </footer>
        </div>
      </div>
    </>
  )
}
