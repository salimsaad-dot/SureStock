import { z } from 'zod';
import { createSaleBodySchema } from '../sales/sale.schemas.js';

// Doc 2 §3.2: "the device pulls the full catalogue and caches it in
// IndexedDB, refreshing by changed-since timestamp afterwards." Omitted
// entirely (not an empty string) means a full pull — the device's very
// first sync, or after clearing its local cache.
export const syncCatalogueQuerySchema = z.object({
  since: z.coerce.date().optional(),
});
export type SyncCatalogueQuery = z.infer<typeof syncCatalogueQuerySchema>;

// Reuses T-16's own create-sale body verbatim — an offline sale is a
// normal sale in every way except the negative-stock rule (Doc 2 §3.2),
// which is a service-layer concern, not a different request shape.
export const syncBatchBodySchema = z.object({
  sales: z.array(createSaleBodySchema).min(1, 'At least one sale is required.').max(100),
});
export type SyncBatchBody = z.infer<typeof syncBatchBodySchema>;
