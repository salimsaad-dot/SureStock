import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { ApiError } from '../../lib/api/types'
import type { SettingsTabProps } from './settings-tab-props'

const CURRENCIES = ['GHS', 'NGN', 'KES', 'USD']

/**
 * Doc 3/mockup Business Profile tab. Two mockup elements don't map onto
 * anything real and were deliberately not faked: "Change logo" is a
 * plain URL field, not a file uploader (no upload infra exists — same
 * honest gap as Product.imageUrl/T-09), and "Receipt prefix / next
 * number" isn't shown at all — receipts are `RCT-<id fragment>`, not a
 * stored sequential counter, so a "next number" field would just be a
 * lie. The summary panel shows what's actually true instead.
 */
export function BusinessProfileTab({ settings, onSave, saving }: SettingsTabProps) {
  const [name, setName] = useState(settings.name)
  const [phone, setPhone] = useState(settings.phone ?? '')
  const [email, setEmail] = useState(settings.email ?? '')
  const [address, setAddress] = useState(settings.address ?? '')
  const [currency, setCurrency] = useState(settings.currency)
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? '')
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter ?? '')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      await onSave({
        name,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        currency,
        logoUrl: logoUrl || undefined,
        receiptFooter: receiptFooter || undefined,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Business information</h2>
        <p className="mt-0.5 font-display text-[13px] text-ink-muted">Update your business details. This information will appear on receipts and reports.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput label="Business name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Currency</span>
            <select
              className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <TextInput label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <h3 className="mt-6 font-display text-sm font-semibold text-ink">Business logo</h3>
        <p className="mt-0.5 font-display text-[12.5px] text-ink-muted">A URL to your logo image — there's no file upload yet.</p>
        <div className="mt-2 max-w-sm">
          <TextInput label="Logo URL" placeholder="https://…" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        </div>

        <h3 className="mt-6 font-display text-sm font-semibold text-ink">Receipt footer</h3>
        <p className="mt-0.5 font-display text-[12.5px] text-ink-muted">This will appear at the bottom of receipts.</p>
        <div className="mt-2">
          <textarea
            value={receiptFooter}
            onChange={(e) => setReceiptFooter(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border-strong bg-surface-raised px-3 py-2 font-display text-sm text-ink"
          />
        </div>

        {error && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {error}
          </p>
        )}

        <Button className="mt-6" isLoading={saving} onClick={submit}>
          Save changes
        </Button>
      </div>

      <div className="h-fit rounded-xl border border-border bg-surface-raised p-4">
        <h3 className="font-display text-sm font-semibold text-ink">Business summary</h3>
        <dl className="mt-3 flex flex-col gap-2 font-display text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Business name</dt>
            <dd className="text-right text-ink">{settings.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Currency</dt>
            <dd className="text-right text-ink">{settings.currency}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Time zone</dt>
            <dd className="text-right text-ink">{settings.timezone}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Created</dt>
            <dd className="text-right text-ink">{new Date(settings.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
