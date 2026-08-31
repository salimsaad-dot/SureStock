import type { FastifyInstance } from 'fastify';
import {
  createPurchaseOrderBodySchema,
  updatePurchaseOrderBodySchema,
  receivePurchaseOrderBodySchema,
  purchaseOrderIdParamsSchema,
  listPurchaseOrdersQuerySchema,
  purchaseOrderStatsQuerySchema,
} from './purchase-order.schemas.js';
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  sendPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderStats,
  getRestockRecommendations,
} from './purchase-order.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function purchaseOrderRoutes(app: FastifyInstance) {
  // Doc 3's screen table gates Purchasing to Manager and Owner, same as
  // suppliers (supplier.routes.ts) — a cashier has no reason to place or
  // receive orders.
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.get('/purchase-orders', { preHandler: manage }, async (request) => {
    const query = listPurchaseOrdersQuerySchema.parse(request.query);
    return listPurchaseOrders(app.prisma, accessUser(request).locationId, query);
  });

  app.get('/purchase-orders/stats', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const query = purchaseOrderStatsQuerySchema.parse(request.query);
    return getPurchaseOrderStats(app.prisma, user.locationId, query);
  });

  app.get('/purchase-orders/restock-recommendations', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    return getRestockRecommendations(app.prisma, user.locationId);
  });

  app.get('/purchase-orders/:id', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = purchaseOrderIdParamsSchema.parse(request.params);
    return getPurchaseOrder(app.prisma, user.locationId, id);
  });

  app.post('/purchase-orders', { preHandler: manage }, async (request, reply) => {
    const user = accessUser(request);
    const body = parseBody(createPurchaseOrderBodySchema, request.body);
    const po = await createPurchaseOrder(app.prisma, user.locationId, user.sub, body);
    return reply.code(201).send(po);
  });

  app.patch('/purchase-orders/:id', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = purchaseOrderIdParamsSchema.parse(request.params);
    const body = parseBody(updatePurchaseOrderBodySchema, request.body);
    return updatePurchaseOrder(app.prisma, user.locationId, id, body);
  });

  app.post('/purchase-orders/:id/send', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = purchaseOrderIdParamsSchema.parse(request.params);
    return sendPurchaseOrder(app.prisma, user.locationId, id);
  });

  app.post('/purchase-orders/:id/cancel', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = purchaseOrderIdParamsSchema.parse(request.params);
    return cancelPurchaseOrder(app.prisma, user.locationId, id);
  });

  app.post('/purchase-orders/:id/receive', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = purchaseOrderIdParamsSchema.parse(request.params);
    const body = parseBody(receivePurchaseOrderBodySchema, request.body);
    return receivePurchaseOrder(app.prisma, user.locationId, user.sub, id, body);
  });
}
