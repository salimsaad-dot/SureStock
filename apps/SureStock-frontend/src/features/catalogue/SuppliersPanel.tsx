import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { Pill } from '../../components/Pill'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { TextInput } from '../../components/TextInput'
import { archiveSupplier, createSupplier, listSuppliers, restoreSupplier } from '../../lib/api/catalogue'
import { ApiError } from '../../lib/api/types'

export function SuppliersPanel() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers', { includeArchived: true }],
    queryFn: () => listSuppliers(true),
  })

  const create = useMutation({
    mutationFn: () => createSupplier({ name: name.trim(), phone: phone.trim() || undefined }),
    onSuccess: () => {
      setName('')
      setPhone('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  const archive = useMutation({
    mutationFn: (id: string) => archiveSupplier(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })

  const restore = useMutation({
    mutationFn: (id: string) => restoreSupplier(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })

  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-ink">Suppliers</h2>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate()
        }}
      >
        <div className="min-w-0 flex-1">
          <TextInput label="Supplier name" value={name} onChange={(e) => setName(e.target.value)} error={error ?? undefined} />
        </div>
        <div className="min-w-0 flex-1">
          <TextInput label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button type="submit" isLoading={create.isPending} className="flex-none">
          Add
        </Button>
      </form>

      <div className="mt-4 hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton rows={3} columns={4} />}
            {!isLoading && suppliers?.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4}>
                  <EmptyState message="No suppliers yet." />
                </TableCell>
              </TableRow>
            )}
            {suppliers?.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell>{supplier.name}</TableCell>
                <TableCell className="font-mono">{supplier.phone ?? '—'}</TableCell>
                <TableCell>
                  {supplier.archivedAt ? <Pill variant="warning">Archived</Pill> : <Pill variant="success">Active</Pill>}
                </TableCell>
                <TableCell>
                  {supplier.archivedAt ? (
                    <Button size="default" variant="secondary" isLoading={restore.isPending} onClick={() => restore.mutate(supplier.id)}>
                      Restore
                    </Button>
                  ) : (
                    <Button size="default" variant="secondary" isLoading={archive.isPending} onClick={() => archive.mutate(supplier.id)}>
                      Archive
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-col gap-2 md:hidden">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[68px] animate-pulse rounded-lg border border-border bg-surface-raised" />)}
        {!isLoading && suppliers?.length === 0 && <EmptyState message="No suppliers yet." />}
        {suppliers?.map((supplier) => (
          <div key={supplier.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised p-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-display text-sm font-medium text-ink">{supplier.name}</span>
                {supplier.archivedAt ? <Pill variant="warning">Archived</Pill> : <Pill variant="success">Active</Pill>}
              </div>
              <p className="mt-0.5 font-mono text-[12px] text-ink-faint">{supplier.phone ?? '—'}</p>
            </div>
            {supplier.archivedAt ? (
              <Button size="default" variant="secondary" className="flex-none" isLoading={restore.isPending} onClick={() => restore.mutate(supplier.id)}>
                Restore
              </Button>
            ) : (
              <Button size="default" variant="secondary" className="flex-none" isLoading={archive.isPending} onClick={() => archive.mutate(supplier.id)}>
                Archive
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
