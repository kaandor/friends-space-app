import { useState, useEffect, useRef } from 'react'
import { Search, SlidersHorizontal, Plus, Smile, Send, FileText, BadgeCheck, Rocket, ShieldCheck, Gamepad2, Gift, Phone, Video } from 'lucide-react'
import { uiEnabled } from '../Profile/InterfaceTab'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { UserProfileModal } from '../Profile/UserProfileModal'
import { useUserStore, isUserOnline } from '../../stores/userStore'
import { useFriendStore } from '../../stores/friendStore'
import { useServerStore } from '../../stores/serverStore'
import { searchDirectory, requestBackend } from '../../services/backend'
import { uploadToDrive, isDriveConnected, toImageUrl } from '../../services/driveService'
import { useIsMobile } from '../../hooks/useIsMobile'
import { assertUploadLimit } from '../../utils/astro'
import { buildFileName, detectMediaKind, extractMediaUrl, extractEmbedUrl, driveFolderFor } from '../../services/mediaDetect'
import { MediaAttachment } from '../Chat/MediaAttachment'
import { LinkEmbed } from '../Chat/LinkEmbed'
import { DriveRequiredModal } from '../Chat/DriveRequiredModal'
import { EmojiPicker } from '../Chat/EmojiPicker'
import { collectAllServerEmojis, renderContentWithEmojis } from '../../services/serverEmojis'
import { AstroPromo } from '../Home/AstroPromo'
import { AstroPlansModal } from '../Home/AstroPlansModal'
import { StoriesBar } from '../Social/StoriesBar'
import { FeedView } from '../Social/FeedView'
import { AstroGiftModal } from '../Home/AstroGiftModal'
import { VoicePanel } from '../Call/VoicePanel'
import { UserDock } from '../Layout/UserDock'
import { useUserMenuStore } from '../../stores/userMenuStore'
import { useCallStore } from '../../stores/callStore'
import type { User } from '../../types'

function normalizeSearchValue(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]/g, '')
}

  type FriendsTab = 'todas' | 'naonline'

