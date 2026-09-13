import { BarChart3, ClipboardCheck, LayoutDashboard, Package, Receipt, Settings as SettingsIcon, ShoppingCart, Truck, type LucideIcon } from 'lucide-react'
import type { UserRole } from '../lib/api/types'

const ALL_ROLES: UserRole[] = ['OWNER', 'MANAGER', 'CASHIER']
const MANAGER_UP: UserRole[] = ['OWNER', 'MANAGER']

export type NavGroup = 'MAIN' | 'OPERATIONS' | 'INSIGHTS' | 'SYSTEM'

export interface NavItem {
  label: string
  path: string
  roles: UserRole[]
  icon: LucideIcon
  /** Visual section grouping only (sidebar section headers) — never used for access control, that's `roles` + route registration. */
  group: NavGroup
}

/**
 * Fig. 2's role map, made literal: additive per role, never a different
 * arrangement. A route a role can't reach isn't hidden by CSS — it isn't
 * registered (see routes.tsx's RequireRole guard).
 */
export const NAV_ITEMS: NavItem[] = [
  // Doc 3 §6/§7: Dashboard is first in the nav, ahead of Sell — the
  // owner's actual landing page (see LoginPage.tsx/PinUnlockPage.tsx),
  // reachable from the nav for a Manager too even though it isn't theirs.
  { label: 'Dashboard', path: '/dashboard', roles: MANAGER_UP, icon: LayoutDashboard, group: 'MAIN' },
  { label: 'Sell', path: '/', roles: ALL_ROLES, icon: ShoppingCart, group: 'MAIN' },
  { label: 'Inventory', path: '/inventory', roles: ALL_ROLES, icon: Package, group: 'OPERATIONS' },
  { label: 'Sales', path: '/sales', roles: ALL_ROLES, icon: Receipt, group: 'OPERATIONS' },
  { label: 'Purchasing', path: '/purchasing', roles: MANAGER_UP, icon: Truck, group: 'OPERATIONS' },
  { label: 'Review queue', path: '/review-queue', roles: MANAGER_UP, icon: ClipboardCheck, group: 'OPERATIONS' },
  { label: 'Reports', path: '/reports', roles: MANAGER_UP, icon: BarChart3, group: 'INSIGHTS' },
  { label: 'Settings', path: '/settings', roles: ['OWNER'], icon: SettingsIcon, group: 'SYSTEM' },
]

export function navItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}
