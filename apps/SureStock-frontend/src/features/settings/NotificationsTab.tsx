import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Pill, type PillVariant } from '../../components/Pill'
import { TextInput } from '../../components/TextInput'
import { getNotificationLog, sendDailySummaryNow, sendTestSms } from '../../lib/api/settings'
import { ApiError, type NotificationStatus } from '../../lib/api/types'
import { useToast } from '../../lib/toast-store'
import type { SettingsTabProps } from './settings-tab-props'

const TOGGLES = [
  { key: 'notifyLowStockEnabled', label: 'Low stock alerts', description: 'An SMS when a sale, adjustment, or stock take pushes a product to or below its reorder point.' },
  { key: 'notifyTillVarianceEnabled', label: 'Till variance alerts', description: 'An SMS when a till closes with a counted-vs-expected mismatch past the Sales & POS threshold.' },
  { key: 'notifyDailySummaryEnabled', label: 'Daily summary', description: 'A recap of today’s sales, refunds and gross profit — sent on demand below (no automatic close-of-business scheduler exists yet).' },
] as const

const STATUS_PILL: Record<NotificationStatus, PillVariant> = {
  SENT: 'success',
  FAILED: 'danger',
  NOT_CONFIGURED: 'warning',
}

/**
 * Doc 3/mockup Notifications tab, built for real once the SMS-channel
 * decision was made: Africa's Talking, provider-ready today, credentials
 * wired in whenever a real key is dropped into the server's .env (see
 * sms-client.ts). Every toggle below is a real per-location setting an
 * actual trigger (sale, till close, stock take) reads — not a disabled
 * checkbox.
 */
export function NotificationsTab({ settings, onSave, saving }: SettingsTabProps) {
  const queryClient = useQueryClient()
  const show = useToast()
  const [phone, setPhone] = useState(settings.notificationPhone ?? '')
  const [toggles, setToggles] = useState({
    notifyLowStockEnabled: settings.notifyLowStockEnabled,
    notifyTillVarianceEnabled: settings.notifyTillVarianceEnabled,
    notifyDailySummaryEnabled: settings.notifyDailySummaryEnabled,
  })
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [sendingSummary, setSendingSummary] = useState(false)

  const { data: log, isLoading: logLoading } = useQuery({ queryKey: ['notifications', 'log'], queryFn: getNotificationLog })

  async function submit() {
    setError(null)
    try {
      await onSave({ notificationPhone: phone.trim() || undefined, ...toggles })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  async function runTest() {
    setTesting(true)
    try {
      await sendTestSms()
      await queryClient.invalidateQueries({ queryKey: ['notifications', 'log'] })
      show('Test message sent — check the activity log below for the delivery result.')
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'Something went wrong sending the test message.')
    } finally {
      setTesting(false)
    }
  }

  async function runDailySummary() {
    setSendingSummary(true)
    try {
      await sendDailySummaryNow()
      await queryClient.invalidateQueries({ queryKey: ['notifications', 'log'] })
      show('Daily summary sent.')
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'Something went wrong sending the summary.')
    } finally {
      setSendingSummary(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-lg font-semibold text-ink">Notifications</h2>
      <p className="mt-0.5 font-display text-[13px] text-ink-muted">
        Real SMS alerts via Africa's Talking. Every attempt below is genuinely sent and logged — if no provider key is
        configured on the server yet, attempts log as <span className="font-medium">Not configured</span> rather than
        silently pretending to deliver.
      </p>

      <div className="mt-4 max-w-sm">
        <TextInput
          label="Alert phone number"
          type="tel"
          placeholder="+233xxxxxxxxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="mt-1 font-display text-[12.5px] text-ink-muted">
          Who gets paged — not necessarily the shop's own public contact number in Business Profile.
        </p>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {TOGGLES.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="font-display text-sm text-ink">{t.label}</p>
              <p className="font-display text-[12.5px] text-ink-muted">{t.description}</p>
              {t.key === 'notifyDailySummaryEnabled' && (
                <Button
                  variant="secondary"
                  className="mt-2 h-8 px-3 text-[12.5px]"
                  isLoading={sendingSummary}
                  disabled={!toggles.notifyDailySummaryEnabled}
                  onClick={runDailySummary}
                >
                  Send now
                </Button>
              )}
            </div>
            <input
              type="checkbox"
              checked={toggles[t.key]}
              onChange={(e) => setToggles((prev) => ({ ...prev, [t.key]: e.target.checked }))}
              className="h-5 w-5 shrink-0 accent-accent"
            />
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-3 font-display text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button isLoading={saving} onClick={submit}>
          Save changes
        </Button>
        <Button variant="secondary" isLoading={testing} onClick={runTest}>
          Send test SMS
        </Button>
      </div>

      <h3 className="mt-8 font-display text-sm font-semibold text-ink">Recent activity</h3>
      {logLoading ? (
        <p className="mt-2 font-display text-[13px] text-ink-muted">Loading…</p>
      ) : !log || log.length === 0 ? (
        <p className="mt-2 font-display text-[13px] text-ink-muted">No notification attempts yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {log.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-[12.5px] font-medium text-ink">{entry.type.replace('_', ' ')}</span>
                <div className="flex items-center gap-2">
                  <Pill variant={STATUS_PILL[entry.status]}>{entry.status.replace('_', ' ')}</Pill>
                  <span className="font-mono text-[11px] text-ink-faint">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <p className="mt-1 font-mono text-[12.5px] text-ink-muted">{entry.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
