import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

/**
 * Product-testing pass, 2026-08-26, gap #3: no CORS plugin existed at
 * all. `NODE_ENV=test` takes the same non-production branch as
 * `development` in `corsOriginResolver` (app.ts), so the dev/test half
 * of this behavior is provable against the normal test-mode app — no
 * `vi.resetModules()` trick needed here, unlike the rate-limit tests.
 * Only the production-only branch (requiring `CORS_ORIGIN`) needs a
 * forced `NODE_ENV` the same way those tests force theirs.
 */
describe('CORS (product-testing pass, gap #3)', () => {
  describe('dev/test: any localhost origin allowed, anything else rejected', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildApp();
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('a request with no Origin header (curl, a mobile client) is unaffected', async () => {
      const res = await app.inject({ method: 'GET', url: '/health/live' });
      expect(res.statusCode).toBe(200);
    });

    it('a localhost origin, any port, gets reflected in Access-Control-Allow-Origin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { origin: 'http://localhost:5183' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5183');
    });

    it('127.0.0.1 is treated the same as localhost', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { origin: 'http://127.0.0.1:5183' },
      });
      expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5183');
    });

    it('a real cross-origin request (not localhost) is not granted CORS access', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { origin: 'https://evil.example' },
      });
      // The request still completes (Fastify doesn't block the handler from
      // running) — it's the *header* a real browser would enforce against
      // that must be absent, since that's the actual protection mechanism.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('a preflight OPTIONS request for a disallowed origin is not granted access either', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/products',
        headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
      });
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('production: only an explicitly configured CORS_ORIGIN is allowed, localhost is no longer special-cased', () => {
    let app: FastifyInstance;

    afterAll(async () => {
      await app?.close();
    });

    it('with no CORS_ORIGIN set, nothing is allowed — fails closed, not open', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalCorsOrigin = process.env.CORS_ORIGIN;
      process.env.NODE_ENV = 'production';
      delete process.env.CORS_ORIGIN;
      vi.resetModules();
      const { buildApp: buildProdApp } = await import('./app.js');
      app = await buildProdApp();
      await app.ready();
      process.env.NODE_ENV = originalNodeEnv;
      if (originalCorsOrigin !== undefined) process.env.CORS_ORIGIN = originalCorsOrigin;

      const localhostAttempt = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { origin: 'http://localhost:5183' },
      });
      expect(localhostAttempt.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('with CORS_ORIGIN set, exactly that origin is allowed and nothing else is', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalCorsOrigin = process.env.CORS_ORIGIN;
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGIN = 'https://app.surestock.example';
      vi.resetModules();
      const { buildApp: buildProdApp } = await import('./app.js');
      app = await buildProdApp();
      await app.ready();
      process.env.NODE_ENV = originalNodeEnv;
      if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = originalCorsOrigin;

      const allowed = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { origin: 'https://app.surestock.example' },
      });
      expect(allowed.headers['access-control-allow-origin']).toBe('https://app.surestock.example');

      const otherOrigin = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { origin: 'https://not-the-real-app.example' },
      });
      expect(otherOrigin.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
