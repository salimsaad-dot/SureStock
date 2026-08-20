export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="p-6">
      <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-2 font-body text-ink-muted">
        Not built yet — see the build sequence in progress.md for what's next.
      </p>
    </main>
  )
}
