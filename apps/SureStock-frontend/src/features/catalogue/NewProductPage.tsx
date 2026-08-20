import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { createProduct, listCategories, listSuppliers } from '../../lib/api/catalogue'
import { ApiError, type ProductUnit } from '../../lib/api/types'
import { parseCedisToPesewas } from '../../lib/money'

const UNITS: ProductUnit[] = ['EACH', 'KG', 'LITRE', 'PACK', 'METRE']

const variantSchema = z.object({
  sku: z.string().min(1, 'SKU is required.'),
  barcode: z.string().optional(),
  variantName: z.string().optional(),
  costPrice: z.string().min(1, 'Cost price is required.'),
  sellingPrice: z.string().min(1, 'Selling price is required.'),
  reorderPoint: z.string().optional(),
  reorderQuantity: z.string().optional(),
  openingQuantity: z.string().optional(),
})

const productSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
  unit: z.enum(['EACH', 'KG', 'LITRE', 'PACK', 'METRE']),
  isPerishable: z.boolean(),
  variants: z.array(variantSchema).min(1, 'At least one variant is required.'),
})
type ProductForm = z.infer<typeof productSchema>

const emptyVariant = { sku: '', barcode: '', variantName: '', costPrice: '', sellingPrice: '', reorderPoint: '', reorderQuantity: '', openingQuantity: '' }

export function NewProductPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => listCategories() })
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() })

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', description: '', categoryId: '', supplierId: '', unit: 'EACH', isPerishable: false, variants: [emptyVariant] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'variants' })

  const mutation = useMutation({
    mutationFn: (values: ProductForm) => {
      const variants = values.variants.map((v) => {
        const costPrice = parseCedisToPesewas(v.costPrice)
        const sellingPrice = parseCedisToPesewas(v.sellingPrice)
        if (costPrice === null || sellingPrice === null) throw new Error('Enter valid prices for every variant.')
        return {
          sku: v.sku,
          barcode: v.barcode || undefined,
          variantName: v.variantName || undefined,
          costPrice,
          sellingPrice,
          reorderPoint: v.reorderPoint ? Number(v.reorderPoint) : undefined,
          reorderQuantity: v.reorderQuantity ? Number(v.reorderQuantity) : undefined,
          openingQuantity: v.openingQuantity ? Number(v.openingQuantity) : undefined,
        }
      })
      return createProduct({
        name: values.name,
        description: values.description || undefined,
        categoryId: values.categoryId || undefined,
        supplierId: values.supplierId || undefined,
        unit: values.unit,
        isPerishable: values.isPerishable,
        variants,
      })
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      navigate(`/inventory/${product.id}`)
    },
    onError: (err) => {
      if (err instanceof ApiError) setError('root', { message: err.message })
    },
  })

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link to="/inventory" className="font-display text-[13px] text-ink-muted hover:text-ink">
        ← Back to inventory
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">New product</h1>

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <TextInput label="Name" error={errors.name?.message} {...register('name')} />
        <TextInput label="Description (optional)" error={errors.description?.message} {...register('description')} />

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Category</span>
            <select className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink" {...register('categoryId')}>
              <option value="">None</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Supplier</span>
            <select className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink" {...register('supplierId')}>
              <option value="">None</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Unit</span>
            <select className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink" {...register('unit')}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 font-display text-sm text-ink">
          <input type="checkbox" {...register('isPerishable')} />
          Perishable
        </label>

        <h2 className="mt-2 font-display text-lg font-semibold text-ink">Variants</h2>
        {errors.variants?.root?.message && <p className="text-[13px] text-danger">{errors.variants.root.message}</p>}

        {fields.map((field, index) => (
          <div key={field.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap gap-3">
              <TextInput label="SKU" error={errors.variants?.[index]?.sku?.message} {...register(`variants.${index}.sku`)} />
              <TextInput label="Barcode (optional)" {...register(`variants.${index}.barcode`)} />
              <TextInput label="Variant name (optional)" {...register(`variants.${index}.variantName`)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <TextInput label="Cost price (GH₵)" error={errors.variants?.[index]?.costPrice?.message} {...register(`variants.${index}.costPrice`)} />
              <TextInput label="Selling price (GH₵)" error={errors.variants?.[index]?.sellingPrice?.message} {...register(`variants.${index}.sellingPrice`)} />
              <TextInput label="Opening quantity" {...register(`variants.${index}.openingQuantity`)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <TextInput label="Reorder point (optional)" {...register(`variants.${index}.reorderPoint`)} />
              <TextInput label="Reorder quantity (optional)" {...register(`variants.${index}.reorderQuantity`)} />
            </div>
            {fields.length > 1 && (
              <Button type="button" variant="secondary" size="default" className="mt-3" onClick={() => remove(index)}>
                Remove variant
              </Button>
            )}
          </div>
        ))}

        <Button type="button" variant="secondary" onClick={() => append(emptyVariant)}>
          Add another variant
        </Button>

        {errors.root?.message && (
          <p role="alert" className="font-display text-[13px] text-danger">
            {errors.root.message}
          </p>
        )}

        <Button type="submit" isLoading={mutation.isPending} className="mt-2">
          Create product
        </Button>
      </form>
    </main>
  )
}
