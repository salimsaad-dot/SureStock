import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { register } from '../../lib/api/auth'
import { ApiError } from '../../lib/api/types'
import { useAuthStore } from '../../lib/auth-store'

// Mirrors the backend's registerBodySchema exactly (src/modules/auth/schemas.ts).
const registerSchema = z
  .object({
    shopName: z.string().min(1, 'Enter your shop name.'),
    ownerName: z.string().min(1, 'Enter your name.'),
    email: z.string().email('Enter a valid email.').optional().or(z.literal('')),
    phone: z.string().optional(),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
  })
  .refine((b) => b.email || b.phone, { message: 'Provide an email or phone number.', path: ['email'] })
type RegisterForm = z.infer<typeof registerSchema>

/** Doc 3 §2, T-30 step 1: "Owner name, shop name, phone, email, password." No SMS verification — no SMS provider exists anywhere in this project. */
export function RegisterPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const mutation = useMutation({
    mutationFn: (values: RegisterForm) => register({ ...values, email: values.email || undefined, phone: values.phone || undefined }),
    onSuccess: (session) => {
      setSession(session)
      navigate('/onboarding', { replace: true })
    },
  })

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-accent">SureStock</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">Create your shop</h1>
      <p className="mt-1 font-body text-sm text-ink-muted">Takes about fifteen minutes, plus adding your catalogue.</p>

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <TextInput label="Shop name" error={errors.shopName?.message} {...registerField('shopName')} />
        <TextInput label="Your name" autoComplete="name" error={errors.ownerName?.message} {...registerField('ownerName')} />
        <TextInput label="Email" type="email" autoComplete="email" error={errors.email?.message} {...registerField('email')} />
        <TextInput label="Phone" autoComplete="tel" error={errors.phone?.message} {...registerField('phone')} />
        <TextInput label="Password" type="password" autoComplete="new-password" error={errors.password?.message} {...registerField('password')} />

        {mutation.isError && (
          <p role="alert" className="font-display text-[13px] text-danger">
            {mutation.error instanceof ApiError ? mutation.error.message : 'Something went wrong.'}
          </p>
        )}

        <Button type="submit" isLoading={mutation.isPending} className="mt-2">
          Create shop
        </Button>
      </form>

      <p className="mt-4 text-center font-display text-[13px] text-ink-muted">
        Already have a shop?{' '}
        <Link to="/login" className="font-medium text-accent hover:text-accent-strong">
          Sign in
        </Link>
      </p>
    </main>
  )
}
