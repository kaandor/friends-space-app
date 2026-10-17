import { Fa } from '../../utils/fa'
import { useState } from 'react'
import { ArrowLeft, Menu, ChevronDown, House, Settings, ShieldHalf, Languages, HardDrive, Check, Pen, History, Info as InfoIcon, Rocket, UserPlus, MessageCircle, Phone, Download } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { IconNotification, IconAdd, IconSearch } from '../../utils/icons'
import type { User, Server } from '../../types'
import { useLangStore } from '../../stores/langStore'
import { useFriendStore } from '../../stores/friendStore'
import { useUserStore } from '../../stores/userStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { assetUrl } from '../../utils/assets'
import { getDriveStorage, isDriveConnected, type DriveStorageInfo } from '../../services/driveService'
import { canOpenAdminPanel } from '../../services/admin'
import { AdminPanel, type Tab } from '../Admin/AdminPanel'
import { UserHistoryModal } from '../Social/UserHistoryModal'

interface TopBarProps {
  activeUser: User | null
  onShowPrivacy: () => void
  onShowEditProfile: () => void
  onShowAstro?: () => void
  onSignOut: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onMenuClick?: () => void
  // 'back' (mobile, dentro de um canal) mostra seta de voltar em vez do menu
  menuIcon?: 'menu' | 'back'
  onShowAbout: () => void
  onShowHelp: () => void
  onToast: (message: string) => void
  servers: Server[]
  currentServer: Server | null
  onSelectServer: (server: Server | null) => void
  onShowUsers: (show: boolean) => void
  onCreateServer: () => void
  onJoinServer: () => void
  backendOnline: boolean
}

