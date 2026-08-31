import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getLocationSettings, updateLocationSettings } from '../../lib/api/settings'
import type { UpdateLocationSettingsBody } from '../../lib/api/types'
import { useToast } from '../../lib/toast-store'
import { ActivityLogTab } from './ActivityLogTab'
import { BackupDataTab } from './BackupDataTab'
import { BusinessProfileTab } from './BusinessProfileTab'
import { InventoryTab } from './InventoryTab'
import { NotificationsTab } from './NotificationsTab'
import { PaymentMethodsTab } from './PaymentMethodsTab'
import { SalesPosTab } from './SalesPosTab'
import { SecurityTab } from './SecurityTab'
import { UsersRolesTab } from './UsersRolesTab'

const TABS = [
  { key: 'profile', label: 'Business Profile' },
  { key: 'users', label: 'Users & Roles' },
  { key: 'sales', label: 'Sales & POS' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'payments', label: 'Payment Methods' },
  { key: 'security', label: 'Security' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'backup', label: 'Backup & Data' },
  { key: 'activity', label: 'Activity Log' },
] as const
type TabKey = (typeof TABS)[number]['key']

/** Doc 3/mockup Settings screen. Owner-only (App.tsx's own route gate). All configurable tabs share one query/mutation over the real settings store (Location, T-29) — each tab's form only submits its own relevant subset. */
export function SettingsPage() {
  const queryClient = useQueryClient()
  const show = useToast()
  const [tab, setTab] = useState<TabKey>('profile')

  const { data: settings, isLoading } = useQuery({ queryKey: ['settings', 'business'], queryFn: getLocationSettings })
  const mutation = useMutation({
    mutationFn: (body: UpdateLocationSettingsBody) => updateLocationSettings(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      show('Settings saved.')
    },
  })

  return (
    <main className="p-6">
      <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>
      <p className="mt-0.5 font-body text-sm text-ink-muted">Configure your business, users and system preferences.</p>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-4 py-2.5 font-display text-sm font-medium ${
              tab === t.key ? 'border-b-2 border-accent text-accent-strong' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 max-w-3xl">
        {isLoading || !settings ? (
          <p className="font-display text-sm text-ink-muted">Loading…</p>
        ) : (
          <>
            {tab === 'profile' && <BusinessProfileTab settings={settings} onSave={mutation.mutateAsync} saving={mutation.isPending} />}
            {tab === 'users' && <UsersRolesTab />}
            {tab === 'sales' && <SalesPosTab settings={settings} onSave={mutation.mutateAsync} saving={mutation.isPending} />}
            {tab === 'inventory' && <InventoryTab settings={settings} onSave={mutation.mutateAsync} saving={mutation.isPending} />}
            {tab === 'payments' && <PaymentMethodsTab settings={settings} onSave={mutation.mutateAsync} saving={mutation.isPending} />}
            {tab === 'security' && <SecurityTab settings={settings} onSave={mutation.mutateAsync} saving={mutation.isPending} />}
            {tab === 'notifications' && <NotificationsTab settings={settings} onSave={mutation.mutateAsync} saving={mutation.isPending} />}
            {tab === 'backup' && <BackupDataTab />}
            {tab === 'activity' && <ActivityLogTab />}
          </>
        )}
      </div>
    </main>
  )
}
