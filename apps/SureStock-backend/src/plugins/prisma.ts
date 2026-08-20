import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { prisma, disconnectPrisma } from '../lib/prisma.js';

/**
 * Wraps the shared Prisma client (lib/prisma.ts) as a Fastify decorator
 * so every route handler reaches it the same way — `app.prisma` — and
 * the connection is closed once, on server shutdown, instead of each
 * module managing its own client lifecycle.
 */
export default fp(async function prismaPlugin(app: FastifyInstance) {
  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await disconnectPrisma();
  });
});
