import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createSupplierBodySchema,
  updateSupplierBodySchema,
  supplierIdParamsSchema,
} from './supplier.schemas.js';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  archiveSupplier,
  restoreSupplier,
  deleteSupplier,
} from './supplier.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

const listQuerySchema = z.object({ includeArchived: z.coerce.boolean().optional().default(false) });

export default async function supplierRoutes(app: FastifyInstance) {
  // Manager+ only, not Cashier — suppliers aren't part of the Sell
  // screen; Doc 3's screen table gates Purchasing to Manager and Owner.
  const managerUp = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.get('/suppliers', { preHandler: managerUp }, async (request) => {
    const { includeArchived } = listQuerySchema.parse(request.query);
    return listSuppliers(app.prisma, accessUser(request).locationId, includeArchived);
  });

  app.post('/suppliers', { preHandler: managerUp }, async (request, reply) => {
    const body = parseBody(createSupplierBodySchema, request.body);
    const supplier = await createSupplier(app.prisma, accessUser(request).locationId, body);
    return reply.code(201).send(supplier);
  });

  app.patch('/suppliers/:id', { preHandler: managerUp }, async (request) => {
    const { id } = supplierIdParamsSchema.parse(request.params);
    const body = parseBody(updateSupplierBodySchema, request.body);
    return updateSupplier(app.prisma, accessUser(request).locationId, id, body);
  });

  app.post('/suppliers/:id/archive', { preHandler: managerUp }, async (request) => {
    const { id } = supplierIdParamsSchema.parse(request.params);
    return archiveSupplier(app.prisma, accessUser(request).locationId, id);
  });

  app.post('/suppliers/:id/restore', { preHandler: managerUp }, async (request) => {
    const { id } = supplierIdParamsSchema.parse(request.params);
    return restoreSupplier(app.prisma, accessUser(request).locationId, id);
  });

  app.delete(
    '/suppliers/:id',
    { preHandler: [app.authenticate, app.requireRole('OWNER')] },
    async (request, reply) => {
      const { id } = supplierIdParamsSchema.parse(request.params);
      await deleteSupplier(app.prisma, accessUser(request).locationId, id);
      return reply.code(204).send();
    },
  );
}
