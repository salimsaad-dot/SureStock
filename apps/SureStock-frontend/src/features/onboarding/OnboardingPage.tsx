import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, Printer, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'
import { createCategory } from '../../lib/api/catalogue'
import { getOnboardingStatus } from '../../lib/api/onboarding'
import type { OnboardingStepKey } from '../../lib/api/types'
import { useBarcodeScanner } from '../sell/useBarcodeScanner'

const STARTER_CATEGORIES = ['Beverages', 'Snacks & Confectionery', 'Household', 'Fresh Produce', 'Bakery', 'Other']

const STEP_COPY: Record<OnboardingStepKey, { title: string; description: string }> = {
  SHOP_PROFILE: { title: 'Set up your shop profile', description: 'Currency, tax rate, opening hours, and your receipt header/footer.' },
  CATEGORIES: { title: 'Add categories', description: 'Start from a suggested set, or write your own — editable later either way.' },
  PRODUCTS: { title: 'Add your first products', description: 'Import a spreadsheet, or add the first one by hand with a guided form.' },
  OPENING_STOCK: { title: 'Set opening stock', description: 'Run a stock take to record real counts and cost prices.' },
  INVITE_STAFF: { title: 'Invite your staff', description: 'Name, role, and a four-digit PIN — they can sign in right away.' },
  HARDWARE_TEST: { title: 'Connect hardware', description: 'Test your barcode scanner and print a test receipt.' },
}

/**
 * Doc 3 §2, T-30: steps 2-7 of onboarding (step 1, account creation, is
 * RegisterPage.tsx). Each step's status is derived live server-side
 * (see onboarding.service.ts) — this page is a set of doorways into
 * already-real screens, not a re-implementation of them.
 */
export function OnboardingPage() {
  const { data } = useQuery({ queryKey: ['onboarding', 'status'], queryFn: getOnboardingStatus })
  const queryClient = useQueryClient()
  const [scannedCode, setScannedCode] = useState<string | null>(null)

  const addStarterCategories = useMutation({
    mutationFn: () => Promise.all(STARTER_CATEGORIES.map((name) => createCategory({ name }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding', 'status'] }),
  })

  useBarcodeScanner((code) => setScannedCode(code), true)

  const steps = data?.steps ?? []
  const requiredSteps = steps.filter((s) => s.required)
  const doneCount = requiredSteps.filter((s) => s.done).length

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-2xl font-bold text-ink">Set up your shop</h1>
      <p className="mt-0.5 font-body text-sm text-ink-muted">
        {data ? `${doneCount} of ${requiredSteps.length} steps complete.` : 'Loading…'} Every step is skippable and you can come back anytime.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {steps.map((step) => {
          const copy = STEP_COPY[step.key]
          return (
            <div key={step.key} className="rounded-lg border border-border bg-surface-raised p-4">
              <div className="flex items-start gap-3">
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-success" aria-hidden="true" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 flex-none text-ink-faint" aria-hidden="true" />
                )}
                <div className="flex-1">
                  <p className="font-display text-sm font-semibold text-ink">
                    {copy.title}
                    {!step.required && <span className="ml-2 font-display text-[11px] font-normal text-ink-faint">Optional</span>}
                  </p>
                  <p className="mt-0.5 font-body text-[13px] text-ink-muted">{copy.description}</p>

                  {step.key === 'CATEGORIES' && !step.done && (
                    <Button variant="secondary" className="mt-3" isLoading={addStarterCategories.isPending} onClick={() => addStarterCategories.mutate()}>
                      Add starter categories
                    </Button>
                  )}

                  {step.key === 'HARDWARE_TEST' ? (
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2 rounded-md border border-border-strong px-3 py-2 font-display text-sm text-ink-muted">
                        <ScanLine className="h-4 w-4 flex-none" aria-hidden="true" />
                        {scannedCode ? <span className="text-ink">Scanned: {scannedCode}</span> : 'Scan anything to test your barcode scanner…'}
                      </div>
                      <Button variant="secondary" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" aria-hidden="true" /> Print a test receipt
                      </Button>
                    </div>
                  ) : (
                    <Link to={step.linkPath} className="mt-3 inline-block font-display text-[13px] font-medium text-accent hover:text-accent-strong">
                      Go →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {data?.isComplete && (
        <div className="mt-6 rounded-lg border border-success bg-success-wash p-4">
          <p className="font-display text-sm font-semibold text-success">You're all set up.</p>
          <Link to="/" className="mt-2 inline-block font-display text-[13px] font-medium text-accent hover:text-accent-strong">
            Go to Sell →
          </Link>
        </div>
      )}
    </main>
  )
}
