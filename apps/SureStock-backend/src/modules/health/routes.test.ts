import { describe, it, expect, afterAll } from 'vitest';
import Fastify from 'fastify';
import healthRoutes from './routes.js';

// A narrow test on purpose: it proves the route module wires up and
// responds correctly without needing the prisma plugin or a live
// database, since /health/live never touches either. /health/ready is
// covered separately once a test database exists to point it at.
describe('health routes', () => {
  const app = Fastify();
  app.register(healthRoutes);

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns 200 ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
