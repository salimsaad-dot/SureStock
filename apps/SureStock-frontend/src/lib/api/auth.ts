import { apiRequest } from './client'
import type { AuthSession, StaffMember } from './types'

export function login(identifier: string, password: string) {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: { identifier, password },
    authenticated: false,
  })
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
