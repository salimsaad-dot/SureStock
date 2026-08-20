import type { FastifyInstance } from 'fastify';

/**
 * Two checks, deliberately different in what they promise:
 *  - /health/live  — the process is up. Used by the host to know
 *    whether to restart the container; never touches the database.
 *  - /health/ready — the process can actually serve a request end to
 *    end, i.e. the database is reachable. Used before routing traffic
 *    to this instance.
 * Conflating the two means a slow database makes the host think the
 * whole process is dead and restart it, which is the wrong response to
 * a database blip.
 */
export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (err) {
      app.log.error({ err }, 'readiness check failed: database unreachable');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
