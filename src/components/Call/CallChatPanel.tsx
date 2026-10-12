import { Fa } from '../../utils/fa'
import { useEffect, useRef, useState } from 'react'
import type { Channel, Message } from '../../types'
import { Avatar } from '../ui/Avatar'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { uploadToDrive, isDriveConnected } from '../../services/driveService'
import { assertUploadLimit } from '../../utils/astro'
import { buildFileName, detectMediaKind, extractMediaUrl, extractEmbedUrl, driveFolderFor } from '../../services/mediaDetect'
import { MediaAttachment } from '../Chat/MediaAttachment'
import { LinkEmbed } from '../Chat/LinkEmbed'
import { EmojiPicker } from '../Chat/EmojiPicker'
import { collectAllServerEmojis, renderContentWithEmojis } from '../../services/serverEmojis'

function toast(message: string) {
  window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: message }))
}

// Painel fino vertical de chat dentro da call (como a lista de membros):
// mensagens do canal atual, compartilhamento de midia e emojis.
export function CallChatPanel({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { messages, sendMessage, loadMessages } = useServerStore()
  const { currentUser, users } = useUserStore()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const allEmojis = collectAllServerEmojis()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMessages(channel.id)
  }, [channel.id, loadMessages])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || !currentUser || sending) return
    if (!isDriveConnected()) { toast('Conecte seu Google Drive para mandar mensagens'); return }
    setSending(true)
    try {
      await sendMessage(channel.id, currentUser.id, currentUser.name, currentUser.photoUrl, text, 'text')
      setInput('')
    } finally {
      setSending(false)
    }
  }

  const pickEmoji = (emoji: string) => {
    setInput(prev => prev + emoji)
  }

  const pickMedia = async (url: string, name: string, kind: 'gif' | 'sticker') => {
    if (!currentUser || sending) return
    setSending(true)
    try {
      await sendMessage(channel.id, currentUser.id, currentUser.name, currentUser.photoUrl, '', 'text', undefined, url, name, kind)
      setShowEmoji(false)
    } finally {
      setSending(false)
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentUser || sending) return
    if (!isDriveConnected()) { toast('Conecte seu Google Drive para enviar arquivos'); return }
    const blocked = assertUploadLimit(currentUser, file.size)
    if (blocked) { toast(blocked); return }
    setSending(true)
    try {
      const kind = detectMediaKind(file.name)
      const folder = kind === 'none' ? 'mensagens' : driveFolderFor(kind)
      const name = kind === 'none' ? file.name : buildFileName(driveFolderFor(kind), file.name)
      const memberEmails = users
        .filter(u => channel && u.id !== currentUser.id && typeof u.email === 'string' && /@/.test(u.email))
        .map(u => u.email as string)
      const url = await uploadToDrive(file, name, file.type, folder, memberEmails, 'Arquivos enviados')
      if (!url) return
      await sendMessage(channel.id, currentUser.id, currentUser.name, currentUser.photoUrl, '', 'text', undefined, url, name, kind)
    } finally {
      setSending(false)
    }
  }

  const renderBody = (msg: Message, sent: boolean) => {
    if (msg.attachmentUrl) {
      return <MediaAttachment url={msg.attachmentUrl} name={msg.attachmentName} msgId={msg.id} type={msg.attachmentType} />
    }
    if (msg.type === 'text') {
      const mediaUrl = extractMediaUrl(msg.content)
      if (mediaUrl) {
        const prefix = msg.content.slice(0, msg.content.indexOf(mediaUrl)).trim()
        const suffix = msg.content.slice(msg.content.indexOf(mediaUrl) + mediaUrl.length).trim()
        return (
          <p style={{ margin: 0, color: sent ? '#000' : 'var(--text-primary)', fontSize: 12.5, wordBreak: 'break-word', lineHeight: 1.4 }}>
            {prefix && <span>{renderContentWithEmojis(prefix, allEmojis)} </span>}
            <MediaAttachment url={mediaUrl} compact />
            {suffix && <span> {renderContentWithEmojis(suffix, allEmojis)}</span>}
          </p>
        )
      }
      const embed = extractEmbedUrl(msg.content)
      if (embed) {
        return (
          <p style={{ margin: 0, color: sent ? '#000' : 'var(--text-primary)', fontSize: 12.5, wordBreak: 'break-word', lineHeight: 1.4 }}>
            <LinkEmbed embed={embed} />
          </p>
        )
      }
      return <p style={{ margin: 0, color: sent ? '#000' : 'var(--text-primary)', fontSize: 12.5, wordBreak: 'break-word', lineHeight: 1.4 }}>{renderContentWithEmojis(msg.content, allEmojis)}</p>
    }
    if (msg.audioUrl) {
      return <audio controls src={msg.audioUrl} style={{ height: 36, maxWidth: '100%' }} />
    }
    return null
  }

  return (
    <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-tertiary)', borderLeft: '1px solid var(--border)', minWidth: 0 }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Fa name="hashtag" size={16} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</span>
        <button onClick={onClose} title="Fechar chat" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, fontSize: 15 }}><Fa name="xmark" size={14} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, paddingTop: 30 }}>
            Sem mensagens ainda. Escreva algo!
          </div>
        )}
        {messages.map(msg => {
          const sent = msg.userId === currentUser?.id
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: sent ? 'flex-end' : 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <Avatar src={msg.userPhoto} name={msg.userName} size={16} />
                {msg.userName}
              </span>
              <div style={{ padding: '8px 11px', borderRadius: 12, background: sent ? 'var(--accent)' : 'var(--bg-secondary)', color: sent ? '#000' : 'var(--text-primary)', maxWidth: '85%', minWidth: 0 }}>
                {renderBody(msg, sent)}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {showEmoji && (
        <div style={{ borderTop: '1px solid var(--border)', maxHeight: 220, overflowY: 'auto' }}>
          <EmojiPicker onPick={pickEmoji} onPickMedia={pickMedia} allEmojis={allEmojis} />
        </div>
      )}

      <div style={{ padding: '10px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <button onClick={() => fileInputRef.current?.click()} title="Compartilhar midia (foto, video, audio, arquivo)" disabled={sending} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, padding: 4 }}><Fa name="paperclip" size={14} /></button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder={`Mensagem para ${channel.name}`}
          style={{ flex: 1, minWidth: 0, background: 'var(--bg-secondary)', border: 'none', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 12.5, outline: 'none' }}
        />
        <button onClick={() => setShowEmoji(s => !s)} title="Emojis" style={{ background: 'transparent', border: 'none', color: showEmoji ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 15, padding: 4 }}><Fa name="face-smile" size={14} /></button>
        <button onClick={() => void send()} disabled={sending} title="Enviar" style={{ background: 'var(--accent)', border: 'none', color: '#000', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fa name="paper-plane" size={14} /></button>
      </div>
    </div>
  )
}
