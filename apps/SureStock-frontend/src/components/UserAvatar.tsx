const SIZE_CLASSES = {
  small: 'h-8 w-8 text-xs',
  default: 'h-10 w-10 text-sm',
  large: 'h-16 w-16 text-xl',
} as const

/** Circular person avatar — ProductAvatar's rounded-md square is deliberately different, this one's for people (staff photos). */
export function UserAvatar({ name, avatarUrl, size = 'default' }: { name: string; avatarUrl: string | null; size?: keyof typeof SIZE_CLASSES }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={`flex-none rounded-full object-cover ${SIZE_CLASSES[size]}`} />
  }
  return (
    <span className={`flex flex-none items-center justify-center rounded-full bg-surface-sunken font-display font-semibold text-ink-muted ${SIZE_CLASSES[size]}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
