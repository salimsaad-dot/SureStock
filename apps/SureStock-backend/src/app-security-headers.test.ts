import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

/**
 * Product-testing pass, 2026-08-26, gap #4: no security-headers plugin
 * existed at all. Adds `@fastify/helmet` (wraps the `helmet` npm
 * package) with one deliberate override — see `app.ts`'s own comment on
 * `crossOriginResourcePolicy`.
 */
describe('security headers (product-testing pass, gap #4)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets the standard defensive headers on every response', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeTruthy();
    expect(res.headers['x-dns-prefetch-control']).toBeTruthy();
    expect(res.headers['strict-transport-security']).toBeTruthy();
    expect(res.headers['content-security-policy']).toBeTruthy();
  });

  it('overrides the cross-origin-resource-policy default to cross-origin, matching the CORS fix — this API is meant to be consumed cross-origin by the frontend', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
