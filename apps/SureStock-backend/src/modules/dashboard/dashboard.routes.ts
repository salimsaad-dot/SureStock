import type { FastifyInstance } from 'fastify';
import { getDashboard } from './dashboard.service.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function dashboardRoutes(app: FastifyInstance) {
  // Doc 3 §6 / §7's screen table: Dashboard is Owner/Manager only, same gate as Reports.
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.get('/dashboard', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    return getDashboard(app.prisma, user.locationId);
  });
}
