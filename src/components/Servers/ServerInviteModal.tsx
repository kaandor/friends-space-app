import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Avatar } from '../ui/Avatar'
import { useFriendStore } from '../../stores/friendStore'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import type { Server, User } from '../../types'

interface ServerInviteModalProps {
  open: boolean
  onClose: () => void
  server: Server
  onToast: (message: string) => void
}

export function ServerInviteModal({ open, onClose, server, onToast }: ServerInviteModalProps) {
  const { friends, friendUsers } = useFriendStore()
  const { inviteFriendToServer } = useServerStore()
  const { currentUser } = useUserStore()
  const [copied, setCopied] = useState(false)
  const [invited, setInvited] = useState<Record<string, boolean>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const link = `${window.location.origin}${window.location.pathname}?invite=${server.inviteCode}`

  const copyLink = () => {
    try {
      navigator.clipboard.writeText(link).catch(() => {
        const textarea = document.createElement('textarea')
        textarea.value = link
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      })
      setCopied(true)
      onToast('Link de convite copiado!')
      setTimeout(() => setCopied(false), 2000)
    } catch { }
  }

  const members = new Set(server.members || [])
  const friendMap = new Map<string, User>()
  for (const user of friendUsers) friendMap.set(user.id, user)
  const acceptedFriends = friends
    .filter(f => f.status === 'accepted')
    .map(f => (f.userId === currentUser?.id ? f.friendId : f.userId))
    .filter((id, index, arr) => arr.indexOf(id) === index)

  const available = acceptedFriends
    .map(id => friendMap.get(id))
    .filter((u): u is User => Boolean(u))
    .filter(u => !members.has(u.id))

  const handleInvite = async (userId: string) => {
    if (busyId) return
    setBusyId(userId)
    const result = await inviteFriendToServer(server.id, userId)
    setBusyId(null)
    if (result.ok) {
      setInvited(prev => ({ ...prev, [userId]: true }))
      onToast('Convite enviado!')
    } else {
      onToast(result.error || 'Erro ao convidar amigo')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Convidar para ${server.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)', marginBottom: 2 }}>
              Link de convite
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              friends-space...?invite={server.inviteCode}
            </div>
          </div>
          <button
            onClick={copyLink}
            style={{
              padding: '6px 12px', background: copied ? '#23a55a' : 'var(--accent)', color: '#000',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)' }}>
          Convidar amigos ({available.length})
        </div>

        {available.length === 0 ? (
          <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
            Nenhum amigo disponivel. Adicione amigos e volte aqui para convida-los.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {available.map(user => (
              <div key={user.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                background: 'var(--bg-tertiary)', borderRadius: 8,
              }}>
                <Avatar src={user.photoUrl} name={user.name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{user.friendCode}</div>
                </div>
                <button
                  onClick={() => void handleInvite(user.id)}
                  disabled={Boolean(invited[user.id]) || busyId === user.id}
                  style={{
                    padding: '6px 12px', background: invited[user.id] ? '#23a55a' : 'var(--accent)', color: '#000',
                    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: invited[user.id] ? 'default' : 'pointer',
                    opacity: busyId === user.id ? 0.6 : 1,
                  }}
                >
                  {invited[user.id] ? 'Enviado!' : 'Convidar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
