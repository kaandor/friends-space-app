import { create } from 'zustand'
import type { Server, Channel, Role, Message, Report, ReportAttachment, ServerSettings } from '../types'
import { defaultServerSettings } from '../types'

function toastAndThrow(message: string): never {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: message }))
  throw new Error(message)
}

function getServerSettingsOf(server: Server | undefined): ServerSettings {
  const defaults = defaultServerSettings()
  if (!server?.settings) return defaults
  const s = server.settings
  return {
    ...defaults,
    ...s,
    toggles: { ...defaults.toggles, ...(s.toggles || {}) },
    automod: { ...defaults.automod, ...(s.automod || {}) },
    widget: { ...defaults.widget, ...(s.widget || {}) },
  }
}

const BASE_OFFENSE_WORDS = ['arrombado', 'fdp', 'filho da puta', 'vai se foder', 'retardado', 'idiota', 'otario', 'imbecil', 'escroto', 'cuzao', 'porra', 'caralho', 'buceta', 'puta', 'vagabunda', 'corno']
import { getDb } from '../db'
import { requestBackend } from '../services/backend'
import { getActiveProfileId } from '../services/profile'
import { useUserStore } from './userStore'
import { getServerLimit } from '../utils/astro'

function notifyServerSync() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('friends-space:sync'))
  try {
    const channel = new BroadcastChannel('friends-space-sync')
    channel.postMessage({ type: 'sync', at: Date.now() })
    channel.close()
  } catch {
  }
}

export function assertServerLimitServers(servers: Server[]): string | null {
  const me = useUserStore.getState().currentUser
  const limit = getServerLimit(me)
  if (!Number.isFinite(limit)) return null
  const count = servers.filter((s) => Array.isArray(s.members) && s.members.includes(me?.id || '')).length
  if (count >= limit) {
    return `Limite de ${limit} ${limit === 1 ? 'servidor' : 'servidores'} atingido. Assine ASTRO para criar e entrar em mais servidores.`
  }
  return null
}

function shallowEqual<T>(a: T[], b: T[], key: (item: T) => string): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (key(a[i]) !== key(b[i])) return false
  }
  return true
}

