import { create } from 'zustand'

export type SettingsTabId =
  | 'notificacoes'
  | 'perfil'
  | 'voz'
  | 'aparencia'
  | 'privacidade'
  | 'armazenamento'
  | 'idioma'
  | 'historico'
  | 'sobre'
  | 'ajuda'

interface SettingsState {
  open: boolean
  tab: SettingsTabId
  openSettings: (tab?: SettingsTabId) => void
  closeSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  open: false,
  tab: 'notificacoes',
  openSettings: (tab) => set(tab ? { open: true, tab } : { open: true }),
  closeSettings: () => set({ open: false }),
}))
