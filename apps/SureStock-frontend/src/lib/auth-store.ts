import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthSession } from './api/types'

interface AuthState {
  session: AuthSession | null
  setSession: (session: AuthSession) => void
  clearSession: () => void
}

/**
 * Persisted to localStorage — the backend returns both tokens in the response
 * body (no cookies are set anywhere), so the client owns storage (Blueprint §09).
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
    }),
    { name: 'surestock-auth' },
  ),
)
