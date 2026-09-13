import { MoreHorizontal, Package } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../lib/cn'
import { useAuthStore } from '../lib/auth-store'
import { useOfflineSync } from '../lib/offline/use-offline-sync'
import { logout } from '../lib/api/auth'
import { navItemsForRole, type NavGroup } from './nav'
import { MobileMoreSheet } from './MobileMoreSheet'
import { SyncStatusPill } from './SyncStatusPill'
import { ThemeCycleButton } from './ThemeCycleButton'
import { ThemeToggle } from './ThemeToggle'

const GROUP_LABELS: Record<NavGroup, string> = {
  MAIN: 'Main',
  OPERATIONS: 'Operations',
  INSIGHTS: 'Insights',
  SYSTEM: 'System',
}

const MOBILE_PRIMARY_COUNT = 3

/** Persistent left sidebar >1024px, bottom bar below that (Blueprint §05 breakpoints table). */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const clearSession = useAuthStore((s) => s.clearSession)
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const items = session ? navItemsForRole(session.user.role) : []

  const needsOverflow = items.length > MOBILE_PRIMARY_COUNT + 1
  const mobilePrimary = needsOverflow ? items.slice(0, MOBILE_PRIMARY_COUNT) : items
  const mobileOverflow = needsOverflow ? items.slice(MOBILE_PRIMARY_COUNT) : []
  const isInOverflow = mobileOverflow.some((item) => (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)))

  useOfflineSync(Boolean(session))

  // Product-testing pass, 2026-08-26, gap #5: revoke server-side first,
  // best-effort — clearing local state and navigating away must never
  // hang or fail just because the network call did. Either way, the
  // user's own goal ("I'm signed out of this device") is satisfied by
  // the client-side clear alone; the server call is what makes it also
  // true for anyone who might have the old token.
  async function handleSignOut() {
    if (session) {
      try {
        await logout(session.refreshToken)
      } catch {
        // Network down, token already invalid, etc. — sign out locally regardless.
      }
    }
    clearSession()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-64 lg:flex-none lg:flex-col lg:self-start lg:overflow-y-auto lg:border-r lg:border-border lg:bg-surface-raised">
        <div className="flex items-center gap-2.5 p-4">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-accent text-white">
            <Package className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-ink">SureStock</p>
            <p className="font-display text-[11px] text-ink-faint">Inventory Management</p>
          </div>
        </div>
        <div className="px-4">
          <SyncStatusPill />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item, index) => {
            const Icon = item.icon
            const showGroupLabel = index === 0 || items[index - 1]!.group !== item.group
            return (
              <div key={item.path}>
                {showGroupLabel && (
                  <p className={cn('px-3 pb-1 font-display text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint', index === 0 ? 'pt-1' : 'pt-4')}>
                    {GROUP_LABELS[item.group]}
                  </p>
                )}
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md border-l-[3px] border-transparent px-[9px] py-2 font-display text-sm text-ink-muted transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken hover:text-ink',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                      isActive && 'border-accent bg-accent-wash font-medium text-accent-strong',
                    )
                  }
                >
                  <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </div>
            )
          })}
        </nav>
        <div className="m-3 rounded-lg border border-border bg-surface-sunken p-3">
          <p className="truncate font-display text-sm font-medium text-ink">{session?.user.name}</p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">{session?.user.role}</p>
          <div className="mt-3 border-t border-border pt-3">
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={() => navigate('/switch')}
            className="mt-2 w-full rounded-md border border-border-strong bg-surface-raised px-3 py-1.5 text-left font-display text-[13px] text-ink hover:bg-surface-raised/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Switch user
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-1 w-full rounded-md px-3 py-1.5 text-left font-display text-[13px] text-ink-muted hover:bg-surface-raised/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex items-center justify-end gap-1 border-b border-border bg-surface-raised px-4 py-2 lg:hidden">
        <ThemeCycleButton />
        <SyncStatusPill />
      </div>

      <div className="flex-1 pb-16 lg:pb-0">{children}</div>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface-raised lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mobilePrimary.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 font-display text-[11px] text-ink-muted',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                  isActive && 'font-semibold text-accent-strong',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* A wash-filled pill behind the icon — the same "you are
                      here" language as the sidebar's bg-accent-wash active
                      row, just icon-sized for the compact bottom nav. Text
                      color/weight alone was too subtle to read at a glance
                      per live mobile testing. */}
                  <span className={cn('flex h-7 w-9 items-center justify-center rounded-full', isActive && 'bg-accent-wash')}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          )
        })}
        {needsOverflow && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 font-display text-[11px] text-ink-muted',
              'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
              isInOverflow && 'font-semibold text-accent-strong',
            )}
          >
            <span className={cn('flex h-7 w-9 items-center justify-center rounded-full', isInOverflow && 'bg-accent-wash')}>
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </span>
            More
          </button>
        )}
      </nav>

      {moreOpen && <MobileMoreSheet items={mobileOverflow} onClose={() => setMoreOpen(false)} />}
    </div>
  )
}
