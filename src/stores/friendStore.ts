import { create } from 'zustand'
import type { Friend, DirectMessage, User } from '../types'
import { getDb } from '../db'
import { useUserStore } from './userStore'
import { requestBackend } from '../services/backend'

interface FriendState {
  friends: Friend[]
  friendUsers: User[]
  directMessages: DirectMessage[]
  currentDMUser: User | null
  loadFriends: (userId: string) => Promise<void>
  startFriendsPoll: (userId: string) => void
  stopFriendsPoll: () => void
  sendFriendRequest: (userId: string, friendCode: string) => Promise<{ ok: boolean, error?: string }>
  addFriendById: (userId: string, friendId: string) => Promise<{ ok: boolean, error?: string }>
  acceptFriend: (friendId: string) => Promise<void>
  declineFriend: (friendId: string) => Promise<void>
  respondFriend: (friendId: string, accept: boolean) => Promise<void>
  removeFriend: (friendId: string) => Promise<void>
  sendDirectMessage: (fromId: string, toId: string, content: string, type?: 'text' | 'audio', audioUrl?: string, attachmentUrl?: string, attachmentName?: string, attachmentType?: string, replyTo?: DirectMessage['replyTo']) => Promise<void>
  deleteDirectMessage: (messageId: string) => Promise<void>
  loadDirectMessages: (userId1: string, userId2: string) => Promise<void>
  setCurrentDMUser: (user: User | null) => void
  addDirectMessage: (msg: DirectMessage) => void
}

let friendsTimer: number | null = null

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  friendUsers: [],
  directMessages: [],
  currentDMUser: null,
  loadFriends: async (userId) => {
    try {
      const result = await requestBackend<{ friends: Friend[], friendUsers: User[] }>('loadFriends', { userId })
      // SEMPRE aplica o resultado: o short-circuit antigo (mesmo length/ids
      // iguais -> return) congelava lastSeenAt/atividade para sempre, e a UI
      // mostrava "Offline" e "Jogando X" eternos mesmo com dado novo no banco.
      set(result)
      try {
        const db = getDb(localStorage.getItem('friends-space:profile-id') || userId)
        void db.friends.bulkPut(result.friends)
      } catch { }
      return
    } catch {
      // Mantém a lista anterior em falha transitória (nunca zera sozinho)
    }
  },
  startFriendsPoll: (userId) => {
    if (friendsTimer !== null) window.clearInterval(friendsTimer)
    friendsTimer = window.setInterval(() => {
      if (document.hidden) return
      void get().loadFriends(userId)
    }, 15000)
  },
  stopFriendsPoll: () => {
    if (friendsTimer !== null) { window.clearInterval(friendsTimer); friendsTimer = null }
  },
  sendFriendRequest: async (userId, friendCode) => {
    try {
      const friendUser = await requestBackend<User | undefined>('findUserByFriendCode', { friendCode })
      if (!friendUser) return { ok: false, error: 'Codigo nao encontrado' }
      const result = await requestBackend<{ friends: Friend[], friendUsers: User[] }>('sendFriendRequest', {
        userId,
        friendId: friendUser.id,
      })
      set(result)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erro ao adicionar amigo' }
    }
  },
  addFriendById: async (userId, friendId) => {
    try {
      if (userId === friendId) return { ok: false, error: 'Você não pode adicionar você mesmo' }
      const result = await requestBackend<{ friends: Friend[], friendUsers: User[] }>('sendFriendRequest', { userId, friendId })
      set(result)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erro ao adicionar amigo' }
    }
  },
  acceptFriend: async (friendId) => { await get().respondFriend(friendId, true) },
  declineFriend: async (friendId) => { await get().respondFriend(friendId, false) },
  respondFriend: async (friendId, accept) => {
    const currentUser = useUserStore.getState().currentUser
    if (!currentUser) return
    try {
      const result = await requestBackend<{ friends: Friend[], friendUsers: User[] }>('respondFriendRequest', { friendId, userId: currentUser.id, accept })
      set(result)
    } catch {
      await get().loadFriends(currentUser.id)
    }
  },
  removeFriend: async (friendId) => {
    const currentUser = useUserStore.getState().currentUser
    try {
      if (currentUser) {
        const result = await requestBackend<{ friends: Friend[], friendUsers: User[] }>('removeFriend', { friendId, userId: currentUser.id })
        set(result)
        return
      }
    } catch { }
    await getDb(localStorage.getItem('friends-space:profile-id') || currentUser?.id || 'anonymous').friends.delete(friendId)
    set({ friends: get().friends.filter(f => f.id !== friendId) })
    if (currentUser) get().loadFriends(currentUser.id)
  },
  sendDirectMessage: async (fromId, toId, content, type = 'text', audioUrl, attachmentUrl, attachmentName, attachmentType, replyTo) => {
const message = {
fromId,
toId,
content,
type,
audioUrl,
attachmentUrl,
attachmentName,
attachmentType,
replyTo,
}
    try {
      const result = await requestBackend<{ message: DirectMessage }>('sendDirectMessage', { message })
      set({ directMessages: [...get().directMessages, result.message] })
      return
    } catch {
      return
    }
  },
  deleteDirectMessage: async (messageId) => {
const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
try {
await requestBackend<{ messageId: string }>('deleteDirectMessage', { messageId, userId: currentUserId })
set({ directMessages: get().directMessages.filter(m => m.id !== messageId) })
} catch {
}
},
  loadDirectMessages: async (userId1, userId2) => {
    try {
      const directMessages = await requestBackend<DirectMessage[]>('loadDirectMessages', { userId1, userId2 })
      set({ directMessages })
      return
    } catch {
      set({ directMessages: [] })
    }
  },
  setCurrentDMUser: (user) => set({ currentDMUser: user, directMessages: [] }),
  addDirectMessage: (msg) => set({ directMessages: [...get().directMessages, msg] }),
}))
