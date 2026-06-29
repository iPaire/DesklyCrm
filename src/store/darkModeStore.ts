import { create } from 'zustand'

function resolveInitialTheme(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem('deskly-theme')
  if (stored) return stored === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface DarkModeState {
  isDark: boolean
  toggle: () => void
  setDark: (dark: boolean) => void
}

export const useDarkModeStore = create<DarkModeState>((set, get) => ({
  isDark: resolveInitialTheme(),
  setDark: (dark: boolean) => {
    set({ isDark: dark })
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', dark)
      localStorage.setItem('deskly-theme', dark ? 'dark' : 'light')
    }
  },
  toggle: () => get().setDark(!get().isDark),
}))

// Apply immediately when module loads (before React renders)
if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('dark', useDarkModeStore.getState().isDark)
}
