import { useMutation } from '@tanstack/react-query'
import { UserAvatar } from '../components/UserAvatar'
import { updateMyAvatar } from '../lib/api/auth'
import { uploadImage } from '../lib/api/uploads'
import { useAuthStore } from '../lib/auth-store'
import { useToast } from '../lib/toast-store'

/**
 * Self-service profile photo — click the avatar anywhere it's shown to
 * pick a new one. Updates the session in place on success (the response
 * from PATCH /auth/me is the full, current AuthUser) so it shows up
 * immediately everywhere the sidebar/mobile bar reads session.user,
 * with no extra refetch or re-login needed.
 */
export function ProfileAvatarButton({ size = 'default' }: { size?: 'small' | 'default' }) {
  const session = useAuthStore((s) => s.session)
  const setSession = useAuthStore((s) => s.setSession)
  const show = useToast()

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const { url } = await uploadImage(file)
      return updateMyAvatar(url)
    },
    onSuccess: (user) => {
      if (session) setSession({ ...session, user })
    },
    onError: () => show("Couldn't upload that photo — try a JPEG, PNG, or WebP under 5MB.", 'error'),
  })

  if (!session) return null

  return (
    <label className="relative inline-block cursor-pointer rounded-full focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      <UserAvatar name={session.user.name} avatarUrl={session.user.avatarUrl} size={size} />
      <span className="sr-only">Change profile photo</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={mutation.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) mutation.mutate(file)
          e.target.value = ''
        }}
        className="sr-only"
      />
    </label>
  )
}
