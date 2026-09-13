import { PageContainer } from '../../components/PageContainer'
import { PageHeader } from '../../components/PageHeader'
import { CategoriesPanel } from './CategoriesPanel'
import { SuppliersPanel } from './SuppliersPanel'

export function CatalogueSettingsPage() {
  return (
    <PageContainer>
      <PageHeader variant="detail" title="Categories & suppliers" backTo="/inventory" backLabel="Back to inventory" />

      <div className="mt-6 flex flex-col gap-10">
        <CategoriesPanel />
        <SuppliersPanel />
      </div>
    </PageContainer>
  )
}
