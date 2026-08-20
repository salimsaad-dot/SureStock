import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getStaff } from '../../lib/api/auth'

export function StaffPickerPage() {
  const navigate = useNavigate()
  const { data: staff, isLoading, isError } = useQuery({
    queryKey: ['auth', 'staff'],
    queryFn: getStaff,
  })

  return (
    <main className="mx-auto max-w-2xl p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-accent">Switch user</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">Who's this?</h1>

      {isLoading && <p className="mt-6 text-ink-muted">Loading staff…</p>}
      {isError && <p className="mt-6 text-danger">Couldn't load the staff list.</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {staff?.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => navigate(`/switch/${member.id}`, { state: { name: member.name } })}
            className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface-raised font-display transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="text-sm font-semibold text-ink">{member.name}</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {member.role}
            </span>
          </button>
        ))}
      </div>
    </main>
  )
}
