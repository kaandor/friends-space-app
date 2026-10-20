import { Fa } from '../../utils/fa'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Message } from '../../types'

export interface MessageMenuState {
  x: number
  y: number
  message: Message
  isMedia: boolean
}

interface MessageContextMenuProps {
  menu: MessageMenuState | null
  onClose: () => void
  onReply: (msg: Message) => void
  onReact: (msg: Message) => void
  onForward: (msg: Message) => void
  onEdit: (msg: Message) => void
  onDelete: (msg: Message) => void
  onReport: (msg: Message, isMedia: boolean) => void
  onCopyText: (msg: Message) => void
  onCopyLink: (msg: Message) => void
  onSpeak: (msg: Message) => void
  onMarkUnread: () => void
  onCopyId: (msg: Message) => void
  canEdit: (msg: Message) => boolean
  canDelete: (msg: Message) => boolean
}

function MenuItem({ icon, label, onClick, danger }: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 6, textAlign: 'left',
        color: danger ? '#f23f43' : 'var(--text-primary)',
        background: 'transparent', border: 'none', fontSize: 13, cursor: 'pointer',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {icon}
      {label}
    </button>
  )
}

export function MessageContextMenu({ menu, onClose, onReply, onReact, onForward, onEdit, onDelete, onReport, onCopyText, onCopyLink, onSpeak, onMarkUnread, onCopyId, canEdit, canDelete }: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !menu) return
    const place = () => {
      const width = el.offsetWidth
      const height = el.offsetHeight
      el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - width - 8))}px`
      el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - height - 8))}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      const el = document.getElementById('message-context-menu')
      if (el && !el.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, onClose])

  if (!menu) return null
  const { x, y, message, isMedia } = menu
  const editable = canEdit(message)
  const menuWidth = 230
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - 320)),
    zIndex: 12000,
    minWidth: menuWidth,
    width: 'max-content',
    maxWidth: 'calc(100vw - 16px)',
    maxHeight: 'calc(100vh - 16px)',
    overflowY: 'auto',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 6,
    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
  }

  return (
    <div id="message-context-menu" ref={menuRef} style={style}>
      {isMedia && (
        <MenuItem
          icon={<Fa name="flag" size={12} style={{  color: '#f23f43' }} />}
          label="Denunciar midia"
          danger
          onClick={() => { onClose(); onReport(message, true) }}
        />
      )}
      <MenuItem
        icon={<Fa name="face-smile" size={13} />}
        label="Adicionar reacao"
        onClick={() => { onClose(); onReact(message) }}
      />
      <MenuItem
        icon={<Fa name="reply" size={13} />}
        label="Responder"
        onClick={() => { onClose(); onReply(message) }}
      />
      <MenuItem
        icon={<Fa name="share" size={13} />}
        label="Encaminhar"
        onClick={() => { onClose(); onForward(message) }}
      />
      {editable && (
        <MenuItem
          icon={<Fa name="pen" size={13} />}
          label="Editar mensagem"
          onClick={() => { onClose(); onEdit(message) }}
        />
      )}
      <MenuItem
        icon={<Fa name="copy" size={13} />}
        label="Copiar texto"
        onClick={() => { onClose(); onCopyText(message) }}
      />
      <MenuItem
        icon={<Fa name="envelope-open-text" size={13} />}
        label="Marcar como nao lido"
        onClick={() => { onClose(); onMarkUnread() }}
      />
      <MenuItem
        icon={<Fa name="link" size={13} />}
        label="Copiar link da mensagem"
        onClick={() => { onClose(); onCopyLink(message) }}
      />
      <MenuItem
        icon={<Fa name="volume-high" size={13} />}
        label="Falar mensagem"
        onClick={() => { onClose(); onSpeak(message) }}
      />
      {!isMedia && (
        <MenuItem
          icon={<Fa name="flag" size={12} style={{  color: '#f23f43' }} />}
          label="Denunciar mensagem"
          danger
          onClick={() => { onClose(); onReport(message, false) }}
        />
      )}
      {canDelete(message) && (
        <MenuItem
          icon={<Fa name="trash" size={13} />}
          label="Excluir"
          danger
          onClick={() => { onClose(); onDelete(message) }}
        />
      )}
      <MenuItem
        icon={<Fa name="hashtag" size={13} />}
        label="Copiar ID da mensagem"
        onClick={() => { onClose(); onCopyId(message) }}
      />
    </div>
  )
}
