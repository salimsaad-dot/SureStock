import { BarChart3, Package, Receipt, Settings as SettingsIcon, ShoppingCart, Truck, type LucideIcon } from 'lucide-react'
import type { UserRole } from '../lib/api/types'

const ALL_ROLES: UserRole[] = ['OWNER', 'MANAGER', 'CASHIER']
const MANAGER_UP: UserRole[] = ['OWNER', 'MANAGER']

export interface NavItem {
  label: string
  path: string
  roles: UserRole[]
  icon: LucideIcon
}

/**
 * Fig. 2's role map, made literal: additive per role, never a different
 * arrangement. A route a role can't reach isn't hidden by CSS — it isn't
 * registered (see routes.tsx's RequireRole guard).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Sell', path: '/', roles: ALL_ROLES, icon: ShoppingCart },
  { label: 'Inventory', path: '/inventory', roles: ALL_ROLES, icon: Package },
  { label: 'Sales', path: '/sales', roles: ALL_ROLES, icon: Receipt },
  { label: 'Reports', path: '/reports', roles: MANAGER_UP, icon: BarChart3 },
  { label: 'Purchasing', path: '/purchasing', roles: MANAGER_UP, icon: Truck },
  { label: 'Settings', path: '/settings', roles: ['OWNER'], icon: SettingsIcon },
]

export function navItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}
