import { useState, useRef, useEffect } from 'react'
import { Pen } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { ImageCropper } from '../ui/ImageCropper'
import { useUserStore } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'
import { SyncIndicator, type SyncState } from '../ui/SyncIndicator'
import { uploadProfileImage, isDriveConnected, toImageUrl } from '../../services/driveService'
import { InterfaceTab } from './InterfaceTab'
import { DriveRequiredModal } from '../Chat/DriveRequiredModal'
import { appearanceDataAttrs, appearanceScreenStyle, parseAppearance } from './ProfileEditor/appearance'
import { PrivacySettings } from '../Privacy/PrivacySettings'

interface ProfileViewProps {
  onClose: () => void
  initialTab?: ProfileTab
}

export type ProfileTab = 'perfil' | 'social' | 'privacidade' | 'astro' | 'interface'

export function ProfileView({ onClose, initialTab = 'perfil' }: ProfileViewProps) {
  const { currentUser, updateUser } = useUserStore()
  const { t } = useLangStore()
  const userSettings = (currentUser?.settings || {}) as Record<string, string | boolean | undefined>
  const strSetting = (key: string, fallback: string) => typeof userSettings[key] === 'string' ? userSettings[key] as string : fallback
  const boolSetting = (key: string, fallback: boolean) => typeof userSettings[key] === 'boolean' ? userSettings[key] as boolean : fallback
  const [name, setName] = useState(currentUser?.name || '')
  const [username, setUsername] = useState(currentUser?.friendCode || '')
  const [bio, setBio] = useState(currentUser?.bio || '')
  const [pronoun, setPronoun] = useState(strSetting('pronoun', ''))
  const [photoUrl, setPhotoUrl] = useState(currentUser?.photoUrl || '')
  const [bannerUrl, setBannerUrl] = useState(currentUser?.bannerUrl || '')
  const [accentColor] = useState(currentUser?.accentColor || '#00ff88')
  const [tab, setTab] = useState<ProfileTab>(initialTab)
  const [cropImage, setCropImage] = useState<string | null>(null)
  const [cropShape, setCropShape] = useState<'circle' | 'rect'>('circle')
  const [cropAspect, setCropAspect] = useState(1)
  const [driveModal, setDriveModal] = useState(false)
  const pendingDriveAction = useRef<'avatar' | 'banner' | null>(null)

  // Aparencia
  // Social
  const [status, setStatus] = useState(strSetting('status', 'online'))
  const [statusMessage, setStatusMessage] = useState(strSetting('statusMessage', ''))
  const [showActivity, setShowActivity] = useState(boolSetting('showActivity', true))
  const [showServers, setShowServers] = useState(boolSetting('showServers', true))
  const [showFriends, setShowFriends] = useState(boolSetting('showFriends', true))

  // Privacidade (gerenciado pelo PrivacySettings, que salva via savePrivacyAll)

  const [usernameError, setUsernameError] = useState('')
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const syncTimer = useRef<number | null>(null)
  const mountedRef = useRef(true)

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    mountedRef.current = true
    if (!isDriveConnected()) setDriveModal(true)
    return () => { mountedRef.current = false; if (syncTimer.current !== null) window.clearTimeout(syncTimer.current) }
  }, [])

  const persist = async (patch: Partial<Parameters<typeof updateUser>[0]>) => {
    if (!mountedRef.current) return
    const clean: Partial<Parameters<typeof updateUser>[0]> = { ...patch }
    let stripped = false
    const MAX_INLINE_IMAGE_CHARS = 300000
    if (typeof clean.photoUrl === 'string' && clean.photoUrl.startsWith('data:image/') && clean.photoUrl.length > MAX_INLINE_IMAGE_CHARS) { delete clean.photoUrl; stripped = true }
    if (typeof clean.bannerUrl === 'string' && clean.bannerUrl.startsWith('data:image/') && clean.bannerUrl.length > MAX_INLINE_IMAGE_CHARS) { delete clean.bannerUrl; stripped = true }
    if (stripped && Object.keys(clean).length === 0) {
      if (mountedRef.current) setSyncState('error')
      return
    }
    setSyncState('saving')
    try {
      await updateUser(clean)
      if (mountedRef.current) setSyncState('synced')
    } catch {
      if (mountedRef.current) setSyncState('error')
    }
  }

  const scheduleAutoSave = (patch: Partial<Parameters<typeof updateUser>[0]>) => {
    if (syncTimer.current !== null) window.clearTimeout(syncTimer.current)
    setSyncState('saving')
    syncTimer.current = window.setTimeout(() => { void persist(patch) }, 600)
  }

  const scheduleSettingsSave = (key: string, value: string | boolean) => {
    if (syncTimer.current !== null) window.clearTimeout(syncTimer.current)
    setSyncState('saving')
    syncTimer.current = window.setTimeout(() => {
      const fresh = (useUserStore.getState().currentUser?.settings || {}) as Record<string, unknown>
      void persist({ settings: { ...fresh, [key]: value } })
    }, 600)
  }

  const savePrivacyAll = (patch: Record<string, string | boolean>) => {
    if (syncTimer.current !== null) window.clearTimeout(syncTimer.current)
    setSyncState('saving')
    syncTimer.current = window.setTimeout(() => {
      const fresh = (useUserStore.getState().currentUser?.settings || {}) as Record<string, unknown>
      void persist({ settings: { ...fresh, ...patch } })
    }, 600)
  }

  const checkUsernameUnique = async (value: string) => {
    if (!value || value === (currentUser?.friendCode || '')) {
      setUsernameError('')
      return true
    }
    setUsernameChecking(true)
    try {
      const { requestBackend } = await import('../../services/backend')
      const existing = await requestBackend<{ friendCode?: string } | undefined>('findUserByFriendCode', { friendCode: value })
      if (existing && existing.friendCode && existing.friendCode.toUpperCase() === value.toUpperCase()) {
        setUsernameError('Este nome de usuario ja esta em uso')
        setUsernameChecking(false)
        return false
      }
    } catch { }
    setUsernameError('')
    setUsernameChecking(false)
    return true
  }

  const handleSave = async () => {
    if (!username) {
      setUsernameError('Nome de usuario e obrigatorio')
      return
    }
    const unique = await checkUsernameUnique(username)
    if (!unique) return
    const settings: Record<string, unknown> = {
      ...(currentUser?.settings || {}),
      pronoun,
      status,
      statusMessage,
      showActivity,
      showServers,
      showFriends,
    }
    setSyncState('saving')
    let finalPhotoUrl = photoUrl
    let finalBannerUrl = bannerUrl
    if (typeof finalPhotoUrl === 'string' && finalPhotoUrl.startsWith('data:image/')) {
      finalPhotoUrl = await uploadProfileImage(finalPhotoUrl, 'avatar')
    }
    if (typeof finalBannerUrl === 'string' && finalBannerUrl.startsWith('data:image/')) {
      finalBannerUrl = await uploadProfileImage(finalBannerUrl, 'banner')
    }
    if (
      (typeof finalPhotoUrl === 'string' && finalPhotoUrl.startsWith('data:image/')) ||
      (typeof finalBannerUrl === 'string' && finalBannerUrl.startsWith('data:image/'))
    ) {
      setSyncState('error')
      return
    }
    await updateUser({ name, friendCode: username.toUpperCase(), bio, photoUrl: finalPhotoUrl, bannerUrl: finalBannerUrl, accentColor, settings })
    setSyncState('synced')
    onClose()
  }

  const openAvatarCrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      if (file.type === 'image/gif') {
        const dataUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result as string)
          reader.onerror = rej
          reader.readAsDataURL(file)
        })
        setPhotoUrl(dataUrl)
        return
      }
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result as string)
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      setCropImage(dataUrl)
      setCropShape('circle')
      setCropAspect(1)
    } catch { }
  }

  const openBannerCrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      if (file.type === 'image/gif') {
        const dataUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result as string)
          reader.onerror = rej
          reader.readAsDataURL(file)
        })
        setBannerUrl(dataUrl)
        return
      }
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result as string)
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      setCropImage(dataUrl)
      setCropShape('rect')
      setCropAspect(3)
    } catch { }
  }

  const handleCropDone = (dataUrl: string) => {
    const prevPhoto = photoUrl
    const prevBanner = bannerUrl
    const fail = () => {
      if (!mountedRef.current) return
      if (cropShape === 'circle') setPhotoUrl(prevPhoto)
      else setBannerUrl(prevBanner)
      setSyncState('error')
    }
    if (cropShape === 'circle') {
      setPhotoUrl(dataUrl)
      setSyncState('saving')
      void uploadProfileImage(dataUrl, 'avatar').then(url => {
        if (!mountedRef.current) return
        if (!url || url.startsWith('data:')) { fail(); return }
        setPhotoUrl(url)
        void persist({ photoUrl: url })
      }).catch(() => fail())
    } else {
      setBannerUrl(dataUrl)
      setSyncState('saving')
      void uploadProfileImage(dataUrl, 'banner').then(url => {
        if (!mountedRef.current) return
        if (!url || url.startsWith('data:')) { fail(); return }
        setBannerUrl(url)
        void persist({ bannerUrl: url })
      }).catch(() => fail())
    }
    setCropImage(null)
  }

  const requestAvatarChange = () => {
    if (!isDriveConnected()) { pendingDriveAction.current = 'avatar'; setDriveModal(true); return }
    avatarInputRef.current?.click()
  }

  const requestBannerChange = () => {
    if (!isDriveConnected()) { pendingDriveAction.current = 'banner'; setDriveModal(true); return }
    bannerInputRef.current?.click()
  }

  const tabs: { key: ProfileTab; label: string }[] = [
    { key: 'perfil', label: t('profile.tab.perfil') },
    { key: 'social', label: t('profile.tab.social') },
    { key: 'privacidade', label: t('profile.tab.privacidade') },
    { key: 'interface', label: 'Interface' },
  ]

  return (
    <>
      {cropImage && (
        <ImageCropper image={cropImage} shape={cropShape} aspectRatio={cropAspect} onCrop={handleCropDone} onCancel={() => setCropImage(null)} />
      )}
      <div className="profile-overlay" onClick={onClose}>
        <div className="profile-card" {...appearanceDataAttrs(parseAppearance(userSettings))} style={appearanceScreenStyle(parseAppearance(userSettings))} onClick={e => e.stopPropagation()}>
          {/* Banner */}
          <div className="profile-banner">
            {bannerUrl ? (
              <img src={toImageUrl(bannerUrl)} alt="Banner" className="profile-banner-img" />
            ) : (
              <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${accentColor}44, ${accentColor}11)` }} />
            )}
            <button className="profile-banner-btn" onClick={requestBannerChange}>
              Alterar Banner
            </button>
            <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={openBannerCrop} />
            <span style={{ position: 'absolute', top: 10, left: 12, background: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: '4px 10px' }}>
              <SyncIndicator state={syncState} />
            </span>
          </div>

          {/* Header */}
          <div className="profile-header">
            <div className="profile-avatar-area">
              <div className="profile-avatar-ring" style={{ borderColor: accentColor }}>
                <Avatar src={photoUrl} name={name || '?'} size={96} />
              </div>
              <button className="profile-avatar-btn" onClick={requestAvatarChange}>
                <Pen size={13} strokeWidth={2.5} />
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={openAvatarCrop} />
            </div>
            <div className="profile-info-area">
              <h1 className="profile-name">{name || 'Sem nome'}</h1>
              <span className="profile-username">@{username || 'usuario'}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="profile-tabs">
            {tabs.map(t => (
              <button
                key={t.key}
                className={`profile-tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
                style={tab === t.key ? { borderColor: accentColor, color: '#fff' } : {}}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="profile-tab-content">
            {tab === 'perfil' && (
              <div className="profile-form">
                <div className="profile-field">
                  <label>Nome de Exibicao <span className="required">*</span></label>
                  <input value={name} onChange={e => { setName(e.target.value); scheduleAutoSave({ name: e.target.value }) }} />
                </div>
                <div className="profile-field">
                  <label>Nome de usuario</label>
                  <input
                    value={username}
                    onChange={e => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
                      setUsername(val)
                      setUsernameError('')
                    }}
                    onBlur={() => { void (async () => {
                      if (!username || username === (currentUser?.friendCode || '')) return
                      const unique = await checkUsernameUnique(username)
                      if (unique) scheduleAutoSave({ friendCode: username.toUpperCase() })
                    })() }}
                    style={usernameError ? { borderColor: '#ed4245' } : {}}
                  />
                  {usernameChecking && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Verificando...</span>}
                  {usernameError && <span style={{ fontSize: 11, color: '#ed4245', marginTop: 2 }}>{usernameError}</span>}
                </div>
                <div className="profile-field">
                  <label>Sobre mim</label>
                  <textarea value={bio} onChange={e => { setBio(e.target.value); scheduleAutoSave({ bio: e.target.value }) }} placeholder="Escreva algo sobre voce..." rows={3} />
                </div>
                <div className="profile-field">
                  <label>Pronome (Opcional)</label>
                  <input value={pronoun} onChange={e => { setPronoun(e.target.value); scheduleAutoSave({ settings: { ...userSettings, pronoun: e.target.value } }) }} placeholder="Ex: Ele/Dele, Ela/Dela..." />
                </div>
                <div className="profile-form-actions">
                  <button className="profile-cancel-btn" onClick={onClose}>Cancelar</button>
                  <button className="profile-save-btn" onClick={handleSave}>Salvar Alteracoes</button>
                </div>
              </div>
            )}

            {tab === 'social' && (
              <div className="profile-form">
                <div className="profile-field">
                  <label>Status</label>
                  <div className="profile-radio-group">
                    {['Online', 'Ausente', 'Nao Perturbe', 'Invisivel'].map(s => (
                      <label key={s} className="profile-radio">
                        <input type="radio" name="status" checked={status === s.toLowerCase().replace(/[^a-z]/g, '')} onChange={() => { const v = s.toLowerCase().replace(/[^a-z]/g, ''); setStatus(v); scheduleSettingsSave('status', v) }} />
                        <span>{s}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="profile-field">
                  <label>Mensagem de Status</label>
                  <input value={statusMessage} onChange={e => { setStatusMessage(e.target.value); scheduleSettingsSave('statusMessage', e.target.value) }} placeholder="O que voce esta fazendo?" />
                </div>
                <div className="profile-divider" />
                <div className="profile-toggle-row">
                  <span>Mostrar atividade</span>
                  <label className="profile-toggle">
                    <input type="checkbox" checked={showActivity} onChange={e => { setShowActivity(e.target.checked); scheduleSettingsSave('showActivity', e.target.checked) }} />
                    <span className="profile-toggle-slider" />
                  </label>
                </div>
                <div className="profile-toggle-row">
                  <span>Mostrar servidores</span>
                  <label className="profile-toggle">
                    <input type="checkbox" checked={showServers} onChange={e => { setShowServers(e.target.checked); scheduleSettingsSave('showServers', e.target.checked) }} />
                    <span className="profile-toggle-slider" />
                  </label>
                </div>
                <div className="profile-toggle-row">
                  <span>Mostrar amigos</span>
                  <label className="profile-toggle">
                    <input type="checkbox" checked={showFriends} onChange={e => { setShowFriends(e.target.checked); scheduleSettingsSave('showFriends', e.target.checked) }} />
                    <span className="profile-toggle-slider" />
                  </label>
                </div>
                <div className="profile-form-actions">
                  <button className="profile-cancel-btn" onClick={onClose}>Cancelar</button>
                  <button className="profile-save-btn" onClick={handleSave}>Salvar Alteracoes</button>
                </div>
              </div>
            )}

            {tab === 'privacidade' && (
              <PrivacySettings userSettings={userSettings} onSaveAll={savePrivacyAll} />
            )}
            {tab === 'interface' && <InterfaceTab />}
          </div>
        </div>
      </div>
      <DriveRequiredModal
        open={driveModal}
        variant="perfil"
        onClose={() => { setDriveModal(false); pendingDriveAction.current = null }}
        onConnected={() => {
          setDriveModal(false)
          if (pendingDriveAction.current === 'avatar') avatarInputRef.current?.click()
          else if (pendingDriveAction.current === 'banner') bannerInputRef.current?.click()
          pendingDriveAction.current = null
        }}
      />
    </>
  )
}
