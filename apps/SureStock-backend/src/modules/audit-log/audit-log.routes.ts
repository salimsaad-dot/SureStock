import type { FastifyInstance } from 'fastify';
import { listAuditLogQuerySchema } from './audit-log.schemas.js';
import { listAuditLog } from './audit-log.service.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function auditLogRoutes(app: FastifyInstance) {
  // Doc 3's Settings note: "Owner only" — same gate as Users & Roles and Business Profile.
  app.get('/audit-log', { preHandler: [app.authenticate, app.requireRole('OWNER')] }, async (request) => {
    const user = accessUser(request);
    const query = listAuditLogQuerySchema.parse(request.query);
    return listAuditLog(app.prisma, user.locationId, query);
  });
}
