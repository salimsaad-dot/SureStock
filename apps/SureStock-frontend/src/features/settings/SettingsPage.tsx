import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PageContainer } from '../../components/PageContainer'
import { PageHeader } from '../../components/PageHeader'
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
import { SettingsNav } from './SettingsNav'
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
    <PageContainer>
      <PageHeader title="Settings" subtitle="Configure your business, users and system preferences." />

      <div className="mt-6 lg:flex lg:gap-8">
        <SettingsNav items={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={(key) => setTab(key as TabKey)} />

        <div className="mt-4 max-w-3xl lg:mt-0 lg:flex-1">
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
      </div>
    </PageContainer>
  )
}
