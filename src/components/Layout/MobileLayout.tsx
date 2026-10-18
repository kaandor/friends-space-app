import type { Channel, Server, User } from '../../types'
import { useEffect, useState } from 'react'
import { TopBar } from '../Layout/TopBar'
import { ChannelSidebar } from '../Layout/ChannelSidebar'
import { ChatView } from '../Chat/ChatView'
import { VoiceChannelView } from '../Call/VoiceChannelView'
import { FriendsView } from '../Friends/FriendsView'
import { MobileDiscover } from '../Social/MobileDiscover'
import { FeedView } from '../Social/FeedView'
import {
  LayoutGrid, MessageCircle, Bell, Plus, Mail, Compass, Newspaper,
  ChevronRight, ArrowLeft, Pen, Settings, Shield, Sparkles, Sun, Moon,
  CircleHelp, Info, LogOut, Mic, MicOff, PhoneOff,
} from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { useCallStore } from '../../stores/callStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useUserStore } from '../../stores/userStore'

export type MobileTab = 'servers' | 'messages' | 'notifications' | 'you'
type HubView = 'grid' | 'discover' | 'news'
type ProfileTab = 'perfil' | 'social' | 'privacidade' | 'astro' | 'interface'

interface MobileLayoutProps {
  activeUser: User | null
  currentServer: Server | null
  currentChannel: Channel | null
  servers: Server[]
  mobileTab: MobileTab
  topbarHidden: boolean
  mobileContentRef: React.RefObject<HTMLDivElement | null>
  onMobileTabChange: (t: MobileTab) => void
  onSelectServer: (s: Server | null) => void
  onSetCurrentChannel: (c: Channel | null) => void
  onShowProfile: (tab?: ProfileTab) => void
  onShowPrivacy: () => void
  onShowEditProfile: () => void
  onSignOut: () => void
  onShowAbout: () => void
  onShowHelp: () => void
  onToast: (msg: string) => void
  onCreateServer: () => void
  onJoinServer: () => void
  onDriveRequired: () => void
  backendOnline: boolean
  totalUnread: number
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'agora'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} h`
  return new Date(ts).toLocaleDateString()
}

export function MobileLayout({
  activeUser, currentServer, currentChannel, servers, mobileTab,
  topbarHidden, mobileContentRef, onMobileTabChange,
  onSelectServer, onSetCurrentChannel, onShowProfile, onShowPrivacy, onShowEditProfile,
  onSignOut, onShowAbout, onShowHelp, onToast,
  onCreateServer, onJoinServer, onDriveRequired, backendOnline, totalUnread, theme, onToggleTheme,
}: MobileLayoutProps) {
  // Hub de servidores (aba Servidores): grade principal / Descobrir / Novidades
  const [hubView, setHubView] = useState<HubView>('grid')
  const [addSheet, setAddSheet] = useState(false)
  const activeCall = useCallStore(s => s.activeCall)
  const callChannelId = useCallStore(s => s.channelId)
  const callMuted = useCallStore(s => s.muted)
  const toggleMute = useCallStore(s => s.toggleMute)
  const endCall = useCallStore(s => s.endCall)
  const { notifications, unread, markAllRead } = useNotificationStore()
  const users = useUserStore(s => s.users)

  // Descobrir (evento global): abre a sub-tela dentro da aba Servidores.
  useEffect(() => {
    const onDiscover = () => { setHubView('discover'); onMobileTabChange('servers') }
    window.addEventListener('friends-space:open-discover', onDiscover)
    return () => window.removeEventListener('friends-space:open-discover', onDiscover)
  }, [onMobileTabChange])

  const inChannelView = mobileTab === 'servers' && !!currentChannel
  const inServerListView = mobileTab === 'servers' && !currentChannel && !!currentServer
  const callOnThisChannel = Boolean(activeCall) && (currentChannel as Channel | null)?.id === callChannelId

  const openNotification = (n: { type?: string; data?: unknown }) => {
    const dmId = String((n.data as Record<string, unknown> | undefined)?.['fromId'] || '')
    const isDm = String(n.type || '') === 'dm' || String(n.type || '') === 'mention'
    if (!isDm || !dmId) return
    const user = users.find(u => u.id === dmId)
    if (!user) return
    try { window.dispatchEvent(new CustomEvent('friends-space:open-dm', { detail: { user } })) } catch { }
  }

  return (
    <div className="fs-mobile-root">
      <div className="fs-mobile-main">
        {inChannelView ? (
          <>
            <div className={`fs-topbar-scroll ${topbarHidden ? 'hidden' : ''}`}>
              <TopBar
                activeUser={activeUser}
                onShowPrivacy={onShowPrivacy}
                onShowEditProfile={onShowEditProfile}
                onShowAstro={() => onShowProfile('astro')}
                onSignOut={onSignOut}
                theme={theme}
                onToggleTheme={onToggleTheme}
                onMenuClick={() => onSetCurrentChannel(null)}
                menuIcon="back"
                onShowAbout={onShowAbout}
                onShowHelp={onShowHelp}
                onToast={onToast}
                servers={servers}
                currentServer={currentServer}
                onSelectServer={onSelectServer}
                onShowUsers={() => {}}
                onCreateServer={onCreateServer}
                onJoinServer={onJoinServer}
                backendOnline={backendOnline}
              />
            </div>
            <div className="fs-mobile-content" ref={mobileContentRef}>
              {currentChannel?.type === 'text' && <ChatView channel={currentChannel} />}
              {currentChannel?.type === 'voice' && <VoiceChannelView channel={currentChannel} />}
            </div>
          </>
        ) : inServerListView ? (
          <>
            <div className={`fs-topbar-scroll ${topbarHidden ? 'hidden' : ''}`}>
              <TopBar
                activeUser={activeUser}
                onShowPrivacy={onShowPrivacy}
                onShowEditProfile={onShowEditProfile}
                onShowAstro={() => onShowProfile('astro')}
                onSignOut={onSignOut}
                theme={theme}
                onToggleTheme={onToggleTheme}
                onShowAbout={onShowAbout}
                onShowHelp={onShowHelp}
                onToast={onToast}
                servers={servers}
                currentServer={currentServer}
                onSelectServer={onSelectServer}
                onShowUsers={() => {}}
                onCreateServer={onCreateServer}
                onJoinServer={onJoinServer}
                backendOnline={backendOnline}
              />
            </div>
            <div className="fs-mobile-channel-list">
              <ChannelSidebar server={currentServer} onOpenSettings={() => {}} onChannelSelect={() => {}} />
            </div>
          </>
        ) : (
          <div className="fs-mobile-tab-content">
            {mobileTab === 'servers' && hubView === 'grid' && (
              <div className="fs-mob-pane">
                <div className="fs-mob-tabhead">
                  <h2>Servidores</h2>
                  <button className="fs-mob-headbtn" onClick={() => setAddSheet(true)} title="Adicionar servidor" aria-label="Adicionar servidor">
                    <Plus size={19} strokeWidth={2.5} />
                  </button>
                </div>
                <div className="fs-mob-grid">
                  <button className="fs-mob-tile" onClick={() => setHubView('discover')}>
                    <span className="fs-mob-tile-icn special"><Compass size={23} strokeWidth={2} /></span>
                    <span className="fs-mob-tile-name">Descobrir</span>
                  </button>
                  <button className="fs-mob-tile" onClick={() => setHubView('news')}>
                    <span className="fs-mob-tile-icn news"><Newspaper size={23} strokeWidth={2} /></span>
                    <span className="fs-mob-tile-name">Novidades</span>
                  </button>
                  {servers.map(s => (
                    <button
                      key={s.id}
                      className={`fs-mob-tile ${currentServer?.id === s.id ? 'is-current' : ''}`}
                      onClick={() => onSelectServer(s)}
                    >
                      <span className="fs-mob-tile-icn"><Avatar src={s.photoUrl || ''} name={s.name} size={54} /></span>
                      <span className="fs-mob-tile-name">{s.name}</span>
                    </button>
                  ))}
                  <button className="fs-mob-tile" onClick={() => setAddSheet(true)}>
                    <span className="fs-mob-tile-icn add"><Plus size={23} strokeWidth={2.5} /></span>
                    <span className="fs-mob-tile-name">Adicionar</span>
                  </button>
                </div>
              </div>
            )}

            {mobileTab === 'servers' && hubView !== 'grid' && (
              <div className="fs-mob-pane">
                <div className="fs-mob-tabhead">
                  <button className="fs-mob-back" onClick={() => setHubView('grid')} aria-label="Voltar">
                    <ArrowLeft size={19} strokeWidth={2.5} />
                  </button>
                  <h2>{hubView === 'discover' ? 'Descobrir' : 'Novidades'}</h2>
                </div>
                <div className="fs-mob-subview">
                  {hubView === 'discover' && <MobileDiscover />}
                  {hubView === 'news' && <FeedView onDriveRequired={onDriveRequired} />}
                </div>
              </div>
            )}

            {mobileTab === 'messages' && <FriendsView />}

            {mobileTab === 'notifications' && (
              <div className="fs-mob-pane">
                <div className="fs-mob-tabhead">
                  <h2>Notificações</h2>
                  {unread > 0 && (
                    <button className="fs-mob-textbtn" onClick={() => void markAllRead()}>Marcar todas como lidas</button>
                  )}
                </div>
                <div className="fs-mob-list">
                  {notifications.length === 0 && <div className="fs-mob-empty">Tudo em dia por aqui.</div>}
                  {notifications.slice(0, 40).map(n => (
                    <button
                      key={n.id}
                      className={`fs-mob-notif ${n.read ? '' : 'is-unread'}`}
                      onClick={() => openNotification(n)}
                    >
                      <Avatar src={n.fromPhoto} name={n.fromName} size={36} />
                      <span className="fs-mob-notif-copy">
                        <strong>{n.title}</strong>
                        {n.body ? <small>{n.body}</small> : null}
                        <em>{timeAgo(Number(n.createdAt) || 0)}</em>
                      </span>
                      {!n.read && <span className="fs-mob-notif-dot" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mobileTab === 'you' && (
              <div className="fs-mob-pane fs-mob-you">
                <div className="fs-mob-you-card">
                  <span className="fs-mob-you-avatar">
                    <Avatar src={activeUser?.photoUrl || ''} name={activeUser?.name || 'U'} size={72} />
                  </span>
                  <h2>{activeUser?.name || 'Usuário'}</h2>
                  <span className="fs-mob-you-handle">@{activeUser?.friendCode || 'usuario'}</span>
                </div>
                <div className="fs-mob-rows">
                  <button className="fs-mob-row" onClick={() => onShowEditProfile()}>
                    <Pen size={17} strokeWidth={2} /><span>Editar perfil</span><ChevronRight size={16} />
                  </button>
                  <button className="fs-mob-row" onClick={() => onShowProfile()}>
                    <Settings size={17} strokeWidth={2} /><span>Configurações do perfil</span><ChevronRight size={16} />
                  </button>
                  <button className="fs-mob-row" onClick={onShowPrivacy}>
                    <Shield size={17} strokeWidth={2} /><span>Privacidade</span><ChevronRight size={16} />
                  </button>
                  <button className="fs-mob-row" onClick={() => onShowProfile('astro')}>
                    <Sparkles size={17} strokeWidth={2} /><span>Astro</span><ChevronRight size={16} />
                  </button>
                  <button className="fs-mob-row" onClick={onToggleTheme}>
                    {theme === 'dark' ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
                    <span>Alternar tema</span><ChevronRight size={16} />
                  </button>
                  <button className="fs-mob-row" onClick={onShowHelp}>
                    <CircleHelp size={17} strokeWidth={2} /><span>Central de Ajuda</span><ChevronRight size={16} />
                  </button>
                  <button className="fs-mob-row" onClick={onShowAbout}>
                    <Info size={17} strokeWidth={2} /><span>Sobre o Friends Space</span><ChevronRight size={16} />
                  </button>
                  <button className="fs-mob-row is-danger" onClick={onSignOut}>
                    <LogOut size={17} strokeWidth={2} /><span>Sair</span><ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeCall && !callOnThisChannel && (() => {
          let ch = null as null | { id: string; name: string }
          let srv = null as null | Server
          for (const s of servers) {
            const f = ((s.channels || []) as Array<{ id: string; name: string }>).find(c => c.id === callChannelId)
            if (f) { ch = f; srv = s; break }
          }
          if (!ch) return null
          return (
            <button
              className="fs-mob-callpill"
              onClick={() => { onMobileTabChange('servers'); if (srv) onSelectServer(srv); onSetCurrentChannel(ch as Channel) }}
            >
              <span className="fs-mob-callpill-dot" />
              <span className="fs-mob-callpill-name">Em chamada · {ch.name}</span>
              <span
                role="button" tabIndex={0}
                onClick={e => { e.stopPropagation(); try { toggleMute() } catch { } }}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); try { toggleMute() } catch { } } }}
                title={callMuted ? 'Ativar microfone' : 'Mutar'}
                className="fs-mob-callpill-act"
              >
                {callMuted ? <MicOff size={15} /> : <Mic size={15} />}
              </span>
              <span
                role="button" tabIndex={0}
                onClick={e => { e.stopPropagation(); try { endCall() } catch { } }}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); try { endCall() } catch { } } }}
                title="Sair da call"
                className="fs-mob-callpill-act danger"
              >
                <PhoneOff size={15} />
              </span>
            </button>
          )
        })()}

        <nav className="fs-mobile-tabbar">
          <button className={mobileTab === 'servers' ? 'active' : ''} onClick={() => onMobileTabChange('servers')}>
            <LayoutGrid size={22} strokeWidth={2} /><span>Servidores</span>
          </button>
          <button className={mobileTab === 'messages' ? 'active' : ''} onClick={() => onMobileTabChange('messages')}>
            <span className="fs-mob-tab-icon">
              <MessageCircle size={22} strokeWidth={2} />
              {totalUnread > 0 && <i className="fs-mob-badge">{totalUnread > 99 ? '99+' : totalUnread}</i>}
            </span>
            <span>Mensagens</span>
          </button>
          <button className={mobileTab === 'notifications' ? 'active' : ''} onClick={() => onMobileTabChange('notifications')}>
            <span className="fs-mob-tab-icon">
              <Bell size={22} strokeWidth={2} />
              {unread > 0 && <i className="fs-mob-badge">{unread > 99 ? '99+' : unread}</i>}
            </span>
            <span>Notificações</span>
          </button>
          <button className={mobileTab === 'you' ? 'active' : ''} onClick={() => onMobileTabChange('you')}>
            <span className="fs-mob-tab-avatar">
              <Avatar src={activeUser?.photoUrl || ''} name={activeUser?.name || 'U'} size={24} />
            </span>
            <span>Você</span>
          </button>
        </nav>
      </div>

      {addSheet && (
        <div className="fs-mob-sheet-backdrop" onClick={() => setAddSheet(false)}>
          <div className="fs-mob-sheet fs-modal-in" onClick={e => e.stopPropagation()}>
            <span className="fs-mob-sheet-grab" />
            <h3>Adicionar servidor</h3>
            <button className="fs-mob-sheet-opt" onClick={() => { setAddSheet(false); onCreateServer() }}>
              <span className="fs-mob-sheet-icn accent"><Plus size={19} strokeWidth={2.5} /></span>
              <span className="fs-mob-sheet-copy">
                <strong>Criar um servidor</strong>
                <small>Comece do zero — canais e cargos já vêm prontos.</small>
              </span>
            </button>
            <button className="fs-mob-sheet-opt" onClick={() => { setAddSheet(false); onJoinServer() }}>
              <span className="fs-mob-sheet-icn"><Mail size={19} strokeWidth={2} /></span>
              <span className="fs-mob-sheet-copy">
                <strong>Entrar com convite</strong>
                <small>Cole um código ou link de convite.</small>
              </span>
            </button>
            <button className="fs-mob-sheet-cancel" onClick={() => setAddSheet(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
