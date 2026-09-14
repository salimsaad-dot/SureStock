import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'light' | 'dark'

interface ThemeState {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

/**
 * A device preference, not a shop setting — persisted to localStorage
 * directly (same pattern as auth-store.ts), never sent to the backend.
 * Deliberately just light/dark, defaulting to light — a "System" option
 * (follow prefers-color-scheme) existed originally but was real, direct
 * user feedback that it added a confusing third state for no real
 * benefit on a business device someone picks a theme for once. `tokens.css`
 * still carries a `prefers-color-scheme` media-query fallback from that
 * era; harmless now since ThemeSync always sets `data-theme` explicitly,
 * so that branch is simply never reached.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'surestock-theme',
      // A device that persisted the old 'system' value (or anything else
      // no longer valid) must not carry it forward as a silently-broken
      // theme — coerce anything but an exact 'dark' to the new default.
      version: 1,
      migrate: (persisted) => ({ theme: (persisted as { theme?: string } | undefined)?.theme === 'dark' ? 'dark' : 'light' }),
    },
  ),
)
