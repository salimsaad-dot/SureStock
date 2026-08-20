import type { FastifyInstance } from 'fastify';
import { receiveStockBodySchema } from './receive.schemas.js';
import { receiveStock } from './receive.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function receiveRoutes(app: FastifyInstance) {
  // Same manage-only gate as the rest of the catalogue's write endpoints
  // (Doc 6 doesn't carve out a separate role for receiving specifically,
  // and it moves cost price — a manager-and-up-only field already).
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.post('/inventory/receive', { preHandler: manage }, async (request, reply) => {
    const user = accessUser(request);
    const body = parseBody(receiveStockBodySchema, request.body);
    const receipt = await receiveStock(app.prisma, user.locationId, user.sub, body);
    return reply.code(201).send(receipt);
  });
}
