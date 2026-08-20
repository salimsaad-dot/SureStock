const SIZE_CLASSES = {
  default: 'h-10 w-10 text-sm',
  large: 'h-20 w-20 text-2xl',
} as const

export function ProductAvatar({ name, imageUrl, size = 'default' }: { name: string; imageUrl: string | null; size?: keyof typeof SIZE_CLASSES }) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" className={`flex-none rounded-md object-cover ${SIZE_CLASSES[size]}`} />
  }
  return (
    <span className={`flex flex-none items-center justify-center rounded-md bg-surface-sunken font-display font-semibold text-ink-muted ${SIZE_CLASSES[size]}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
