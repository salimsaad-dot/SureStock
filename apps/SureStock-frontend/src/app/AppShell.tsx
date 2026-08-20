import { Package } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '../lib/cn'
import { useAuthStore } from '../lib/auth-store'
import { navItemsForRole } from './nav'

/** Persistent left sidebar >1024px, bottom bar below that (Blueprint §05 breakpoints table). */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const clearSession = useAuthStore((s) => s.clearSession)
  const navigate = useNavigate()
  const items = session ? navItemsForRole(session.user.role) : []

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-56 lg:flex-none lg:flex-col lg:self-start lg:overflow-y-auto lg:border-r lg:border-border lg:bg-surface-raised">
        <div className="flex items-center gap-2.5 p-4">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-accent text-white">
            <Package className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-ink">SureStock</p>
            <p className="font-display text-[11px] text-ink-faint">Inventory Management</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 font-display text-sm text-ink-muted transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken hover:text-ink',
                    isActive && 'bg-accent-wash text-accent-strong',
                  )
                }
              >
                <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-border p-3">
          <p className="truncate font-display text-sm font-medium text-ink">{session?.user.name}</p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">{session?.user.role}</p>
          <button
            type="button"
            onClick={() => navigate('/switch')}
            className="mt-2 w-full rounded-md border border-border-strong px-3 py-1.5 text-left font-display text-[13px] text-ink hover:bg-surface-sunken"
          >
            Switch user
          </button>
          <button
            type="button"
            onClick={() => {
              clearSession()
              navigate('/login', { replace: true })
            }}
            className="mt-1 w-full rounded-md px-3 py-1.5 text-left font-display text-[13px] text-ink-muted hover:bg-surface-sunken"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 pb-16 lg:pb-0">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface-raised lg:hidden">
        {items.slice(0, 4).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 font-display text-[11px] text-ink-muted',
                  isActive && 'text-accent-strong',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
