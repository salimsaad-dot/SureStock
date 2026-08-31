import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from './service.js';

const OWNER_PASSWORD = 'owner-password-logout-test';

/**
 * Product-testing pass, 2026-08-26, gap #5: proves `POST /auth/logout`
 * is a real server-side action — before this, a refresh token was a
 * purely stateless JWT with no way to kill it early, so "logging out"
 * only ever cleared client-side storage while the token quietly stayed
 * valid for up to 30 days.
 */
describe('logout and refresh-token revocation (product-testing pass, gap #5)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let email: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Logout Test Shop', currency: 'GHS' } });

    email = `logout-owner-${generateId().slice(-8)}@test.surestock.local`;
    await app.prisma.user.create({
      data: {
        id: generateId(),
        name: 'Logout Owner',
        email,
        passwordHash: await hashPassword(OWNER_PASSWORD),
        role: 'OWNER',
        locationId,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function login() {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password: OWNER_PASSWORD } });
    expect(res.statusCode).toBe(200);
    return res.json().refreshToken as string;
  }

  it('a fresh login can refresh normally', async () => {
    const refreshToken = await login();
    const res = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
  });

  it('logging out revokes the token — it can no longer refresh afterward, even though it has not naturally expired', async () => {
    const refreshToken = await login();

    const logout = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken } });
    expect(logout.statusCode).toBe(204);

    const refreshAfterLogout = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(refreshAfterLogout.statusCode).toBe(401);
  });

  it('logging out twice with the same token is idempotent — no error either time', async () => {
    const refreshToken = await login();

    const first = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken } });
    expect(first.statusCode).toBe(204);

    const second = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken } });
    expect(second.statusCode).toBe(204);
  });

  it('logging out with a garbage/unparseable token is a no-op, not an error — logout never leaks whether a token was real', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: 'not-a-real-token' } });
    expect(res.statusCode).toBe(204);
  });

  it('revocation is per-token, not per-user — logging out one session leaves another session\'s own token still valid', async () => {
    const sessionA = await login();
    const sessionB = await login();

    await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: sessionA } });

    const refreshA = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: sessionA } });
    expect(refreshA.statusCode).toBe(401);

    const refreshB = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: sessionB } });
    expect(refreshB.statusCode).toBe(200); // a second, independent session is unaffected by the first one logging out
  });

  it('an access token cannot be used to log out (wrong token kind) — treated the same as an unparseable one, still 204', async () => {
    const login2 = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password: OWNER_PASSWORD } });
    const accessToken = login2.json().accessToken as string;

    const res = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: accessToken } });
    expect(res.statusCode).toBe(204);

    // The real refresh token from that same login is unaffected — logout only ever acted on the (wrong-kind) token it was actually given.
    const refreshToken = login2.json().refreshToken as string;
    const refreshRes = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(refreshRes.statusCode).toBe(200);
  });
});
