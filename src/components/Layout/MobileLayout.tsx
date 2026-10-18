import type { Channel, Server, User } from '../../types'
import { TopBar } from '../Layout/TopBar'
import { ChannelSidebar } from '../Layout/ChannelSidebar'
import { ChatView } from '../Chat/ChatView'
import { VoiceChannelView } from '../Call/VoiceChannelView'
import { FriendsView } from '../Friends/FriendsView'
import { MobileDiscover } from '../Social/MobileDiscover'
import { FeedView } from '../Social/FeedView'
import { Compass, Plus, Mail, MessageCircle, CircleUser, Pen, Settings, LogOut, Newspaper, Mic, MicOff, PhoneOff } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { useCallStore } from '../../stores/callStore'
import { Button } from '../ui/Button'

type ProfileTab = 'perfil' | 'social' | 'privacidade' | 'astro' | 'interface'

interface MobileLayoutProps {
  activeUser: User | null
  currentServer: Server | null
  currentChannel: Channel | null
  servers: Server[]
  mobileTab: 'feed' | 'friends' | 'explore' | 'me'
  topbarHidden: boolean
  mobileContentRef: React.RefObject<HTMLDivElement | null>
  onMobileTabChange: (t: 'feed' | 'friends' | 'explore' | 'me') => void
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

export function MobileLayout({
  activeUser, currentServer, currentChannel, servers, mobileTab,
  topbarHidden, mobileContentRef, onMobileTabChange,
  onSelectServer, onSetCurrentChannel, onShowProfile, onShowPrivacy, onShowEditProfile,
  onSignOut, onShowAbout, onShowHelp, onToast,
  onCreateServer, onJoinServer, onDriveRequired, backendOnline, totalUnread, theme, onToggleTheme,
}: MobileLayoutProps) {
  const homeActive = !currentServer && !currentChannel
  const channelActive = !!currentChannel
  const serverNoChannel = !!currentServer && !currentChannel
  const activeCall = useCallStore(s => s.activeCall)
  const callChannelId = useCallStore(s => s.channelId)
  const callMuted = useCallStore(s => s.muted)
  const toggleMute = useCallStore(s => s.toggleMute)
  const endCall = useCallStore(s => s.endCall)

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
              {mobileTab === 'feed' && <FeedView onDriveRequired={onDriveRequired} />}
              {mobileTab === 'friends' && <FriendsView />}
              {mobileTab === 'explore' && <MobileDiscover />}
              {mobileTab === 'me' && (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: 28 }}>
                  <div style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--accent)' }}>
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
            {activeCall && (currentChannel as Channel | null)?.id !== callChannelId && (() => {
              let ch = null as null | { id: string; name: string }
              let srv = null as null | Server
              for (const s of servers) {
                const f = ((s.channels || []) as Array<{ id: string; name: string }>).find(c => c.id === callChannelId)
                if (f) { ch = f; srv = s; break }
              }
              if (!ch) return null
              return (
                <button
                  onClick={() => { if (srv) onSelectServer(srv); onSetCurrentChannel(ch as Channel) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'var(--accent)', color: '#04120a', border: 'none', borderTop: '1px solid rgba(0,0,0,0.2)', padding: '10px 14px', cursor: 'pointer' }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#04120a', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Em chamada · {ch.name}
                  </span>
                  <span
                    role="button" tabIndex={0}
                    onClick={e => { e.stopPropagation(); try { toggleMute() } catch { } }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); try { toggleMute() } catch { } } }}
                    title={callMuted ? 'Ativar microfone' : 'Mutar'}
                    style={{ display: 'flex', padding: 6, borderRadius: 8, background: 'rgba(0,0,0,0.18)' }}
                  >
                    {callMuted ? <MicOff size={15} /> : <Mic size={15} />}
                  </span>
                  <span
                    role="button" tabIndex={0}
                    onClick={e => { e.stopPropagation(); try { endCall() } catch { } }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); try { endCall() } catch { } } }}
                    title="Sair da call"
                    style={{ display: 'flex', padding: 6, borderRadius: 8, background: 'rgba(0,0,0,0.28)' }}
                  >
                    <PhoneOff size={15} />
                  </span>
                </button>
              )
            })()}
            <div className="fs-mobile-tabbar">
              <button className={mobileTab === 'feed' ? 'active' : ''} onClick={() => onMobileTabChange('feed')}>
                <Newspaper size={16} strokeWidth={2} /><span>Início</span>
              </button>
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