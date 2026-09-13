import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

/**
 * A device preference, not a shop setting — persisted to localStorage
 * directly (same pattern as auth-store.ts), never sent to the backend.
 * `tokens.css` already has full light/dark token values and a
 * `[data-theme]` selector wired for exactly this ("system" = no
 * attribute, follow `prefers-color-scheme`; "light"/"dark" = force it)
 * — this store plus ThemeSync.tsx is what actually drives that
 * attribute, since nothing did before now.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'surestock-theme' },
  ),
)
