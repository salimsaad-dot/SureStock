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
 *
 * Product-testing pass, 2026-08-27, gap #6: a real, deliberate tradeoff,
 * not an oversight — considered and confirmed with the user rather than
 * silently accepted. localStorage is readable by any script running on
 * the page, so a real XSS vector would let an attacker exfiltrate both
 * tokens. Weighed against that:
 *   - No actual XSS vector exists in this codebase today — confirmed by
 *     grep, not assumed: zero `dangerouslySetInnerHTML` anywhere, React's
 *     default JSX escaping is the only thing that ever renders
 *     user-supplied strings.
 *   - The access token is short-lived (15 minutes) — even a successful
 *     theft has a small window before it's dead on its own.
 *   - The refresh token is now server-side revocable (gap #5,
 *     `POST /auth/logout`, `RefreshToken` table) — a real incident
 *     response now exists ("sign out everywhere" as a future feature),
 *     where before a stolen refresh token was unkillable for up to 30
 *     days regardless of storage location.
 *   - The alternative (httpOnly cookies) isn't a free upgrade: it trades
 *     XSS-readable storage for CSRF, a *different* real attack surface
 *     that would need its own defense (a CSRF token, `SameSite`
 *     policy, etc.) built from scratch, plus `credentials: 'include'`
 *     on every request and a CORS `credentials: true` change — a real
 *     architectural migration across the whole auth flow, not a
 *     drop-in swap, for a currently-theoretical improvement.
 *
 * Revisit this (move to httpOnly cookies + CSRF protection) if any of
 * these change: a real XSS vector is found anywhere in this app or a
 * dependency; a third-party script/widget/ad ever gets embedded in this
 * page; or this ever needs to satisfy a compliance regime that mandates
 * it regardless of actual risk.
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
