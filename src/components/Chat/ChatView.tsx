import { Fa } from '../../utils/fa'
import { useState, useRef, useEffect, useMemo } from 'react'
import type { Channel, Message } from '../../types'
import { Avatar } from '../ui/Avatar'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore, isUserOnline } from '../../stores/userStore'
import { useCallStore } from '../../stores/callStore'
import { uploadToDriveWithProgress, isDriveConnected, getLastDriveError, startDriveKeepWarm } from '../../services/driveService'
import { assertUploadLimit } from '../../utils/astro'
import { Rocket } from 'lucide-react'
import { nameStyleOf, nameClassOf, hasAstroBadge } from '../../utils/nameStyle'
import { buildFileName, detectMediaKind, extractMediaUrl, extractEmbedUrl, driveFolderFor } from '../../services/mediaDetect'
import { MediaAttachment } from './MediaAttachment'
import { LinkEmbed } from './LinkEmbed'
import { DriveRequiredModal } from './DriveRequiredModal'
import { EmojiPicker } from './EmojiPicker'
import { collectAllServerEmojis, renderContentWithEmojis } from '../../services/serverEmojis'
import { AstroGiftModal } from '../Home/AstroGiftModal'
import { useUserMenuStore } from '../../stores/userMenuStore'
import { MessageContextMenu, type MessageMenuState } from './MessageContextMenu'
import { ReportModal } from './ReportModal'
import { ForwardModal } from './ForwardModal'

interface ChatViewProps {
  channel: Channel
}

interface ReportTargetState {
  type: 'media' | 'message' | 'user' | 'server'
  target: { id: string; name?: string; channelId?: string; serverId?: string; preview?: string }
}

function toast(message: string) {
  window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: message }))
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

function renderEmoji(emoji: string) {
  if (/^https?:\/\//.test(emoji)) {
    return <img src={emoji} alt="" style={{ width: 16, height: 16, objectFit: 'contain', verticalAlign: 'middle' }} />
  }
  return <span style={{ fontSize: 14, lineHeight: 1 }}>{emoji}</span>
}

