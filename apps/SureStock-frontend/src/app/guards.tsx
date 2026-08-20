import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { UserRole } from '../lib/api/types'
import { useAuthStore } from '../lib/auth-store'

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const location = useLocation()

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <>{children}</>
}

/** A route a role can't reach isn't hidden by CSS, it isn't registered (Blueprint §05/§09). */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const role = useAuthStore((s) => s.session?.user.role)

  if (!role || !roles.includes(role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
