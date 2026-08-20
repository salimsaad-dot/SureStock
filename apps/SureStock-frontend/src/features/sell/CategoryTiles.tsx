import { useQuery } from '@tanstack/react-query'
import { listCategories } from '../../lib/api/catalogue'

export function CategoryTiles({ value, onChange }: { value: string; onChange: (categoryId: string) => void }) {
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => listCategories() })

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`rounded-full px-4 py-2 font-display text-[13px] font-semibold ${
          value === '' ? 'bg-accent text-white' : 'border border-border-strong text-ink-muted hover:bg-surface-sunken'
        }`}
      >
        All
      </button>
      {categories?.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={`rounded-full px-4 py-2 font-display text-[13px] font-semibold ${
            value === c.id ? 'bg-accent text-white' : 'border border-border-strong text-ink-muted hover:bg-surface-sunken'
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}
