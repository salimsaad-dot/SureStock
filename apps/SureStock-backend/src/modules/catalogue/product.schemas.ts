import { z } from 'zod';

const unitSchema = z.enum(['EACH', 'KG', 'LITRE', 'PACK', 'METRE']);

// Money fields are integer pesewas (Doc 2 §3.3), not cedis — 1250 means
// GH₵12.50. See lib/money.ts for the conversion at the storage boundary.
const pesewasSchema = z.number().int().nonnegative();

const variantInputSchema = z.object({
  sku: z.string().min(1).max(191),
  barcode: z.string().min(1).max(191).optional(),
  variantName: z.string().min(1).max(191).optional(),
  costPrice: pesewasSchema,
  sellingPrice: pesewasSchema,
  reorderPoint: z.number().nonnegative().optional(),
  reorderQuantity: z.number().nonnegative().optional(),
  // Doc 5 §2: stock changes only ever happen through stock_movement.
  // A non-zero opening quantity here becomes an OPENING_BALANCE
  // movement in the same transaction as the variant itself — never a
  // direct write to quantity_on_hand.
  openingQuantity: z.number().nonnegative().optional(),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const createProductBodySchema = z.object({
  name: z.string().min(1, 'Name is required.').max(191),
  description: z.string().optional(),
  categoryId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
  unit: unitSchema.optional(),
  taxRateId: z.string().min(1).optional(),
  isPerishable: z.boolean().optional(),
  imageUrl: z.string().min(1).optional(),
  // Doc 5: "A product with no real variants still gets one default row"
  // describes the data model, not licence to fabricate a price no one
  // supplied — every product needs at least one real variant with real
  // pricing, even if it's a single unnamed variant standing in for the
  // whole product.
  variants: z.array(variantInputSchema).min(1, 'At least one variant is required.'),
});
export type CreateProductBody = z.infer<typeof createProductBodySchema>;

export const updateProductBodySchema = z.object({
  name: z.string().min(1).max(191).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  supplierId: z.string().min(1).nullable().optional(),
  unit: unitSchema.optional(),
  taxRateId: z.string().min(1).nullable().optional(),
  isPerishable: z.boolean().optional(),
  imageUrl: z.string().min(1).nullable().optional(),
});
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;

export const productStatusBodySchema = z.object({
  status: z.enum(['ACTIVE', 'DISCONTINUED', 'SEASONAL']),
});
export type ProductStatusBody = z.infer<typeof productStatusBodySchema>;

export const createVariantBodySchema = variantInputSchema;

export const updateVariantBodySchema = z.object({
  sku: z.string().min(1).max(191).optional(),
  barcode: z.string().min(1).max(191).nullable().optional(),
  variantName: z.string().min(1).max(191).nullable().optional(),
  costPrice: pesewasSchema.optional(),
  sellingPrice: pesewasSchema.optional(),
  reorderPoint: z.number().nonnegative().nullable().optional(),
  reorderQuantity: z.number().nonnegative().nullable().optional(),
  // Required by the route handler (not by zod here) whenever
  // sellingPrice is present — see product.routes.ts. Kept optional at
  // the schema level so "missing reason" can get its own clear error
  // message instead of a generic validation failure.
  priceChangeReason: z.string().min(1).optional(),
});
export type UpdateVariantBody = z.infer<typeof updateVariantBodySchema>;

export const productIdParamsSchema = z.object({ id: z.string().min(1) });
export const variantParamsSchema = z.object({ id: z.string().min(1), variantId: z.string().min(1) });

export const listProductsQuerySchema = z.object({
  q: z.string().min(1).max(191).optional(),
  categoryId: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'DISCONTINUED', 'SEASONAL']).optional(),
  stockLevel: z.enum(['IN_STOCK', 'LOW', 'OUT']).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const barcodeLookupQuerySchema = z.object({
  barcode: z.string().min(1),
});

// Doc 3 App Flow §3: the Sell screen's "grid of category tiles and
// favourite products" — "popular" is real top-sellers-by-quantity over
// a trailing window, not fabricated demo data.
export const popularProductsQuerySchema = z.object({
  categoryId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(8),
});
export type PopularProductsQuery = z.infer<typeof popularProductsQuerySchema>;

export const recentProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(8),
});
export type RecentProductsQuery = z.infer<typeof recentProductsQuerySchema>;
