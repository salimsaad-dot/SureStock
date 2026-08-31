import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { generateId } from './lib/id.js';
import { hashPassword } from './modules/auth/service.js';

describe('bodyless POST requests (real bug found 2026-08-25 building T-32)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Empty Body Test Shop', currency: 'GHS' } });
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: {
        id: generateId(),
        name: 'Empty Body Owner',
        email: `${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('empty-body-test-password'),
        role: 'OWNER',
        locationId,
      },
    });
    token = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'empty-body-test-password' } })
    ).json().accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * `apiRequest()` (the frontend's real client, client.ts) always sets
   * `Content-Type: application/json` on a POST, even one with no body
   * at all — the frontend has no other way to signal "this is a JSON
   * API call" for a route that happens not to need a body. Sending that
   * exact header combination used to make Fastify's default JSON parser
   * throw `FST_ERR_CTP_EMPTY_JSON_BODY`, which this app's error handler
   * didn't recognize and turned into a false 500 — invisible to every
   * curl-based verification in this project's history, since curl never
   * sends that header without a body unless told to.
   */
  it('an empty body with Content-Type: application/json parses as no body, not a 500', async () => {
    const category = await app.prisma.category.create({ data: { id: generateId(), locationId, name: `Empty Body Test Category ${generateId()}` } });

    const res = await app.inject({
      method: 'POST',
      url: `/categories/${category.id}/archive`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: '',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().archivedAt).not.toBeNull();
  });

  it('a genuinely malformed JSON body still fails as a real 400, not silently accepted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{not valid json',
    });
    expect(res.statusCode).toBe(400);
  });
});
