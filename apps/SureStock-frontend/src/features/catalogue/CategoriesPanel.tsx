import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { Pill } from '../../components/Pill'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { TextInput } from '../../components/TextInput'
import { archiveCategory, createCategory, listCategories, restoreCategory } from '../../lib/api/catalogue'
import { ApiError } from '../../lib/api/types'

export function CategoriesPanel() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories', { includeArchived: true }],
    queryFn: () => listCategories(true),
  })

  const create = useMutation({
    mutationFn: () => createCategory({ name: name.trim() }),
    onSuccess: () => {
      setName('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  const archive = useMutation({
    mutationFn: (id: string) => archiveCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  const restore = useMutation({
    mutationFn: (id: string) => restoreCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-ink">Categories</h2>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate()
        }}
      >
        <TextInput label="New category name" value={name} onChange={(e) => setName(e.target.value)} error={error ?? undefined} />
        <Button type="submit" isLoading={create.isPending}>
          Add
        </Button>
      </form>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton rows={3} columns={3} />}
            {!isLoading && categories?.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3}>
                  <EmptyState message="No categories yet." />
                </TableCell>
              </TableRow>
            )}
            {categories?.map((category) => (
              <TableRow key={category.id}>
                <TableCell>{category.name}</TableCell>
                <TableCell>
                  {category.archivedAt ? <Pill variant="warning">Archived</Pill> : <Pill variant="success">Active</Pill>}
                </TableCell>
                <TableCell>
                  {category.archivedAt ? (
                    <Button size="default" variant="secondary" isLoading={restore.isPending} onClick={() => restore.mutate(category.id)}>
                      Restore
                    </Button>
                  ) : (
                    <Button size="default" variant="secondary" isLoading={archive.isPending} onClick={() => archive.mutate(category.id)}>
                      Archive
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
