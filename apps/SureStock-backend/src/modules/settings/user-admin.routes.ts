import type { FastifyInstance } from 'fastify';
import { createStaffBodySchema, updateStaffBodySchema, resetCredentialsBodySchema, staffIdParamsSchema } from './user-admin.schemas.js';
import { listStaff, createStaff, updateStaff, resetStaffCredentials } from './user-admin.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function userAdminRoutes(app: FastifyInstance) {
  // Owner-only throughout — matches the Settings page's own route gate
  // (App.tsx's <RequireRole roles={['OWNER']}>), not a separate policy.
  const ownerOnly = [app.authenticate, app.requireRole('OWNER')];

  app.get('/settings/users', { preHandler: ownerOnly }, async (request) => {
    const user = accessUser(request);
    return listStaff(app.prisma, user.locationId);
  });

  app.post('/settings/users', { preHandler: ownerOnly }, async (request, reply) => {
    const user = accessUser(request);
    const body = parseBody(createStaffBodySchema, request.body);
    const staff = await createStaff(app.prisma, user.locationId, body);
    return reply.code(201).send(staff);
  });

  app.patch('/settings/users/:id', { preHandler: ownerOnly }, async (request) => {
    const user = accessUser(request);
    const { id } = staffIdParamsSchema.parse(request.params);
    const body = parseBody(updateStaffBodySchema, request.body);
    return updateStaff(app.prisma, user.locationId, user.sub, id, body);
  });

  app.post('/settings/users/:id/reset-credentials', { preHandler: ownerOnly }, async (request) => {
    const user = accessUser(request);
    const { id } = staffIdParamsSchema.parse(request.params);
    const body = parseBody(resetCredentialsBodySchema, request.body);
    return resetStaffCredentials(app.prisma, user.locationId, id, body);
  });
}