export function FriendsView({ onReturnToCall }: { onReturnToCall?: () => void }) {
  const { currentUser } = useUserStore()
  const { friendUsers, friends, directMessages, currentDMUser,
    loadFriends, addFriendById,
    sendDirectMessage, loadDirectMessages, setCurrentDMUser } = useFriendStore()
  const { servers } = useServerStore()
  const { open: openUserMenu } = useUserMenuStore()
  const [addQuery, setAddQuery] = useState('')
  const [addResults, setAddResults] = useState<User[]>([])
  const [addLoading, setAddLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddInline, setShowAddInline] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [addMessage, setAddMessage] = useState<{ type: 'ok' | 'err', text: string } | null>(null)
  const [dmInput, setDmInput] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FriendsTab>('todas')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [driveModal, setDriveModal] = useState(false)
  const [dmSending, setDmSending] = useState(false)
  const [showDmEmoji, setShowDmEmoji] = useState(false)
  const [showAstro, setShowAstro] = useState(false)
  const [showAstroPlans, setShowAstroPlans] = useState(false)
  const dmFileInputRef = useRef<HTMLInputElement>(null)
  const dmScrollRef = useRef<HTMLDivElement>(null)
  const dmEndRef = useRef<HTMLDivElement>(null)
  const dmStickRef = useRef(true)
  const [storyRetrySignal, setStoryRetrySignal] = useState(0)
  const [mutualCounts, setMutualCounts] = useState({ friends: 0, servers: 0 })
  const [showFullProfile, setShowFullProfile] = useState(false)
  const callUser = useCallStore(s => s.callUser)
  const callingUser = useCallStore(s => s.callingUser)
  const activeCall = useCallStore(s => s.activeCall)
  const isMobile = useIsMobile(768)
  const userSettings = (currentUser?.settings || {}) as Record<string, unknown>
  const hasAstro = userSettings['astro'] === true || userSettings['astro'] === 'true'
  const dmEmojis = collectAllServerEmojis()

  useEffect(() => {
    if (currentUser) {
      loadFriends(currentUser.id)
    }
  }, [currentUser, loadFriends])

  useEffect(() => {
    if (!currentUser) return

    let cancelled = false

    const refresh = async () => {
      try {
        await loadFriends(currentUser.id)
        if (currentDMUser) {
          await loadDirectMessages(currentUser.id, currentDMUser.id)
        }
      } catch {
        if (cancelled) return
      }
    }

    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 10000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [currentUser, currentDMUser, loadFriends, loadDirectMessages])

  useEffect(() => {
    if (currentDMUser && currentUser) {
      loadDirectMessages(currentUser.id, currentDMUser.id)
    }
  }, [currentDMUser, currentUser, loadDirectMessages])

  useEffect(() => {
    dmStickRef.current = true
    const el = dmScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [currentDMUser?.id])

  useEffect(() => {
    if (dmStickRef.current) dmEndRef.current?.scrollIntoView({ block: 'end' })
  }, [directMessages])

  useEffect(() => {
    if (!currentUser || !currentDMUser || currentDMUser.id === currentUser.id) { setMutualCounts({ friends: 0, servers: 0 }); return }
    let cancelled = false
    const run = async () => {
      try {
        const [theirFriends, theirServers] = await Promise.all([
          requestBackend<{ friends: { userId: string; friendId: string; status: string }[] }>('loadFriends', { userId: currentDMUser.id }),
          requestBackend<{ id: string }[]>('loadUserServers', { userId: currentDMUser.id }),
        ])
        if (cancelled) return
        const meId = currentUser.id
        const theirIds = (theirFriends?.friends || [])
          .filter(f => f.status === 'accepted')
          .map(f => f.userId === currentDMUser.id ? f.friendId : f.userId)
        const myIds = (friends || [])
          .filter(f => f.status === 'accepted')
          .map(f => f.userId === meId ? f.friendId : f.userId)
        const myServerIds = new Set((servers || []).filter(s => Array.isArray((s as { members?: unknown }).members) && ((s as { members: string[] }).members.includes(meId))).map(s => s.id))
        setMutualCounts({
          friends: theirIds.filter(id => myIds.includes(id)).length,
          servers: Array.isArray(theirServers) ? theirServers.filter(s => myServerIds.has(s.id)).length : 0,
        })
      } catch { if (!cancelled) setMutualCounts({ friends: 0, servers: 0 }) }
    }
    void run()
    return () => { cancelled = true }
  }, [currentUser, currentDMUser, friends, servers])

  useEffect(() => {
    if (!showAdd || addQuery.trim().length < 2) { setAddResults([]); return }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setAddLoading(true)
      try {
        const result = await searchDirectory(addQuery, currentUser?.id)
        if (!cancelled) setAddResults(result.users)
      } catch {
        if (!cancelled) setAddResults([])
      } finally {
        if (!cancelled) setAddLoading(false)
      }
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [showAdd, addQuery, currentUser])

  const filteredFriends = friendUsers.filter(u => {
    const query = normalizeSearchValue(search)
    if (!query) return true
    return (
      normalizeSearchValue(u.name).includes(query)
      || normalizeSearchValue(u.friendCode || '').includes(query)
      || normalizeSearchValue(u.id).includes(query)
      || normalizeSearchValue(u.email || '').includes(query)
    )
  })

  const copyFriendCode = () => {
    if (currentUser?.friendCode) {
      navigator.clipboard.writeText(currentUser.friendCode).catch(() => {})
    }
  }

  const tabFriends = tab === 'naonline' ? filteredFriends.filter(u => { try { return isUserOnline(u) } catch { return false } }) : filteredFriends

  const handleSendDM = async () => {
    if (!dmInput.trim() || !currentUser || !currentDMUser || dmSending) return
    setDmSending(true)
    try {
      await sendDirectMessage(currentUser.id, currentDMUser.id, dmInput)
      setDmInput('')
    } finally {
      setDmSending(false)
    }
  }

  const handlePickMediaDm = async (url: string, name: string, kind: 'gif' | 'sticker') => {
    if (!currentUser || !currentDMUser || dmSending) return
    setDmSending(true)
    try {
      await sendDirectMessage(currentUser.id, currentDMUser.id, '', 'text', undefined, url, name, kind)
      setShowDmEmoji(false)
    } finally {
      setDmSending(false)
    }
  }

  const handleDmFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentUser || !currentDMUser) return
    if (!isDriveConnected()) {
      setPendingFile(file)
      setDriveModal(true)
      return
    }
    await uploadAndSendDm(file)
  }

  const uploadAndSendDm = async (file: File) => {
    if (!currentUser || !currentDMUser) return
    const blocked = assertUploadLimit(currentUser, file.size)
    if (blocked) {
      window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: blocked }))
      return
    }
    setDmSending(true)
    try {
      const kind = detectMediaKind(file.name)
      const folder = kind === 'none' ? 'mensagens' : driveFolderFor(kind)
      const name = kind === 'none' ? file.name : buildFileName(driveFolderFor(kind), file.name)
      const recipientEmails = currentDMUser?.email ? [currentDMUser.email] : []
      const url = await uploadToDrive(file, name, file.type, folder, recipientEmails, 'Arquivos enviados')
      if (!url) return
      await sendDirectMessage(currentUser.id, currentDMUser.id, '', 'text', undefined, url, name, kind)
    } finally {
      setDmSending(false)
    }
  }

  const sendDmAsTxt = async () => {
    const text = dmInput.trim()
    if (!text || !currentUser || !currentDMUser || dmSending) return
    const name = `mensagem-${Date.now()}.txt`
    const file = new File([new Blob([text], { type: 'text/plain;charset=utf-8' })], name, { type: 'text/plain' })
    if (!isDriveConnected()) {
      setPendingFile(file)
      setDriveModal(true)
      return
    }
    await uploadAndSendDm(file)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendDM() }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file || !currentUser || !currentDMUser) return
        const renamed = new File([file], `pasted-${Date.now()}.${file.name.split('.').pop() || 'png'}`, { type: file.type })
        if (!isDriveConnected()) {
          setPendingFile(renamed)
          setDriveModal(true)
        } else {
          void uploadAndSendDm(renamed)
        }
        return
      }
    }
  }

  const handleDriveConnectedDm = async () => {
    if (pendingFile) {
      const file = pendingFile
      setPendingFile(null)
      await uploadAndSendDm(file)
    }
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const sameDay = (a: number, b: number) => {
    const da = new Date(a)
    const db = new Date(b)
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
  }

  const formatDay = (ts: number) => {
    return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const tabs: { key: FriendsTab; label: string; badge?: number }[] = [
    { key: 'todas', label: 'Todos' },
    { key: 'naonline', label: 'Na Online' },
  ]

  return (
    <div className="fs-friends-root fs-chat-card" style={{ flex: 1, display: isMobile ? 'block' : 'flex', height: '100%', minHeight: 0 }}>
      <div className="fs-friends-panel" style={{ width: 350, display: isMobile && currentDMUser ? 'none' : 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, margin: 12, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          {isMobile && (
            <button onClick={() => setShowAddInline(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 10px' }}>
              <Plus size={15} strokeWidth={2.4} color="var(--text-primary)" />
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1, textAlign: 'left' }}>Adicionar amigo</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{showAddInline ? '▲' : '▼'}</span>
            </button>
          )}
          {(!isMobile || showAddInline) && (<>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Adicionar amigo</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
            Voce pode adicionar amigos com o nome de usuario deles.
          </p>
          {currentUser?.friendCode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Seu codigo:</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>@{currentUser.friendCode}</span>
              <button onClick={copyFriendCode} style={{ padding: '4px 8px', fontSize: 11, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Copiar
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={addInput}
              onChange={e => { setAddInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '')); setAddMessage(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && addInput.trim().length >= 2) { setAddQuery(addInput); setShowAdd(true) } }}
              placeholder="Nome de usuario ou codigo"
              style={{
                flex: 1, minWidth: 0, padding: '10px 12px',
                background: 'var(--bg-secondary)', border: `1px solid ${addMessage?.type === 'err' ? '#ed4245' : 'var(--border)'}`,
                borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none',
              }}
            />
            <button
              onClick={async () => {
                if (!addInput.trim() || !currentUser) return
                setAddMessage(null)
                setAddLoading(true)
                try {
                  const result = await searchDirectory(addInput, currentUser.id)
                  if (result.users.length > 0) {
                    const target = result.users[0]
                    const added = await addFriendById(currentUser.id, target.id)
                    if (added.ok) {
                      setAddMessage({ type: 'ok', text: `Solicitacao enviada para ${target.name}!` })
                      setAddInput('')
                    } else {
                      setAddMessage({ type: 'err', text: added.error || 'Erro ao adicionar' })
                    }
                  } else {
                    setAddMessage({ type: 'err', text: 'Nenhum usuario encontrado com este nome/codigo' })
                  }
                } catch {
                  setAddMessage({ type: 'err', text: 'Erro ao buscar usuario' })
                } finally {
                  setAddLoading(false)
                }
              }}
              disabled={addLoading || addInput.trim().length < 2}
              style={{ padding: '10px 14px', background: addInput.trim().length < 2 ? 'var(--bg-tertiary)' : 'var(--accent)', border: 'none', borderRadius: 8, color: addInput.trim().length < 2 ? 'var(--text-dim)' : '#fff', fontSize: 13, fontWeight: 600, cursor: addInput.trim().length < 2 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {addLoading ? '...' : 'Adicionar'}
            </button>
          </div>
          {addMessage && (
            <p style={{ marginTop: 8, fontSize: 12, color: addMessage.type === 'ok' ? '#23a55a' : '#ed4245' }}>
              {addMessage.text}
            </p>
          )}
          </>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-primary)', borderRadius: 12, padding: '10px 15px', margin: '16px 20px', gap: 10, border: '1px solid var(--border)' }}>
          <Search size={14} strokeWidth={2} color="var(--text-secondary)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar amigos"
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: 13 }}
          />
          <SlidersHorizontal size={14} strokeWidth={2} color="var(--text-secondary)" style={{ cursor: 'pointer' }} />
        </div>
        <div style={{ display: 'flex', padding: '0 20px', gap: 20, borderBottom: '1px solid var(--border)' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'transparent', border: 'none', color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '12px 0', fontSize: 14, fontWeight: 500, cursor: 'pointer', position: 'relative',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {t.label}
              {t.badge !== undefined && (
                <span style={{ background: 'var(--accent)', color: '#000000', fontSize: 10, padding: '2px 8px', borderRadius: 12, marginLeft: 5, fontWeight: 700 }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
          {tab === 'naonline' && tabFriends.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                Ninguém online agora
              </div>
              <div style={{ fontSize: 12 }}>
                Quando amigos entrarem, aparecem aqui.
              </div>
            </div>
          )}
          {tab === 'todas' && (
            tabFriends.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  Nenhum amigo encontrado
                </div>
                <div style={{ fontSize: 12 }}>
                  Use a busca acima para encontrar amigos.
                </div>
              </div>
            ) : (
              tabFriends.map(user => (
                <button
                  key={user.id}
                  onClick={() => { setCurrentDMUser(user) }}
                  onContextMenu={(e) => { e.preventDefault(); openUserMenu(user, e.clientX, e.clientY) }}
                  style={{
                    width: '100%', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
                    background: currentDMUser?.id === user.id ? 'var(--bg-hover)' : 'transparent',
                    color: 'var(--text-primary)', fontSize: 14, border: 'none', textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <Avatar src={user.photoUrl} name={user.name} size={44} />
                    {(() => {
                      const s = (user.settings || {}) as Record<string, string | boolean | undefined>
                      const statusKey = typeof s['status'] === 'string' ? s['status'] as string : 'online'
                      const online = isUserOnline(user)
                      const color = statusKey === 'ausente' ? '#faa81a' : statusKey === 'naoperturbe' ? '#f23f43' : statusKey === 'invisivel' ? '#80848e' : online ? '#23a55a' : '#80848e'
                      return <span style={{ position: 'absolute', bottom: 0, right: 0, width: 13, height: 13, borderRadius: '50%', background: color, border: '2px solid var(--bg-secondary)' }} />
                    })()}
                  </div>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</span>
                    <span style={{ color: isUserOnline(user) ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 11 }}>{isUserOnline(user) ? 'Online' : 'Offline'}</span>
                    {(() => {
                      const s = (user.settings || {}) as Record<string, string | boolean | undefined>
                      const statusMessage = typeof s['statusMessage'] === 'string' ? s['statusMessage'] as string : ''
                      if (statusMessage) {
                        return <span style={{ color: 'var(--text-primary)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusMessage}</span>
                      }
                      return null
                    })()}
                    {user.activityEnabled !== false && user.activityPrivacy !== 'private' && user.activityName && (
                      <span style={{ color: 'var(--text-primary)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.activityName}{user.activityDetails ? ` — ${user.activityDetails}` : ''}</span>
                    )}
                  </span>
                </button>
              ))
            )
          )}
        </div>
        <VoicePanel onReturnToCall={onReturnToCall} />
        <UserDock />
      </div>

      <div style={{ flex: 1, display: isMobile && !currentDMUser ? 'none' : 'flex', flexDirection: isMobile ? 'column' : 'row', background: 'var(--bg-primary)', minWidth: 0, minHeight: 0, height: isMobile ? '100%' : undefined }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {currentDMUser ? (
          <>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 12,
              fontWeight: 600, fontSize: 15, color: 'var(--text-primary)',
              boxShadow: '0 1px 0 var(--border)',
            }}>
              <button onClick={() => setCurrentDMUser(null)} title="Voltar ao feed" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: 15 }}>←</button>
              <Avatar src={currentDMUser.photoUrl} name={currentDMUser.name} size={36} />
              <span onContextMenu={(e) => { e.preventDefault(); openUserMenu(currentDMUser, e.clientX, e.clientY) }}>{currentDMUser.name}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  className="fs-dm-action"
                  onClick={() => { if (!callingUser && !activeCall) void callUser(currentDMUser.id) }}
                  disabled={Boolean(callingUser || activeCall)}
                  title="Chamada de voz"
                ><Phone size={17} strokeWidth={2} /></button>
                <button
                  className="fs-dm-action"
                  onClick={() => { if (!callingUser && !activeCall) void callUser(currentDMUser.id, 'video') }}
                  disabled={Boolean(callingUser || activeCall)}
                  title="Chamada de vídeo"
                ><Video size={17} strokeWidth={2} /></button>
              </div>
            </div>

            <div
              ref={dmScrollRef}
              onScroll={() => {
                try {
                  const el = dmScrollRef.current
                  if (el) dmStickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
                } catch { }
              }}
              style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {directMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Inicio da conversa com {currentDMUser.name}</div>
                  <div style={{ fontSize: 12 }}>Envie uma mensagem para comecar</div>
                </div>
              ) : (
                directMessages.map((msg, idx) => {
                  const sent = msg.fromId === currentUser?.id
                  const sender = sent ? currentUser : currentDMUser
                  const showDay = idx === 0 || !sameDay(directMessages[idx - 1].createdAt, msg.createdAt)
                  return (
                  <div key={msg.id} style={{ display: 'contents' }}>
                    {showDay && (
                      <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', margin: '8px 0 4px' }}>{formatDay(msg.createdAt)}</div>
                    )}
                    <div style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
                      <Avatar src={sender?.photoUrl || ''} name={sender?.name || ''} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{sender?.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatTime(msg.createdAt)}</span>
                        </div>
                    <div style={{ marginTop: 2, maxWidth: '100%' }}>
                      {msg.attachmentUrl ? (
                        <MediaAttachment url={msg.attachmentUrl} name={msg.attachmentName} msgId={msg.id} type={msg.attachmentType} />
                      ) : msg.type === 'text' ? (
                        <p style={{ color: 'var(--text-primary)', fontSize: 13, wordBreak: 'break-word', margin: 0 }}>
                          {(() => {
                            const mediaUrl = extractMediaUrl(msg.content)
                            if (mediaUrl) {
                              const prefix = msg.content.slice(0, msg.content.indexOf(mediaUrl)).trim()
                              const suffix = msg.content.slice(msg.content.indexOf(mediaUrl) + mediaUrl.length).trim()
                              return (
                                <>
                                  {prefix && <span>{renderContentWithEmojis(prefix, dmEmojis)} </span>}
                                  <MediaAttachment url={mediaUrl} compact />
                                  {suffix && <span> {renderContentWithEmojis(suffix, dmEmojis)}</span>}
                                </>
                              )
                            }
                            const embed = extractEmbedUrl(msg.content)
                            if (embed) {
                              const embedIndex = msg.content.indexOf(embed.source)
                              const start = embedIndex > -1 ? embedIndex : msg.content.length
                              const prefix = msg.content.slice(0, start).trim()
                              const suffix = embedIndex > -1 ? msg.content.slice(embedIndex + embed.source.length).trim() : ''
                              return (
                                <>
                                  {prefix && <span>{renderContentWithEmojis(prefix, dmEmojis)} </span>}
                                  <LinkEmbed embed={embed} />
                                  {suffix && <span> {renderContentWithEmojis(suffix, dmEmojis)}</span>}
                                </>
                              )
                            }
                            return renderContentWithEmojis(msg.content, dmEmojis)
                          })()}
                        </p>
                      ) : msg.audioUrl && (
                        <audio controls src={msg.audioUrl} style={{ height: 36, borderRadius: 'var(--radius-sm)' }} />
                      )}
                      </div>
                      </div>
                    </div>
                  </div>
                  )
                })
              )}
              <div ref={dmEndRef} />
            </div>

            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => dmFileInputRef.current?.click()} className="fs-input-icon" title="Enviar midia">
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                  <input ref={dmFileInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleDmFileChange} />
                  <button onClick={() => setShowAstro(true)} className="fs-input-icon" title="Enviar presente">
                    <Gift size={16} strokeWidth={2} />
                  </button>
                </div>
                <div className="fs-chat-input-wrapper">
                  <textarea
                    value={dmInput}
                    onChange={e => setDmInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={`Mensagem para ${currentDMUser.name}`}
                    rows={1}
                    className="fs-chat-input"
                    style={{ maxHeight: 120 }}
                  />
                </div>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowDmEmoji(s => !s)} className="fs-input-icon" title="Emojis">
                    <Smile size={17} strokeWidth={2} />
                  </button>
                  {showDmEmoji && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowDmEmoji(false)} />
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 41 }}>
                        <EmojiPicker
                          onPick={(emoji) => { setDmInput(v => v + emoji); setShowDmEmoji(false) }}
                          onPickMedia={handlePickMediaDm}
                          allEmojis={dmEmojis}
                          serverId={null}
                          hasAstro={hasAstro}
                        />
                      </div>
                    </>
                  )}
                </div>
                <button className="fs-send-btn" onClick={handleSendDM} disabled={!dmInput.trim() || dmSending}>
                  {dmSending ? <span className="inline-spinner" /> : <Send size={16} strokeWidth={2} />}
                </button>
                {dmInput.trim().length >= 300 && (
                  <button
                    onClick={() => void sendDmAsTxt()}
                    disabled={dmSending}
                    title="Enviar como arquivo .txt"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                      fontSize: 11.5, fontWeight: 700, padding: '8px 12px', borderRadius: 8,
                      background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', cursor: dmSending ? 'default' : 'pointer', flexShrink: 0,
                    }}
                  >
                    <FileText size={13} strokeWidth={2} /> Enviar como .txt
                  </button>
                )}
              </div>
              <DriveRequiredModal open={driveModal} onClose={() => { setDriveModal(false); setPendingFile(null) }} onConnected={() => { handleDriveConnectedDm(); setStoryRetrySignal(s => s + 1) }} file={pendingFile} />
              {showAstro && <AstroGiftModal onClose={() => setShowAstro(false)} />}
            </div>
          </>
        ) : (
          <div style={{ padding: 0, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <AstroPromo onPlans={() => setShowAstroPlans(true)} />
            {uiEnabled(currentUser, 'stories') && (
              <StoriesBar onDriveRequired={() => setDriveModal(true)} driveConnectedSignal={storyRetrySignal} />
            )}
            <FeedView onDriveRequired={() => setDriveModal(true)} />
          </div>
        )}
        </div>
        {currentDMUser && !isMobile && (
          <aside style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {(() => {
              const u = currentDMUser
              const s = (u.settings || {}) as Record<string, unknown>
              const online = isUserOnline(u)
              const statusKey = typeof s['status'] === 'string' ? s['status'] as string : 'online'
              const statusMessage = typeof s['statusMessage'] === 'string' ? s['statusMessage'] as string : ''
              const verified = Boolean(u.googleId || u.authProvider === 'google')
              const astro = s['astro'] === true || s['astro'] === 'true'
              const flags = (u.flags || {}) as Record<string, boolean | undefined>
              const mural = (s['mural'] && typeof s['mural'] === 'object' ? s['mural'] : {}) as Record<string, unknown>
              const games = Array.isArray(mural['games']) ? (mural['games'] as { image?: string; title?: string; name?: string }[]) : []
              const isFriend = (friends || []).some(f => f.status === 'accepted' && ((f.userId === u.id) || (f.friendId === u.id)))
              const statusColor = statusKey === 'ausente' ? '#faa81a' : statusKey === 'naoperturbe' ? '#f23f43' : statusKey === 'invisivel' ? '#80848e' : online ? '#23a55a' : '#80848e'
              return (<>
                <div style={{ position: 'relative', height: 110, flexShrink: 0, background: u.bannerUrl ? 'var(--bg-tertiary)' : 'var(--bg-tertiary)' }}>
                  {u.bannerUrl && (
                    <img src={toImageUrl(u.bannerUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                </div>
                <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'relative', width: 76, marginTop: -38 }}>
                    <div style={{ borderRadius: '50%', padding: 3, background: 'var(--bg-secondary)', display: 'flex' }}>
                      <Avatar src={u.photoUrl || ''} name={u.name} size={70} />
                    </div>
                    <span style={{ position: 'absolute', bottom: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: statusColor, border: '3px solid var(--bg-secondary)' }} />
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{u.friendCode || 'usuario'}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    {verified && (
                      <span title="Verificado" style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
                        <BadgeCheck size={14} strokeWidth={2} />
                      </span>
                    )}
                    {astro && (
                      <span title="ASTRO" style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
                        <Rocket size={14} strokeWidth={2} />
                      </span>
                    )}
                    {(flags.dev || flags.support || flags.official) && (
                      <span title="Equipe" style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
                        <ShieldCheck size={14} strokeWidth={2} />
                      </span>
                    )}
                  </div>
                  {(mutualCounts.friends > 0 || mutualCounts.servers > 0) && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                      {mutualCounts.friends > 0 && `${mutualCounts.friends} amigo${mutualCounts.friends === 1 ? '' : 's'} mútuo${mutualCounts.friends === 1 ? '' : 's'}`}
                      {mutualCounts.friends > 0 && mutualCounts.servers > 0 && ' · '}
                      {mutualCounts.servers > 0 && `${mutualCounts.servers} servidor${mutualCounts.servers === 1 ? '' : 'es'} mútuo${mutualCounts.servers === 1 ? '' : 's'}`}
                    </div>
                  )}
                  {statusMessage ? (
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 12, lineHeight: 1.4 }}>{statusMessage}</div>
                  ) : null}
                  {u.createdAt > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Membro desde</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{new Date(u.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                  )}
                  {games.length > 0 && (
                    <button onClick={() => setShowFullProfile(true)} style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, cursor: 'pointer', textAlign: 'left' }}>
                      <Gamepad2 size={16} strokeWidth={2} color="var(--text-primary)" />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Coleção de Jogos</span>
                      <span style={{ display: 'flex' }}>
                        {games.slice(0, 3).map((g, i) => (
                          g.image ? (
                            <img key={i} src={toImageUrl(g.image)} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--bg-tertiary)' }} />
                          ) : (
                            <span key={i} style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--bg-tertiary)' }}>
                              {(g.title || g.name || '?').slice(0, 1).toUpperCase()}
                            </span>
                          )
                        ))}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
                    </button>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Sobre mim</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{u.bio || 'Nada para ver aqui...'}</div>
                  </div>
                  {isFriend && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Cargos</div>
                      <div style={{ marginTop: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px' }}>Membro</span>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Status</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor }} />
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{online ? 'Online' : 'Offline'}</span>
                    </div>
                  </div>
                  <button onClick={() => setShowFullProfile(true)} style={{ marginTop: 16, width: '100%', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Ver Perfil Completo
                  </button>
                </div>
              </>)
            })()}
          </aside>
        )}
      </div>

      {showFullProfile && currentDMUser && (
        <UserProfileModal user={currentDMUser} isSelf={currentDMUser.id === currentUser?.id} onClose={() => setShowFullProfile(false)} />
      )}

      {showAstroPlans && <AstroPlansModal onClose={() => setShowAstroPlans(false)} />}

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setAddQuery(''); setAddResults([]); setAddMessage(null) }} title="Adicionar Amigo">
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Digite nome, email ou codigo de amigo para encontrar pessoas.
        </p>
        <Input
          value={addQuery}
          onChange={setAddQuery}
          placeholder="Pesquisar..."
          style={{ marginBottom: 12 }}
        />
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {addLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Pesquisando...</p>}
          {!addLoading && addQuery.trim().length >= 2 && addResults.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum usuario encontrado.</p>
          )}
          {addResults.map(user => (
            <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
              <Avatar src={user.photoUrl} name={user.name} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{user.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>@{user.friendCode}</div>
              </div>
              <Button size="sm" onClick={async () => {
                if (!currentUser) return
                const added = await addFriendById(currentUser.id, user.id)
                if (added.ok) {
                  setAddMessage({ type: 'ok', text: `Solicitacao enviada para ${user.name}!` })
                  setShowAdd(false); setAddQuery(''); setAddResults([])
                } else {
                  setAddMessage({ type: 'err', text: added.error || 'Erro ao adicionar' })
                }
              }}>Adicionar</Button>
            </div>
          ))}
        </div>
        {addMessage && (
          <p style={{ fontSize: 12, color: addMessage.type === 'ok' ? '#23a55a' : '#ed4245' }}>
            {addMessage.text}
          </p>
        )}
      </Modal>
    </div>
  )
}
