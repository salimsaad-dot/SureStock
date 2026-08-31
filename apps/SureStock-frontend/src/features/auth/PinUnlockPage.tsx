import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { pinUnlock } from '../../lib/api/auth'
import { isLockedError } from '../../lib/api/types'
import { useAuthStore } from '../../lib/auth-store'

const PIN_LENGTH = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

function useCountdown(lockedUntil: string | null) {
  const [remainingMs, setRemainingMs] = useState(() => (lockedUntil ? Date.parse(lockedUntil) - Date.now() : 0))

  useEffect(() => {
    if (!lockedUntil) return
    const interval = setInterval(() => setRemainingMs(Date.parse(lockedUntil) - Date.now()), 250)
    return () => clearInterval(interval)
  }, [lockedUntil])

  return Math.max(0, remainingMs)
}

export function PinUnlockPage() {
  const { userId } = useParams<{ userId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const name = (location.state as { name?: string } | null)?.name

  const [pin, setPin] = useState('')
  const [lockedUntil, setLockedUntil] = useState<string | null>(null)
  const remainingMs = useCountdown(lockedUntil)
  const isLocked = lockedUntil !== null && remainingMs > 0

  const mutation = useMutation({
    mutationFn: (enteredPin: string) => pinUnlock(userId!, enteredPin),
    onSuccess: (session) => {
      setSession(session)
      // Doc 3 §6: "the owner lands on a dashboard, not the till" — same landing rule as a full login (LoginPage.tsx).
      navigate(session.user.role === 'OWNER' ? '/dashboard' : '/', { replace: true })
    },
    onError: (error) => {
      if (isLockedError(error)) {
        setLockedUntil(error.details.lockedUntil)
      }
      setPin('')
    },
  })

  function press(key: string) {
    if (isLocked || mutation.isPending) return
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (key === '' || pin.length >= PIN_LENGTH) return
    const next = pin + key
    setPin(next)
    if (next.length === PIN_LENGTH) mutation.mutate(next)
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xs flex-col items-center justify-center p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-accent">Enter PIN</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">{name ?? 'Enter your PIN'}</h1>

      <div className="mt-8 flex gap-3" aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-accent ${i < pin.length ? 'bg-accent' : 'bg-transparent'}`}
          />
        ))}
      </div>

      <div className="mt-3 h-6">
        {isLocked && (
          <p role="alert" className="font-display text-[13px] text-danger">
            Too many attempts. Try again in {Math.ceil(remainingMs / 1000)}s.
          </p>
        )}
        {!isLocked && mutation.isError && !isLockedError(mutation.error) && (
          <p role="alert" className="font-display text-[13px] text-danger">
            Incorrect PIN.
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {KEYS.map((key, i) => (
          <button
            key={i}
            type="button"
            disabled={key === '' || isLocked || mutation.isPending}
            onClick={() => press(key)}
            className="h-14 w-14 rounded-full font-mono text-xl font-medium text-ink transition-colors duration-[var(--motion-state)] ease-out enabled:hover:bg-surface-sunken disabled:opacity-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {key}
          </button>
        ))}
      </div>
    </main>
  )
}
