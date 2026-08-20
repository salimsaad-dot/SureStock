import type { FastifyInstance } from 'fastify';
import {
  createSaleBodySchema,
  createRefundBodySchema,
  saleIdParamsSchema,
  listSalesQuerySchema,
  salesStatsQuerySchema,
} from './sale.schemas.js';
import { createSale, getSale, createRefund, listSales, getSalesStats, exportSalesCsv } from './sale.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function saleRoutes(app: FastifyInstance) {
  // Any role that sells can write and read sales — cost data is hidden
  // for cashiers inside serializeSale, the same pattern as everywhere
  // else, rather than a route-level gate.
  const any = [app.authenticate];

  app.post('/sales', { preHandler: any }, async (request, reply) => {
    const user = accessUser(request);
    const body = parseBody(createSaleBodySchema, request.body);
    const sale = await createSale(app.prisma, user.locationId, user.sub, user.role, body);
    return reply.code(201).send(sale);
  });

  app.get('/sales', { preHandler: any }, async (request) => {
    const user = accessUser(request);
    const query = listSalesQuerySchema.parse(request.query);
    return listSales(app.prisma, user.locationId, user.sub, user.role, query);
  });

  app.get('/sales/stats', { preHandler: any }, async (request) => {
    const user = accessUser(request);
    const query = salesStatsQuerySchema.parse(request.query);
    return getSalesStats(app.prisma, user.locationId, user.sub, user.role, query);
  });

  app.get('/sales/export', { preHandler: any }, async (request, reply) => {
    const user = accessUser(request);
    const query = salesStatsQuerySchema.parse(request.query);
    const csv = await exportSalesCsv(app.prisma, user.locationId, user.sub, user.role, query);
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="sales-export.csv"').send(csv);
  });

  app.get('/sales/:id', { preHandler: any }, async (request) => {
    const user = accessUser(request);
    const { id } = saleIdParamsSchema.parse(request.params);
    return getSale(app.prisma, id, user.role);
  });

  app.post('/sales/:id/refund', { preHandler: any }, async (request, reply) => {
    const user = accessUser(request);
    const { id } = saleIdParamsSchema.parse(request.params);
    const body = parseBody(createRefundBodySchema, request.body);
    const refund = await createRefund(app.prisma, user.locationId, user.sub, user.role, id, body);
    return reply.code(201).send(refund);
  });
}
