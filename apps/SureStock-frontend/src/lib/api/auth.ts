import { apiRequest } from './client'
import type { AuthSession, StaffMember } from './types'

export function login(identifier: string, password: string) {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    authenticated: false,
  })
}

export interface RegisterBody {
  shopName: string
  ownerName: string
  email?: string
  phone?: string
  password: string
}

/** T-30 step 1 — the one endpoint that creates a Location at all. Logs the new owner straight in, same shape as login(). */
export function register(body: RegisterBody) {
  return apiRequest<AuthSession>('/auth/register', { method: 'POST', body, authenticated: false })
}

export function pinUnlock(userId: string, pin: string) {
  return apiRequest<AuthSession>('/auth/pin-unlock', {
    method: 'POST',
    body: { userId, pin },
    authenticated: false,
  })
}

/** Roster for the PIN quick-switch picker, scoped server-side to the caller's own location. */
export function getStaff() {
  return apiRequest<StaffMember[]>('/auth/staff')
}

/**
 * Product-testing pass, 2026-08-26, gap #5: "Sign out" used to only
 * ever clear localStorage — the refresh token stayed genuinely valid
 * server-side for up to 30 days regardless. Same `authenticated: false`
 * shape as login/register/pin-unlock — logout has to work even when the
 * caller's access token has already expired.
 */
export function logout(refreshToken: string) {
  return apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken }, authenticated: false })
}
