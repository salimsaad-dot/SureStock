import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import type { NavItem } from './nav'

/**
 * Redesign 2026-09: the mobile bottom nav only has room for a handful of
 * fixed slots, but Owner/Manager roles have 7-8 total destinations — a
 * real, pre-existing gap where items past the 4th were simply unreachable
 * on mobile. This sheet presents the remaining existing destinations
 * (same NavItem data, same role filtering already applied by the caller)
 * — no new routes, no new access.
 */
export function MobileMoreSheet({ items, onClose }: { items: NavItem[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 lg:hidden">
      <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div
        role="dialog"
        aria-label="More navigation"
        className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-border bg-surface-raised p-3 shadow-lg"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong" aria-hidden="true" />
        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 font-display text-sm text-ink-muted hover:bg-surface-sunken',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                    isActive && 'bg-accent-wash font-semibold text-accent-strong',
                  )
                }
              >
                <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
