import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Pill } from '../../components/Pill'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/Table'
import { commitImport, downloadImportTemplate, parseImportFile, validateImport } from '../../lib/api/catalogue'
import { ApiError, IMPORT_FIELDS, type ImportField, type ImportMapping, type ImportParseResponse, type ImportValidationReport } from '../../lib/api/types'
import { triggerBrowserDownload } from '../../lib/download'
import { IMPORT_FIELD_LABELS, REQUIRED_IMPORT_FIELDS } from './importFields'

type Step = 'upload' | 'map' | 'preview' | 'done'

export function ImportPage() {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('upload')
  const [parsed, setParsed] = useState<ImportParseResponse | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [report, setReport] = useState<ImportValidationReport | null>(null)
  const [productsCreated, setProductsCreated] = useState(0)

  const templateMutation = useMutation({
    mutationFn: downloadImportTemplate,
    onSuccess: (blob) => triggerBrowserDownload(blob, 'surestock-product-import-template.csv'),
  })

  const parseMutation = useMutation({
    mutationFn: parseImportFile,
    onSuccess: (result) => {
      setParsed(result)
      setMapping(result.suggestedMapping)
      setStep('map')
    },
  })

  const validateMutation = useMutation({
    mutationFn: () => validateImport(parsed!.headers, parsed!.rows, mapping),
    onSuccess: (result) => {
      setReport(result)
      setStep('preview')
    },
  })

  const commitMutation = useMutation({
    mutationFn: () => commitImport(parsed!.headers, parsed!.rows, mapping),
    onSuccess: (result) => {
      if (result.committed) {
        setProductsCreated(result.productsCreated)
        queryClient.invalidateQueries({ queryKey: ['products'] })
        setStep('done')
      } else {
        // Something changed since preview (e.g. a concurrent duplicate SKU) — show the fresh report.
        setReport(result.report)
        setStep('preview')
      }
    },
  })

  const requiredFieldsMapped = REQUIRED_IMPORT_FIELDS.every((field) => mapping[field])

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link to="/inventory" className="font-display text-[13px] text-ink-muted hover:text-ink">
        ← Back to inventory
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">Import products</h1>

      {step === 'upload' && (
        <section className="mt-6">
          <p className="max-w-lg text-ink-muted">
            Upload a CSV or XLSX file of products. You'll map columns to fields and preview every row before
            anything is created.
          </p>
          <Button variant="secondary" isLoading={templateMutation.isPending} onClick={() => templateMutation.mutate()} className="mt-4">
            Download template
          </Button>

          <div className="mt-6">
            <label className="font-display text-[13px] font-medium text-ink">Choose a file</label>
            <input
              type="file"
              accept=".csv,.xlsx"
              disabled={parseMutation.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) parseMutation.mutate(file)
              }}
              className="mt-1.5 block font-display text-sm text-ink file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface-raised file:px-3 file:py-2 file:font-display file:text-sm file:text-ink"
            />
            {parseMutation.isPending && <p className="mt-2 text-ink-muted">Parsing…</p>}
            {parseMutation.isError && (
              <p role="alert" className="mt-2 text-danger">
                {parseMutation.error instanceof ApiError ? parseMutation.error.message : 'Could not read that file.'}
              </p>
            )}
          </div>
        </section>
      )}

      {step === 'map' && parsed && (
        <section className="mt-6">
          <p className="text-ink-muted">
            Match each field to a column from your file. {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} found.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {IMPORT_FIELDS.map((field) => (
              <label key={field} className="flex flex-col gap-1.5">
                <span className="font-display text-[13px] font-medium text-ink">
                  {IMPORT_FIELD_LABELS[field]}
                  {REQUIRED_IMPORT_FIELDS.includes(field) && <span className="text-danger"> *</span>}
                </span>
                <select
                  className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
                  value={mapping[field] ?? ''}
                  onChange={(e) =>
                    setMapping((m) => {
                      const next = { ...m }
                      if (e.target.value) next[field as ImportField] = e.target.value
                      else delete next[field as ImportField]
                      return next
                    })
                  }
                >
                  <option value="">— Not mapped —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {!requiredFieldsMapped && (
            <p className="mt-3 text-[13px] text-danger">Map every required field (*) before continuing.</p>
          )}

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button disabled={!requiredFieldsMapped} isLoading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>
              Preview
            </Button>
          </div>
        </section>
      )}

      {step === 'preview' && report && (
        <section className="mt-6">
          <div className="flex flex-wrap gap-3">
            <Pill variant="success">{report.validCount} valid</Pill>
            {report.invalidCount > 0 && <Pill variant="danger">{report.invalidCount} invalid</Pill>}
            <span className="font-display text-sm text-ink-muted">of {report.totalRows} rows</span>
          </div>

          {report.invalidCount > 0 && (
            <p className="mt-3 max-w-lg text-[13px] text-danger">
              Fix these rows in your spreadsheet and re-upload — the import is all-or-nothing, so nothing is
              created while any row still has a problem.
            </p>
          )}

          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.rowIndex}>
                    <TableCell className="font-mono">{row.rowIndex}</TableCell>
                    <TableCell>
                      {row.status === 'valid' ? <Pill variant="success">Valid</Pill> : <Pill variant="danger">Invalid</Pill>}
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {row.status === 'valid' ? (typeof row.data?.name === 'string' ? row.data.name : '—') : row.reasons.join('; ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" onClick={() => setStep('map')}>
              Back to mapping
            </Button>
            <Button
              disabled={report.invalidCount > 0}
              isLoading={commitMutation.isPending}
              onClick={() => commitMutation.mutate()}
            >
              Commit import
            </Button>
          </div>
        </section>
      )}

      {step === 'done' && (
        <section className="mt-6">
          <p className="font-display text-lg text-ink">
            {productsCreated} product{productsCreated === 1 ? '' : 's'} created.
          </p>
          <Link to="/inventory">
            <Button className="mt-4">Back to inventory</Button>
          </Link>
        </section>
      )}
    </main>
  )
}