export function ChatView({ channel }: ChatViewProps) {
  const { messages, sendMessage, loadMessages, loadUnread, markChannelRead, markChannelUnread, editMessage, deleteMessage, addReaction, removeReaction, forwardMessage, servers } = useServerStore()
  const { currentUser, users } = useUserStore()
  const { activeCall, createdAt } = useCallStore()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [driveModal, setDriveModal] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAstro, setShowAstro] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<MessageMenuState | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [reportTarget, setReportTarget] = useState<ReportTargetState | null>(null)
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null)
  const [reactFor, setReactFor] = useState<Message | null>(null)
  const { open: openUserMenu, openProfile } = useUserMenuStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const currentServer = servers.find(s => s.id === channel.serverId) || null
  const canManageEmojis = !!currentUser && !!currentServer &&
    (currentServer.ownerId === currentUser.id || (currentServer.staffMemberIds || []).includes(currentUser.id))
  const isStaff = !!currentUser && !!currentServer &&
    (currentServer.ownerId === currentUser.id || (currentServer.staffMemberIds || []).includes(currentUser.id))
  const [showMembers, setShowMembers] = useState(true)
  const serverMembers = useMemo(() => (currentServer?.members || [])
    .map(id => users.find(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u)), [currentServer, users])
  const membersOnline = serverMembers.filter(u => isUserOnline(u))
  const membersOffline = serverMembers.filter(u => !isUserOnline(u))
  const allEmojis = collectAllServerEmojis()
  /* BOT + :nome: custom do servidor do canal (case-insensitive, sobre o renderer existente) */
  const channelServerEmojis = useMemo(() => {
    const srv = currentServer as unknown as Record<string, unknown> | null
    if (!srv) return allEmojis
    const custom: { name: string; url: string }[] = []
    const pushList = (arr: unknown, urlKey: string) => {
      if (!Array.isArray(arr)) return
      for (const e of arr as Record<string, unknown>[]) {
        const name = typeof e.name === 'string' ? e.name.toLowerCase() : ''
        const url = typeof e[urlKey] === 'string' ? (e[urlKey] as string) : ''
        if (name && url) custom.push({ name, url })
      }
    }
    pushList(srv.customEmojis, 'url')
    const settings = (srv.settings || {}) as Record<string, unknown>
    pushList(settings.emojis, 'detail')
    pushList(srv.emojis, 'url')
    if (custom.length === 0) return allEmojis
    const seen = new Set(allEmojis.map(e => e.name.toLowerCase()))
    const extra = custom.filter(c => !seen.has(c.name)).map((c, i) => ({ id: `custom-${i}`, serverId: currentServer?.id || '', name: c.name, url: c.url, addedBy: '', createdAt: 0 }))
    return [...extra, ...allEmojis]
  }, [currentServer, allEmojis])
  const renderChatContent = (text: string) => {
    if (!text) return text
    const normalized = text.replace(/:([A-Za-z0-9_]{1,32}):/g, (_m, n: string) => `:${String(n).toLowerCase()}:`)
    return renderContentWithEmojis(normalized, channelServerEmojis)
  }
  const isBotMsg = (msg: Message) => Boolean((msg as unknown as Record<string, unknown>).isBot) || String(msg.userId || '').startsWith('bot:')
  const botBadge = (sent: boolean) => (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.4px', background: sent ? 'rgba(0,0,0,0.35)' : 'var(--accent)', color: sent ? '#000' : '#000', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>BOT</span>
  )
  const settings = (currentUser?.settings || {}) as Record<string, unknown>
  const hasAstro = settings['astro'] === true || settings['astro'] === 'true'

  useEffect(() => {
    loadMessages(channel.id)
    void loadUnread()
    void markChannelRead(channel.id)
  }, [channel.id, loadMessages, loadUnread, markChannelRead])

  useEffect(() => {
    if (stickRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  // Light Speed: tempo real no canal aberto (3s com aba visivel).
  useEffect(() => {
    if (!channel?.id) return
    const t = window.setInterval(() => {
      try {
        if (document.visibilityState === 'visible') void loadMessages(channel.id)
      } catch { }
    }, 3000)
    return () => window.clearInterval(t)
  }, [channel?.id, loadMessages])

  const isMediaMsg = (msg: Message) => Boolean(msg.attachmentUrl) || Boolean(extractMediaUrl(msg.content))

  const canEditMsg = (msg: Message) => !!currentUser && msg.userId === currentUser.id

  const [pendingText, setPendingText] = useState<string | null>(null)
  const handleSend = async () => {
    if (!input.trim() || !currentUser || sending) return
    if (!isDriveConnected()) {
      setPendingText(input)
      setDriveModal(true)
      return
    }
    setSending(true)
    try {
      const reply = replyTo ? { id: replyTo.id, userName: replyTo.userName, content: replyTo.content.slice(0, 200) } : undefined
      await sendMessage(channel.id, currentUser.id, currentUser.name, currentUser.photoUrl, input, 'text', undefined, undefined, undefined, undefined, reply)
      setInput('')
      setReplyTo(null)
    } finally {
      setSending(false)
    }
  }

  const handlePickMedia = async (url: string, name: string, kind: 'gif' | 'sticker') => {
    if (!currentUser || sending) return
    setSending(true)
    try {
      const reply = replyTo ? { id: replyTo.id, userName: replyTo.userName, content: replyTo.content.slice(0, 200) } : undefined
      await sendMessage(channel.id, currentUser.id, currentUser.name, currentUser.photoUrl, '', 'text', undefined, url, name, kind, reply)
      setShowEmoji(false)
      setReplyTo(null)
    } finally {
      setSending(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentUser) return
    if (!isDriveConnected()) {
      setPendingFile(file)
      setDriveModal(true)
      return
    }
    await uploadAndSend(file)
  }

  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null)

  useEffect(() => { startDriveKeepWarm() }, [])

  const uploadAndSend = async (file: File) => {
    if (!currentUser) return
    const blocked = assertUploadLimit(currentUser, file.size)
    if (blocked) {
      toast(blocked)
      return
    }
    setSending(true)
    setUploadProgress({ name: file.name, pct: 0 })
    try {
      const kind = detectMediaKind(file.name)
      const folder = kind === 'none' ? 'mensagens' : driveFolderFor(kind)
      const name = kind === 'none' ? file.name : buildFileName(driveFolderFor(kind), file.name)
      const memberEmails = users
        .filter(u => channel && u.id !== currentUser.id && typeof u.email === 'string' && /@/.test(u.email))
        .map(u => u.email as string)
      const url = await uploadToDriveWithProgress(file, name, file.type, folder, memberEmails, (pct) => {
        setUploadProgress({ name: file.name, pct })
      }, 'Arquivos enviados')
      if (!url) {
        toast(getLastDriveError() || 'Falha ao enviar arquivo')
        return
      }
      const reply = replyTo ? { id: replyTo.id, userName: replyTo.userName, content: replyTo.content.slice(0, 200) } : undefined
      await sendMessage(channel.id, currentUser.id, currentUser.name, currentUser.photoUrl, '', 'text', undefined, url, name, kind, reply)
      setReplyTo(null)
    } finally {
      setSending(false)
      setUploadProgress(null)
    }
  }

  const sendAsTxt = async () => {
    const text = input.trim()
    if (!text || !currentUser || sending) return
    const name = `mensagem-${Date.now()}.txt`
    const file = new File([new Blob([text], { type: 'text/plain;charset=utf-8' })], name, { type: 'text/plain' })
    if (!isDriveConnected()) {
      setPendingFile(file)
      setDriveModal(true)
      return
    }
    await uploadAndSend(file)
  }

  const handleDriveConnected = async () => {
    if (pendingFile) {
      const file = pendingFile
      setPendingFile(null)
      await uploadAndSend(file)
    }
    if (pendingText && currentUser && !sending) {
      const text = pendingText
      setPendingText(null)
      setReplyTo(null)
      setSending(true)
      try {
        await sendMessage(channel.id, currentUser.id, currentUser.name, currentUser.photoUrl, text, 'text')
        setInput('')
      } finally {
        setSending(false)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file || !currentUser) return
        const renamed = new File([file], `pasted-${Date.now()}.${file.name.split('.').pop() || 'png'}`, { type: file.type })
        if (!isDriveConnected()) {
          setPendingFile(renamed)
          setDriveModal(true)
        } else {
          void uploadAndSend(renamed)
        }
        return
      }
    }
  }

  const openContext = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, message: msg, isMedia: isMediaMsg(msg) })
  }

  const handleReply = (msg: Message) => {
    setReplyTo(msg)
    setEditingId(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleReact = (msg: Message) => {
    setReactFor(msg)
  }

  const handleReactionToggle = async (msgId: string, emoji: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg || !currentUser) return
    const reaction = msg.reactions?.find(r => r.emoji === emoji)
    if (reaction?.userIds.includes(currentUser.id)) {
      await removeReaction(msgId, emoji)
    } else {
      await addReaction(msgId, emoji)
    }
  }

  const handlePickReaction = (emoji: string) => {
    if (reactFor) void handleReactionToggle(reactFor.id, emoji)
    setReactFor(null)
  }

  const handleEdit = (msg: Message) => {
    setEditingId(msg.id)
    setEditingText(msg.content)
    setReplyTo(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    await editMessage(editingId, editingText.trim())
    setEditingId(null)
    setEditingText('')
  }

  const handleDelete = async (msg: Message) => {
    if (!window.confirm('Excluir esta mensagem?')) return
    await deleteMessage(msg.id)
  }

  const handleReport = (msg: Message, isMedia: boolean) => {
    setReportTarget({
      type: isMedia ? 'media' : 'message',
      target: {
        id: msg.id,
        name: currentServer?.name,
        channelId: channel.id,
        serverId: channel.serverId,
        preview: msg.content.slice(0, 120),
      },
    })
  }

  const handleForwardSelect = async (targetChannelId: string) => {
    if (!forwardTarget) return
    await forwardMessage(forwardTarget, targetChannelId)
    toast('Mensagem encaminhada')
    setForwardTarget(null)
  }

  const handleCopyText = async (msg: Message) => {
    const ok = await copyText(msg.content)
    toast(ok ? 'Texto copiado' : 'Nao foi possivel copiar')
  }

  const handleCopyLink = async (msg: Message) => {
    const link = `${window.location.origin}${window.location.pathname}#/c/${channel.id}/${msg.id}`
    const ok = await copyText(link)
    toast(ok ? 'Link da mensagem copiado' : 'Nao foi possivel copiar')
  }

  const handleCopyId = async (msg: Message) => {
    const ok = await copyText(msg.id)
    toast(ok ? 'ID da mensagem copiado' : 'Nao foi possivel copiar')
  }

  const handleSpeak = (msg: Message) => {
    try {
      const utterance = new SpeechSynthesisUtterance(msg.content)
      utterance.lang = 'pt-BR'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    } catch {
      toast('Nao foi possivel falar a mensagem')
    }
  }

  const handleMarkUnread = async () => {
    await markChannelUnread(channel.id)
    toast('Marcado como nao lido')
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Hoje'
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const groupedMessages: { date: string; msgs: typeof messages }[] = []
  let currentDate = ''
  for (const msg of messages) {
    const d = formatDate(msg.createdAt)
    if (d !== currentDate) {
      currentDate = d
      groupedMessages.push({ date: d, msgs: [] })
    }
    groupedMessages[groupedMessages.length - 1].msgs.push(msg)
  }

  const renderMessageBody = (msg: Message, sent: boolean) => {
    if (msg.attachmentUrl) {
      return <MediaAttachment url={msg.attachmentUrl} name={msg.attachmentName} msgId={msg.id} type={msg.attachmentType} />
    }
    if (msg.type === 'text') {
      return (
        <p style={{ color: sent ? '#000' : 'var(--text-primary)', fontSize: 13, wordBreak: 'break-word', lineHeight: 1.4, margin: 0 }}>
          {(() => {
            const mediaUrl = extractMediaUrl(msg.content)
            if (mediaUrl) {
              const prefix = msg.content.slice(0, msg.content.indexOf(mediaUrl)).trim()
              const suffix = msg.content.slice(msg.content.indexOf(mediaUrl) + mediaUrl.length).trim()
              return (
                <>
                  {prefix && <span>{renderChatContent(prefix)} </span>}
                  <MediaAttachment url={mediaUrl} compact />
                  {suffix && <span> {renderChatContent(suffix)}</span>}
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
                  {prefix && <span>{renderChatContent(prefix)} </span>}
                  <LinkEmbed embed={embed} />
                  {suffix && <span> {renderChatContent(suffix)}</span>}
                </>
              )
            }
            return renderChatContent(msg.content)
          })()}
        </p>
      )
    }
    if (msg.audioUrl) {
      return <audio controls src={msg.audioUrl} style={{ height: 40, borderRadius: 'var(--radius-sm)' }} />
    }
    return null
  }

  return (
    <div className="fs-chat-card" style={{ flex: 1, display: 'flex', flexDirection: 'row', height: '100%', background: 'var(--bg-primary)', minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, minHeight: 0 }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        fontWeight: 600, fontSize: 15, color: 'var(--text-primary)',
        background: 'var(--bg-primary)',
      }}>
        {channel.type === 'voice' ? <Fa name="volume-high" size={18} style={{ color: 'var(--text-muted)' }} /> : <Fa name="hashtag" size={18} style={{ color: 'var(--text-muted)' }} />}
        <span>{channel.name}</span>
        {channel.type === 'voice' && activeCall && createdAt && (
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            {Math.floor((Date.now() - createdAt) / 60000)}:{String(Math.floor(((Date.now() - createdAt) % 60000) / 1000)).padStart(2, '0')}
          </span>
        )}
        {currentServer && (
          <button onClick={() => setShowMembers(s => !s)} title={showMembers ? 'Ocultar membros' : 'Mostrar membros'} style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: showMembers ? 'var(--bg-active)' : 'transparent', border: 'none', color: showMembers ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
            <Fa name="users" size={15} />
          </button>
        )}
      </div>

      <div ref={scrollRef} onScroll={() => {
        try {
          const el = scrollRef.current
          if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        } catch { }
      }} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
        {groupedMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
            <div style={{ width: 64, height: 64, background: 'var(--bg-hover)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--text-secondary)', margin: '0 auto 16px' }}>
              <Fa name="hashtag" size={14} />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Bem-vindo ao #{channel.name}!</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Este e o inicio do canal #{channel.name}.</p>
          </div>
        )}
        {groupedMessages.map((group, gi) => (
          <div key={gi}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', marginBottom: 8 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{group.date}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            {group.msgs.map((msg, mi) => {
              const prev = mi > 0 ? group.msgs[mi - 1] : null
              const sameUser = prev && prev.userId === msg.userId && (msg.createdAt - prev.createdAt) < 300000
              const sent = msg.userId === currentUser?.id
              const msgUser = users.find(u => u.id === msg.userId) || { id: msg.userId, name: msg.userName, photoUrl: msg.userPhoto, friendCode: '', bio: '', createdAt: 0 }
              const isEditing = editingId === msg.id
              return (
                <div key={msg.id} style={{
                  display: 'flex', gap: 8,
                  flexDirection: 'column',
                  alignItems: sent ? 'flex-end' : 'flex-start',
                  marginBottom: sameUser ? 6 : 14,
                }}
                  onContextMenu={(e) => openContext(e, msg)}
                >
                  {!sameUser && !sent && (
                    <span
                      style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                      onClick={() => openProfile(msgUser)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openUserMenu(msgUser, e.clientX, e.clientY) }}
                    >
                      <Avatar src={msg.userPhoto} name={msg.userName} size={20} />
                      <span className={nameClassOf(msgUser)} style={nameStyleOf(msgUser)}>{msg.userName}</span>
                      {hasAstroBadge(msgUser) && <Rocket size={11} strokeWidth={2.5} color="var(--text-primary)" />}
                      {isBotMsg(msg) && botBadge(false)}
                    </span>
                  )}
                  <div style={{
                    padding: '10px 12px', borderRadius: 14,
                    background: sent ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sent ? '#000' : 'var(--text-primary)',
                    maxWidth: '80%', minWidth: 0,
                  }}
                    onContextMenu={(e) => openContext(e, msg)}
                  >
                    {msg.replyTo && (
                      <div style={{ borderLeft: `2px solid ${sent ? 'rgba(0,0,0,0.4)' : 'var(--accent)'}`, paddingLeft: 8, marginBottom: 6, fontSize: 11.5, color: sent ? '#000' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', opacity: sent ? 0.7 : 1 }}>
                        <span style={{ fontWeight: 700 }}>{msg.replyTo.userName}: </span>
                        {msg.replyTo.content}
                      </div>
                    )}
                    {msg.forwardedFrom && (
                      <div style={{ fontSize: 11, color: sent ? '#000' : 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, opacity: sent ? 0.7 : 1 }}>
                        <Fa name="share" size={9} />
                        Encaminhado de {msg.forwardedFrom.userName}
                      </div>
                    )}
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 280 }}>
                        <textarea
                          value={editingText}
                          onChange={e => setEditingText(e.target.value)}
                          rows={2}
                          autoFocus
                          className="fs-chat-input"
                          style={{ fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditingId(null); setEditingText('') }} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                          <button onClick={() => void saveEdit()} disabled={!editingText.trim()} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: editingText.trim() ? 1 : 0.6 }}>Salvar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {renderMessageBody(msg, sent)}
                        <span style={{ fontSize: 10, color: sent ? '#000' : 'var(--text-secondary)', display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, opacity: sent ? 0.6 : 1 }}>
                          {isBotMsg(msg) && botBadge(sent)}
                          {formatTime(msg.createdAt)} {sent && <Fa name="check-double" size={14} style={{ marginLeft: 2 }} />}
                          {msg.edited && <span style={{ marginLeft: 4, opacity: 0.7 }}>(editado)</span>}
                        </span>
                      </>
                    )}
                  </div>
                  {(msg.reactions || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 4 }}>
                      {(msg.reactions || []).map(reaction => {
                        const mine = !!currentUser && reaction.userIds.includes(currentUser.id)
                        return (
                          <button
                            key={reaction.emoji}
                            onClick={() => void handleReactionToggle(msg.id, reaction.emoji)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
                              fontSize: 12, border: `1px solid ${mine ? 'var(--accent)' : 'var(--border)'}`,
                              background: mine ? 'rgba(74,222,128,0.18)' : 'var(--bg-tertiary)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {renderEmoji(reaction.emoji)}
                            <span style={{ fontWeight: 700 }}>{reaction.userIds.length}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {replyTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
          <Fa name="reply" size={14} style={{ color: 'var(--text-primary)' }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Respondendo a <b style={{ color: 'var(--text-primary)' }}>{replyTo.userName}</b>: {replyTo.content.slice(0, 120)}
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Fa name="xmark" size={14} /></button>
        </div>
      )}

      {uploadProgress && (
        <div style={{ margin: '0 16px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>Enviando {uploadProgress.name}</span>
            <span>{uploadProgress.pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress.pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}
      <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => fileInputRef.current?.click()} className="fs-input-icon" title="Enviar midia">
              <Fa name="plus" size={14} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
          <div className="fs-chat-input-wrapper">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={`Mensagem #${channel.name}`}
              rows={1}
              className="fs-chat-input"
              style={{ maxHeight: 120 }}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowEmoji(s => !s)} className="fs-input-icon" title="Emojis">
              <Fa name="face-smile" size={14} />
            </button>
            {showEmoji && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowEmoji(false)} />
                <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 41 }}>
                  <EmojiPicker
                    onPick={(emoji) => { setInput(v => v + emoji); setShowEmoji(false) }}
                    onPickMedia={handlePickMedia}
                    allEmojis={allEmojis}
                    serverId={currentServer?.id || null}
                    manageable={canManageEmojis}
                    hasAstro={hasAstro}
                  />
                </div>
              </>
            )}
          </div>
          <button className="fs-send-btn" onClick={handleSend} disabled={!input.trim() || sending}>
            {sending ? <span className="inline-spinner" /> : <Fa name="paper-plane" size={14} />}
          </button>
          {input.trim().length >= 300 && (
            <button
              onClick={() => void sendAsTxt()}
              disabled={sending}
              title="Enviar como arquivo .txt"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                fontSize: 11.5, fontWeight: 700, padding: '8px 12px', borderRadius: 8,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', cursor: sending ? 'default' : 'pointer', flexShrink: 0,
              }}
            >
              <Fa name="file-lines" size={14} /> Enviar como .txt
            </button>
          )}
        </div>
      </div>
      </div>
      {currentServer && showMembers && (
        <div className="fs-chat-members">
          <div className="fs-chat-members-head">
            <span>Membros — {serverMembers.length}</span>
            <button onClick={() => setShowMembers(false)} title="Fechar">✕</button>
          </div>
          <div className="fs-chat-members-list">
            <div className="fs-chat-members-group">Online — {membersOnline.length}</div>
            {membersOnline.length === 0 && <div className="fs-chat-members-empty">Ninguém</div>}
            {membersOnline.map(u => (
              <div key={u.id} className="fs-chat-member-row" onClick={() => openProfile(u)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openUserMenu(u, e.clientX, e.clientY) }}>
                <Avatar src={u.photoUrl} name={u.name} size={28} />
                <span className="fs-chat-member-name">{u.name}</span>
                <span className="fs-chat-member-dot online" />
              </div>
            ))}
            <div className="fs-chat-members-group">Offline — {membersOffline.length}</div>
            {membersOffline.map(u => (
              <div key={u.id} className="fs-chat-member-row" onClick={() => openProfile(u)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openUserMenu(u, e.clientX, e.clientY) }}>
                <Avatar src={u.photoUrl} name={u.name} size={28} />
                <span className="fs-chat-member-name">{u.name}</span>
                <span className="fs-chat-member-dot" />
              </div>
            ))}
          </div>
        </div>
      )}

      <MessageContextMenu
        menu={ctxMenu}
        onClose={() => setCtxMenu(null)}
        onReply={handleReply}
        onReact={handleReact}
        onForward={(msg) => setForwardTarget(msg)}
        onEdit={handleEdit}
        onDelete={(msg) => void handleDelete(msg)}
        onReport={handleReport}
        onCopyText={(msg) => void handleCopyText(msg)}
        onCopyLink={(msg) => void handleCopyLink(msg)}
        onSpeak={(msg) => handleSpeak(msg)}
        onMarkUnread={() => void handleMarkUnread()}
        onCopyId={(msg) => void handleCopyId(msg)}
        canEdit={canEditMsg}
        canDelete={(msg) => !!currentUser && (msg.userId === currentUser.id || Boolean(isStaff))}
      />

      <ReportModal
        open={reportTarget !== null}
        type={reportTarget?.type || null}
        target={reportTarget?.target || null}
        serverId={currentServer?.id || null}
        onClose={() => setReportTarget(null)}
      />

      <ForwardModal
        message={forwardTarget}
        servers={servers}
        onSelect={(targetChannelId) => void handleForwardSelect(targetChannelId)}
        onClose={() => setForwardTarget(null)}
      />

      {reactFor && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 12000 }} onClick={() => setReactFor(null)} />
          <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 12001 }}>
            <EmojiPicker
              onPick={handlePickReaction}
              onPickMedia={(url) => handlePickReaction(url)}
              allEmojis={allEmojis}
              serverId={currentServer?.id || null}
              manageable={canManageEmojis}
              hasAstro={hasAstro}
            />
          </div>
        </>
      )}

      <DriveRequiredModal open={driveModal} onClose={() => { setDriveModal(false); setPendingFile(null) }} onConnected={handleDriveConnected} file={pendingFile} />
      {showAstro && <AstroGiftModal onClose={() => setShowAstro(false)} />}
    </div>
  )
}
