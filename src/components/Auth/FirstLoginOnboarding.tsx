import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Sparkles } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'
import { uploadProfileImage } from '../../services/driveService'
import { ImageCropper } from '../ui/ImageCropper'

const DONE_PREFIX = 'friends-space:onboarded:'
const FORCE_KEY = 'friends-space:force-onboarding'

function alreadyDone(userId: string) {
  try { return localStorage.getItem(DONE_PREFIX + userId) === '1' } catch { return false }
}

function markDone(userId: string) {
  try {
    localStorage.setItem(DONE_PREFIX + userId, '1')
    localStorage.removeItem(FORCE_KEY)
  } catch { }
}

export function FirstLoginOnboarding() {
  const currentUser = useUserStore(s => s.currentUser)
  const updateUser = useUserStore(s => s.updateUser)
  const [visible, setVisible] = useState(false)
  const [nick, setNick] = useState('')
  const [photo, setPhoto] = useState('')
  const [cropImage, setCropImage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const hydratedRef = useRef('')

  useEffect(() => {
    if (!currentUser) { setVisible(false); hydratedRef.current = ''; return }
    if (hydratedRef.current === currentUser.id) return
    hydratedRef.current = currentUser.id
    let force = false
    try { force = localStorage.getItem(FORCE_KEY) === '1' } catch { }
    if (alreadyDone(currentUser.id) && !force) { setVisible(false); return }
    // Conta antiga sem a marca: não incomoda (onboarding é só para 1º login).
    const fresh = currentUser.createdAt ? Date.now() - currentUser.createdAt < 7 * 24 * 60 * 60 * 1000 : false
    if (!alreadyDone(currentUser.id) && !fresh && !force) {
      markDone(currentUser.id)
      setVisible(false)
      return
    }
    setNick(currentUser.name || '')
    setPhoto(currentUser.photoUrl || '')
    setVisible(true)
  }, [currentUser])

  if (!currentUser || !visible) return null

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      if (file.type === 'image/gif') {
        setUploading(true)
        try { setPhoto(await uploadProfileImage(dataUrl, 'avatar', `onboarding-${currentUser.id}.gif`)) }
        finally { setUploading(false) }
        return
      }
      setCropImage(dataUrl)
    } catch { /* ignora arquivo inválido */ }
  }

  const handleCropDone = async (dataUrl: string) => {
    setCropImage(null)
    setUploading(true)
    try { setPhoto(await uploadProfileImage(dataUrl, 'avatar', `onboarding-${currentUser.id}.png`)) }
    finally { setUploading(false) }
  }

  const finish = async (save: boolean) => {
    if (busy || uploading) return
    setBusy(true)
    try {
      if (save) {
        const data: { name?: string; photoUrl?: string } = {}
        const cleanNick = nick.trim().slice(0, 20)
        if (cleanNick && cleanNick !== currentUser.name) data.name = cleanNick
        if (photo && photo !== currentUser.photoUrl) data.photoUrl = photo
        if (Object.keys(data).length > 0) await updateUser(data)
      }
      markDone(currentUser.id)
      setVisible(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {cropImage && (
        <ImageCropper
          image={cropImage}
          shape="circle"
          aspectRatio={1}
          onCrop={dataUrl => void handleCropDone(dataUrl)}
          onCancel={() => setCropImage(null)}
        />
      )}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 15000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(4, 8, 18, 0.86)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        padding: 16,
      }}>
        <div style={{
          width: 'min(460px, 94vw)',
          borderRadius: 18,
          border: '1px solid rgba(41,163,255,0.28)',
          background: 'linear-gradient(180deg, #0d1526 0%, #070b14 100%)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 44px rgba(41,163,255,0.10)',
          padding: '26px 24px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#29A3FF', fontSize: 11.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            <Sparkles size={13} /> Primeiros passos
          </div>
          <h1 style={{ margin: '8px 0 0', color: '#fff', fontSize: 21, fontWeight: 800, letterSpacing: -0.2 }}>
            Bem-vindo ao Friends Space!
          </h1>
          <p style={{ margin: '6px 0 0', color: '#9fb2c8', fontSize: 13, lineHeight: 1.5 }}>
            Escolha o apelido que você quer usar e a sua foto de perfil (PNG, JPG ou GIF) antes de entrar.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Escolher foto de perfil"
              style={{
                position: 'relative', width: 104, height: 104, borderRadius: '50%',
                border: '2px solid #29A3FF', background: '#0a1220', cursor: 'pointer',
                overflow: 'hidden', padding: 0,
              }}
            >
              {photo ? (
                <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <span style={{ color: '#9fb2c8', fontSize: 34, fontWeight: 800 }}>{(nick || currentUser.name || '?').trim().charAt(0).toUpperCase() || '?'}</span>
              )}
              <span style={{
                position: 'absolute', right: 2, bottom: 2, width: 30, height: 30, borderRadius: '50%',
                background: '#29A3FF', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #070b14',
              }}>
                <Camera size={14} strokeWidth={2.4} />
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => void handleFile(e)} />
          </div>
          <p style={{ margin: '8px 0 0', textAlign: 'center', color: '#7d8ea6', fontSize: 11.5 }}>
            {uploading ? 'Enviando foto...' : 'Toque para escolher sua foto'}
          </p>

          <label style={{ display: 'block', marginTop: 18 }}>
            <span style={{ display: 'block', color: '#cfe0f4', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Seu apelido</span>
            <input
              value={nick}
              onChange={e => setNick(e.target.value)}
              maxLength={20}
              placeholder="Como você quer ser chamado?"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10,
                border: '1px solid rgba(41,163,255,0.35)', background: '#0a1220', color: '#fff',
                fontSize: 14, outline: 'none',
              }}
            />
            <span style={{ display: 'block', textAlign: 'right', color: '#7d8ea6', fontSize: 11, marginTop: 3 }}>{nick.length}/20</span>
          </label>

          <button
            type="button"
            onClick={() => void finish(true)}
            disabled={busy || uploading || !nick.trim()}
            style={{
              width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 11, border: 'none',
              background: '#29A3FF', color: '#000', fontSize: 14.5, fontWeight: 800,
              cursor: busy || uploading || !nick.trim() ? 'not-allowed' : 'pointer',
              opacity: busy || uploading || !nick.trim() ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Check size={16} strokeWidth={3} /> {busy ? 'Salvando...' : 'Começar'}
          </button>
          <button
            type="button"
            onClick={() => void finish(false)}
            disabled={busy}
            style={{
              width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 10, border: 'none',
              background: 'transparent', color: '#8fa3bb', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Agora não
          </button>
        </div>
      </div>
    </>
  )
}
