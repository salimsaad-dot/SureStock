import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createCategoryBodySchema,
  updateCategoryBodySchema,
  categoryIdParamsSchema,
} from './category.schemas.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  restoreCategory,
  deleteCategory,
} from './category.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

const listQuerySchema = z.object({ includeArchived: z.coerce.boolean().optional().default(false) });

export default async function categoryRoutes(app: FastifyInstance) {
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  // Every role reads categories — even a cashier needs them for the
  // Sell screen's category filter chips (Doc 3, §3).
  app.get('/categories', { preHandler: [app.authenticate] }, async (request) => {
    const { includeArchived } = listQuerySchema.parse(request.query);
    return listCategories(app.prisma, accessUser(request).locationId, includeArchived);
  });

  app.post('/categories', { preHandler: manage }, async (request, reply) => {
    const body = parseBody(createCategoryBodySchema, request.body);
    const category = await createCategory(app.prisma, accessUser(request).locationId, body);
    return reply.code(201).send(category);
  });

  app.patch('/categories/:id', { preHandler: manage }, async (request) => {
    const { id } = categoryIdParamsSchema.parse(request.params);
    const body = parseBody(updateCategoryBodySchema, request.body);
    return updateCategory(app.prisma, accessUser(request).locationId, id, body);
  });

  app.post('/categories/:id/archive', { preHandler: manage }, async (request) => {
    const { id } = categoryIdParamsSchema.parse(request.params);
    return archiveCategory(app.prisma, accessUser(request).locationId, id);
  });

  app.post('/categories/:id/restore', { preHandler: manage }, async (request) => {
    const { id } = categoryIdParamsSchema.parse(request.params);
    return restoreCategory(app.prisma, accessUser(request).locationId, id);
  });

  // Hard delete is Owner-only — a permanent, irreversible action gets a
  // narrower gate than the everyday create/rename/archive operations
  // above, matching the pattern elsewhere in the docs (refunds, discount
  // overrides) of high-blast-radius actions needing the top role.
  app.delete(
    '/categories/:id',
    { preHandler: [app.authenticate, app.requireRole('OWNER')] },
    async (request, reply) => {
      const { id } = categoryIdParamsSchema.parse(request.params);
      await deleteCategory(app.prisma, accessUser(request).locationId, id);
      return reply.code(204).send();
    },
  );
}
