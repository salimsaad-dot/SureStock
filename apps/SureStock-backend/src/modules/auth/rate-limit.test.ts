import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { generateId } from '../../lib/id.js';

/**
 * Product-testing pass, 2026-08-26, gaps #1 and #2: neither POST
 * /auth/login nor POST /auth/register had any brute-force/abuse
 * protection. Both routes' real rate-limit ceilings (`max: 10` per
 * minute per IP) are only active outside `NODE_ENV=test` — the suite as
 * a whole calls both routes dozens of times per run across many fixture
 * files, so the normal test run uses a much higher ceiling that never
 * trips (see `auth/routes.ts`). That means this is the one place in the
 * suite that has to prove the *real* production ceiling actually blocks
 * requests, not just that the plugin is registered — which means
 * deliberately building the app with a non-test `NODE_ENV`.
 *
 * `vi.resetModules()` + a dynamic re-import is the standard way to force
 * `config/env.ts`'s module-level singleton to re-evaluate against a
 * different `process.env.NODE_ENV` — a plain import wouldn't work here,
 * since `setup-env.ts` (a Vitest `setupFiles` hook) already forces
 * `NODE_ENV=test` before this file's own top-level imports even run,
 * and `env.ts` reads `process.env` exactly once at import time. Built
 * once in `beforeAll` and shared by both routes below — each route's
 * `config.rateLimit` gets its own independent bucket keyed by
 * route+IP, so exercising login first doesn't consume register's quota.
 */
describe('rate limiting on the public auth routes (product-testing pass, gaps #1/#2)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development'; // force the real (non-test) rate-limit ceiling
    vi.resetModules();
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    await app.ready();
    process.env.NODE_ENV = originalNodeEnv; // restore immediately — nothing else in this process should see the flip
  });

  afterAll(async () => {
    await app?.close();
  });

  it('POST /auth/login blocks after the real per-minute ceiling and returns a 429 with retry info', async () => {
    // Wrong credentials on purpose — the rate-limit hook runs before the
    // route handler regardless of outcome, so 10 real 401s still count
    // against the same per-IP bucket the real login attempts would.
    const payload = { identifier: 'nobody@rate-limit-test.local', password: 'wrong-password' };

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => app.inject({ method: 'POST', url: '/auth/login', payload })),
    );
    for (const res of responses) {
      expect(res.statusCode).toBe(401); // all 10 are within the ceiling — genuinely rejected for bad credentials, not throttled
    }

    const eleventh = await app.inject({ method: 'POST', url: '/auth/login', payload });
    expect(eleventh.statusCode).toBe(429);
    const body = eleventh.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(typeof body.details.retryAfterSeconds).toBe('number');
    expect(body.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('POST /auth/register blocks after the real per-minute ceiling and returns a 429 with retry info', async () => {
    // Same email on every attempt on purpose — the first succeeds, the
    // rest genuinely conflict on a duplicate email/phone, but the
    // rate-limit hook counts every attempt regardless of outcome, same
    // reasoning as the login test above.
    const email = `rate-limit-register-${generateId().slice(-8)}@test.surestock.local`;
    const payload = { shopName: 'Rate Limit Test Shop', ownerName: 'Rate Limit Test Owner', email, password: 'rate-limit-test-password-1' };

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => app.inject({ method: 'POST', url: '/auth/register', payload })),
    );
    for (const res of responses) {
      expect([201, 409, 400]).toContain(res.statusCode); // within the ceiling — real outcomes, not throttled
    }

    const eleventh = await app.inject({ method: 'POST', url: '/auth/register', payload });
    expect(eleventh.statusCode).toBe(429);
    const body = eleventh.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(typeof body.details.retryAfterSeconds).toBe('number');
    expect(body.details.retryAfterSeconds).toBeGreaterThan(0);
  });
});