interface ServerState {
  servers: Server[]
  currentServer: Server | null
  currentChannel: Channel | null
  messages: Message[]
  unread: Record<string, number>
  totalUnread: number
  loadServers: () => Promise<void>
  fetchServer: (serverId: string) => Promise<Server | null>
  adoptServerId: (localId: string, remote: Server) => Promise<void>
  seedServer: (server: Server) => Promise<void>
  createServer: (name: string, ownerId: string, photoUrl?: string, category?: string, extra?: {
    bannerUrl?: string
    description?: string
    themes?: string[]
    frequency?: string
    peakTime?: string
    language?: string
    accent?: string
    minAge?: string
    requireAgeCheck?: boolean
    toggles?: { public?: boolean; verify?: boolean; welcome?: boolean; logs?: boolean; approval?: boolean; invites?: boolean; slowmode?: boolean }
    moderation?: string
    automod?: { spam?: boolean; links?: boolean; caps?: boolean }
    rules?: string
    textChannels?: string[]
    voiceChannels?: string[]
    categories?: string[]
    roles?: { name: string; color: string }[]
    events?: { title: string; description?: string; date?: number }[]
  }) => Promise<Server>
  joinServer: (inviteCode: string, userId: string, serverId?: string) => Promise<{ ok: boolean, error?: string }>
  setCurrentServer: (server: Server | null) => void
  setCurrentChannel: (channel: Channel | null) => void
  updateServer: (serverId: string, data: Partial<Server>) => Promise<void>
  deleteServer: (serverId: string, userId: string) => Promise<{ ok: boolean, error?: string }>
  addChannel: (serverId: string, name: string, type: 'text' | 'voice', categoryId?: string) => Promise<void>
  renameChannel: (serverId: string, channelId: string, name: string) => Promise<void>
  deleteChannel: (serverId: string, channelId: string) => Promise<void>
  addCategory: (serverId: string, name: string) => Promise<void>
  renameCategory: (serverId: string, categoryId: string, name: string) => Promise<void>
  deleteCategory: (serverId: string, categoryId: string) => Promise<void>
  addServerEvent: (serverId: string, data: { title: string; description?: string; date: number; location?: string }) => Promise<void>
  deleteServerEvent: (serverId: string, eventId: string) => Promise<void>
  addForumThread: (serverId: string, title: string, body: string) => Promise<{ ok: boolean; error?: string; threadId?: string }>
  addForumReply: (serverId: string, threadId: string, content: string) => Promise<{ ok: boolean; error?: string }>
  deleteForumThread: (serverId: string, threadId: string) => Promise<{ ok: boolean; error?: string }>
  addRole: (serverId: string, name: string, color: string) => Promise<void>
  addMember: (serverId: string, userId: string) => Promise<void>
  addServerEmoji: (serverId: string, name: string, url: string, kind?: 'emoji' | 'gif' | 'sticker') => Promise<void>
  deleteServerEmoji: (serverId: string, emojiId: string) => Promise<void>
  leaveServer: (serverId: string, userId: string) => Promise<void>
  sendMessage: (channelId: string, userId: string, userName: string, userPhoto: string, content: string, type?: 'text' | 'audio', audioUrl?: string, attachmentUrl?: string, attachmentName?: string, attachmentType?: string, replyTo?: { id: string; userName: string; content: string }) => Promise<void>
  loadMessages: (channelId: string) => Promise<void>
  loadUnread: () => Promise<void>
  markChannelRead: (channelId: string) => Promise<void>
  markChannelUnread: (channelId: string) => Promise<void>
  editMessage: (messageId: string, content: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  addReaction: (messageId: string, emoji: string) => Promise<void>
  removeReaction: (messageId: string, emoji: string) => Promise<void>
  forwardMessage: (message: Message, targetChannelId: string) => Promise<void>
  createReport: (input: { reporterId: string; type: 'media' | 'message' | 'user' | 'server' | 'help'; subject?: string; scope?: 'server' | 'global'; serverId?: string; target: { id: string; name?: string; channelId?: string; serverId?: string; messageId?: string; preview?: string }; questionnaire: string[]; description: string; proofUrl?: string; evidence?: ReportAttachment[] }) => Promise<{ report?: Report; error?: string }>
  getMyReports: () => Promise<Report[]>
  reportUnanswered: (reportId: string, message: string) => Promise<{ report?: Report; error?: string }>
  getServerByInvite: (inviteCode: string) => Promise<Server | undefined>
  inviteFriendToServer: (serverId: string, friendUserId: string) => Promise<{ ok: boolean, error?: string }>
  saveServerSettings: (serverId: string, patch: Partial<ServerSettings>) => Promise<void>
  logAudit: (serverId: string, action: string, detail: string) => Promise<void>
  kickMember: (serverId: string, userId: string) => Promise<void>
  banMember: (serverId: string, userId: string) => Promise<void>
  unbanMember: (serverId: string, userId: string) => Promise<void>
  timeoutMember: (serverId: string, userId: string, minutes: number) => Promise<void>
  regenerateInvite: (serverId: string) => Promise<string>
  createInvite: (serverId: string, label: string) => Promise<string>
  postAsBot: (serverId: string, channelId: string, botId: string, text: string) => Promise<void>
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  currentServer: null,
  currentChannel: null,
  messages: [],
  unread: {},
  totalUnread: 0,
  loadServers: async () => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id')
    if (!currentUserId) return
    const currentServerId = get().currentServer?.id || null
    const currentChannelObj = get().currentChannel
    let servers: Server[]
    try {
      const loaded = await requestBackend<Server[]>('loadUserServers', { userId: currentUserId })
      if (!Array.isArray(loaded)) return
      servers = loaded
      await getDb(getActiveProfileId()).servers.bulkPut(servers)
      if (servers.length === 0) {
        // Backend vazio mas aparelho tem servidores: tenta restaurar e relê.
        // Cobre limpeza indevida sem apagar nada local.
        try {
          const local = await getDb(getActiveProfileId()).servers.toArray()
          const mine = local.filter(s => Array.isArray(s.members) && (s.members.includes(currentUserId) || s.ownerId === currentUserId))
          if (mine.length > 0) {
            for (const s of mine) {
              try { await requestBackend('restoreServer', { server: s, userId: currentUserId }) } catch { }
            }
            const reloaded = await requestBackend<Server[]>('loadUserServers', { userId: currentUserId })
            if (Array.isArray(reloaded) && reloaded.length > 0) {
              servers = reloaded
              await getDb(getActiveProfileId()).servers.bulkPut(servers)
            } else {
              servers = mine
            }
          }
        } catch { }
      }
    } catch {
      const local = await getDb(getActiveProfileId()).servers.toArray()
      servers = local.filter(s => Array.isArray(s.members) && s.members.includes(currentUserId))
      if (servers.length === 0) return
    }
    const prev = get()
    if (shallowEqual(prev.servers, servers, s => s.id)) {
      // Mesmos ids: ainda assim atualiza se algum conteúdo mudou (banner,
      // descrição, settings, membros...). Antes retornava cedo e a UI nunca
      // via mudanças vindas do backend/outra aba.
      try {
        if (JSON.stringify(prev.servers) === JSON.stringify(servers)) return
      } catch { return }
    }
    const nextCurrentServer =
      currentServerId
        ? servers.find(server => server.id === currentServerId) || prev.currentServer
        : prev.currentServer
    let nextCurrentChannel = currentChannelObj
    if (nextCurrentServer && currentChannelObj) {
      const found = nextCurrentServer.channels.find(ch => ch.id === currentChannelObj.id)
      if (found) nextCurrentChannel = found
    }
    set({ servers, currentServer: nextCurrentServer, currentChannel: nextCurrentChannel })
  },
  seedServer: async (server) => {
    if (!server || !server.id) return
    const prev = get()
    if (prev.servers.some(s => s.id === server.id)) return
    set({ servers: [...prev.servers, server] })
    try { await getDb(getActiveProfileId()).servers.put(server) } catch { }
    notifyServerSync()
  },
  adoptServerId: async (localId, remote) => {
    const prev = get()
    const servers = (prev.servers.some(s => s.id === localId)
      ? prev.servers.map(s => s.id === localId ? remote : s)
      : [...prev.servers, remote]
    ).filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)
    set({
      servers,
      currentServer: prev.currentServer?.id === localId ? remote : prev.currentServer,
      currentChannel: prev.currentChannel?.serverId === localId
        ? (remote.channels.find(c => c.type === 'text') || remote.channels[0] || null)
        : prev.currentChannel,
    })
    try {
      const db = getDb(getActiveProfileId())
      await db.servers.bulkDelete([localId])
      await db.servers.bulkPut(servers)
    } catch { }
    notifyServerSync()
  },
  fetchServer: async (serverId) => {
    const userId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const server = await requestBackend<Server | null>('getServer', { serverId, userId })
      if (!server || !server.id) return null
      await getDb(getActiveProfileId()).servers.put(server)
      const prev = get()
      const exists = prev.servers.some(s => s.id === server.id)
      set({
        servers: exists ? prev.servers.map(s => s.id === server.id ? server : s) : [...prev.servers, server],
        currentServer: prev.currentServer?.id === server.id ? server : prev.currentServer,
      })
      notifyServerSync()
      return server
    } catch { return null }
  },
  createServer: async (name: string, ownerId: string, photoUrl?: string, category?: string, extra?: {
    bannerUrl?: string
    description?: string
    themes?: string[]
    frequency?: string
    peakTime?: string
    language?: string
    accent?: string
    minAge?: string
    requireAgeCheck?: boolean
    toggles?: { public?: boolean; verify?: boolean; welcome?: boolean; logs?: boolean; approval?: boolean; invites?: boolean; slowmode?: boolean }
    moderation?: string
    automod?: { spam?: boolean; links?: boolean; caps?: boolean }
    rules?: string
    textChannels?: string[]
    voiceChannels?: string[]
    categories?: string[]
    roles?: { name: string; color: string }[]
    events?: { title: string; description?: string; date?: number }[]
  }) => {
    const blocked = assertServerLimitServers(get().servers)
    if (blocked) {
      throw new Error(blocked)
    }
    // Monta os canais/cargos/categorias/eventos que o usuário definiu no painel.
    const buildCustom = (serverId: string) => {
      const textNames = (extra?.textChannels || []).map(s => String(s || '').trim().slice(0, 40)).filter(Boolean)
      const voiceNames = (extra?.voiceChannels || []).map(s => String(s || '').trim().slice(0, 40)).filter(Boolean)
      const channels: Channel[] = [
        ...textNames.map(n => ({ id: crypto.randomUUID(), name: n, type: 'text' as const, serverId })),
        ...voiceNames.map(n => ({ id: crypto.randomUUID(), name: n, type: 'voice' as const, serverId })),
      ]
      const finalChannels: Channel[] = channels.length > 0 ? channels : [
        { id: crypto.randomUUID(), name: 'geral', type: 'text', serverId },
        { id: crypto.randomUUID(), name: 'Sala 1', type: 'voice', serverId },
      ]
      const roleDrafts = (extra?.roles || []).map(r => ({ name: String(r?.name || '').trim().slice(0, 30), color: String(r?.color || '#29A3FF') })).filter(r => r.name)
      const roles: Role[] = roleDrafts.length > 0
        ? roleDrafts.map(r => ({ id: crypto.randomUUID(), name: r.name, color: r.color, serverId, permissions: r.name.toLowerCase() === 'admin' ? ['all'] : [] }))
        : [{ id: crypto.randomUUID(), name: 'Admin', color: '#29A3FF', serverId, permissions: ['all'] }]
      const categories = (extra?.categories || []).map(n => String(n || '').trim().slice(0, 40)).filter(Boolean)
        .map(n => ({ id: crypto.randomUUID(), name: n, serverId }))
      const events = (extra?.events || []).map(e => ({
        id: crypto.randomUUID(), serverId,
        title: String(e?.title || '').trim().slice(0, 80) || 'Evento',
        description: String(e?.description || ''),
        date: Number(e?.date) > 0 ? Number(e.date) : Date.now() + 24 * 3600 * 1000,
        createdBy: ownerId, createdAt: Date.now(),
      })).filter(e => e.title)
      return { finalChannels, roles, categories, events }
    }
    const fullPayload = {
      name, ownerId, photoUrl, category,
      bannerUrl: extra?.bannerUrl,
      description: extra?.description ?? extra?.rules,
      themes: extra?.themes, frequency: extra?.frequency, minAge: extra?.minAge,
      toggles: extra?.toggles, rules: extra?.rules,
      peakTime: extra?.peakTime, language: extra?.language, accent: extra?.accent,
      requireAgeCheck: extra?.requireAgeCheck, moderation: extra?.moderation, automod: extra?.automod,
      textChannels: extra?.textChannels, voiceChannels: extra?.voiceChannels,
      categories: extra?.categories, roles: extra?.roles, events: extra?.events,
    }
    const applyFullData = async (server: Server): Promise<Server> => {
      const sid = server.id
      const { finalChannels, roles, categories, events } = buildCustom(sid)
      const wantsCustom = Boolean(
        (extra?.textChannels?.length || extra?.voiceChannels?.length || extra?.categories?.length || extra?.roles?.length || extra?.events?.length)
      )
      const patch: Partial<Server> = {
        ...(extra?.bannerUrl !== undefined ? { bannerUrl: extra.bannerUrl } : {}),
        ...(extra?.description !== undefined || extra?.rules !== undefined ? { description: extra.description ?? extra.rules ?? '' } : {}),
        ...(extra?.themes?.length || category ? { category: category || extra?.themes?.[0] } : {}),
      }
      const currentChannels = server.channels || []
      const hasCustomChannels = wantsCustom && (
        currentChannels.length !== finalChannels.length ||
        currentChannels.some((c, i) => c.name !== finalChannels[i]?.name || c.type !== finalChannels[i]?.type)
      )
      if (hasCustomChannels) (patch as Partial<Server>).channels = finalChannels
      const currentRoles = server.roles || []
      if ((extra?.roles?.length) && (
        currentRoles.length !== roles.length ||
        currentRoles.some((r, i) => r.name !== roles[i]?.name)
      )) (patch as Partial<Server>).roles = roles
      if (extra?.categories?.length) (patch as Partial<Server>).categories = categories
      if (extra?.events?.length) (patch as Partial<Server>).events = events
      if (extra?.themes?.length || extra?.frequency || extra?.minAge || extra?.toggles) {
        const cur = getServerSettingsOf(server)
        ;(patch as Partial<Server>).settings = {
          ...cur,
          themes: extra.themes?.length ? extra.themes : cur.themes,
          frequency: extra.frequency || cur.frequency,
          minAge: extra.minAge || cur.minAge,
          toggles: {
            ...cur.toggles,
            public: extra.toggles?.public ?? cur.toggles.public,
            verification: extra.toggles?.verify ?? cur.toggles.verification,
            welcome: extra.toggles?.welcome ?? cur.toggles.welcome,
            log: extra.toggles?.logs ?? cur.toggles.log,
          },
        }
      }
      if (Object.keys(patch).length === 0) return server
      try {
        const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId: sid, data: patch, userId: ownerId })
        set({
          servers: result.servers,
          currentServer: get().currentServer?.id === sid ? result.server : get().currentServer,
          currentChannel: result.server.channels[0] || null,
        })
        await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
        notifyServerSync()
        return result.server
      } catch {
        const updated = { ...server, ...patch } as Server
        await getDb(getActiveProfileId()).servers.put(updated)
        set({
          servers: get().servers.map(s => s.id === sid ? updated : s),
          currentServer: get().currentServer?.id === sid ? updated : get().currentServer,
          currentChannel: updated.channels[0] || null,
        })
        notifyServerSync()
        return updated
      }
    }
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('createServer', fullPayload)
      set({
        servers: result.servers,
        currentServer: result.server,
        currentChannel: result.server.channels[0] || null,
        messages: [],
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      // Backend antigo ignora os campos extras: garante via updateServer.
      return await applyFullData(result.server)
    } catch (error) {
      const isLimitError = error instanceof Error && /limite|atingido|servidores/i.test(error.message)
      if (isLimitError) throw error
      const id = crypto.randomUUID()
      const { finalChannels, roles, categories, events } = buildCustom(id)
      const inviteCode = Math.random().toString(36).substring(2, 10)
      const server: Server = {
        id, name, photoUrl: photoUrl || '', ownerId, inviteCode,
        bannerUrl: extra?.bannerUrl || '',
        description: extra?.description ?? extra?.rules ?? '',
        category: category || extra?.themes?.[0] || '',
        createdAt: Date.now(), members: [ownerId],
        channels: finalChannels, roles, categories, events,
      }
      const servers = [...get().servers, server]
      set({ servers, currentServer: server, currentChannel: finalChannels[0] || null, messages: [] })
      await getDb(getActiveProfileId()).servers.bulkPut(servers)
      notifyServerSync()
      void (async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await new Promise(r => window.setTimeout(r, 5000 * (attempt + 1)))
          try {
            const result = await requestBackend<{ server: Server, servers: Server[] }>('createServer', fullPayload)
            await get().adoptServerId(id, result.server)
            try { window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Servidor sincronizado!' })) } catch { }
            return
          } catch { }
        }
      })()
      return server
    }
  },
  joinServer: async (inviteCode, userId, serverId) => {
    const blocked = assertServerLimitServers(get().servers)
    if (blocked) return { ok: false, error: blocked }
    try {
      const result = await requestBackend<{ success: boolean, error?: string, server?: Server, servers: Server[] }>('joinServer', { inviteCode, userId, serverId })
      if (!result.success) return { ok: false, error: result.error || 'Erro ao entrar no servidor' }
      set({
        servers: result.servers,
        currentServer: result.server || null,
        currentChannel: result.server?.channels?.[0] || null,
        messages: [],
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Erro ao entrar no servidor' }
    }
  },
  setCurrentServer: (server) => set({ currentServer: server, currentChannel: null, messages: [] }),
  setCurrentChannel: (channel) => set({ currentChannel: channel }),
  updateServer: async (serverId, data) => {
    const isIdentity = data && (data.name !== undefined || data.photoUrl !== undefined || (data as Partial<Server>).bannerUrl !== undefined || (data as Partial<Server>).description !== undefined)
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      if (isIdentity) void get().logAudit(serverId, 'identidade', 'Identidade do servidor atualizada').catch(() => {})
      return
    } catch {
      // backend offline/erro: cai no fallback local abaixo
    }
    const server = get().servers.find(s => s.id === serverId)
    if (!server) {
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Servidor não encontrado. Recarregue a lista de servidores.' }))
      } catch { }
      return
    }
    const updated = { ...server, ...data } as Server
    await getDb(getActiveProfileId()).servers.put(updated)
    set({
      servers: get().servers.map(s => s.id === updated.id ? updated : s) as Server[],
      currentServer: get().currentServer?.id === serverId ? updated : get().currentServer,
    })
    if (isIdentity) void get().logAudit(serverId, 'identidade', 'Identidade do servidor atualizada').catch(() => {})
  },
  saveServerSettings: async (serverId, patch) => {
    const server = get().servers.find(s => s.id === serverId)
    const base = getServerSettingsOf(server)
    const merged: ServerSettings = {
      ...base,
      ...patch,
      toggles: { ...base.toggles, ...(patch.toggles || {}) },
      automod: { ...base.automod, ...(patch.automod || {}) },
      widget: { ...base.widget, ...(patch.widget || {}) },
    }
    await get().updateServer(serverId, { settings: merged } as Partial<Server>)
    void get().logAudit(serverId, 'settings', 'Configurações atualizadas').catch(() => {})
  },
  logAudit: async (serverId, action, detail) => {
    try {
      const server = get().servers.find(s => s.id === serverId)
      if (!server) return
      const me = useUserStore.getState().currentUser
      const entry = {
        id: crypto.randomUUID(),
        at: Date.now(),
        actorId: me?.id || (typeof localStorage !== 'undefined' ? localStorage.getItem('friends-space:current-user-id') || '' : ''),
        actorName: me?.name || '',
        action,
        detail,
      }
      const auditLog = [...(server.auditLog || []), entry].slice(-200)
      await get().updateServer(serverId, { auditLog } as Partial<Server>)
    } catch {
    }
  },
  deleteServer: async (serverId, userId) => {
    try {
      const result = await requestBackend<{ serverId: string, servers: Server[] }>('deleteServer', { serverId, userId })
      await getDb(getActiveProfileId()).servers.bulkDelete([serverId])
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? null : get().currentServer,
        currentChannel: get().currentServer?.id === serverId ? null : get().currentChannel,
        messages: get().currentServer?.id === serverId ? [] : get().messages,
      })
      notifyServerSync()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erro ao apagar servidor' }
    }
  },
  addChannel: async (serverId, name, type, categoryId) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) { console.warn('[addChannel] servidor nao encontrado', serverId); return }
    const channel: Channel = { id: crypto.randomUUID(), name, type, serverId, categoryId }
    const channels = [...(server.channels || []), channel]
    const updated = { ...server, channels }
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data: { channels }, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      console.log('[addChannel] salvo no backend', channel.name)
      void get().logAudit(serverId, 'canal', `Canal ${channel.name} criado`).catch(() => {})
      return
    } catch (e) {
      console.warn('[addChannel] backend falhou, salvando local', e)
    }
    await getDb(getActiveProfileId()).servers.put(updated)
    set({ servers: get().servers.map(s => s.id === updated.id ? updated : s), currentServer: get().currentServer?.id === serverId ? updated : get().currentServer })
    notifyServerSync()
    console.log('[addChannel] salvo local', channel.name)
    void get().logAudit(serverId, 'canal', `Canal ${channel.name} criado`).catch(() => {})
  },
  renameChannel: async (serverId, channelId, name) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const target = (server.channels || []).find(c => c.id === channelId)
    if (!target) return
    const trimmed = target.type === 'text'
      ? name.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40)
      : name.trim().slice(0, 40)
    if (!trimmed || trimmed === target.name) return
    const channels = (server.channels || []).map(c => c.id === channelId ? { ...c, name: trimmed } : c)
    const updated = { ...server, channels }
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data: { channels }, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server : get().currentServer,
        currentChannel: get().currentChannel?.id === channelId ? { ...get().currentChannel!, name: trimmed } : get().currentChannel,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      void get().logAudit(serverId, 'canal', `Canal renomeado para ${trimmed}`).catch(() => {})
      return
    } catch {
    }
    await getDb(getActiveProfileId()).servers.put(updated)
    set({
      servers: get().servers.map(s => s.id === updated.id ? updated : s),
      currentServer: get().currentServer?.id === serverId ? updated : get().currentServer,
      currentChannel: get().currentChannel?.id === channelId ? { ...get().currentChannel!, name: trimmed } : get().currentChannel,
    })
    notifyServerSync()
    void get().logAudit(serverId, 'canal', `Canal renomeado para ${trimmed}`).catch(() => {})
  },
  addCategory: async (serverId, name) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const trimmed = name.trim().slice(0, 64)
    if (!trimmed) return
    const category = { id: crypto.randomUUID(), name: trimmed, serverId }
    const categories = [...(server.categories || []), category]
    const updated = { ...server, categories }
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data: { categories }, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      void get().logAudit(serverId, 'categoria', `Categoria ${trimmed} criada`).catch(() => {})
      return
    } catch {
    }
    await getDb(getActiveProfileId()).servers.put(updated)
    set({ servers: get().servers.map(s => s.id === updated.id ? updated : s), currentServer: get().currentServer?.id === serverId ? updated : get().currentServer })
    notifyServerSync()
    void get().logAudit(serverId, 'categoria', `Categoria ${trimmed} criada`).catch(() => {})
  },
  renameCategory: async (serverId, categoryId, name) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const trimmed = name.trim().slice(0, 64)
    if (!trimmed) return
    const categories = (server.categories || []).map(c => c.id === categoryId ? { ...c, name: trimmed } : c)
    const updated = { ...server, categories }
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data: { categories }, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      return
    } catch {
    }
    await getDb(getActiveProfileId()).servers.put(updated)
    set({ servers: get().servers.map(s => s.id === updated.id ? updated : s), currentServer: get().currentServer?.id === serverId ? updated : get().currentServer })
    notifyServerSync()
  },
  deleteCategory: async (serverId, categoryId) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const catName = (server.categories || []).find(c => c.id === categoryId)?.name || ''
    const categories = (server.categories || []).filter(c => c.id !== categoryId)
    const channels = server.channels.map(c => c.categoryId === categoryId ? { ...c, categoryId: undefined } : c)
    const updated = { ...server, categories, channels }
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data: { categories, channels }, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      void get().logAudit(serverId, 'categoria', `Categoria ${catName} removida`).catch(() => {})
      return
    } catch {
    }
    await getDb(getActiveProfileId()).servers.put(updated)
    set({ servers: get().servers.map(s => s.id === updated.id ? updated : s), currentServer: get().currentServer?.id === serverId ? updated : get().currentServer })
    notifyServerSync()
    void get().logAudit(serverId, 'categoria', `Categoria ${catName} removida`).catch(() => {})
  },
  addServerEvent: async (serverId, data) => {
    const userId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ servers: Server[], server?: Server }>('addServerEvent', { serverId, userId, ...data })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server || get().currentServer : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      return
    } catch {
      return
    }
  },
  deleteServerEvent: async (serverId, eventId) => {
    const userId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ servers: Server[], server?: Server }>('deleteServerEvent', { serverId, userId, eventId })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server || get().currentServer : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      return
    } catch {
      return
    }
  },
  addForumThread: async (serverId, title, body) => {
    const userId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ servers: Server[]; server?: Server; thread?: { id: string } }>('addForumThread', { serverId, userId, title, body })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server || get().currentServer : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      return { ok: true, threadId: result.thread?.id }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erro ao criar topico' }
    }
  },
  addForumReply: async (serverId, threadId, content) => {
    const userId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ servers: Server[]; server?: Server }>('addForumReply', { serverId, userId, threadId, content })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server || get().currentServer : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erro ao responder' }
    }
  },
  deleteForumThread: async (serverId, threadId) => {
    const userId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ servers: Server[]; server?: Server }>('deleteForumThread', { serverId, userId, threadId })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server || get().currentServer : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erro ao excluir topico' }
    }
  },
  deleteChannel: async (serverId, channelId) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const channels = server.channels.filter(c => c.id !== channelId)
    const updated = { ...server, channels }
    const isCurrent = get().currentChannel?.id === channelId
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data: { channels }, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server : get().currentServer,
        currentChannel: isCurrent ? null : get().currentChannel,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      void get().logAudit(serverId, 'canal', 'Canal removido').catch(() => {})
      return
    } catch {
    }
    await getDb(getActiveProfileId()).servers.put(updated)
    set({
      servers: get().servers.map(s => s.id === updated.id ? updated : s),
      currentServer: get().currentServer?.id === serverId ? updated : get().currentServer,
      currentChannel: isCurrent ? null : get().currentChannel,
    })
    notifyServerSync()
    void get().logAudit(serverId, 'canal', 'Canal removido').catch(() => {})
  },
  addRole: async (serverId, name, color) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const role: Role = { id: crypto.randomUUID(), name, color, serverId, permissions: [] }
    const updated = { ...server, roles: [...(server.roles || []), role] }
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data: { roles: updated.roles }, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      void get().logAudit(serverId, 'cargo', `Cargo ${name} criado`).catch(() => {})
      return
    } catch {
    }
    await getDb(getActiveProfileId()).servers.put(updated)
    set({ servers: get().servers.map(s => s.id === updated.id ? updated : s), currentServer: get().currentServer?.id === serverId ? updated : get().currentServer })
    notifyServerSync()
    void get().logAudit(serverId, 'cargo', `Cargo ${name} criado`).catch(() => {})
  },
  addServerEmoji: async (serverId, name, url, kind = 'emoji') => {
    const userId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ servers: Server[], server?: Server }>('addServerEmoji', { serverId, userId, name, url, kind })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server || get().currentServer : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      return
    } catch {
      return
    }
  },
  deleteServerEmoji: async (serverId, emojiId) => {
    const userId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ servers: Server[], server?: Server }>('deleteServerEmoji', { serverId, userId, emojiId })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server || get().currentServer : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      return
    } catch {
      return
    }
  },
  inviteFriendToServer: async (serverId, friendUserId) => {
    const userId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      await requestBackend('inviteFriendToServer', { serverId, userId, friendUserId })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erro ao convidar amigo' }
    }
  },
  addMember: async (serverId, userId) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    if (server.members.includes(userId)) return
    const autoRoleId = server.autoRoleId && (server.roles || []).some(r => r.id === server.autoRoleId) ? server.autoRoleId : null
    const memberRoles = autoRoleId
      ? { ...(server.memberRoles || {}), [userId]: Array.from(new Set([...(server.memberRoles?.[userId] || []), autoRoleId])) }
      : null
    const updated = { ...server, members: [...server.members, userId], ...(memberRoles ? { memberRoles } : {}) }
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data: { members: updated.members, ...(memberRoles ? { memberRoles } : {}) }, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers,
        currentServer: get().currentServer?.id === serverId ? result.server : get().currentServer,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      void get().logAudit(serverId, 'entrou', 'Membro entrou').catch(() => {})
      return
    } catch {
    }
    await getDb(getActiveProfileId()).servers.put(updated)
    set({ servers: get().servers.map(s => s.id === updated.id ? updated : s), currentServer: get().currentServer?.id === serverId ? updated : get().currentServer })
    notifyServerSync()
    void get().logAudit(serverId, 'entrou', 'Membro entrou').catch(() => {})
  },
  leaveServer: async (serverId, userId) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const updated = { ...server, members: server.members.filter(id => id !== userId) }
    try {
      const result = await requestBackend<{ server: Server, servers: Server[] }>('updateServer', { serverId, data: { members: updated.members }, userId: useUserStore.getState().currentUser?.id })
      set({
        servers: result.servers.filter(s => s.id !== serverId),
        currentServer: get().currentServer?.id === serverId ? null : get().currentServer,
        currentChannel: get().currentServer?.id === serverId ? null : get().currentChannel,
        messages: get().currentServer?.id === serverId ? [] : get().messages,
      })
      await getDb(getActiveProfileId()).servers.bulkPut(result.servers)
      notifyServerSync()
      void get().logAudit(serverId, 'saiu', 'Membro saiu').catch(() => {})
      return
    } catch {
    }
    await getDb(getActiveProfileId()).servers.put(updated)
    const servers = get().servers.map(s => s.id === updated.id ? updated : s)
    set({ servers, currentServer: get().currentServer?.id === serverId ? null : get().currentServer, currentChannel: get().currentServer?.id === serverId ? null : get().currentChannel, messages: get().currentServer?.id === serverId ? [] : get().messages })
    notifyServerSync()
    void get().logAudit(serverId, 'saiu', 'Membro saiu').catch(() => {})
  },
  kickMember: async (serverId, userId) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const members = (server.members || []).filter(id => id !== userId)
    await get().updateServer(serverId, { members } as Partial<Server>)
    void get().logAudit(serverId, 'kick', `Membro ${userId} expulso`).catch(() => {})
  },
  banMember: async (serverId, userId) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const settings = getServerSettingsOf(server)
    const banned = settings.banned.includes(userId) ? settings.banned : [...settings.banned, userId]
    const members = (server.members || []).filter(id => id !== userId)
    await get().updateServer(serverId, { members, settings: { ...settings, banned } } as Partial<Server>)
    void get().logAudit(serverId, 'ban', `Membro ${userId} banido`).catch(() => {})
  },
  unbanMember: async (serverId, userId) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const settings = getServerSettingsOf(server)
    const banned = settings.banned.filter(id => id !== userId)
    await get().updateServer(serverId, { settings: { ...settings, banned } } as Partial<Server>)
    void get().logAudit(serverId, 'unban', `Membro ${userId} desbanido`).catch(() => {})
  },
  timeoutMember: async (serverId, userId, minutes) => {
    const server = get().servers.find(s => s.id === serverId)
    if (!server) return
    const settings = getServerSettingsOf(server)
    const timeouts = { ...settings.timeouts, [userId]: Date.now() + Math.max(0, minutes) * 60000 }
    await get().updateServer(serverId, { settings: { ...settings, timeouts } } as Partial<Server>)
    void get().logAudit(serverId, 'timeout', `Membro ${userId} silenciado por ${minutes}min`).catch(() => {})
  },
  regenerateInvite: async (serverId) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let code = ''
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
    await get().updateServer(serverId, { inviteCode: code } as Partial<Server>)
    void get().logAudit(serverId, 'convite', 'Código de convite regenerado').catch(() => {})
    return code
  },
  createInvite: async (serverId, label) => {
    const server = get().servers.find(s => s.id === serverId)
    const settings = getServerSettingsOf(server)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let code = ''
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
    const invites = [...settings.invites, { code, label, createdAt: Date.now() }]
    await get().saveServerSettings(serverId, { invites })
    return code
  },
  postAsBot: async (serverId, channelId, botId, text) => {
    const server = get().servers.find(s => s.id === serverId)
    const settings = getServerSettingsOf(server)
    const bot = settings.bots.find(b => b.id === botId)
    if (!bot) throw new Error('Bot não encontrado')
    const commit = (message: Message) => {
      if (get().currentChannel?.id !== channelId) return
      set({ messages: [...get().messages, message] })
    }
    try {
      const result = await requestBackend<{ message: Message }>('botPost', { serverId, channelId, botId, botName: bot.name, text })
      if (result?.message) commit(result.message)
      return
    } catch {
      const message: Message = { id: crypto.randomUUID(), channelId, userId: `bot:${serverId}:${Date.now()}`, userName: bot.name, userPhoto: '', content: text.slice(0, 2000), type: 'text', isBot: true, createdAt: Date.now() }
      commit(message)
    }
  },
  sendMessage: async (channelId, userId, userName, userPhoto, content, type = 'text', audioUrl, attachmentUrl, attachmentName, attachmentType, replyTo) => {
    const ownerServer = get().servers.find(s => Array.isArray(s.channels) && s.channels.some(c => c.id === channelId))
    const ownerSettings = ownerServer ? getServerSettingsOf(ownerServer) : null
    if (ownerServer && ownerSettings) {
      const until = ownerSettings.timeouts?.[userId] || 0
      if (until > Date.now()) toastAndThrow('Você está silenciado neste servidor. Tente mais tarde.')
      const text = String(content || '')
      if (ownerSettings.automod.links && /https?:\/\/|www\.|discord\.gg|t\.me/i.test(text)) toastAndThrow('Links não são permitidos neste servidor.')
      if (ownerSettings.automod.caps) {
        const letters = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []
        if (letters.length > 10) {
          const upper = letters.filter(l => l === l.toUpperCase() && l !== l.toLowerCase()).length
          if (upper / letters.length > 0.7) toastAndThrow('Evite CAPS LOCK neste servidor.')
        }
      }
      if (ownerSettings.automod.ofensa) {
        const lower = text.toLowerCase()
        const words = [...BASE_OFFENSE_WORDS, ...(ownerSettings.automod.words || [])].map(w => String(w).toLowerCase()).filter(Boolean)
        if (words.some(w => w && lower.includes(w))) toastAndThrow('Mensagem bloqueada pelo AutoMod (linguagem ofensiva).')
      }
      if (ownerSettings.automod.spam) {
        const mine = get().messages.filter(m => m.channelId === channelId && m.userId === userId).slice(-5)
        const nowMs = Date.now()
        if (mine.length >= 5 && nowMs - Number(mine[0]?.createdAt || 0) < 15000) toastAndThrow('Você está enviando mensagens rápido demais.')
        const last2 = get().messages.filter(m => m.channelId === channelId && m.userId === userId).slice(-2)
        if (last2.length === 2 && last2.every(m => String(m.content || '').trim() === text.trim() && text.trim() !== '')) toastAndThrow('Mensagem duplicada bloqueada (spam).')
      }
    }
    const { scanText, scanName, blockedMessage, blockedNameMessage } = await import('../services/moderation')
    const textCheck = scanText(content)
    if (textCheck.blocked) {
      const err = blockedMessage(textCheck.word)
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: err }))
      throw new Error(err)
    }
    const nameCheck = scanName(attachmentName)
    if (nameCheck.blocked) {
      const err = blockedNameMessage(nameCheck.word)
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: err }))
      throw new Error(err)
    }
    const msg = { channelId, userId, userName, userPhoto, content, type, audioUrl, attachmentUrl, attachmentName, attachmentType, replyTo } as const
    let committed: Message | null = null
    const commit = (message: Message) => {
      committed = message
      const current = get()
      if (get().currentChannel?.id !== channelId) return
      set({ messages: [...current.messages, message] })
    }
    try {
      const result = await requestBackend<{ message: Message }>('sendMessage', { message: msg })
      if (result?.message) commit(result.message)
    } catch {
      const message: Message = { id: crypto.randomUUID(), channelId, userId, userName, userPhoto, content, type: type || 'text', audioUrl, attachmentUrl, attachmentName, attachmentType, replyTo, createdAt: Date.now() }
      commit(message)
    }
    if (committed && ownerServer && ownerSettings) {
      const cm: Message = committed
      try {
        for (const wh of ownerSettings.webhooks || []) {
          if (!wh?.url) continue
          void fetch(wh.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ server: ownerServer.id, channel: channelId, message: { user: userName, content, at: cm.createdAt } }) }).catch(() => {})
        }
      } catch {
      }
      if (ownerSettings.toggles?.log) void get().logAudit(ownerServer.id, 'mensagem', `Mensagem enviada em ${channelId}`).catch(() => {})
    }
  },
  loadMessages: async (channelId) => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const messages = await requestBackend<Message[]>('loadMessages', { channelId, userId: currentUserId })
      if (!Array.isArray(messages)) return
      const current = get()
      if (current.currentChannel?.id !== channelId) return
      if (current.messages.length === messages.length && current.messages.length > 0 && current.messages[current.messages.length - 1].id === messages[messages.length - 1].id) return
      set({ messages })
      return
    } catch {
      if (get().currentChannel?.id === channelId) set({ messages: [] })
    }
  },
  loadUnread: async () => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    if (!currentUserId) return
    try {
      const result = await requestBackend<{ map: Record<string, number>; total: number }>('getUnread', { userId: currentUserId })
      if (!result || typeof result !== 'object') return
      set({ unread: result.map || {}, totalUnread: Number(result.total) || 0 })
    } catch {
    }
  },
  markChannelRead: async (channelId) => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    if (!currentUserId) return
    try {
      const result = await requestBackend<{ map: Record<string, number> }>('markChannelRead', { userId: currentUserId, channelId })
      if (result?.map) {
        const total = Object.values(result.map).reduce((sum, count) => sum + count, 0)
        set({ unread: result.map, totalUnread: total })
      }
    } catch {
    }
  },
  markChannelUnread: async (channelId) => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    if (!currentUserId) return
    try {
      const result = await requestBackend<{ map: Record<string, number> }>('markChannelUnread', { userId: currentUserId, channelId })
      if (result?.map) {
        const total = Object.values(result.map).reduce((sum, count) => sum + count, 0)
        set({ unread: result.map, totalUnread: total })
      }
    } catch {
    }
  },
  editMessage: async (messageId, content) => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ message: Message }>('editMessage', { messageId, content, userId: currentUserId })
      if (result?.message) {
        set({ messages: get().messages.map(m => m.id === result.message.id ? result.message : m) })
      }
    } catch {
    }
  },
  deleteMessage: async (messageId) => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      await requestBackend<{ messageId: string }>('deleteMessage', { messageId, userId: currentUserId })
      set({ messages: get().messages.filter(m => m.id !== messageId) })
    } catch {
    }
  },
  addReaction: async (messageId, emoji) => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ message: Message }>('addReaction', { messageId, emoji, userId: currentUserId })
      if (result?.message) {
        set({ messages: get().messages.map(m => m.id === result.message.id ? result.message : m) })
      }
    } catch {
    }
  },
  removeReaction: async (messageId, emoji) => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ message: Message }>('removeReaction', { messageId, emoji, userId: currentUserId })
      if (result?.message) {
        set({ messages: get().messages.map(m => m.id === result.message.id ? result.message : m) })
      }
    } catch {
    }
  },
  forwardMessage: async (message, targetChannelId) => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ message: Message }>('forwardMessage', { messageId: message.id, targetChannelId, userId: currentUserId })
      if (result?.message && result.message.channelId === get().currentChannel?.id) {
        set({ messages: [...get().messages, result.message] })
      }
    } catch {
    }
  },
  createReport: async (input) => {
    try {
      const result = await requestBackend<{ report: Report }>('createReport', input)
      return result?.report ? { report: result.report } : { error: 'Erro ao enviar denuncia' }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Erro ao enviar denuncia' }
    }
  },
  getMyReports: async () => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<Report[]>('getMyReports', { userId: currentUserId })
      return Array.isArray(result) ? result : []
    } catch {
      return []
    }
  },
  reportUnanswered: async (reportId, message) => {
    const currentUserId = useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
    try {
      const result = await requestBackend<{ report: Report }>('reportUnanswered', { reportId, userId: currentUserId, message })
      return result?.report ? { report: result.report } : { error: 'Erro ao enviar reclamacao' }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Erro ao enviar reclamacao' }
    }
  },
  getServerByInvite: async (inviteCode) => {
    try {
      return await requestBackend<Server | undefined>('getServerByInvite', { inviteCode })
    } catch {
      return undefined
    }
  },
}))
