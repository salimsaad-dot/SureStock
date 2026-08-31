import type { FastifyInstance } from 'fastify';
import {
  startStockTakeBodySchema,
  updateStockTakeLineBodySchema,
  listStockTakesQuerySchema,
  listStockTakeLinesQuerySchema,
  stockTakeIdParamsSchema,
  stockTakeLineParamsSchema,
} from './stock-take.schemas.js';
import {
  startStockTake,
  getStockTake,
  listStockTakes,
  updateStockTakeLine,
  getDiscrepancies,
  abandonStockTake,
  postStockTake,
} from './stock-take.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function stockTakeRoutes(app: FastifyInstance) {
  // Doc 3's role table: "Stock take — Count and correct — Manager, Owner."
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.post('/stock-takes', { preHandler: manage }, async (request, reply) => {
    const user = accessUser(request);
    const body = parseBody(startStockTakeBodySchema, request.body);
    const stockTake = await startStockTake(app.prisma, user.locationId, user.sub, body);
    return reply.code(201).send(stockTake);
  });

  app.get('/stock-takes', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const query = listStockTakesQuerySchema.parse(request.query);
    return listStockTakes(app.prisma, user.locationId, query);
  });

  app.get('/stock-takes/:id', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = stockTakeIdParamsSchema.parse(request.params);
    const query = listStockTakeLinesQuerySchema.parse(request.query);
    return getStockTake(app.prisma, user.locationId, id, query);
  });

  app.get('/stock-takes/:id/discrepancies', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = stockTakeIdParamsSchema.parse(request.params);
    return getDiscrepancies(app.prisma, user.locationId, id);
  });

  app.patch('/stock-takes/:id/lines/:lineId', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id, lineId } = stockTakeLineParamsSchema.parse(request.params);
    const body = parseBody(updateStockTakeLineBodySchema, request.body);
    return updateStockTakeLine(app.prisma, user.locationId, id, lineId, body);
  });

  app.post('/stock-takes/:id/post', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = stockTakeIdParamsSchema.parse(request.params);
    return postStockTake(app.prisma, user.locationId, user.sub, id);
  });

  app.post('/stock-takes/:id/abandon', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = stockTakeIdParamsSchema.parse(request.params);
    return abandonStockTake(app.prisma, user.locationId, id);
  });
}
