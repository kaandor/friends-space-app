import { Fa } from './utils/fa'
import { useEffect, useState, useCallback, useRef, Fragment, lazy, Suspense } from 'react'
import './App.css'
import { Avatar } from './components/ui/Avatar'
import { Button } from './components/ui/Button'
import { Input } from './components/ui/Input'
import { Modal } from './components/ui/Modal'
import { DataRecovery } from './components/ui/DataRecovery'
import { PostViewModal } from './components/Social/PostViewModal'
import { GoogleLoginView } from './components/Auth/GoogleLoginView'

import { toImageUrl } from './services/driveService'
import { enablePushNotifications, pushEnabledLocally } from './services/pushService'
import { ChannelSidebar } from './components/Layout/ChannelSidebar'
import { TopBar } from './components/Layout/TopBar'
import { ChatView } from './components/Chat/ChatView'
import { CallView } from './components/Call/CallView'
import { CallAudioLayer } from './components/Call/CallAudioLayer'
import { FriendsView } from './components/Friends/FriendsView'
import { MobileLayout } from './components/Layout/MobileLayout'
import { ProfileView, type ProfileTab } from './components/Profile/ProfileView'
import { AstroWindow } from './components/Profile/AstroWindow'
import { EditProfile } from './components/Profile/EditProfile'
import { appearanceDataAttrs, appearanceScreenStyle, clampAppearanceToPlan, parseAppearance, planFromUser } from './components/Profile/ProfileEditor/appearance'
import { useLangStore } from './stores/langStore'
import { UserContextMenu } from './components/ui/UserContextMenu'
import { SettingsModal } from './components/Settings/SettingsModal'
import { CreateServerModal, type CreateServerData } from './components/Servers/CreateServerModal'
const ServerSettingsWindow = lazy(() => import('./components/Servers/ServerSettingsWindow').then(m => ({ default: m.ServerSettingsWindow })))
import { ServerInviteModal } from './components/Servers/ServerInviteModal'
import { DiscoverView } from './components/Social/DiscoverView'
import { VoiceChannelView } from './components/Call/VoiceChannelView'
import { UsersView } from './components/Users/UsersView'
import { useIsMobile } from './hooks/useIsMobile'
import { getStickyUser, useUserStore } from './stores/userStore'
import { useServerStore } from './stores/serverStore'
import { useFriendStore } from './stores/friendStore'
import { useCallStore } from './stores/callStore'
import { useNotificationStore } from './stores/notificationStore'
import { useFolderStore } from './stores/folderStore'
import { NotificationToasts } from './components/NotificationToasts'
import { pingBackend, searchDirectory, requestBackend } from './services/backend'
import { canManageServer, canDeleteServer } from './config/permissions'
import type { User, Server, ServerFolder } from './types'
import { IconShield, IconCrown, IconLink, IconPlus } from './utils/icons'
import { acquireCallMedia } from './services/antiloud'
import { connectDrive, disconnectDrive, isDriveConnected, uploadProfileImage, createServerDriveFolder, ensureServerTransmissionsFolder } from './services/driveService'
import { DriveRequiredModal } from './components/Chat/DriveRequiredModal'
import { startRingtone, stopRingtone, resumeRingtoneAudio } from './services/ringtone'
import { unlockAudio } from './services/audioUnlock'
import { startIncomingCallPoll, stopIncomingCallPoll, upgradeLocalMedia, prewarmServer } from './stores/callStore'
import { startCallOverlay } from './services/callOverlayService'
import { startAutoActivity } from './services/activityService'
import { DesktopChrome } from './components/Desktop/DesktopChrome'
import { assetUrl } from './utils/assets'
import AboutPage from './pages/About'
import { PrivacyPage } from './components/Privacy/PrivacyPage'
import { PrivacyModal } from './components/Privacy/PrivacyModal'
import { AstroPlansModal } from './components/Home/AstroPlansModal'
import { initSecurity } from './services/security'
import { FolderModal } from './components/Servers/FolderModal'
import { FolderShareModal } from './components/Servers/FolderShareModal'
import { ReportModal } from './components/Chat/ReportModal'
import { AboutModal } from './components/About/AboutModal'
import { WelcomeModal } from './components/About/WelcomeModal'
import { HelpReportModal } from './components/About/HelpReportModal'
import { DownloadAppModal } from './components/About/DownloadAppModal'

const CURRENT_USER_DATA_KEY = 'friends-space:current-user'
const THEME_KEY = 'friends-space:theme'

const navBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -4,
  right: -4,
  minWidth: 16,
  height: 16,
  padding: '0 4px',
  borderRadius: 999,
  background: '#f23f43',
  color: '#fff',
  fontSize: 10,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_DATA_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

function getInitialTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
}

