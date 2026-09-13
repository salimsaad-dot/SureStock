import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { BarChart3, Eye, EyeOff, Lock, Package, ScanLine, Search, ShoppingCart, User } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { login } from '../../lib/api/auth'
import { useAuthStore } from '../../lib/auth-store'

// Mirrors the backend's loginBodySchema exactly (src/modules/auth/schemas.ts).
const loginSchema = z.object({
  identifier: z.string().min(1, 'Enter your phone number or email.'),
  password: z.string().min(1, 'Enter your password.'),
})
type LoginForm = z.infer<typeof loginSchema>

/**
 * Redesigned 2026-09-01 against a user-supplied login.png mockup — its
 * split-screen structure and field affordances (leading icons, a
 * password-visibility toggle), not its purple/teal palette (kept our
 * own validated accent + chart tokens instead, per this project's
 * established "borrow the features, never the color system" rule).
 *
 * The mockup's "forgot password?" link has nothing to actually deliver
 * a reset — no email/SMS reset flow exists anywhere in this app,
 * credential resets are always a direct Owner action in Settings — so
 * it opens a static note instead of pretending to be a real flow.
 *
 * Revised 2026-09-02 against the UI/UX redesign spec: the decorative
 * panel originally used a gradient + translucent "glassmorphism" icon
 * badges, which the spec explicitly discourages ("avoid excessive
 * gradients... glassmorphism"; auth should use "existing assets only").
 * Kept the split-screen layout and floating-icon composition, flattened
 * the fill to a single solid token color and the badges to fully
 * opaque — no blur, no gradient, no translucency.
 */
export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const [showPassword, setShowPassword] = useState(false)
  const [showForgotNote, setShowForgotNote] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const mutation = useMutation({
    mutationFn: (values: LoginForm) => login(values.identifier, values.password),
    onSuccess: (session) => {
      setSession(session)
      // Doc 3 §6: "the owner lands on a dashboard, not the till" — a
      // Manager still has Dashboard in the nav (see nav.ts), just isn't
      // dropped there by default the way the Owner is.
      navigate(session.user.role === 'OWNER' ? '/dashboard' : '/', { replace: true })
    },
  })

  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-accent text-white">
              <Package className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="font-display text-sm font-bold text-ink">SureStock</p>
          </div>

          <h1 className="mt-8 font-display text-2xl font-bold text-ink">Sign in to SureStock</h1>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
            <TextInput
              label="Phone or email"
              autoComplete="username"
              icon={<User className="h-4 w-4" aria-hidden="true" />}
              error={errors.identifier?.message}
              {...register('identifier')}
            />
            <div>
              <TextInput
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                icon={<Lock className="h-4 w-4" aria-hidden="true" />}
                endAdornment={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="flex h-7 w-7 items-center justify-center rounded text-ink-faint hover:text-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                }
                error={errors.password?.message}
                {...register('password')}
              />
              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowForgotNote((v) => !v)}
                  className="font-display text-[12.5px] font-medium text-accent hover:text-accent-strong"
                >
                  Forgot password?
                </button>
              </div>
              {showForgotNote && (
                <p className="mt-2 rounded-md bg-surface-sunken p-3 font-display text-[12.5px] text-ink-muted">
                  There's no self-service reset yet — contact your shop owner or manager to reset your password from
                  Settings → Users &amp; Roles.
                </p>
              )}
            </div>

            {mutation.isError && (
              <p role="alert" className="font-display text-[13px] text-danger">
                {mutation.error instanceof Error ? mutation.error.message : 'Something went wrong.'}
              </p>
            )}

            <Button type="submit" isLoading={mutation.isPending} className="mt-2">
              Sign in
            </Button>
          </form>

          <p className="mt-4 text-center font-display text-[13px] text-ink-muted">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-accent hover:text-accent-strong">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-accent-strong lg:flex lg:flex-col lg:items-start lg:justify-end lg:p-12">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <FloatingIcon icon={Package} className="left-[12%] top-[14%]" />
          <FloatingIcon icon={BarChart3} className="left-[62%] top-[10%]" />
          <FloatingIcon icon={ScanLine} className="left-[78%] top-[42%]" />
          <FloatingIcon icon={Search} className="left-[10%] top-[46%]" />
          <FloatingIcon icon={ShoppingCart} className="left-[34%] top-[62%]" />
        </div>

        <div className="relative">
          <h2 className="font-display text-4xl font-bold leading-tight text-white">
            Smart inventory
            <br />
            solutions
          </h2>
          <p className="mt-3 font-display text-sm font-semibold uppercase tracking-wide text-white/80">
            Stay optimized. Grow faster.
          </p>
        </div>
      </div>
    </main>
  )
}

function FloatingIcon({ icon: Icon, className }: { icon: typeof Package; className: string }) {
  return (
    <span className={`absolute flex h-12 w-12 items-center justify-center rounded-xl bg-white text-accent-strong ${className}`}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  )
}
