import type { Channel, Server, User } from '../../types'
import type { ProfileTab } from '../Profile/ProfileView'
import { TopBar } from '../Layout/TopBar'
import { ChannelSidebar } from '../Layout/ChannelSidebar'
import { ChatView } from '../Chat/ChatView'
import { VoiceChannelView } from '../Call/VoiceChannelView'
import { FriendsView } from '../Friends/FriendsView'
import { VerifiedServers } from '../Home/VerifiedServers'
import { Compass, Plus, Mail, MessageCircle, CircleUser, Pen, Settings, LogOut } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'

interface MobileLayoutProps {
  activeUser: User | null
  currentServer: Server | null
  currentChannel: Channel | null
  servers: Server[]
  mobileTab: 'friends' | 'explore' | 'me'
  topbarHidden: boolean
  mobileContentRef: React.RefObject<HTMLDivElement | null>
  onMobileTabChange: (t: 'friends' | 'explore' | 'me') => void
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
  backendOnline: boolean
  totalUnread: number
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

export function MobileLayout({
  activeUser, currentServer, currentChannel, servers, mobileTab,
  topbarHidden, mobileContentRef, onMobileTabChange,
  onSelectServer, onSetCurrentChannel, onShowProfile, onShowPrivacy, onShowEditProfile,
  onSignOut, onShowAbout, onShowHelp, onToast,
  onCreateServer, onJoinServer, backendOnline, totalUnread, theme, onToggleTheme,
}: MobileLayoutProps) {
  const homeActive = !currentServer && !currentChannel
  const channelActive = !!currentChannel
  const serverNoChannel = !!currentServer && !currentChannel

  return (
    <div className="fs-mobile-root">
      {/* Trilho de servidores (esquerda) — sempre visivel, estilo Discord */}
      <div className="fs-mobile-rail">
        <button
          className={`fs-mobile-rail-item ${homeActive ? 'active' : ''}`}
          onClick={() => { onSelectServer(null); onSetCurrentChannel(null) }}
          title="Inicio"
        >
          <Compass size={16} strokeWidth={2} />
          {totalUnread > 0 && <span className="fs-mobile-rail-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
        </button>
        <div className="fs-mobile-rail-divider" />
        {servers.map(s => (
          <button
            key={s.id}
            className={`fs-mobile-rail-item ${currentServer?.id === s.id ? 'active' : ''}`}
            onClick={() => { onSelectServer(s); onSetCurrentChannel(null) }}
            title={s.name}
          >
            <Avatar src={s.photoUrl || ''} name={s.name} size={32} />
          </button>
        ))}
        <div className="fs-mobile-rail-spacer" />
        <button className="fs-mobile-rail-item fs-mobile-rail-add" onClick={onCreateServer} title="Criar servidor">
          <Plus size={16} strokeWidth={2.5} />
        </button>
        <button className="fs-mobile-rail-item" onClick={onJoinServer} title="Entrar em servidor">
          <Mail size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Conteudo principal */}
      <div className="fs-mobile-main">
        {channelActive ? (
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
              {currentChannel.type === 'text' && <ChatView channel={currentChannel} />}
              {currentChannel.type === 'voice' && <VoiceChannelView channel={currentChannel} />}
            </div>
          </>
        ) : serverNoChannel ? (
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
          /* Home: Amigos / Explorar / Voce */
          <>
            <div className="fs-mobile-tab-content">
              {mobileTab === 'friends' && <FriendsView />}
              {mobileTab === 'explore' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                  <VerifiedServers />
                </div>
              )}
              {mobileTab === 'me' && (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: 28 }}>
                  <div style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--accent)' }}>
                    <Avatar src={activeUser?.photoUrl || ''} name={activeUser?.name || 'U'} size={96} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{activeUser?.name || 'Usuário'}</h2>
                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>@{activeUser?.friendCode || 'usuario'}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 300 }}>
                    <Button onClick={onShowEditProfile}><Pen size={14} strokeWidth={2} style={{ marginRight: 8 }} /> Editar perfil</Button>
                    <Button variant="secondary" onClick={() => onShowProfile()}><Settings size={14} strokeWidth={2} style={{ marginRight: 8 }} /> Configurações do perfil</Button>
                    <Button variant="danger" onClick={onSignOut}><LogOut size={14} strokeWidth={2} style={{ marginRight: 8 }} /> Sair</Button>
                  </div>
                </div>
              )}
            </div>
            <div className="fs-mobile-tabbar">
              <button className={mobileTab === 'friends' ? 'active' : ''} onClick={() => onMobileTabChange('friends')}>
                <MessageCircle size={16} strokeWidth={2} /><span>Amigos</span>
              </button>
              <button className={mobileTab === 'explore' ? 'active' : ''} onClick={() => onMobileTabChange('explore')}>
                <Compass size={16} strokeWidth={2} /><span>Explorar</span>
              </button>
              <button className={mobileTab === 'me' ? 'active' : ''} onClick={() => onMobileTabChange('me')}>
                <CircleUser size={16} strokeWidth={2} /><span>Você</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}