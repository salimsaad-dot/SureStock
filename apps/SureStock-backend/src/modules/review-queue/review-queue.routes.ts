import type { FastifyInstance } from 'fastify';
import { listReviewQueueQuerySchema, resolveReviewQueueItemBodySchema, reviewQueueItemIdParamsSchema } from './review-queue.schemas.js';
import { listReviewQueue, resolveReviewQueueItem } from './review-queue.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function reviewQueueRoutes(app: FastifyInstance) {
  // Manager/Owner only — a cashier's offline sync can create these
  // entries, but resolving them (a stock or sale-level judgment call) is
  // the same tier as approving a discount override.
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.get('/review-queue', { preHandler: manage }, async (request) => {
    const query = listReviewQueueQuerySchema.parse(request.query);
    return listReviewQueue(app.prisma, query);
  });

  app.post('/review-queue/:id/resolve', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = reviewQueueItemIdParamsSchema.parse(request.params);
    const body = parseBody(resolveReviewQueueItemBodySchema, request.body);
    return resolveReviewQueueItem(app.prisma, user.sub, id, body);
  });
}
