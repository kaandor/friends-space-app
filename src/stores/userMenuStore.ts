import { create } from 'zustand'
import type { User } from '../types'

interface UserMenuState {
  user: User | null
  x: number
  y: number
  profileUser: User | null
  open: (user: User, x: number, y: number) => void
  close: () => void
  openProfile: (user: User) => void
  closeProfile: () => void
}

export const useUserMenuStore = create<UserMenuState>((set) => ({
  user: null,
  x: 0,
  y: 0,
  profileUser: null,
  open: (user, x, y) => set({ user, x, y }),
  close: () => set({ user: null }),
  openProfile: (user) => set({ user: null, profileUser: user }),
  closeProfile: () => set({ profileUser: null }),
}))
