import { create } from 'zustand'

interface SettingsState {
  open: boolean
  openSettings: () => void
  closeSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  open: false,
  openSettings: () => set({ open: true }),
  closeSettings: () => set({ open: false }),
}))
