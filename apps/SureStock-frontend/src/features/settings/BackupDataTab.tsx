import { Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { exportAllData } from '../../lib/api/settings'
import { triggerBrowserDownload } from '../../lib/download'
import { useToast } from '../../lib/toast-store'

/**
 * Doc 6 T-31: "full CSV export of every table" and "nightly backups
 * verified by a documented restore drill." The export below is real —
 * this shop's own business data (products, sales, stock movements,
 * staff, etc.), never `password_hash`/`pin_hash` (see
 * data-export.service.ts). "Nightly backups" is deliberately *not* a
 * button here: a literal database backup dumps every shop in this
 * deployment at once, and there's no platform-operator role in this
 * app that could safely be trusted with everyone's data — Doc 2's own
 * design already frames it as infrastructure (a managed host's
 * automated-backup feature), not a per-shop, in-app action.
 */
export function BackupDataTab() {
  const show = useToast()
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportAllData()
      triggerBrowserDownload(blob, 'surestock-export.csv')
    } catch {
      show('Could not export your data.', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="font-display text-lg font-semibold text-ink">Backup & Data</h2>
      <p className="mt-0.5 font-display text-[13px] text-ink-muted">
        A complete copy of your shop's own data — products, sales, stock movements, staff, and more — as one CSV file. Keep it somewhere
        safe; it's your real safety net and your way out if you ever need one.
      </p>

      <Button isLoading={exporting} onClick={handleExport} className="mt-4 w-fit">
        <Download className="h-4 w-4" aria-hidden="true" /> Download your data
      </Button>

      <p className="mt-4 font-display text-[13px] text-ink-faint">
        Full database backups (protecting every shop on this system, not just yours) are handled at the infrastructure level — automated
        nightly backups plus a periodic restore drill — rather than from this screen.
      </p>
    </div>
  )
}
