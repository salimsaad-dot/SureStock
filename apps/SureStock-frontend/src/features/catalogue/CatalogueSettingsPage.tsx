import { Link } from 'react-router-dom'
import { CategoriesPanel } from './CategoriesPanel'
import { SuppliersPanel } from './SuppliersPanel'

export function CatalogueSettingsPage() {
  return (
    <main className="p-6">
      <Link to="/inventory" className="font-display text-[13px] text-ink-muted hover:text-ink">
        ← Back to inventory
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">Categories &amp; suppliers</h1>

      <div className="mt-6 flex flex-col gap-10">
        <CategoriesPanel />
        <SuppliersPanel />
      </div>
    </main>
  )
}
