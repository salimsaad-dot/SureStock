import { z } from 'zod';

export const createCategoryBodySchema = z.object({
  name: z.string().min(1, 'Name is required.').max(191),
  parentId: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  colour: z.string().min(1).optional(),
});
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;

export const updateCategoryBodySchema = z.object({
  name: z.string().min(1).max(191).optional(),
  // Explicit null, not just omission, so a client can move a category
  // back to the top level — optional-and-absent means "leave unchanged",
  // present-and-null means "clear it".
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().optional(),
  colour: z.string().min(1).nullable().optional(),
});
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;

export const categoryIdParamsSchema = z.object({
  id: z.string().min(1),
});
