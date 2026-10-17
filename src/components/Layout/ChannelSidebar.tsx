import { useState, useEffect } from 'react'
import type { Server, Channel, ServerCategory, CallSession } from '../../types'
import { Hash, Volume2, Headphones, Megaphone, CalendarDays, ChevronRight, ChevronDown, Pen, Folder, Trash2 } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { VoicePanel } from '../Call/VoicePanel'
import { IconAdd, IconSettings, IconMic, IconMute, IconHeadphone, IconDeafen, IconHome } from '../../utils/icons'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { useCallStore } from '../../stores/callStore'
import { useUserMenuStore } from '../../stores/userMenuStore'
import { toImageUrl } from '../../services/driveService'
import { canManageServer } from '../../config/permissions'
import { EventsModal } from '../Servers/EventsModal'
import { ServerPostModal } from '../Social/ServerPostModal'
import { CreateChannelModal, CreateCategoryModal, RenameCategoryModal, RenameChannelModal } from '../Servers/CreateChannelModal'

interface ChannelSidebarProps {
  server: Server
  onOpenSettings: () => void
  onChannelSelect?: () => void
  onReturnToCall?: () => void
}

export function ChannelSidebar({ server, onOpenSettings, onChannelSelect, onReturnToCall }: ChannelSidebarProps) {
  const { currentChannel, setCurrentChannel, addChannel, renameChannel, deleteChannel, addCategory, renameCategory, deleteCategory, updateServer } = useServerStore()
  const { currentUser, users: allUsers } = useUserStore()
  const [channelSessions, setChannelSessions] = useState<CallSession[]>([])
  useEffect(() => {
    let alive = true
    const fetchSessions = () => {
      useCallStore.getState().loadCallSessions(server.id).then(sessions => {
        if (alive) setChannelSessions(sessions.filter(s => s.active))
      }).catch(() => { })
    }
    fetchSessions()
    const t = window.setInterval(fetchSessions, 5000)
    return () => { alive = false; window.clearInterval(t) }
  }, [server.id])
  const { open: openUserMenu } = useUserMenuStore()
  const { muted, deafened, activeCall, channelId: activeChannelId, participants, createdAt, screenSharing, speakingUsers, toggleMute, toggleDeafen } = useCallStore()
  const [channelModal, setChannelModal] = useState<{ open: boolean; type: 'text' | 'voice'; categoryId: string }>({ open: false, type: 'text', categoryId: '' })
  const [channelMenu, setChannelMenu] = useState<{ channel: Channel; x: number; y: number } | null>(null)
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const [categoryMenu, setCategoryMenu] = useState<{ category: ServerCategory; x: number; y: number } | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [renameChannelModal, setRenameChannelModal] = useState<{ open: boolean; channel: Channel | null }>({ open: false, channel: null })
  const [emptyMenu, setEmptyMenu] = useState<{ x: number; y: number } | null>(null)
  const [renameModal, setRenameModal] = useState<{ open: boolean; category: ServerCategory | null }>({ open: false, category: null })
  const [showEvents, setShowEvents] = useState(false)
  const [showServerPost, setShowServerPost] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const isOwner = canManageServer(server, currentUser?.id)

  const handleDeleteChannel = async () => {
    if (!channelMenu || !isOwner) return
    const target = channelMenu.channel
    setChannelMenu(null)
    if (!window.confirm(`Excluir o canal "${target.name}"?`)) return
    await deleteChannel(server.id, target.id)
  }

  const [switchModal, setSwitchModal] = useState<{ open: boolean, target: Channel | null, targetName: string }>({ open: false, target: null, targetName: '' })
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const [skipConfirm, setSkipConfirm] = useState(() => {
    try { return localStorage.getItem('friends-space:skip-voice-switch') === 'true' } catch { return false }
  })

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleAddChannel = async (name: string, type: 'text' | 'voice', categoryId?: string) => {
    const clean = type === 'text'
      ? name.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40)
      : name.trim().slice(0, 40)
    if (!clean) return
    await addChannel(server.id, clean, type, categoryId || undefined)
  }

  const handleAddCategory = async (name: string) => {
    if (!name.trim()) return
    await addCategory(server.id, name.trim())
  }

  const handleRenameCategory = () => {
    if (!categoryMenu || !isOwner) return
    setRenameModal({ open: true, category: categoryMenu.category })
    setCategoryMenu(null)
  }

  const handleConfirmRename = async (name: string) => {
    if (!renameModal.category || !isOwner) return
    await renameCategory(server.id, renameModal.category.id, name.trim())
  }

  const handleRenameChannel = () => {
    if (!channelMenu || !isOwner) return
    setRenameChannelModal({ open: true, channel: channelMenu.channel })
    setChannelMenu(null)
    setMoveMenuOpen(false)
  }

  const handleConfirmRenameChannel = async (name: string) => {
    if (!renameChannelModal.channel || !isOwner) return
    await renameChannel(server.id, renameChannelModal.channel.id, name)
  }

  const handleDeleteCategory = async () => {
    if (!categoryMenu || !isOwner) return
    const target = categoryMenu.category
    setCategoryMenu(null)
    if (!window.confirm(`Excluir a categoria "${target.name}"? Os canais voltam para a lista principal.`)) return
    await deleteCategory(server.id, target.id)
  }

  const moveChannel = async (channelId: string, categoryId?: string) => {
    if (!isOwner) return
    const current = useServerStore.getState().servers.find(s => s.id === server.id)
    if (!current) return
    const channels = current.channels.map(c => c.id === channelId ? { ...c, categoryId } : c)
    await updateServer(server.id, { channels })
    setChannelMenu(null)
  }

  const handleVoiceClick = (channel: Channel) => {
    try { window.dispatchEvent(new CustomEvent('friends-space:join-reset')) } catch {}
    if (activeCall && activeChannelId !== channel.id) {
      if (skipConfirm) {
        const callStore = useCallStore.getState()
        if (callStore.activeCall) {
          callStore.moveCall(channel.id, server.id)
        }
        setCurrentChannel(channel)
        onChannelSelect?.()
        return
      }
      setSwitchModal({ open: true, target: channel, targetName: channel.name })
      return
    }
    setCurrentChannel(channel)
    onChannelSelect?.()
  }

  const confirmSwitch = () => {
    if (dontAskAgain) {
      try { localStorage.setItem('friends-space:skip-voice-switch', 'true') } catch {}
      setSkipConfirm(true)
    }
    if (switchModal.target) {
      const callStore = useCallStore.getState()
      if (callStore.activeCall) {
        callStore.moveCall(switchModal.target.id, server.id)
      }
      setCurrentChannel(switchModal.target)
      onChannelSelect?.()
    }
    setSwitchModal({ open: false, target: null, targetName: '' })
    setDontAskAgain(false)
  }

  const cancelSwitch = () => {
    setSwitchModal({ open: false, target: null, targetName: '' })
    setDontAskAgain(false)
  }

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const textChannels = server.channels.filter(c => c.type === 'text')
  const voiceChannels = server.channels.filter(c => c.type === 'voice')
  const inVoiceCall = activeCall && createdAt && activeChannelId && server.channels.some(c => c.id === activeChannelId)
  const callDuration = inVoiceCall ? formatTime(now - createdAt) : null
  const categories = server.categories || []
  const upcomingEvents = (server.events || []).filter(e => e.date >= Date.now()).length

  const openAddChannel = (type: 'text' | 'voice', categoryId?: string) => {
    setChannelModal({ open: true, type, categoryId: categoryId || '' })
  }

  const renderChannelRow = (channel: Channel) => {
    const isText = channel.type === 'text'
    if (isText) {
      return (
        <button key={channel.id} onClick={() => { try { window.dispatchEvent(new CustomEvent('friends-space:join-reset')) } catch {}; setCurrentChannel(channel); onChannelSelect?.() }} onContextMenu={e => { if (isOwner) { e.preventDefault(); e.stopPropagation(); setEmptyMenu(null); setCategoryMenu(null); setChannelMenu({ channel, x: e.clientX, y: e.clientY }) } }} style={{ width: '100%', padding: '8px 16px 8px 20px', display: 'flex', alignItems: 'center', gap: 6, background: currentChannel?.id === channel.id ? 'var(--bg-active)' : 'transparent', color: currentChannel?.id === channel.id ? 'var(--text-primary)' : 'var(--text-secondary)', borderRadius: 0, fontSize: 14, fontWeight: currentChannel?.id === channel.id ? 600 : 400, border: 'none', textAlign: 'left', cursor: 'pointer' }}>
          <Hash size={16} strokeWidth={2} color={currentChannel?.id === channel.id ? 'var(--text-primary)' : 'var(--text-secondary)'} />
          {channel.name}
        </button>
      )
    }
    const isCallHere = activeCall && activeChannelId === channel.id
    const callParticipantIds = new Set(participants.map(p => p.userId))
    const myUser = currentUser && callParticipantIds.has(currentUser.id) ? {
      userId: currentUser.id,
      userName: currentUser.name,
      userPhoto: currentUser.photoUrl,
      muted: isCallHere ? muted : false,
      deafened: isCallHere ? deafened : false,
    } : null
    const callParticipants = isCallHere
      ? [myUser, ...participants.filter(p => p.userId !== currentUser?.id)].filter((p): p is NonNullable<typeof p> => Boolean(p))
      : []
    const otherSessionMembers = !isCallHere
      ? [...new Set(channelSessions.filter(s => s.channelId === channel.id).flatMap(s => s.participantIds))]
        .map(id => allUsers.find(u => u.id === id))
        .filter((u): u is NonNullable<typeof u> => Boolean(u))
      : []
    const otherScreenSharer = !isCallHere
      ? channelSessions.find(s => s.channelId === channel.id && s.screenSharingUserId)?.screenSharingUserId
      : undefined
    const shownMembers = isCallHere ? callParticipants : otherSessionMembers
    return (
      <div key={channel.id}>
        <button onClick={() => handleVoiceClick(channel)} onContextMenu={e => { if (isOwner) { e.preventDefault(); e.stopPropagation(); setEmptyMenu(null); setCategoryMenu(null); setChannelMenu({ channel, x: e.clientX, y: e.clientY }) } }} style={{ width: '100%', padding: '8px 16px 8px 20px', display: 'flex', alignItems: 'center', gap: 6, background: currentChannel?.id === channel.id ? 'var(--bg-active)' : 'transparent', color: currentChannel?.id === channel.id ? 'var(--text-primary)' : 'var(--text-secondary)', borderRadius: 0, fontSize: 14, border: 'none', textAlign: 'left', cursor: 'pointer' }}>
          <Volume2 size={16} strokeWidth={2} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</span>
          {isCallHere && callDuration && (
            <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600, flexShrink: 0 }}>{callDuration}</span>
          )}
          {!isCallHere && otherSessionMembers.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 700, flexShrink: 0 }}>{otherSessionMembers.length}</span>
          )}
        </button>
        {shownMembers.length > 0 && (
          <div style={{ paddingLeft: 12, paddingBottom: 4 }}>
            {isCallHere ? callParticipants.map(p => (
              <div key={p.userId} onClick={() => handleVoiceClick(channel)} onContextMenu={(e) => { e.preventDefault(); const full = useUserStore.getState().users.find(u => u.id === p.userId); if (full) openUserMenu(full, e.clientX, e.clientY) }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                <div className={`vc-participant-ring ${speakingUsers[p.userId] && !p.muted ? 'speaking' : ''} ${p.muted ? 'muted' : ''}`} style={{ width: 22, height: 22 }}>
                  <Avatar src={p.userPhoto} name={p.userName} size={18} />
                </div>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {p.userName}
                </span>
                {screenSharing && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--danger, #ed4245)', padding: '2px 6px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.3px' }}>
                    AO VIVO
                  </span>
                )}
              </div>
            )) : otherSessionMembers.map(u => (
              <div key={u.id} onClick={() => handleVoiceClick(channel)} onContextMenu={(e) => { e.preventDefault(); openUserMenu(u, e.clientX, e.clientY) }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }} title="Clique para entrar na call">
                <div className="vc-participant-ring" style={{ width: 22, height: 22 }}>
                  <Avatar src={u.photoUrl} name={u.name} size={18} />
                </div>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {u.name}
                </span>
                {otherScreenSharer === u.id && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--danger, #ed4245)', padding: '2px 6px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.3px' }}>
                    AO VIVO
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const uncategorizedText = textChannels.filter(c => !c.categoryId)
  const uncategorizedVoice = voiceChannels.filter(c => !c.categoryId)

  return (
    <div className="fs-side-card" style={{ width: 240, height: '100%', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
      {switchModal.open && (
        <div className="vc-switch-overlay" onClick={cancelSwitch}>
          <div className="vc-switch-modal" onClick={e => e.stopPropagation()}>
            <h3>Voce tem certeza?</h3>
            <p>Parece que voce esta em outro canal de voz. Deseja mesmo mudar para <Headphones size={14} strokeWidth={2} style={{ margin: '0 4px', verticalAlign: -2 }} /> <strong>{switchModal.targetName}</strong>?</p>
            <label className="vc-switch-check">
              <input type="checkbox" checked={dontAskAgain} onChange={e => setDontAskAgain(e.target.checked)} />
              Nao perguntar de novo
            </label>
            <div className="vc-switch-actions">
              <button className="vc-switch-cancel" onClick={cancelSwitch}>Cancelar</button>
              <button className="vc-switch-confirm" onClick={confirmSwitch}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {(server.bannerUrl || (server as unknown as Record<string, unknown>).banner) ? (
        <div style={{ height: 80, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-tertiary)' }}>
          <img src={toImageUrl(String(server.bannerUrl || (server as unknown as Record<string, unknown>).banner))} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      ) : null}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 0 var(--border)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }} title={server.description || server.name}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, overflow: 'hidden' }}>
            {server.photoUrl ? <img src={toImageUrl(server.photoUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : server.name.charAt(0).toUpperCase()}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</span>
            {server.description ? <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{server.description}</span> : null}
          </span>
        </span>
        {isOwner && (
          <button onClick={onOpenSettings} title="Configuracoes do servidor" style={{ color: 'var(--text-muted)', padding: 3, flexShrink: 0 }}>
            <IconSettings width={16} height={16} />
          </button>
        )}
      </div>

      <button onClick={() => window.dispatchEvent(new Event('friends-space:show-friends'))} style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--border)' }} title="Voltar para Amigos / Conversas">
        <IconHome width={18} height={18} /> Amigos
      </button>

      {isOwner && (
        <button onClick={() => setShowServerPost(true)} style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--border)' }} title="Postar no feed ou story como este servidor">
          <Megaphone size={16} strokeWidth={2} /> Postar no feed
        </button>
      )}
      {showServerPost && (
        <ServerPostModal server={server} onClose={() => setShowServerPost(false)} onPublished={() => setShowServerPost(false)} />
      )}

      <button onClick={() => setShowEvents(true)} style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--border)' }} title="Eventos do servidor">
        <CalendarDays size={16} strokeWidth={2} /> Eventos
        {upcomingEvents > 0 && (
          <span style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#000', fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>{upcomingEvents}</span>
        )}
      </button>

      <div
        style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}
        onContextMenu={e => {
          if (!isOwner) return
          e.preventDefault()
          setChannelMenu(null)
          setCategoryMenu(null)
          const w = typeof window !== 'undefined' ? window.innerWidth : 1024
          const h = typeof window !== 'undefined' ? window.innerHeight : 768
          setEmptyMenu({ x: Math.min(e.clientX, w - 230), y: Math.min(e.clientY, h - 140) })
        }}
      >
        {categories.length > 0 && (
          <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Categorias</span>
            {isOwner && (
              <button onClick={() => setCategoryModalOpen(true)} className="fs-add-channel-btn" title="Criar categoria" style={{ color: 'var(--text-secondary)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconAdd width={16} height={16} />
              </button>
            )}
          </div>
        )}

        {categories.map(cat => {
          const catChannels = server.channels.filter(c => c.categoryId === cat.id)
          const isCollapsed = collapsed[cat.id]
          return (
            <div key={cat.id}>
              <div
                onClick={() => setCollapsed({ ...collapsed, [cat.id]: !isCollapsed })}
                onContextMenu={e => { if (isOwner) { e.preventDefault(); e.stopPropagation(); setEmptyMenu(null); setChannelMenu(null); setCategoryMenu({ category: cat, x: e.clientX, y: e.clientY }) } }}
                style={{ padding: '8px 12px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', minWidth: 0 }}>
                  {isCollapsed ? <ChevronRight size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} /> : <ChevronDown size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                </span>
                {isOwner && (
                  <button onClick={(e) => { e.stopPropagation(); openAddChannel('text', cat.id) }} className="fs-add-channel-btn" title={`Criar canal em ${cat.name}`} style={{ color: 'var(--text-secondary)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                    <IconAdd width={14} height={14} />
                  </button>
                )}
              </div>
              {!isCollapsed && catChannels.map(renderChannelRow)}
            </div>
          )
        })}

        <div style={{ padding: '8px 16px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Texto</span>
          {isOwner && (
            <button onClick={() => openAddChannel('text')} className="fs-add-channel-btn" style={{ color: 'var(--text-secondary)', padding: 2 }}>
              <IconAdd width={16} height={16} />
            </button>
          )}
        </div>
        {uncategorizedText.map(renderChannelRow)}

        <div style={{ padding: '8px 16px 4px', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Voz</span>
          {isOwner && (
            <button onClick={() => openAddChannel('voice')} className="fs-add-channel-btn" style={{ color: 'var(--text-secondary)', padding: 2 }}>
              <IconAdd width={16} height={16} />
            </button>
          )}
        </div>
        {uncategorizedVoice.map(renderChannelRow)}
      </div>

      <VoicePanel onReturnToCall={onReturnToCall} />
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar src={currentUser?.photoUrl || ''} name={currentUser?.name || ''} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser?.name || 'Usuario'}</div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={toggleMute} style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }} title={muted ? 'Ativar microfone' : 'Desativar microfone'}>
            {muted ? <IconMute width={18} height={18} style={{ color: 'var(--danger)' }} /> : <IconMic width={18} height={18} />}
          </button>
          <button onClick={toggleDeafen} style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }} title={deafened ? 'Ativar som' : 'Desativar som'}>
            {deafened ? <IconDeafen width={18} height={18} style={{ color: 'var(--danger)' }} /> : <IconHeadphone width={18} height={18} />}
          </button>
        </div>
      </div>

      {channelMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={() => { setChannelMenu(null); setMoveMenuOpen(false) }} />
          <div style={{
            position: 'fixed', left: channelMenu.x, top: channelMenu.y, zIndex: 10000,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 4, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <button onClick={handleRenameChannel}
              style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Pen size={13} strokeWidth={2} style={{ color: 'var(--text-muted)' }} /> Renomear canal
            </button>
            {categories.length > 0 && (
              <button
                onClick={() => setMoveMenuOpen(m => !m)}
                style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Folder size={13} strokeWidth={2} style={{ color: 'var(--text-muted)' }} /> Mover para categoria
                <ChevronRight size={11} strokeWidth={2.5} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
              </button>
            )}
            {moveMenuOpen && (
              <>
                <button onClick={() => moveChannel(channelMenu.channel.id, undefined)}
                  style={{ width: '100%', padding: '8px 12px 8px 32px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Sem categoria
                </button>
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => moveChannel(channelMenu.channel.id, cat.id)}
                    style={{ width: '100%', padding: '8px 12px 8px 32px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Folder size={11} strokeWidth={2} /> {cat.name}
                  </button>
                ))}
              </>
            )}
            <button onClick={handleDeleteChannel}
              style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: '#ed4245', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Trash2 size={13} strokeWidth={2} /> Excluir canal
            </button>
          </div>
        </>
      )}

      {categoryMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={() => setCategoryMenu(null)} />
          <div style={{
            position: 'fixed', left: categoryMenu.x, top: categoryMenu.y, zIndex: 10000,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 4, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <button onClick={handleRenameCategory}
              style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Pen size={13} strokeWidth={2} style={{ color: 'var(--text-muted)' }} /> Renomear categoria
            </button>
            <button onClick={handleDeleteCategory}
              style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: '#ed4245', fontSize: 13, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Trash2 size={13} strokeWidth={2} /> Excluir categoria
            </button>
          </div>
        </>
      )}

      {emptyMenu && isOwner && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={() => setEmptyMenu(null)} onContextMenu={e => { e.preventDefault(); setEmptyMenu(null) }} />
          <div style={{
            position: 'fixed', left: emptyMenu.x, top: emptyMenu.y, zIndex: 10000,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 4, minWidth: 210, boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          }}>
            <button
              onClick={() => { setEmptyMenu(null); setChannelModal({ open: true, type: 'text', categoryId: '' }) }}
              style={{ width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 6, textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Hash size={14} strokeWidth={2} style={{ color: 'var(--text-primary)' }} />
              </span>
              Criar canal
            </button>
            <button
              onClick={() => { setEmptyMenu(null); setCategoryModalOpen(true) }}
              style={{ width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 6, textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Folder size={14} strokeWidth={2} style={{ color: 'var(--text-primary)' }} />
              </span>
              Criar categoria
            </button>
          </div>
        </>
      )}

      <EventsModal open={showEvents} onClose={() => setShowEvents(false)} server={server} canManage={isOwner} />

      <CreateChannelModal
        open={channelModal.open}
        initialType={channelModal.type}
        initialCategoryId={channelModal.categoryId}
        categories={categories}
        onClose={() => setChannelModal(m => ({ ...m, open: false }))}
        onCreate={handleAddChannel}
      />
      <CreateCategoryModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onCreate={handleAddCategory}
      />
      <RenameCategoryModal
        open={renameModal.open}
        currentName={renameModal.category?.name || ''}
        onClose={() => setRenameModal({ open: false, category: null })}
        onRename={handleConfirmRename}
      />
      <RenameChannelModal
        open={renameChannelModal.open}
        currentName={renameChannelModal.channel?.name || ''}
        channelType={renameChannelModal.channel?.type || 'text'}
        onClose={() => setRenameChannelModal({ open: false, channel: null })}
        onRename={handleConfirmRenameChannel}
      />
    </div>
  )
}