export function TopBar({ activeUser, onShowPrivacy, onShowEditProfile, onShowAstro, onSignOut, onMenuClick, menuIcon = 'menu', onShowAbout, onShowHelp, onToast, servers, currentServer, onSelectServer, onShowUsers, onCreateServer, onJoinServer, backendOnline }: TopBarProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showServerMenu, setShowServerMenu] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [adminTab] = useState<Tab>('overview')
  const { friends, loadFriends, respondFriend } = useFriendStore()
  const { users, currentUser: me } = useUserStore()
  const { notifications, unread, markAllRead } = useNotificationStore()
  const { lang: language, setLang, t } = useLangStore()
  const [driveStorage, setDriveStorage] = useState<DriveStorageInfo | null>(null)
  const [driveStorageLoading, setDriveStorageLoading] = useState(false)
  const [showStorage, setShowStorage] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const toggleStorage = async () => {
    const next = !showStorage
    setShowStorage(next)
    if (next) await loadDriveStorage()
  }

  const loadDriveStorage = async () => {
    if (!isDriveConnected()) { setDriveStorage(null); return }
    setDriveStorageLoading(true)
    try {
      const info = await getDriveStorage()
      setDriveStorage(info)
    } finally {
      setDriveStorageLoading(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = bytes
    let i = 0
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
    return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
  }

  const closeMenus = () => {
    setShowProfileMenu(false)
    setShowSettingsMenu(false)
    setShowServerMenu(false)
    setShowLangMenu(false)
    setShowNotifications(false)
  }

  const pendingRequests = me
    ? friends.filter(f => f.status === 'pending' && f.friendId === me.id)
    : []
  const pendingUsers = pendingRequests
    .map(req => users.find(u => u.id === req.userId))
    .filter((u): u is User => Boolean(u))

  const changeLang = (lang: 'pt-BR' | 'en-US') => {
    setLang(lang)
    setShowLangMenu(false)
    setShowSettingsMenu(false)
    onToast(lang === 'pt-BR' ? 'Idioma: Portugues (Brasil)' : 'Language: English (US)')
  }

  return (
    <div className="fs-topbar">
      <div className="fs-topbar-left">
        {onMenuClick && (
          <button className="fs-icon-btn fs-topbar-menu" onClick={onMenuClick} title={menuIcon === 'back' ? 'Voltar para os canais' : 'Menu'} aria-label={menuIcon === 'back' ? 'Voltar' : 'Menu'}>
            {menuIcon === 'back' ? <ArrowLeft size={17} strokeWidth={2} /> : <Menu size={17} strokeWidth={2} />}
          </button>
        )}
        <img src={assetUrl('friends-space-logo.png')} alt="Friends Space" className="fs-topbar-logo-full" title="Recarregar (F5)" onClick={() => window.location.reload()} />

        {currentServer && (
          <>
            <button
              className={`fs-server-nav active ${backendOnline ? '' : 'fs-server-nav-off'}`}
              onClick={() => { setShowServerMenu(!showServerMenu); setShowProfileMenu(false); setShowSettingsMenu(false) }}
              title={currentServer.name}
            >
              {currentServer.photoUrl ? (
                <img src={currentServer.photoUrl} alt="" />
              ) : (
                currentServer.name.charAt(0).toUpperCase()
              )}
              <span>{currentServer.name}</span>
              <ChevronDown size={14} strokeWidth={2.5} className="fs-chevron" />
            </button>
            {showServerMenu && (
              <>
                <div className="fs-topbar-overlay" onClick={closeMenus} />
                <div className="fs-dropdown fs-server-dropdown">
                  <button className="fs-dropdown-item" onClick={() => { closeMenus(); onSelectServer(null); onShowUsers(false) }}>
                    <House size={15} strokeWidth={2} /> Amigos
                  </button>
                  {servers.map(server => (
                    <button key={server.id} className={`fs-dropdown-item fs-server-option ${currentServer?.id === server.id ? 'active' : ''}`} onClick={() => { closeMenus(); onSelectServer(server); onShowUsers(false) }}>
                      {server.photoUrl ? (
                        <img src={server.photoUrl} alt="" />
                      ) : (
                        <span className="fs-server-option-char">{server.name.charAt(0).toUpperCase()}</span>
                      )}
                      {server.name}
                    </button>
                  ))}
                  <div className="fs-dropdown-divider" />
                  <button className="fs-dropdown-item" onClick={() => { closeMenus(); onCreateServer() }}>
                    <IconAdd width={16} height={16} /> Criar servidor
                  </button>
                  <button className="fs-dropdown-item" onClick={() => { closeMenus(); onJoinServer() }}>
                    <IconSearch width={16} height={16} /> Entrar com convite
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="fs-topbar-right">
        <div style={{ position: 'relative' }}>
          <button
            className="fs-icon-btn"
            title="Notificacoes"
            onClick={() => { setShowNotifications(!showNotifications); setShowSettingsMenu(false); setShowProfileMenu(false); setShowServerMenu(false) }}
          >
            <IconNotification width={16} height={16} />
            {(pendingRequests.length + unread) > 0 && (
              <span style={{
                position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 9,
                background: '#ed4245', color: '#fff', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>
                {pendingRequests.length + unread}
              </span>
            )}
          </button>
          {showNotifications && (
            <>
              <div className="fs-topbar-overlay" onClick={closeMenus} />
              <div className="fs-dropdown" style={{ minWidth: 320, maxHeight: 420, overflowY: 'auto' }}>
                <div className="fs-dropdown-header">
                  <h4>{t('notifs.friendRequests')}</h4>
                  {unread > 0 && (
                    <button onClick={() => void markAllRead()} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Marcar todas como lidas
                    </button>
                  )}
                </div>
                <div className="fs-dropdown-divider" />
                {pendingUsers.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                    {t('notifs.none')}
                  </div>
                ) : (
                  pendingUsers.map(user => (
                    <div key={user.id} className="fs-dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'default' }}>
                      <Avatar src={user.photoUrl} name={user.name} size={30} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
                      <button
                        onClick={async () => { const req = pendingRequests.find(r => r.userId === user.id); if (req && me) { await respondFriend(req.id, true); await loadFriends(me.id) } }}
                        title="Aceitar"
                        style={{ padding: '5px 9px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {t('notifs.accept')}
                      </button>
                      <button
                        onClick={async () => { const req = pendingRequests.find(r => r.userId === user.id); if (req && me) { await respondFriend(req.id, false); await loadFriends(me.id) } }}
                        title="Recusar"
                        style={{ padding: '5px 9px', background: 'var(--bg-tertiary)', color: '#ed4245', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {t('notifs.reject')}
                      </button>
                    </div>
                  ))
                )}
                {notifications.length > 0 && (
                  <>
                    <div className="fs-dropdown-divider" />
                    <div style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)' }}>
                      Historico
                    </div>
                    {notifications.slice(0, 20).map(n => {
                      const kind = String(n.type || '')
                      const Icon = kind.includes('friend') || kind.includes('pending') ? UserPlus
                        : kind.includes('call') ? Phone
                        : kind.includes('update') ? Download
                        : MessageCircle
                      const tint = kind.includes('update') ? 'var(--accent)' : kind.includes('call') ? '#f0b232' : 'var(--accent)'
                      return (
                      <div key={n.id} className="fs-dropdown-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'default', opacity: n.read ? 0.55 : 1, borderLeft: n.read ? 'none' : '2px solid var(--accent)', paddingLeft: n.read ? undefined : 10 }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', flexShrink: 0 }}>
                          <Icon size={14} style={{ color: tint }} />
                        </span>
                        <Avatar src={n.fromPhoto} name={n.fromName} size={26} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.35 }}>{n.title}</div>
                          {n.body ? <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.body}</div> : null}
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      )
                    })}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <button
          className="fs-icon-btn"
          title="Configuracoes"
          onClick={() => { setShowSettingsMenu(!showSettingsMenu); setShowProfileMenu(false); setShowServerMenu(false); setShowStorage(false) }}
        >
          <Settings size={15} strokeWidth={2} />
        </button>
        {showSettingsMenu && (
          <>
            <div className="fs-topbar-overlay" onClick={closeMenus} />
            <div className="fs-dropdown">
              <button className="fs-dropdown-item" onClick={() => { closeMenus(); onShowPrivacy() }}>
                <ShieldHalf size={15} strokeWidth={2} /> {t('topbar.privacy')}
              </button>
              <button className="fs-dropdown-item" onClick={() => { setShowLangMenu(s => !s); setShowSettingsMenu(false); setShowServerMenu(false); setShowProfileMenu(false) }}>
                <Languages size={15} strokeWidth={2} /> {t('topbar.language')} <span className="fs-dropdown-hint">{language}</span>
              </button>
              <div className="fs-dropdown-divider" />
              <button className="fs-dropdown-item" onClick={() => void toggleStorage()}>
                <HardDrive size={15} strokeWidth={2} style={{ color: 'var(--text-muted)' }} />
                <span>Armazenamento</span>
                <Fa name={showStorage ? 'chevron-up' : 'chevron-down'} size={10} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
              </button>
              {showStorage && (
                <div style={{ padding: '4px 12px 10px' }}>
                  {driveStorageLoading ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Carregando...</div>
                  ) : driveStorage ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)' }}>
                        <span>{formatBytes(driveStorage.usedBytes)}</span>
                        <span>{formatBytes(driveStorage.freeBytes)} livre</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden', marginTop: 3 }}>
                        <div
                          style={{
                            height: '100%', borderRadius: 999,
                            background: (driveStorage.freeBytes / driveStorage.limitBytes) < 0.1 ? '#ed4245' : 'var(--accent)',
                            width: `${Math.min(100, (driveStorage.usedBytes / driveStorage.limitBytes) * 100)}%`,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                        {Math.round((driveStorage.usedBytes / driveStorage.limitBytes) * 100)}% de {formatBytes(driveStorage.limitBytes)}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {isDriveConnected() ? 'Nao foi possivel carregar.' : 'Conecte o Google Drive para ver o espaco utilizado.'}
                    </div>
                  )}
                </div>
              )}
            </div>
            {showLangMenu && (
              <>
                <div className="fs-topbar-overlay" onClick={closeMenus} />
                <div className="fs-dropdown fs-lang-dropdown">
                  <button className={`fs-dropdown-item ${language === 'pt-BR' ? 'active' : ''}`} onClick={() => changeLang('pt-BR')}>
                    <Check size={14} strokeWidth={2.5} style={{ visibility: language === 'pt-BR' ? 'visible' : 'hidden' }} /> Portugues (Brasil)
                  </button>
                  <button className={`fs-dropdown-item ${language === 'en-US' ? 'active' : ''}`} onClick={() => changeLang('en-US')}>
                    <Check size={14} strokeWidth={2.5} style={{ visibility: language === 'en-US' ? 'visible' : 'hidden' }} /> English (US)
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <button
          className="fs-user-mini"
          onClick={() => { setShowProfileMenu(!showProfileMenu); setShowSettingsMenu(false); setShowServerMenu(false) }}
        >
          <span className="fs-avatar-wrap">
            <Avatar src={activeUser?.photoUrl || ''} name={activeUser?.name || 'U'} size={26} />
            <span className="fs-status-dot" />
          </span>
          <span className="fs-user-mini-name">{activeUser?.name || 'Usuario'}</span>
          <ChevronDown size={14} strokeWidth={2.5} className="fs-chevron" />
        </button>
        {showProfileMenu && (
          <>
            <div className="fs-topbar-overlay" onClick={closeMenus} />
            <div className="fs-dropdown">
              <div className="fs-dropdown-header">
                <Avatar src={activeUser?.photoUrl || ''} name={activeUser?.name || 'U'} size={40} />
                <div>
                  <h4>{activeUser?.name || 'Usuario'}</h4>
                  <span>@{activeUser?.friendCode || 'usuario'}</span>
                </div>
              </div>
              <div className="fs-dropdown-divider" />
              <button className="fs-dropdown-item" onClick={() => { closeMenus(); onShowEditProfile() }}>
                <Pen size={14} strokeWidth={2} /> {t('topbar.editProfile')}
              </button>
              <button className="fs-dropdown-item" onClick={() => { closeMenus(); setShowHistory(true) }}>
                <History size={15} strokeWidth={2} /> Histórico
              </button>
              {onShowAstro && (
                <button className="fs-dropdown-item" onClick={() => { closeMenus(); onShowAstro() }}>
                  <Rocket size={15} strokeWidth={2} color="var(--text-primary)" /> <b style={{ color: 'var(--text-primary)' }}>Astro</b>
                </button>
              )}
              {canOpenAdminPanel(me) && (
                <button className="fs-dropdown-item" onClick={() => { closeMenus(); setShowAdminPanel(true) }}>
                  <Fa name="shield-halved" size={14} /> Painel {me?.flags?.dev ? 'Dev' : me?.flags?.support ? 'Suporte' : 'Conta'}
                </button>
              )}
              <button className="fs-dropdown-item" onClick={() => { closeMenus(); onShowAbout() }}>
                <InfoIcon size={15} strokeWidth={2} /> Sobre
              </button>
              <button className="fs-dropdown-item" onClick={() => { closeMenus(); onShowHelp() }}>
                <Fa name="circle-question" size={14} /> Ajuda
              </button>
              <div className="fs-dropdown-divider" />
              <button className="fs-dropdown-item fs-dropdown-danger" onClick={() => { closeMenus(); onSignOut() }}>
                <Fa name="right-from-bracket" size={14} /> {t('topbar.signOut')}
              </button>
            </div>
          </>
        )}
      </div>
      <AdminPanel open={showAdminPanel} onClose={() => setShowAdminPanel(false)} initialTab={adminTab} />
      {showHistory && <UserHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  )
}
