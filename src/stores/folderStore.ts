import { create } from 'zustand'
import type { ServerFolder } from '../types'
import { requestBackend } from '../services/backend'
import { useUserStore } from './userStore'

function currentUserId(): string {
  return useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
}

interface FolderState {
  folders: ServerFolder[]
  loadFolders: () => Promise<void>
  createFolder: (name: string, serverIds?: string[]) => Promise<ServerFolder | null>
  updateFolder: (folderId: string, data: { name?: string; serverIds?: string[]; color?: string }) => Promise<void>
  deleteFolder: (folderId: string) => Promise<void>
  shareFolder: (folderId: string, toUserId: string) => Promise<{ ok: boolean; error?: string }>
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  loadFolders: async () => {
    const userId = currentUserId()
    if (!userId) return
    try {
      const folders = await requestBackend<ServerFolder[]>('loadMyFolders', { userId })
      if (!Array.isArray(folders)) return
      set({ folders })
    } catch {
      return
    }
  },
  createFolder: async (name, serverIds = []) => {
    const userId = currentUserId()
    if (!userId) return null
    try {
      const result = await requestBackend<{ folder: ServerFolder }>('createFolder', { userId, name, serverIds })
      if (result?.folder) {
        set({ folders: [...get().folders, result.folder] })
        return result.folder
      }
      return null
    } catch {
      const folder: ServerFolder = {
        id: crypto.randomUUID(),
        ownerId: userId,
        name,
        serverIds,
        createdAt: Date.now(),
      }
      set({ folders: [...get().folders, folder] })
      return folder
    }
  },
  updateFolder: async (folderId, data) => {
    const userId = currentUserId()
    if (!userId) return
    try {
      const result = await requestBackend<{ folder: ServerFolder; folders?: ServerFolder[] }>('updateFolder', { userId, folderId, ...data })
      if (result?.folders) {
        set({ folders: result.folders })
        return
      }
      if (result?.folder) {
        set({ folders: get().folders.map(f => f.id === result.folder.id ? result.folder : f) })
        return
      }
    } catch {
      return
    }
    const updated = get().folders.map(f => {
      if (f.id !== folderId) return f
      return { ...f, ...data }
    })
    set({ folders: updated })
  },
  deleteFolder: async (folderId) => {
    const userId = currentUserId()
    if (!userId) return
    try {
      await requestBackend('deleteFolder', { userId, folderId })
      set({ folders: get().folders.filter(f => f.id !== folderId) })
    } catch {
      set({ folders: get().folders.filter(f => f.id !== folderId) })
    }
  },
  shareFolder: async (folderId, toUserId) => {
    const userId = currentUserId()
    if (!userId) return { ok: false, error: 'Sessao invalida' }
    try {
      await requestBackend('shareFolder', { userId, folderId, toUserId })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erro ao encaminhar pasta' }
    }
  },
}))