function App() {
  const { currentUser, loadCurrentUser, loadUsers, signOut } = useUserStore()
  const { servers, currentServer, currentChannel, loadServers, createServer, joinServer, addRole, updateServer, deleteServer, leaveServer, setCurrentServer, setCurrentChannel, unread, totalUnread, loadUnread } = useServerStore()
  const { folders, loadFolders, createFolder, updateFolder, deleteFolder, shareFolder } = useFolderStore()
  const { loadFriends, sendFriendRequest, addFriendById } = useFriendStore()
  const { loadCallSessions, incomingCall, setIncomingCall, callingUser, endCall, declineIncomingCall, callRejectedBy, callUser, dismissRejectedCall, callWaiting } = useCallStore()
  const callChannelId = useCallStore(s => s.channelId)
  const callServerId = useCallStore(s => s.serverId)
  const controllingCall = useCallStore(s => s.controlling)
  const ringing = Boolean(callingUser) || Boolean(incomingCall)
  const [updateAvailable, setUpdateAvailable] = useState<{ latestVersion: string; downloadUrl: string; downloadUrlLinux: string; downloadUrlMac: string; releaseNotes: string } | null>(null)
  const [updateDownloadedVersion, setUpdateDownloadedVersion] = useState('')
  const [updatePercent, setUpdatePercent] = useState<number | null>(null)
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false)
  // Site: última versão desktop vista (ponto verde no botão Baixar).
  const [desktopRelease, setDesktopRelease] = useState('')
  const [desktopSeen, setDesktopSeen] = useState(() => {
    try { return localStorage.getItem('friends-space:desktop-seen') || '' } catch { return '' }
  })

  // Compara versões semver (1.2.4 > 1.2.3): o !== ingênuo avisava até
  // downgrade ou "v1.2.4" vs "1.2.4" como se fosse update.
  function isNewerVersion(latest: string, current: string): boolean {
    const norm = (v: string) => String(v || '').trim().replace(/^[v=\s]+/, '').split('.').map(p => {
      const n = parseInt(p, 10)
      return Number.isFinite(n) ? n : 0
    })
    const a = norm(latest)
    const b = norm(current)
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const x = a[i] ?? 0
      const y = b[i] ?? 0
      if (x !== y) return x > y
    }
    return false
  }

  // Novidade de update no historico de notificacoes (1x por versao).
  const announceUpdateNews = (version: string, notes: string) => {
    try {
      const key = 'friends-space:update-news-seen'
      let seen = ''
      try { seen = localStorage.getItem(key) || '' } catch { /* silencioso */ }
      if (seen === version) return
      try { localStorage.setItem(key, version) } catch { /* silencioso */ }
      const me = useUserStore.getState().currentUser
      if (!me) return
      void requestBackend('pushSystemNotification', {
        userId: me.id,
        type: 'update-news',
        title: `Friends Space ${version} disponível`,
        body: notes ? String(notes).slice(0, 180) : 'Abra Baixar app para atualizar.',
        data: { version },
      }).catch(() => { })
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    // Atualização automática no Electron: 1º electron-updater (GitHub
    // Releases, baixa em segundo plano), 2º fallback checkUpdate do backend
    // (instalações antigas ainda sem feed de update). Na web, ignora.
    type ElectronBridge = {
      isElectron?: boolean
      platform?: string
      appVersion?: () => Promise<string>
      checkForUpdates?: () => Promise<unknown>
      installUpdate?: () => Promise<unknown>
      onAppUpdate?: (cb: (evt: { status: string; version?: string; percent?: number }) => void) => () => void
    }
    const api = typeof window !== 'undefined'
      ? (window as unknown as { electronAPI?: ElectronBridge }).electronAPI
      : undefined
    if (!api?.isElectron) return
    let cancelled = false
    if (typeof api.onAppUpdate === 'function') {
      const off = api.onAppUpdate((evt) => {
        if (cancelled || !evt) return
        if (evt.status === 'downloading') setUpdatePercent(typeof evt.percent === 'number' ? evt.percent : null)
        else if (evt.status === 'downloaded') {
          setUpdatePercent(100)
          setUpdateDownloadedVersion(evt.version || 'nova')
        } else if (evt.status === 'available') {
          setUpdatePercent(0)
        } else if (evt.status === 'up-to-date' || evt.status === 'error') {
          setUpdatePercent(null)
        }
      })
      const timer = window.setTimeout(() => { try { api.checkForUpdates?.() } catch { /* silencioso */ } }, 5000)
      return () => { cancelled = true; window.clearTimeout(timer); try { off() } catch { /* silencioso */ } }
    }
    const check = async () => {
      try {
        const result = await requestBackend<{ latestVersion: string; downloadUrl: string; downloadUrlLinux: string; downloadUrlMac: string; releaseNotes: string }>('checkUpdate', {})
        if (cancelled || !result) return
        let current = '1.0.0'
        try { current = (await api.appVersion?.()) || current } catch { /* silencioso */ }
        if (result.latestVersion && isNewerVersion(result.latestVersion, current)) {
          setUpdateAvailable(result)
          announceUpdateNews(result.latestVersion, result.releaseNotes || '')
        }
      } catch { /* silencioso — nao mostrar erro se falhar */ }
    }
    // Checar 5s apos o carregamento (dar tempo pro app iniciar)
    const timer = window.setTimeout(check, 5000)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [])

  useEffect(() => {
    // Site: avisa 1x por sessão sobre app desktop novo (notificação + ponto
    // verde no botão Baixar). O modal "Baixar app" puxa a release sozinho.
    const onWeb = typeof window !== 'undefined' && !(window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron
    if (!onWeb) return
    let cancelled = false
    const check = async () => {
      try {
        const r = await requestBackend<{ latestVersion?: string }>('checkUpdate', {})
        const v = (r && r.latestVersion) || ''
        if (cancelled || !v) return
        setDesktopRelease(v)
        let seen = ''
        try { seen = localStorage.getItem('friends-space:desktop-seen') || '' } catch { /* silencioso */ }
        if (seen !== v) {
          setToast(`Nova versão do app disponível (${v})! Abra Baixar app.`)
          announceUpdateNews(v, '')
        }
      } catch { /* silencioso */ }
    }
    const timer = window.setTimeout(check, 8000)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [])

  useEffect(() => {
    if (ringing) startRingtone()
    else stopRingtone()
    return () => stopRingtone()
  }, [ringing])

  const callActive = useCallStore(s => s.activeCall)
  const callUserName = useCallStore(s => s.callUser?.name)

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { isElectron?: boolean; notify?: (title: string, body: string) => void; traySetCall?: (active: boolean) => void } }).electronAPI
    if (!api?.isElectron) return
    api.traySetCall?.(callActive)
    if (callActive) api.notify?.('Friends Space Beta', `Em chamada com ${callUserName ?? 'contato'}`)
  }, [callActive, callUserName])

  useEffect(() => {
    startCallOverlay()
    startAutoActivity()
    initSecurity()
  }, [])

  // First-run: exibe o Welcome na primeira vez (desktop e site)
  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI
    if (typeof window !== 'undefined' && !window.localStorage.getItem('friends-space:welcome-seen')) {
      window.localStorage.setItem('friends-space:welcome-seen', '1')
      setWelcomePlatform(api?.isElectron ? 'desktop' : 'site')
      setShowWelcome(true)
    }
  }, [])

  useEffect(() => {
    const onGesture = () => { resumeRingtoneAudio(); unlockAudio() }
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('touchstart', onGesture)
    window.addEventListener('keydown', onGesture)
    return () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('touchstart', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
  }, [])

  useEffect(() => {
    const onEditProfile = () => {
      if (!isDriveConnected()) {
        setPendingDriveAction(() => () => { setProfileTab('perfil'); setShowProfile(true) })
        setDriveGateOpen(true)
        return
      }
      setProfileTab('perfil'); setShowProfile(true)
    }
    window.addEventListener('friends-space:edit-profile', onEditProfile)
    return () => window.removeEventListener('friends-space:edit-profile', onEditProfile)
  }, [])

  const [showCreateServer, setShowCreateServer] = useState(false)
  const [showJoinServer, setShowJoinServer] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [profileTab, setProfileTab] = useState<ProfileTab>('perfil')
  const [showAstro, setShowAstro] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showRoles, setShowRoles] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [roleName, setRoleName] = useState('')
  const [roleColor, setRoleColor] = useState('#00ff88')
  const [toast, setToast] = useState('')
  const [showEditServer, setShowEditServer] = useState(false)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [showUsers, setShowUsers] = useState(false)
  const [serverMenu, setServerMenu] = useState<{ server: Server; x: number; y: number } | null>(null)
  const [folderMenu, setFolderMenu] = useState<{ folder: ServerFolder; x: number; y: number } | null>(null)
  const [folderModal, setFolderModal] = useState<{ folder: ServerFolder | null; open: boolean }>({ folder: null, open: false })
  const [folderShare, setFolderShare] = useState<ServerFolder | null>(null)
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null)
  const [reportServer, setReportServer] = useState<Server | null>(null)
  const [inviteServer, setInviteServer] = useState<Server | null>(null)
  const [editServerName, setEditServerName] = useState('')
  const [editServerPhoto, setEditServerPhoto] = useState('')
  const [editServerBanner, setEditServerBanner] = useState('')
  const [editServerDesc, setEditServerDesc] = useState('')
  const [editServerColor, setEditServerColor] = useState('#00ff88')
  const [editCallAccess, setEditCallAccess] = useState<'public' | 'members' | 'staff'>('public')
  const [editCallPassword, setEditCallPassword] = useState('')
  const [editStaffIds, setEditStaffIds] = useState('')
  const [editError, setEditError] = useState('')
  const [driveConnected, setDriveConnected] = useState(isDriveConnected())
  const [driveBusy, setDriveBusy] = useState(false)
  const [driveGateOpen, setDriveGateOpen] = useState(false)
  const [showAstroPlans, setShowAstroPlans] = useState(false)
  const driveGateShownRef = useRef<string | null>(null)
  const [pendingDriveAction, setPendingDriveAction] = useState<(() => void) | null>(null)
  const [serverDriveModal, setServerDriveModal] = useState(false)
  const [editServerDriveModal, setEditServerDriveModal] = useState(false)
  const pendingServerDrive = useRef<'icon' | 'banner' | 'save' | null>(null)
  const [restoredUser, setRestoredUser] = useState<User | null>(() => getStickyUser() || readStoredUser())
  const [backendOnline, setBackendOnline] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [welcomePlatform, setWelcomePlatform] = useState<'site' | 'desktop'>('site')
  const [showHelpReport, setShowHelpReport] = useState(false)
  const [showDownloadApp, setShowDownloadApp] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [deepPostId, setDeepPostId] = useState<string | null>(null)
  useEffect(() => {
    const open = () => {
      try {
        const m = /^#\/post\/([\w-]+)/.exec(window.location.hash || '')
        setDeepPostId(m ? m[1] : null)
      } catch {}
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ users: User[], servers: Server[] }>({ users: [], servers: [] })
  const [searchLoading, setSearchLoading] = useState(false)
  const [showServerSearch, setShowServerSearch] = useState(false)
  const [showDiscover, setShowDiscover] = useState(false)
  const [serverQuery, setServerQuery] = useState('')
  const [serverResults, setServerResults] = useState<Server[]>([])
  const [serverLoading, setServerLoading] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme)
  const isMobile = useIsMobile(768)
  const isElectron = typeof window !== 'undefined' && Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron)
  // Build velho bloqueado: o site compara /version.json com a primeira leitura;
  // se o deploy mudou no meio da sessão, TRAVA a tela pedindo atualização.
  // Call com client velho quebra (protocolo de sinal mudou) e o usuário acha
  // que é "problema de conexão". No Electron o auto-update cuida disso.
  const [staleBuild, setStaleBuild] = useState(false)
  useEffect(() => {
    if (isElectron) return
    let cancelled = false
    let baseline: string | null = null
    const check = async () => {
      try {
        const r = await fetch('/version.json', { cache: 'no-store' })
        const j = await r.json().catch(() => null)
        const cur = j ? String(j.v ?? j.id ?? '') : ''
        if (!cur) return
        if (baseline === null) { baseline = cur; return }
        if (!cancelled && baseline !== cur) setStaleBuild(true)
      } catch { /* silencioso */ }
    }
    const t1 = window.setTimeout(check, 30000)
    const t2 = window.setInterval(check, 120000)
    return () => { cancelled = true; window.clearTimeout(t1); window.clearInterval(t2) }
  }, [isElectron])
  // Aba ativa da navegacao inferior estilo Discord mobile (Amigos/Explorar/Voce)
  const [mobileTab, setMobileTab] = useState<'friends' | 'explore' | 'me'>('friends')
  // Esquema de interface por scroll (mobile): rolar para BAIXO esconde a barra
  // superior (mais espaco pra conversa), rolar para CIMA mostra de novo.
  const [topbarHidden, setTopbarHidden] = useState(false)
  const mobileContentRef = useRef<HTMLDivElement>(null)
  const lastScrollYRef = useRef(0)
  useEffect(() => {
    if (!isMobile) return
    const el = mobileContentRef.current
    if (!el) return
    const onScroll = () => {
      const y = el.scrollTop
      const delta = y - lastScrollYRef.current
      lastScrollYRef.current = y
      if (y <= 0) { setTopbarHidden(false); return }
      if (delta > 3) setTopbarHidden(true)
      else if (delta < -3) setTopbarHidden(false)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // Tema personalizado do Workshop (criado por usuário Astro): aplica as
  // cores como variáveis CSS; sem tema, remove para voltar ao padrão.
  // Só vale com assinatura ativa (validação também existe no backend).
  useEffect(() => {
    const root = document.documentElement
    const s = (currentUser?.settings || {}) as Record<string, unknown>
    const active = (s.astro === true || s.astro === 'true') && !(Number(s.astroUntil || 0) > 0 && Number(s.astroUntil) < Date.now())
    const applied = (active ? s.appliedTheme : null) as Record<string, string> | undefined
    const vars: Array<[string, string]> = [
      ['--accent', String(applied?.accent || '')],
      ['--bg-primary', String(applied?.bg || '')],
      ['--bg-secondary', String(applied?.bg2 || '')],
      ['--text-primary', String(applied?.text || '')],
    ]
    for (const [k, v] of vars) {
      if (/^#[0-9a-fA-F]{6}$/.test(v)) root.style.setProperty(k, v)
      else root.style.removeProperty(k)
    }
    return () => {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--bg-primary')
      root.style.removeProperty('--bg-secondary')
      root.style.removeProperty('--text-primary')
    }
  }, [currentUser?.id, (currentUser?.settings as Record<string, unknown> | undefined)?.appliedTheme])

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    const refresh = async () => {
      try { await loadFriends(currentUser.id) } catch { }
    }
    void refresh()
    const timer = window.setInterval(() => { if (!cancelled) void refresh() }, 45000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [currentUser, loadFriends])

  // Notificacoes push: registra o service worker e assina (chamadas chegam
  // mesmo com o navegador fechado). Best-effort: nunca bloqueia o login.
  useEffect(() => {
    if (!currentUser?.id) return
    if (pushEnabledLocally()) return
    const timer = window.setTimeout(() => {
      void enablePushNotifications(currentUser.id).then(ok => {
        if (!ok) return
        // Depois de assinar, avisa o backend para dar push em chamadas DM.
        requestBackend('refreshPushRegistration', { userId: currentUser.id }).catch(() => null)
      })
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [currentUser?.id])

  useEffect(() => {
    const onOpenDM = (e: Event) => {
      const user = (e as CustomEvent).detail?.user as User | undefined
      if (!user) return
      useFriendStore.getState().setCurrentDMUser(user)
      useServerStore.setState({ currentServer: null, currentChannel: null })
      setShowUsers(false)
      setShowProfile(false)
    }
    const onShowFriends = () => {
      useServerStore.setState({ currentServer: null, currentChannel: null })
      setShowUsers(false)
      setShowProfile(false)
    }
    window.addEventListener('friends-space:open-dm', onOpenDM)
    window.addEventListener('friends-space:show-friends', onShowFriends)
    const onShowAstroPlans = () => setShowAstroPlans(true)
    window.addEventListener('friends-space:show-astro-plans', onShowAstroPlans)
    return () => {
      window.removeEventListener('friends-space:open-dm', onOpenDM)
      window.removeEventListener('friends-space:show-friends', onShowFriends)
      window.removeEventListener('friends-space:show-astro-plans', onShowAstroPlans)
    }
  }, [])

  useEffect(() => {
    const lastByMessage = new Map<string, number>()
    const onToast = (e: Event) => {
      const message = (e as CustomEvent<string>).detail
      if (typeof message !== 'string' || !message) return
      // Dedupe: mesma mensagem em <3s é ignorada (callStore dispara em loop por peer)
      const now = Date.now()
      const last = lastByMessage.get(message) || 0
      if (now - last < 3000) return
      lastByMessage.set(message, now)
      if (lastByMessage.size > 50) {
        for (const [k, t] of lastByMessage) {
          if (now - t > 10000) lastByMessage.delete(k)
        }
      }
      setToast(message)
    }
    window.addEventListener('friends-space:toast', onToast)
    const onOpenDiscover = () => setShowDiscover(true)
    window.addEventListener('friends-space:open-discover', onOpenDiscover)
    const onOpenDownload = () => setShowDownloadApp(true)
    window.addEventListener('friends-space:open-download', onOpenDownload)
    return () => { window.removeEventListener('friends-space:toast', onToast); window.removeEventListener('friends-space:open-discover', onOpenDiscover); window.removeEventListener('friends-space:open-download', onOpenDownload) }
  }, [])

  // Pre-conexao: entrou no servidor = pre-aquece ICE + sessoes + usuarios.
  const prewarmServerId = currentServer?.id
  useEffect(() => {
    if (prewarmServerId) prewarmServer(prewarmServerId)
  }, [prewarmServerId])

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    const refresh = async () => {
      try { await loadUnread() } catch { }
      try { await loadFolders() } catch { }
    }
    void refresh()
    const timer = window.setInterval(() => { if (!cancelled) void refresh() }, 15000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [currentUser, loadUnread, loadFolders])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        await loadCurrentUser()
        await Promise.allSettled([
          loadUsers(),
          loadServers(),
          loadFolders(),
          loadUnread(),
        ])
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    }

    void bootstrap()
    return () => { cancelled = true }
  }, [loadCurrentUser, loadUsers, loadServers, loadFolders, loadUnread])

  useEffect(() => {
    if (!currentUser) return
    const fs = useFriendStore.getState()
    fs.startFriendsPoll(currentUser.id)
    const onFocus = () => { void useFriendStore.getState().loadFriends(currentUser.id) }
    window.addEventListener('focus', onFocus)
    return () => { useFriendStore.getState().stopFriendsPoll(); window.removeEventListener('focus', onFocus) }
  }, [currentUser])

  const [authBlock, setAuthBlock] = useState<string | null>(null)
  useEffect(() => {
    const onAuthFail = (e: Event) => {
      const msg = (e as CustomEvent).detail || ''
      if (/Rede bloqueada|Dispositivo bloqueado/.test(msg)) setAuthBlock('rede')
      else if (/EXPULSO/.test(msg)) setAuthBlock('expulso')
      else if (/Atualize o app/.test(msg)) setToast('Versão antiga. Recarregue com Ctrl+Shift+R.')

    }
    window.addEventListener('friends-space:auth-fail', onAuthFail)
    return () => window.removeEventListener('friends-space:auth-fail', onAuthFail)
  }, [])
  useEffect(() => {
    let alive = true
    const checkVersion = async () => {
      try {
        const r = await fetch('/version.json', { cache: 'no-store' })
        const srv = await r.json()
        const mine = typeof __BUILD_ID__ !== 'undefined' ? String(__BUILD_ID__) : ''
        if (alive && srv && srv.id && mine && srv.id !== mine) {
          void import('./services/sounds').then(m => m.playSound('notification')).catch(() => {}); setToast('Nova versão disponível. Recarregue (Ctrl+F5).')
        }
      } catch {}
    }
    const iv = window.setInterval(checkVersion, 5 * 60 * 1000)
    return () => { alive = false; window.clearInterval(iv) }
  }, [])
  useEffect(() => {
    let errCount = 0
    let errWindow = Date.now()
    const sendErr = (where: string, message: string) => {
      try {
        const nowMs = Date.now()
        if (nowMs - errWindow > 60000) { errWindow = nowMs; errCount = 0 }
        if (errCount >= 5) return
        errCount++
        void requestBackend('reportClientError', { where, message: String(message).slice(0, 500) }).catch(() => {})
      } catch {}
    }
    const onErr = (e: ErrorEvent) => sendErr('onerror', (e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + String(e.lineno || 0))
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason
      sendErr('unhandledrejection', r instanceof Error ? (r.message + ' ' + String((r.stack || '').split('\n')[1] || '')) : String(r))
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej) }
  }, [])
  useEffect(() => {
    let busy = false
    const onExpired = () => {
      if (busy) return
      try { if (!useUserStore.getState().currentUser) return } catch { return }
      busy = true
      void (async () => {
        try {
          const ok = await useUserStore.getState().trySilentReauth()
          if (!ok) {
            try { useUserStore.getState().handleSessionExpired() } catch { }
            try { setRestoredUser(null) } catch { }
            try { useCallStore.getState().endCall() } catch { }
            setToast('Sessão expirada. Entre de novo.')
          }
        } finally { busy = false }
      })()
    }
    window.addEventListener('friends-space:session-expired', onExpired)
    return () => window.removeEventListener('friends-space:session-expired', onExpired)
  }, [])

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const online = await pingBackend()
      if (!cancelled) setBackendOnline(online)
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 60000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (currentUser) setRestoredUser(currentUser)
    else if (authReady) setRestoredUser(null)
  }, [currentUser, authReady])

  useEffect(() => {
    const active = currentUser || restoredUser
    if (!active) return
    if (isDriveConnected()) {
      setDriveGateOpen(false)
      return
    }
    if (driveGateShownRef.current === active.id) return
    driveGateShownRef.current = active.id
    setDriveGateOpen(true)
  }, [currentUser, restoredUser, authReady])

  useEffect(() => {
    const active = currentUser || restoredUser || getStickyUser()
    const appearance = active?.settings ? clampAppearanceToPlan(parseAppearance(active.settings as Record<string, unknown>), planFromUser(active)) : null
    const root = document.documentElement
    if (!appearance) {
      for (const key of ['data-appearance-theme', 'data-appearance-bg', 'data-appearance-font', 'data-appearance-text-color']) root.removeAttribute(key)
      for (const key of ['--appearance-accent', '--appearance-accent-strong', '--appearance-accent-soft', '--appearance-glow', '--appearance-page-bg', '--appearance-page-image', '--appearance-font', '--appearance-text', '--accent', '--accent-hover', '--accent-dim', '--connection-dot', '--text-primary', '--text-secondary', '--text-muted', '--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-hover', '--bg-active', '--border', '--border-light', '--sans']) root.style.removeProperty(key)
      document.body.style.background = ""
      return
    }
    const style = appearanceScreenStyle(appearance)
    for (const [key, value] of Object.entries(style)) root.style.setProperty(key, String(value))
    for (const [key, value] of Object.entries(appearanceDataAttrs(appearance))) root.setAttribute(key, value)
    const body = document.body
    const styleMap = style as unknown as Record<string, string>
    const bg = String(styleMap["--appearance-page-bg"])
    const image = String(styleMap["--appearance-page-image"])
    body.style.background = image !== "none" && image
      ? `${image}, ${bg}`
      : bg
    body.style.backgroundAttachment = "fixed"
    body.style.backgroundSize = "cover, auto"
    return () => {
      const latest = currentUser || restoredUser || getStickyUser()
      const latestAppearance = latest?.settings ? parseAppearance(latest.settings as Record<string, unknown>) : null
      if (!latestAppearance) body.style.background = ""
    }
  }, [currentUser, restoredUser])

  // Deteccao automatica de idioma por IP: sem preferencia salva, usuarios fora
  // do Brasil comecam em ingles (backend Vercel injeta x-vercel-ip-country).
  useEffect(() => {
    let cancelled = false
    try {
      if (localStorage.getItem('friends-space:lang')) return
    } catch { /* ignore */ }
    void (async () => {
      try {
        const res = await requestBackend<{ country?: string }>('getGeo', {})
        if (cancelled || !res?.country) return
        if (res.country.toUpperCase() !== 'BR') useLangStore.getState().setLang('en-US')
      } catch { /* offline: permanece no padrao pt-BR */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const invite = params.get('invite')
    const friend = params.get('friend')
    if (invite) {
      setInviteCode(invite.toUpperCase())
      setShowJoinServer(true)
    }
    if (friend) {
      const actor = currentUser || restoredUser
      if (actor) {
        sendFriendRequest(actor.id, friend.toUpperCase())
      }
    }
  }, [])

  useEffect(() => {
    if (!showSearch || searchQuery.trim().length < 2) {
      setSearchResults({ users: [], servers: [] })
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      try {
        const result = await searchDirectory(searchQuery, currentUser?.id || restoredUser?.id)
        if (!cancelled) setSearchResults(result)
      } catch {
        if (!cancelled) setSearchResults({ users: [], servers: [] })
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [showSearch, searchQuery, currentUser, restoredUser])

  useEffect(() => {
    if (!showServerSearch || serverQuery.trim().length < 2) {
      setServerResults([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setServerLoading(true)
      try {
        const result = await searchDirectory(serverQuery, currentUser?.id || restoredUser?.id)
        if (!cancelled) setServerResults(result.servers)
      } catch {
        if (!cancelled) setServerResults([])
      } finally {
        if (!cancelled) setServerLoading(false)
      }
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [showServerSearch, serverQuery, currentUser, restoredUser])

  useEffect(() => {
    const activeUser = currentUser || restoredUser
    if (!activeUser) return

    let cancelled = false
    const refreshInFlight = { current: false }

    const refresh = async () => {
      if (refreshInFlight.current) return
      refreshInFlight.current = true
      try {
        await Promise.all([
          loadServers(),
          loadUsers(),
          loadFriends(activeUser.id),
          currentChannel ? useServerStore.getState().loadMessages(currentChannel.id) : Promise.resolve(),
        ])
      } catch {
        if (cancelled) return
      } finally {
        refreshInFlight.current = false
      }
    }

    void refresh()
    const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window
      ? new BroadcastChannel('friends-space-sync') : null
    const handleSync = () => { void refresh() }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'friends-space:profile-id' || event.key === 'friends-space:current-user' || event.key === 'friends-space:current-user-id') {
        void refresh()
      }
    }

    window.addEventListener('friends-space:sync', handleSync)
    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', handleSync)
    if (channel) channel.onmessage = handleSync

    const timer = window.setInterval(() => { if (!cancelled) void refresh() }, 45000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('friends-space:sync', handleSync)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', handleSync)
      channel?.close()
    }
  }, [currentUser, restoredUser, currentServer, currentChannel, loadServers, loadUsers, loadFriends, loadCallSessions])

  useEffect(() => {
    const activeUser = currentUser || restoredUser
    if (!activeUser) {
      stopIncomingCallPoll()
      useNotificationStore.getState().stopPolling()
      return
    }
    startIncomingCallPoll(activeUser.id)
    useNotificationStore.getState().startPolling()
    return () => {
      stopIncomingCallPoll()
      useNotificationStore.getState().stopPolling()
    }
  }, [currentUser, restoredUser])

  const handleCreateServer = async (data: CreateServerData) => {
    const actor = currentUser || restoredUser
    const name = data.name.trim()
    if (!name || !actor) return
    if (!isDriveConnected()) {
      setPendingDriveAction(() => () => { void handleCreateServer(data) })
      setDriveGateOpen(true)
      return
    }
    try {
      // Sobe ícone/banner pro Drive (no localhost vira compress local).
      let photoUrl = data.photoUrl
      let bannerUrl = data.bannerUrl
      if (photoUrl && photoUrl.startsWith('data:')) {
        photoUrl = await uploadProfileImage(photoUrl, 'avatar', `server-icon-${Date.now()}.png`)
      }
      if (bannerUrl && bannerUrl.startsWith('data:')) {
        bannerUrl = await uploadProfileImage(bannerUrl, 'banner', `server-banner-${Date.now()}.png`)
      }
      const events = (data.events || [])
        .map(e => ({
          title: e.title.trim(),
          description: '',
          date: e.date ? new Date(e.date).getTime() : Date.now() + 24 * 3600 * 1000,
        }))
        .filter(e => e.title && Number.isFinite(e.date))
      const server = await createServer(name, actor.id, photoUrl, data.category, {
        bannerUrl,
        description: data.description,
        themes: data.themes,
        frequency: data.frequency,
        minAge: data.minAge,
        toggles: data.toggles,
        rules: data.rules,
        textChannels: data.textChannels,
        voiceChannels: data.voiceChannels,
        categories: data.categories,
        roles: data.roles,
        events,
      })
      setShowCreateServer(false)
      setServerDriveModal(true)
      void createServerDriveFolder(server.id, server.name).catch(() => { })
      void ensureServerTransmissionsFolder(server.id, server.name).catch(() => { })
      setToast(`Servidor "${server.name}" criado com ${server.channels.length} canais!`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Não foi possível criar o servidor.')
    }
  }

  const handleJoinServer = async () => {
    const actor = currentUser || restoredUser
    if (!inviteCode.trim() || !actor) return
    if (!isDriveConnected()) {
      setPendingDriveAction(() => () => { void handleJoinServer() })
      setDriveGateOpen(true)
      return
    }
    const success = await joinServer(inviteCode.trim(), actor.id)
    if (success && success.ok) {
      setInviteCode('')
      setShowJoinServer(false)
      loadServers()
    } else {
      setToast(success && success.error ? success.error : 'Não foi possível entrar no servidor.')
    }
  }

  const selectServer = (server: Server | null) => {
    // SEMPRE limpa o canal atual ao trocar de servidor (rail, sidebar, topbar):
    // manter currentChannel de outro servidor mostra chat errado e pode crashar.
    if (server && !isDriveConnected()) {
      setPendingDriveAction(() => () => { setCurrentServer(server); setShowUsers(false); setCurrentChannel(null) })
      setDriveGateOpen(true)
      return
    }
    setCurrentServer(server)
    setShowUsers(false)
    setCurrentChannel(null)
  }

  const handleAddRole = async () => {
    if (!roleName.trim() || !currentServer) return
    await addRole(currentServer.id, roleName.trim(), roleColor)
    setRoleName('')
  }

  const copyInvite = () => {
    if (!currentServer) return
    setInviteServer(currentServer)
  }

  const shareServerLink = (server: Server) => {
    setServerMenu(null)
    setInviteServer(server)
  }

  const openEditServer = async (server?: Server) => {
    const initial = server || currentServer
    if (!initial) return
    // Funde TODAS as cópias (argumento, atual, store, backend): conchas
    // parciais nunca mais sombreiam o objeto cheio.
    const pool = [server, currentServer].filter((s): s is Server => Boolean(s))
    const id = server?.id || currentServer?.id || initial.id
    if (!id) {
      setToast('Nenhum servidor selecionado.')
      return
    }
    let target: Server = pool.filter(s => s.id === id).reduce((acc, s) => ({ ...acc, ...s }), {} as Server) as Server
    if (!target.id) target = { ...initial, id } as Server
    try {
      const st = useServerStore.getState()
      let found = st.servers.find(s => s.id === id)
      if (!found) {
        try { await st.loadServers() } catch { }
        found = useServerStore.getState().servers.find(s => s.id === id)
      }
      if (!found) {
        try { found = await useServerStore.getState().fetchServer(id) || undefined } catch { }
      }
      if (found) target = { ...target, ...found }
    } catch { }
    if (!target.name && !(target.channels || []).length && !(target.members || []).length) {
      console.warn('[server] settings parcial', { id, pool: pool.map(s => ({ id: s.id, name: s.name, ch: (s.channels || []).length })) })
    }
    try { await useServerStore.getState().seedServer(target) } catch { }
    setEditingServer(target)
    setEditServerName(target.name || '')
    setEditServerPhoto(target.photoUrl || '')
    setEditServerBanner(target.bannerUrl || '')
    setEditServerDesc(target.description || '')
    setEditServerColor(target.accentColor || '#00ff88')
    setEditCallAccess(target.callAccess || 'public')
    setEditCallPassword(target.callPassword || '')
    setEditStaffIds((target.staffMemberIds || []).join(', '))
    setShowEditServer(true)
  }

  const handleSaveServer = async () => {
    const target = editingServer || currentServer
    if (!target) return
    const hasNewPhoto = typeof editServerPhoto === 'string' && editServerPhoto.startsWith('data:')
    const hasNewBanner = typeof editServerBanner === 'string' && editServerBanner.startsWith('data:')
    if ((hasNewPhoto || hasNewBanner) && !isDriveConnected()) {
      pendingServerDrive.current = 'save'
      setEditServerDriveModal(true)
      return
    }
    let photoUrl = editServerPhoto
    let bannerUrl = editServerBanner
    if (hasNewPhoto) {
      const ext = photoUrl.split(';')[0].split('/')[1] || 'png'
      const uploaded = await uploadProfileImage(photoUrl, 'avatar', `server-icon-${target.id}.${ext}`)
      if (uploaded === photoUrl) {
        setToast('Erro ao enviar o icone para o Google Drive. Tente reconectar.')
        return
      }
      photoUrl = uploaded
    }
    if (hasNewBanner) {
      const ext = bannerUrl.split(';')[0].split('/')[1] || 'png'
      const uploaded = await uploadProfileImage(bannerUrl, 'banner', `server-banner-${target.id}.${ext}`)
      if (uploaded === bannerUrl) {
        setToast('Erro ao enviar o banner para o Google Drive. Tente reconectar.')
        return
      }
      bannerUrl = uploaded
    }
    await updateServer(target.id, {
      name: editServerName, photoUrl, bannerUrl,
      description: editServerDesc, accentColor: editServerColor,
      callAccess: editCallAccess, callPassword: editCallPassword,
      staffMemberIds: editStaffIds.split(',').map(v => v.trim()).filter(Boolean),
    })
    setShowEditServer(false)
  }

  const requestServerIcon = () => {
    if (!isDriveConnected()) { pendingServerDrive.current = 'icon'; setEditServerDriveModal(true); return }
    serverIconInputRef.current?.click()
  }

  const requestServerBanner = () => {
    if (!isDriveConnected()) { pendingServerDrive.current = 'banner'; setEditServerDriveModal(true); return }
    serverBannerInputRef.current?.click()
  }

  const handleToggleDrive = async () => {
    if (driveBusy) return
    setDriveBusy(true)
    try {
      if (driveConnected) {
        disconnectDrive()
        setDriveConnected(false)
      } else {
        const ok = await connectDrive()
        if (ok) setDriveConnected(true)
      }
    } finally {
      setDriveBusy(false)
    }
  }

  const serverIconInputRef = useRef<HTMLInputElement>(null)
  const serverBannerInputRef = useRef<HTMLInputElement>(null)

  const handleServerIconFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setEditServerPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleServerBannerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setEditServerBanner(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleDeleteServer = async () => {
    const actor = currentUser || restoredUser
    const target = editingServer || currentServer
    if (!target || !actor || !canDeleteServer(target, actor.id)) {
      setEditError('Voce nao e o dono deste servidor')
      return
    }
    if (!window.confirm(`Apagar "${target.name}" permanentemente?`)) return
    setEditError('')
    const deleted = await deleteServer(target.id, actor.id)
    if (deleted.ok) { setShowEditServer(false); setEditError('') }
    else { setEditError(deleted.error || 'Erro ao apagar servidor') }
  }

  const handleSignOut = async () => {
    await signOut()
    setRestoredUser(null)
  }

  const handleLeaveServer = async () => {
    const actor = currentUser || restoredUser
    const target = serverMenu?.server
    if (!target || !actor) return
    if (!window.confirm(`Sair do servidor "${target.name}"?`)) return
    setServerMenu(null)
    await leaveServer(target.id, actor.id)
    setToast(`Voce saiu do servidor "${target.name}"`)
  }

  const activeUser = currentUser || restoredUser || getStickyUser()

  if (window.location.pathname === '/sobre') return <AboutPage />
  if (window.location.pathname === '/privacidade') return <PrivacyPage />
  if (window.location.pathname === '/mobile-biometric') {
    return <AboutPage />
  }

  const acceptIncomingCall = async () => {
    if (!incomingCall) return
    const call = incomingCall
    try {
      const store = useCallStore.getState()
      const stream = await acquireCallMedia(call.callMode || 'audio', store.preferredQuality, undefined, store.preferredFps)
      // Mic dedicado + audio limpo entram em background (sem travar o join).
      void upgradeLocalMedia()
      // BUG FIX: adicionar participante ANTES de startCall (que roda connectToAllExistingPeers
      // e syncSession — se o outro lado não estiver na lista, nenhuma oferta é criada e a call
      // fica muda / "Ligando..." para sempre).
      useCallStore.getState().addParticipant({ userId: call.fromId, userName: call.fromName, userPhoto: call.fromPhoto, muted: false, deafened: false })
      store.startCall(call.channelId || 'dm', call.serverId || 'dm', stream, call.callMode || 'audio', store.preferredQuality, call.sessionId)
      setIncomingCall(null)
    } catch {
      // Captura falhou (mic/camera negada ou indisponivel): recusa a chamada
      // em vez de deixar a tela "Chamada recebida" presa e tocando para sempre.
      useCallStore.getState().declineIncomingCall()
    }
  }

  if (!authReady) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%), radial-gradient(70% 60% at 50% 110%, color-mix(in srgb, #5865f2 10%, transparent), transparent 60%), var(--bg-primary)' }}>
        <div style={{ width: 360, maxWidth: 'calc(100vw - 32px)', padding: '44px 36px 34px', borderRadius: 24, border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))', background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 92%, var(--accent) 8%), var(--bg-secondary))', boxShadow: '0 24px 70px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <img src={assetUrl('Logo.png')} alt="Friends Space Beta" style={{ height: 88, width: 88, objectFit: 'cover', borderRadius: '50%', border: '2px solid color-mix(in srgb, var(--accent) 60%, transparent)', boxShadow: '0 0 32px color-mix(in srgb, var(--accent) 30%, transparent), 0 10px 30px rgba(0,0,0,0.5)' }} />
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, margin: 0, fontFamily: '"Space Grotesk", "Inter", sans-serif', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Friends Space Beta</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '8px 0 0', fontFamily: '"Space Grotesk", "Inter", sans-serif' }}>Carregando sua sessão</p>
          </div>
          <div style={{ position: 'relative', width: '100%', height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="fs-loadbar" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '35%', borderRadius: 999, background: 'linear-gradient(90deg, var(--accent-hover), var(--accent))', boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 70%, transparent)' }} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: 0, opacity: 0.75 }}>Se travar aqui, recarregue com Ctrl+F5</p>
        </div>
        <style>{`@keyframes fsLoadSlide{0%{left:-35%}100%{left:100%}}.fs-loadbar{animation:fsLoadSlide 1.4s ease-in-out infinite}`}</style>
      </div>
    )
  }

  const folderServerIds = new Set(folders.flatMap(f => (f.serverIds || [])))
  const standaloneServers = servers.filter(s => !folderServerIds.has(s.id))
  const unreadForServer = (server: Server) => (server.channels || []).reduce((sum, ch) => sum + (unread[ch.id] || 0), 0)
  const unreadForFolder = (folder: ServerFolder) => {
    let total = 0
    for (const id of (folder.serverIds || [])) {
      const server = servers.find(s => s.id === id)
      if (server) total += unreadForServer(server)
    }
    return total
  }
  const openFolderModal = (folder: ServerFolder | null) => setFolderModal({ folder, open: true })
  const handleSaveFolder = async (name: string, serverIds: string[]) => {
    const current = folderModal.folder
    if (current) {
      await updateFolder(current.id, { name, serverIds })
    } else {
      await createFolder(name, serverIds)
      setExpandedFolderId(null)
    }
    setFolderModal({ folder: null, open: false })
  }
  const handleShareFolder = async (toUserId: string) => {
    if (!folderShare) return { ok: false, error: 'Pasta invalida' }
    const result = await shareFolder(folderShare.id, toUserId)
    if (result.ok) setToast(`Pasta encaminhada para ${toUserId ? 'o usuario' : ''}`)
    return result
  }
  const handleDeleteFolder = async () => {
    if (!folderMenu?.folder) return
    if (!window.confirm(`Apagar a pasta "${folderMenu.folder.name}"? Os servidores dentro nao serao removidos.`)) return
    await deleteFolder(folderMenu.folder.id)
    if (expandedFolderId === folderMenu.folder.id) setExpandedFolderId(null)
    setFolderMenu(null)
  }
  const folderItems = (folder: ServerFolder) => [
    { label: 'Abrir pasta', icon: <Fa name="folder-open" size={13} />, onClick: () => { setExpandedFolderId(expandedFolderId === folder.id ? null : folder.id); setFolderMenu(null) } },
    { label: 'Personalizar (nome / servidores)', icon: <Fa name="sliders" size={13} />, onClick: () => { openFolderModal(folder); setFolderMenu(null) } },
    { label: 'Encaminhar pasta', icon: <Fa name="share-nodes" size={13} />, onClick: () => { setFolderShare(folder); setFolderMenu(null) } },
    { label: 'Apagar pasta', icon: <Fa name="trash" size={13} />, danger: true, onClick: () => void handleDeleteFolder() },
  ]

  const siteAppearance = activeUser?.settings ? clampAppearanceToPlan(parseAppearance(activeUser.settings as Record<string, unknown>), planFromUser(activeUser)) : null

  return (
    <div {...(siteAppearance ? appearanceDataAttrs(siteAppearance) : {})} style={siteAppearance ? { ...appearanceScreenStyle(siteAppearance), width: '100%', height: '100dvh', display: 'flex', flexDirection: 'column' } : { width: '100%', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <DesktopChrome />
      {(incomingCall && !useCallStore.getState().activeCall) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--accent)', boxShadow: '0 0 24px color-mix(in srgb, var(--accent) 22%, transparent)' }}>
              <Avatar src={incomingCall.fromPhoto} name={incomingCall.fromName} size={100} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{incomingCall.fromName}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: 'var(--text-muted)' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite' }} />
                <span style={{ fontSize: 15 }}>Chamada Recebida</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <button onClick={() => declineIncomingCall()} style={{ width: 72, height: 56, borderRadius: 12, background: 'var(--danger)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 20, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,68,68,0.4)' }} title="Recusar">
                <span>✕</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>Recusar</span>
              </button>
              <button onClick={() => void acceptIncomingCall()} style={{ width: 72, height: 56, borderRadius: 12, background: 'var(--accent)', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 20, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px color-mix(in srgb, var(--accent) 40%, transparent)' }} title="Entrar">
                <span>✓</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>Entrar</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {callingUser && !incomingCall && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--border)', boxShadow: '0 0 24px rgba(0,0,0,0.25)' }}>
              <Avatar src={callingUser.userPhoto} name={callingUser.userName} size={100} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{callingUser.userName}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: 'var(--text-muted)' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--warning)', animation: 'pulse 1s infinite' }} />
                {callWaiting ? (
                  <span style={{ fontSize: 15 }}>Aguardando resposta</span>
                ) : (
                  <span style={{ fontSize: 15 }}>Ligando</span>
                )}
              </div>
              {callWaiting && (
                <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12, opacity: 0.7 }}>
                  A pessoa foi notificada — assim que atender, você será conectado automaticamente
                </div>
              )}
            </div>
            <button onClick={() => endCall()} style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--danger)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,68,68,0.4)' }} title="Cancelar">✕</button>
          </div>
        </div>
      )}
      {callRejectedBy && !useCallStore.getState().activeCall && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 76, height: 76, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--warning)', boxShadow: '0 0 24px rgba(250,168,26,0.28)' }}>
              <Avatar src={callRejectedBy.userPhoto} name={callRejectedBy.userName} size={76} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                {callRejectedBy.reason === 'timeout' ? (
                  <span style={{ color: 'var(--warning)' }}>Tempo de espera de call terminado</span>
                ) : (
                  <>{callRejectedBy.userName} <span style={{ color: 'var(--text-secondary)' }}>rejeitou sua ligacao</span></>
                )}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{callRejectedBy.reason === 'timeout' ? 'Ninguem atendeu em 30 segundos. Quer tentar novamente?' : 'Quer tentar novamente?'}</p>
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <Button onClick={() => void callUser(callRejectedBy.userId, callRejectedBy.mode)}>
                <Fa name="phone" size={14} style={{ marginRight: 8 }} /> Ligar de novo?
              </Button>
              <Button variant="secondary" onClick={dismissRejectedCall}>Desistir?</Button>
            </div>
          </div>
        </div>
      )}
      {updatePercent !== null && !updateDownloadedVersion && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2600, height: 3, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, updatePercent))}%`, background: 'var(--accent)', transition: 'width 0.4s' }} />
        </div>
      )}
      {updateDownloadedVersion && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2100, display: !updateBannerDismissed ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, maxWidth: 400, textAlign: 'center', padding: 20 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--accent)', boxShadow: '0 0 24px color-mix(in srgb, var(--accent) 22%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
              <Fa name="arrow-up" size={32} style={{  color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Atualização pronta</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
                Friends Space {updateDownloadedVersion} já baixou — instale para usar
              </p>
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <Button onClick={() => {
                try { (window as unknown as { electronAPI?: { installUpdate?: () => void } }).electronAPI?.installUpdate?.() } catch { /* silencioso */ }
              }}>
                <Fa name="rotate" size={14} style={{ marginRight: 8 }} /> Instalar e reiniciar
              </Button>
              <Button variant="secondary" onClick={() => setUpdateBannerDismissed(true)}>Depois</Button>
            </div>
          </div>
        </div>
      )}
      {updateDownloadedVersion && updateBannerDismissed && (
        <button
          onClick={() => setUpdateBannerDismissed(false)}
          title={`Instalar Friends Space ${updateDownloadedVersion}`}
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 2500, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, border: '1px solid var(--accent)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', animation: 'fs-blink 1.6s infinite' }}
        >
          <Fa name="rotate" size={14} style={{ color: 'var(--accent)' }} />
          Atualizar app
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
        </button>
      )}
      {staleBuild && !isElectron && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 400, width: '100%', textAlign: 'center', background: 'var(--bg-secondary)', border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--border))', borderRadius: 22, padding: '32px 28px 26px', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
            <img src={assetUrl('friends-space-logo.png')} alt="Friends Space" style={{ height: 44, width: 'auto', maxWidth: '100%', objectFit: 'contain', background: 'transparent', border: 'none', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.45))' }} />
            <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 12%, var(--bg-tertiary))', border: '2px solid var(--accent)', boxShadow: '0 0 24px color-mix(in srgb, var(--accent) 25%, transparent)' }}>
              <Fa name="rotate" size={26} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontSize: 21, fontWeight: 800, fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>Nova versão disponível</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              O site foi atualizado e esta aba ficou velha — a call pode falhar. Atualize para continuar.
            </p>
            <Button onClick={() => window.location.reload()}>
              <Fa name="rotate" size={14} style={{ marginRight: 8 }} /> Atualizar agora
            </Button>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Se não atualizar, pressione Ctrl+F5.</span>
          </div>
        </div>
      )}
      {updateAvailable && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, maxWidth: 400, textAlign: 'center', padding: 20 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--accent)', boxShadow: '0 0 24px color-mix(in srgb, var(--accent) 22%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
              <Fa name="arrow-up" size={32} style={{  color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Nova versão disponível</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
                Friends Space {updateAvailable.latestVersion} já está disponível
              </p>
              {updateAvailable.releaseNotes && (
                <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8, opacity: 0.8 }}>
                  {updateAvailable.releaseNotes}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <Button onClick={() => {
                // Escolher link: Electron no Windows baixa o .exe, no Linux baixa o tar.xz
                const isElectron = typeof window !== 'undefined' && Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron)
                let url = updateAvailable.downloadUrl
                if (isElectron) {
                  let platform = (window as unknown as { electronAPI?: { platform?: string } }).electronAPI?.platform || ''
                  if (!platform && typeof navigator !== 'undefined') {
                    const ua = navigator.userAgent.toLowerCase()
                    platform = ua.includes('linux') ? 'linux' : (ua.includes('mac') ? 'darwin' : 'win32')
                  }
                  if (platform === 'linux' && updateAvailable.downloadUrlLinux) url = updateAvailable.downloadUrlLinux
                  else if (platform === 'darwin' && updateAvailable.downloadUrlMac) url = updateAvailable.downloadUrlMac
                }
                window.open(url, '_blank')
                setUpdateAvailable(null)
              }}>
                <Fa name="download" size={14} style={{ marginRight: 8 }} /> Baixar nova versão
              </Button>
              <Button variant="secondary" onClick={() => setUpdateAvailable(null)}>Agora não</Button>
            </div>
          </div>
        </div>
      )}
      {callActive && !(currentChannel && currentChannel.type === 'voice' && currentChannel.id === callChannelId) && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 2500,
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 999,
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#23a55a', animation: 'pulse 1.2s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            Em chamada{callChannelId && callChannelId !== 'dm' ? ' de voz' : ''}
          </span>
          <Button size="sm" onClick={() => {
            const targetServer = servers.find(s => s.id === callServerId)
            const targetChannel = targetServer?.channels.find(c => c.id === callChannelId)
            if (targetChannel) {
              setCurrentServer(targetServer ?? null)
              setCurrentChannel(targetChannel)
            } else if (callChannelId === 'dm') {
              setShowUsers(true)
              setCurrentServer(null)
            }
          }}>Voltar</Button>
          <Button size="sm" variant="secondary" onClick={endCall}>Sair da chamada</Button>
        </div>
      )}
      <CallAudioLayer />
      {authBlock && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30000, background: '#0b0e13', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{authBlock === 'rede' ? 'Acesso bloqueado' : authBlock === 'expulso' ? 'Conta expulsa' : 'Conta em análise'}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{authBlock === 'rede' ? 'Esta rede/dispositivo foi bloqueado por segurança.' : authBlock === 'expulso' ? 'Esta conta foi removida. Fale com um dev.' : 'Sua conta está em análise. Aguarde um dev aprovar sua entrada.'}</div>
            <button onClick={() => { try { useUserStore.getState().signOut() } catch {} setAuthBlock(null) }} style={{ marginTop: 16, padding: '10px 22px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Sair</button>
          </div>
        </div>
      )}
      {!authBlock && !((activeUser as unknown as { approved?: boolean })?.approved === false) && activeUser ? (
        <>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, minWidth: 0 }} className={`fs-app-shell${isMobile ? ' fs-mobile-root' : ''}`}>
          {isMobile ? (
            <MobileLayout
              activeUser={activeUser}
              currentServer={currentServer}
              currentChannel={currentChannel}
              servers={servers}
              mobileTab={mobileTab}
              topbarHidden={topbarHidden}
              mobileContentRef={mobileContentRef}
              onMobileTabChange={setMobileTab}
              onSelectServer={selectServer}
              onSetCurrentChannel={setCurrentChannel}
              onShowProfile={(tab) => { if (tab === 'astro') { setShowAstro(true); return } setProfileTab(tab || 'perfil'); setShowProfile(true) }}
              onShowPrivacy={() => setShowPrivacy(true)}
              onShowEditProfile={() => setShowEditProfile(true)}
              onSignOut={handleSignOut}
              onShowAbout={() => setShowAbout(true)}
              onShowHelp={() => setShowHelpReport(true)}
              onToast={setToast}
              onCreateServer={() => {
                if (!isDriveConnected()) {
                  setPendingDriveAction(() => () => { setShowCreateServer(true) })
                  setDriveGateOpen(true)
                  return
                }
                setShowCreateServer(true)
              }}
              onJoinServer={() => setShowJoinServer(true)}
              backendOnline={backendOnline}
              totalUnread={totalUnread}
              theme={theme}
              onToggleTheme={toggleTheme}
            />

          ) : (
            <>
            <div className="fs-icon-sidebar">
              <div className="fs-icon-sidebar-top">
                <button
                  className={`fs-nav-item fs-home-btn ${!currentServer ? 'active' : ''}`}
                  onClick={() => { setCurrentServer(null); setShowUsers(false); setCurrentChannel(null) }}
                  title="Amigos"
                >
                  <Fa name="house" size={14} />
                  {totalUnread > 0 && (
                    <span style={navBadgeStyle}>
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                </button>
                {folders.map(folder => {
                  const expanded = expandedFolderId === folder.id
                  const folderServers = servers.filter(s => (folder.serverIds || []).includes(s.id))
                  const unreadCount = unreadForFolder(folder)
                  return (
                    <Fragment key={folder.id}>
                      <button
                        className={`fs-nav-item fs-folder-item ${expanded ? 'active' : ''}`}
                        onClick={() => setExpandedFolderId(expanded ? null : folder.id)}
                        onContextMenu={e => { e.preventDefault(); setFolderMenu({ folder, x: e.clientX, y: e.clientY }) }}
                        title={folder.name}
                      >
                        <Fa name={expanded ? 'folder-open' : 'folder'} size={14} />
                        {unreadCount > 0 && (
                          <span style={navBadgeStyle}>
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </button>
                      {expanded && folderServers.map(server => (
                        <button
                          key={server.id}
                          className={`fs-nav-item fs-server-item fs-folder-server ${currentServer?.id === server.id ? 'active' : ''}`}
                          onClick={() => { selectServer(server) }}
                          onContextMenu={e => { e.preventDefault(); setServerMenu({ server, x: e.clientX, y: e.clientY }) }}
                          title={server.name}
                        >
                          {server.photoUrl ? (
                            <img src={toImageUrl(server.photoUrl)} alt="" />
                          ) : (
                            server.name.charAt(0).toUpperCase()
                          )}
                          {unreadForServer(server) > 0 && (
                            <span style={navBadgeStyle}>
                              {unreadForServer(server) > 99 ? '99+' : unreadForServer(server)}
                            </span>
                          )}
                        </button>
                      ))}
                    </Fragment>
                  )
                })}
                {standaloneServers.map(server => (
                  <button
                    key={server.id}
                    className={`fs-nav-item fs-server-item ${currentServer?.id === server.id ? 'active' : ''}`}
                    onClick={() => { selectServer(server) }}
                    onContextMenu={e => { e.preventDefault(); setServerMenu({ server, x: e.clientX, y: e.clientY }) }}
                    title={server.name}
                  >
                    {server.photoUrl ? (
                      <img src={server.photoUrl} alt="" />
                    ) : (
                      server.name.charAt(0).toUpperCase()
                    )}
                    {unreadForServer(server) > 0 && (
                      <span style={navBadgeStyle}>
                        {unreadForServer(server) > 99 ? '99+' : unreadForServer(server)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="fs-icon-sidebar-bottom">
                <button className="fs-nav-item fs-add-btn" onClick={() => setShowDiscover(true)} title="Descubra">
                  <Fa name="compass" size={14} />
                </button>
                <button className="fs-nav-item fs-folder-add-btn" onClick={() => openFolderModal(null)} title="Criar pasta">
                  <Fa name="folder-plus" size={14} />
                </button>
                <button className="fs-nav-item fs-add-btn" onClick={() => setShowServerSearch(true)} title="Procurar servidor">
                  <Fa name="magnifying-glass" size={14} />
                </button>
                <button className="fs-nav-item fs-add-btn" onClick={() => {
                  if (!isDriveConnected()) {
                    setPendingDriveAction(() => () => setShowCreateServer(true))
                    setDriveGateOpen(true)
                    return
                  }
                  setShowCreateServer(true)
                }} title="Criar servidor">
                  <Fa name="plus" size={14} />
                </button>
                {/* Botao de download do app — só no site (web), nao no desktop */}
                {!isElectron && (
                  <button className="fs-nav-item fs-add-btn" style={{ position: 'relative' }} onClick={() => {
                    try { if (desktopRelease) localStorage.setItem('friends-space:desktop-seen', desktopRelease) } catch { /* silencioso */ }
                    setDesktopSeen(desktopRelease)
                    setShowDownloadApp(true)
                  }} title="Baixar app">
                    <Fa name="download" size={14} />
                    {desktopRelease && desktopSeen !== desktopRelease && (<span className="fs-update-dot" />)}
                  </button>
                )}
              </div>
            </div>
            <div className="fs-main-col" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
            {!controllingCall && (<TopBar
              activeUser={activeUser}
              onShowPrivacy={() => setShowPrivacy(true)}
              onShowEditProfile={() => setShowEditProfile(true)}
              onShowAstro={() => setShowAstro(true)}
              onSignOut={handleSignOut}
              theme={theme}
              onToggleTheme={toggleTheme}
              onShowAbout={() => setShowAbout(true)}
              onShowHelp={() => setShowHelpReport(true)}
              onToast={setToast}
              servers={servers}
              currentServer={currentServer}
              onSelectServer={(s) => { selectServer(s); setShowUsers(false) }}
              onShowUsers={(show) => { setShowUsers(show); if (show) { setShowProfile(false); setCurrentServer(null) } }}
              onCreateServer={() => {
                if (!isDriveConnected()) {
                  setPendingDriveAction(() => () => setShowCreateServer(true))
                  setDriveGateOpen(true)
                  return
                }
                setShowCreateServer(true)
              }}
              onJoinServer={() => setShowJoinServer(true)}
              backendOnline={backendOnline}
            />)}
            <div className="fs-content-row" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
            {currentServer ? (
              <ChannelSidebar server={currentServer} onOpenSettings={openEditServer} />
            ) : showUsers ? (
              <UsersView />
            ) : (
              <FriendsView />
            )}

            {currentChannel && currentChannel.type === 'text' && (
              <ChatView channel={currentChannel} />
            )}

            {currentChannel && currentChannel.type === 'voice' && (
              <VoiceChannelView channel={currentChannel} />
            )}

            {currentServer && !currentChannel && (
              <div className="fs-chat-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: 12 }}>
                <p>Selecione um canal para comecar</p>
                {canManageServer(currentServer, activeUser?.id) ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" size="sm" onClick={() => setShowRoles(true)}><IconShield width={16} height={16} /> Cargos</Button>
                    <Button variant="secondary" size="sm" onClick={openEditServer}><IconPlus width={16} height={16} /> Editar</Button>
                    <Button variant="secondary" size="sm" onClick={copyInvite}><IconLink width={16} height={16} /> Convidar</Button>
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" onClick={copyInvite}><IconLink width={16} height={16} /> Convidar</Button>
                )}
              </div>
            )}
            </div>
            </div>
            </>
          )}
          </div>

          {showProfile && <ProfileView onClose={() => setShowProfile(false)} initialTab={profileTab} />}
          {showAstro && <AstroWindow onClose={() => setShowAstro(false)} />}

          {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}

          {showEditProfile && <EditProfile onClose={() => setShowEditProfile(false)} />}

          {showAstroPlans && <AstroPlansModal onClose={() => setShowAstroPlans(false)} />}

          <SettingsModal />

          <DriveRequiredModal
            open={driveGateOpen}
            required
            onClose={() => { setDriveGateOpen(false); setPendingDriveAction(null) }}
            onConnected={() => {
              setDriveConnected(true)
              setDriveGateOpen(false)
              const action = pendingDriveAction
              setPendingDriveAction(null)
              if (action) action()
            }}
          />

          <DriveRequiredModal
            open={serverDriveModal}
            variant="server"
            onClose={() => setServerDriveModal(false)}
            onConnected={() => { setDriveConnected(true); setServerDriveModal(false) }}
          />

          <DriveRequiredModal
            open={editServerDriveModal}
            variant="server"
            onClose={() => { setEditServerDriveModal(false); pendingServerDrive.current = null }}
            onConnected={() => {
              setDriveConnected(true)
              setEditServerDriveModal(false)
              const action = pendingServerDrive.current
              pendingServerDrive.current = null
              if (action === 'icon') serverIconInputRef.current?.click()
              else if (action === 'banner') serverBannerInputRef.current?.click()
              else if (action === 'save') void handleSaveServer()
            }}
          />

          <UserContextMenu />

          {callChannelId === 'dm' && !(currentServer && currentChannel?.type === 'voice') && <CallView />}

          <Modal open={showSearch} onClose={() => { setShowSearch(false); setSearchQuery('') }} title="Pesquisar">
            <Input value={searchQuery} onChange={setSearchQuery} placeholder="Nome, codigo de usuario ou convite" />
            <div style={{ marginTop: 16, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {searchLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Pesquisando...</p>}
              {!searchLoading && searchQuery.trim().length >= 2 && searchResults.users.length === 0 && searchResults.servers.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum usuario ou servidor encontrado.</p>
              )}
              {searchResults.users.map(user => (
                <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                  <Avatar src={user.photoUrl} name={user.name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{user.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Codigo: {user.friendCode}</div>
                  </div>
                  <Button size="sm" onClick={async () => {
                    const actor = currentUser || restoredUser
                    if (!actor) return
                    const added = await addFriendById(actor.id, user.id)
                    if (added.ok) { setShowSearch(false); return }
                    if (added.error) alert(added.error)
                  }}>Adicionar</Button>
                </div>
              ))}
              {searchResults.servers.map(server => (
                <div key={server.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: server.accentColor || 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{server.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{server.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Convite: {server.inviteCode}</div>
                  </div>
                  <Button size="sm" onClick={async () => {
                    const actor = currentUser || restoredUser
                    if (!actor) return
                    const joined = await joinServer(server.inviteCode, actor.id)
                    if (joined.ok) { setShowSearch(false); return }
                    alert(joined.error || 'Não foi possível entrar no servidor.')
                  }}>Entrar</Button>
                </div>
              ))}
            </div>
          </Modal>

          <CreateServerModal
            open={showCreateServer}
            onClose={() => setShowCreateServer(false)}
            onCreate={handleCreateServer}
          />

          {inviteServer && (
            <ServerInviteModal
              open={Boolean(inviteServer)}
              onClose={() => setInviteServer(null)}
              server={inviteServer}
              onToast={setToast}
            />
          )}

          {showDiscover && <DiscoverView onClose={() => setShowDiscover(false)} />}

          <Modal open={showJoinServer} onClose={() => setShowJoinServer(false)} title="Entrar em Servidor">
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>Digite o codigo de convite do servidor.</p>
            <Input value={inviteCode} onChange={setInviteCode} placeholder="Codigo de convite" style={{ marginBottom: 12 }} onKeyDown={e => { if (e.key === 'Enter') handleJoinServer() }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setShowJoinServer(false)}>Cancelar</Button>
              <Button onClick={handleJoinServer}>Entrar</Button>
            </div>
          </Modal>

          <Modal open={showServerSearch} onClose={() => { setShowServerSearch(false); setServerQuery('') }} title="Procurar servidor">
            <Input value={serverQuery} onChange={setServerQuery} placeholder="Nome ou ID do servidor" />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Busca por nome ou ID. Entre em um servidor para conversar.</p>
            <div style={{ marginTop: 14, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {serverLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Procurando...</p>}
              {!serverLoading && serverQuery.trim().length >= 2 && serverResults.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum servidor encontrado.</p>
              )}
              {serverResults.map(server => {
                const alreadyJoined = servers.some(s => s.id === server.id)
                return (
                  <div key={server.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: server.accentColor || 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{server.name.charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{server.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>ID: {server.id.slice(0, 10)} · Convite: {server.inviteCode}</div>
                    </div>
                    {alreadyJoined ? (
                      <Button size="sm" variant="secondary" onClick={() => { selectServer(server); setShowServerSearch(false); setServerQuery('') }}>Abrir</Button>
                    ) : (
                      <Button size="sm" onClick={async () => {
                        const actor = currentUser || restoredUser
                        if (!actor) return
                        if (!isDriveConnected()) {
                          setPendingDriveAction(() => () => { void (async () => {
                            const joined = await joinServer(server.inviteCode, actor.id)
                            if (joined.ok) { setShowServerSearch(false); setServerQuery(''); setCurrentServer(server); return }
                            alert(joined.error || 'Não foi possível entrar no servidor.')
                          })() })
                          setDriveGateOpen(true)
                          return
                        }
                        const joined = await joinServer(server.inviteCode, actor.id)
                        if (joined.ok) { setShowServerSearch(false); setServerQuery(''); setCurrentServer(server); return }
                        alert(joined.error || 'Não foi possível entrar no servidor.')
                      }}>Entrar</Button>
                    )}
                  </div>
                )
              })}
            </div>
          </Modal>

          <Modal open={showRoles} onClose={() => setShowRoles(false)} title="Cargos">
            <div style={{ marginBottom: 16 }}>
              {currentServer?.roles.map(role => (
                <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', marginBottom: 4 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: role.color }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{role.name}</span>
                  <IconCrown width={14} height={14} style={{ color: 'var(--warning)', marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Input value={roleName} onChange={setRoleName} placeholder="Nome do cargo" style={{ flex: 1 }} />
              <input type="color" value={roleColor} onChange={e => setRoleColor(e.target.value)} style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
            </div>
            <Button onClick={handleAddRole} size="sm"><IconPlus width={14} height={14} /> Adicionar Cargo</Button>
          </Modal>

          {deepPostId && (
            <PostViewModal
              postId={deepPostId}
              onClose={() => {
                setDeepPostId(null)
                try { history.replaceState(null, '', window.location.pathname) } catch {}
              }}
            />
          )}
          {showRecovery && <DataRecovery onClose={() => setShowRecovery(false)} />}
          {showEditServer && (
          <Suspense fallback={null}>
          <ServerSettingsWindow
            server={editingServer || currentServer}
            activeUserId={activeUser?.id ?? restoredUser?.id}
            editName={editServerName}
            setEditName={setEditServerName}
            editPhoto={editServerPhoto}
            editBanner={editServerBanner}
            editDesc={editServerDesc}
            setEditDesc={setEditServerDesc}
            editColor={editServerColor}
            setEditColor={setEditServerColor}
            editCallAccess={editCallAccess}
            setEditCallAccess={setEditCallAccess}
            editCallPassword={editCallPassword}
            setEditCallPassword={setEditCallPassword}
            editStaffIds={editStaffIds}
            setEditStaffIds={setEditStaffIds}
            onSave={() => void handleSaveServer()}
            onDelete={() => void handleDeleteServer()}
            onClose={() => { setShowEditServer(false); setEditError('') }}
            onRequestIcon={requestServerIcon}
            onRequestBanner={requestServerBanner}
            onIconFile={handleServerIconFile}
            onBannerFile={handleServerBannerFile}
            iconInputRef={serverIconInputRef}
            bannerInputRef={serverBannerInputRef}
            driveConnected={driveConnected}
            driveBusy={driveBusy}
            onToggleDrive={() => void handleToggleDrive()}
            error={editError}
          />

          </Suspense>          )}

          {serverMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={() => setServerMenu(null)} />
              <div style={{
                position: 'fixed', left: serverMenu.x, top: serverMenu.y, zIndex: 10000,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 4, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <button onClick={() => { selectServer(serverMenu.server); setServerMenu(null); setShowUsers(false) }}
                  style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Fa name="right-to-bracket" size={14} /> Abrir servidor
                </button>
                <button onClick={() => shareServerLink(serverMenu.server)}
                  style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Fa name="share-nodes" size={14} /> Compartilhar link de convite
                </button>
                {!canDeleteServer(serverMenu.server, activeUser?.id) && (
                  <button onClick={() => void handleLeaveServer()}
                    style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: '#f23f43', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Fa name="right-from-bracket" size={14} /> Sair do servidor
                  </button>
                )}
                {canManageServer(serverMenu.server, activeUser?.id) && (
                  <button onClick={() => { setCurrentServer(serverMenu.server); openEditServer(serverMenu.server); setServerMenu(null) }}
                    style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Fa name="gear" size={14} /> Configuracoes
                  </button>
                )}
                <button onClick={() => { setReportServer(serverMenu.server); setServerMenu(null) }}
                  style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: '#f23f43', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Fa name="flag" size={14} /> Denunciar servidor
                </button>
              </div>
            </>
          )}

          {folderMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={() => setFolderMenu(null)} />
              <div style={{
                position: 'fixed', left: folderMenu.x, top: folderMenu.y, zIndex: 10000,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 4, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {folderItems(folderMenu.folder).map(item => (
                  <button key={item.label} onClick={item.onClick}
                    style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: item.danger ? '#f23f43' : 'var(--text-primary)', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <FolderModal
            open={folderModal.open}
            folder={folderModal.folder}
            servers={servers}
            onClose={() => setFolderModal({ folder: null, open: false })}
            onSave={(name, serverIds) => void handleSaveFolder(name, serverIds)}
          />

          <FolderShareModal
            open={folderShare !== null}
            folder={folderShare}
            onClose={() => setFolderShare(null)}
            onShare={handleShareFolder}
          />

          <ReportModal
            open={reportServer !== null}
            type="server"
            target={reportServer ? { id: reportServer.id, name: reportServer.name } : null}
            onClose={() => setReportServer(null)}
          />
        </>
      ) : (
        <GoogleLoginView />
      )}


      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 20000,
          background: '#23a55a', color: '#fff', padding: '10px 18px', borderRadius: 8,
          fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}

      <NotificationToasts />

      <AboutModal
        open={showAbout}
        onClose={() => setShowAbout(false)}
      />
      <WelcomeModal
        open={showWelcome}
        platform={welcomePlatform}
        onClose={() => setShowWelcome(false)}
        onHelp={() => setShowHelpReport(true)}
        onExplore={() => setShowDiscover(true)}
      />
      <HelpReportModal open={showHelpReport} onClose={() => setShowHelpReport(false)} />
      <DownloadAppModal open={showDownloadApp} onClose={() => setShowDownloadApp(false)} />
    </div>
  )
}

export default App
