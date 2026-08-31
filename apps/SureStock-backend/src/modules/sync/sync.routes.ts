import type { FastifyInstance } from 'fastify';
import { syncCatalogueQuerySchema, syncBatchBodySchema } from './sync.schemas.js';
import { getCatalogueDelta, syncBatch } from './sync.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function syncRoutes(app: FastifyInstance) {
  // Any role that sells can pull the catalogue and drain its own
  // outbox — same as T-16's POST /sales, this isn't a manage-only action.
  const any = [app.authenticate];

  app.get('/sync/catalogue', { preHandler: any }, async (request) => {
    const user = accessUser(request);
    const { since } = syncCatalogueQuerySchema.parse(request.query);
    return getCatalogueDelta(app.prisma, user.locationId, user.role, since);
  });

  app.post('/sync/batch', { preHandler: any }, async (request) => {
    const user = accessUser(request);
    const body = parseBody(syncBatchBodySchema, request.body);
    return syncBatch(app.prisma, user.locationId, user.sub, user.role, body);
  });
}
