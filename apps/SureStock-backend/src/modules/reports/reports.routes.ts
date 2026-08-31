import type { FastifyInstance } from 'fastify';
import { reportsFilterSchema, reportsProductsQuerySchema, shrinkageQuerySchema, staffActivityQuerySchema } from './reports.schemas.js';
import {
  getReportsOverview,
  getReportsTrend,
  getPaymentBreakdown,
  getReportsProducts,
  getShrinkageReport,
  getStaffActivity,
  exportReportsCsv,
} from './reports.service.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function reportsRoutes(app: FastifyInstance) {
  // Doc 1's role table: Manager sees reports, Cashier doesn't — same
  // gate as the nav already enforces, but real here too, not just
  // hidden in the UI. Profit/cost data is inherently on this screen,
  // so there's no cashier-safe partial view to fall back to.
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.get('/reports/overview', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const filter = reportsFilterSchema.parse(request.query);
    return getReportsOverview(app.prisma, user.locationId, filter);
  });

  app.get('/reports/trend', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const filter = reportsFilterSchema.parse(request.query);
    return getReportsTrend(app.prisma, user.locationId, filter);
  });

  app.get('/reports/payment-breakdown', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const filter = reportsFilterSchema.parse(request.query);
    return getPaymentBreakdown(app.prisma, user.locationId, filter);
  });

  app.get('/reports/products', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const query = reportsProductsQuerySchema.parse(request.query);
    return getReportsProducts(app.prisma, user.locationId, query);
  });

  app.get('/reports/shrinkage', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const filter = shrinkageQuerySchema.parse(request.query);
    return getShrinkageReport(app.prisma, user.locationId, filter);
  });

  app.get('/reports/staff-activity', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const filter = staffActivityQuerySchema.parse(request.query);
    return getStaffActivity(app.prisma, user.locationId, filter);
  });

  app.get('/reports/export', { preHandler: manage }, async (request, reply) => {
    const user = accessUser(request);
    const filter = reportsFilterSchema.parse(request.query);
    const csv = await exportReportsCsv(app.prisma, user.locationId, filter);
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="report.csv"').send(csv);
  });
}
