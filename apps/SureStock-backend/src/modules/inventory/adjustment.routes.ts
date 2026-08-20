import type { FastifyInstance } from 'fastify';
import { createAdjustmentBodySchema } from './adjustment.schemas.js';
import { createAdjustment } from './adjustment.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function adjustmentRoutes(app: FastifyInstance) {
  // Doc 6 T-12: "cashiers cannot adjust" — stated explicitly, unlike
  // T-11's receiving gate which just follows the catalogue's usual
  // manage-only default.
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.post('/inventory/adjustments', { preHandler: manage }, async (request, reply) => {
    const user = accessUser(request);
    const body = parseBody(createAdjustmentBodySchema, request.body);
    const adjustment = await createAdjustment(app.prisma, user.locationId, user.sub, body);
    return reply.code(201).send(adjustment);
  });
}
