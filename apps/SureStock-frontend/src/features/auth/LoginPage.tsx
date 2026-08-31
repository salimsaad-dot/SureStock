import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
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

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
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
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-accent">SureStock</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">Sign in</h1>

      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        <TextInput
          label="Phone or email"
          autoComplete="username"
          error={errors.identifier?.message}
          {...register('identifier')}
        />
        <TextInput
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

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
        New shop?{' '}
        <Link to="/register" className="font-medium text-accent hover:text-accent-strong">
          Create one
        </Link>
      </p>
    </main>
  )
}
