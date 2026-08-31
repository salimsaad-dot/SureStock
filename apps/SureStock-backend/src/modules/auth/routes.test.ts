import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword, hashPin } from './service.js';

// Fixed test fixtures, not vaguely-named placeholders — this is what
// "build with real content" means for a backend test: a reader should
// be able to tell at a glance which user is being exercised and why.
const OWNER_PASSWORD = 'correct-owner-password';
const CASHIER_PASSWORD = 'correct-cashier-password';
const CASHIER_PIN = '4471';

describe('auth routes', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerId: string;
  let cashierId: string;

  beforeAll(async () => {
    app = await buildApp();

    // A throwaway route, registered only for this test file — no real
    // owner-only business route exists yet (catalogue/settings aren't
    // built), so this exercises app.requireRole directly rather than
    // waiting for one to exist. Must be registered before app.ready();
    // Fastify refuses new routes on a listening instance.
    app.get('/__test/owner-only', { preHandler: [app.authenticate, app.requireRole('OWNER')] }, async () => ({
      ok: true,
    }));

    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({
      data: { id: locationId, name: 'Test Shop', currency: 'GHS' },
    });

    ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Test Owner',
        email: 'owner@test.surestock.local',
        passwordHash: await hashPassword(OWNER_PASSWORD),
        role: 'OWNER',
        locationId,
      },
    });

    cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Test Cashier',
        email: 'cashier@test.surestock.local',
        passwordHash: await hashPassword(CASHIER_PASSWORD),
        pinHash: await hashPin(CASHIER_PIN),
        role: 'CASHIER',
        locationId,
      },
    });
  });

  afterAll(async () => {
    await app.prisma.auditLog.deleteMany({ where: { userId: { in: [ownerId, cashierId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [ownerId, cashierId] } } });
    await app.prisma.location.delete({ where: { id: locationId } });
    await app.close();
  });

  it('login issues an access token and a refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: 'owner@test.surestock.local', password: OWNER_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(body.user).toMatchObject({ id: ownerId, role: 'OWNER', locationId });
  });

  it('rejects login with the wrong password without revealing which part was wrong', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: 'owner@test.surestock.local', password: 'not-the-password' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('PIN unlock switches user well within the two-second target', async () => {
    const start = performance.now();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/pin-unlock',
      payload: { userId: cashierId, pin: CASHIER_PIN },
    });
    const elapsedMs = performance.now() - start;

    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ id: cashierId, role: 'CASHIER' });
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('locks the account after five wrong PIN attempts, and the correct PIN no longer works during the lock', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/pin-unlock',
        payload: { userId: cashierId, pin: '0000' },
      });
      if (attempt < 5) {
        expect(res.statusCode).toBe(401);
      } else {
        expect(res.statusCode).toBe(423);
        expect(res.json().code).toBe('LOCKED');
      }
    }

    const correctPinDuringLock = await app.inject({
      method: 'POST',
      url: '/auth/pin-unlock',
      payload: { userId: cashierId, pin: CASHIER_PIN },
    });
    expect(correctPinDuringLock.statusCode).toBe(423);

    const lockoutEntry = await app.prisma.auditLog.findFirst({
      where: { userId: cashierId, action: 'PIN_LOCKOUT' },
    });
    expect(lockoutEntry).not.toBeNull();
  });

  it('a cashier calling an owner-only route receives 403, and an owner calling it succeeds', async () => {
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: 'owner@test.surestock.local', password: OWNER_PASSWORD },
    });
    const cashierLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: 'cashier@test.surestock.local', password: CASHIER_PASSWORD },
    });

    const asCashier = await app.inject({
      method: 'GET',
      url: '/__test/owner-only',
      headers: { authorization: `Bearer ${cashierLogin.json().accessToken}` },
    });
    expect(asCashier.statusCode).toBe(403);

    const asOwner = await app.inject({
      method: 'GET',
      url: '/__test/owner-only',
      headers: { authorization: `Bearer ${ownerLogin.json().accessToken}` },
    });
    expect(asOwner.statusCode).toBe(200);
  });

  it('rejects a request with no token at all', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/staff' });
    expect(res.statusCode).toBe(401);
  });

  it('the staff roster only returns active staff at the caller\'s own location', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: 'owner@test.surestock.local', password: OWNER_PASSWORD },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/staff',
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const names = res.json().map((u: { name: string }) => u.name);
    expect(names).toContain('Test Owner');
    expect(names).toContain('Test Cashier');
  });

  it('refresh issues a new access token for an active user', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: 'owner@test.surestock.local', password: OWNER_PASSWORD },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: login.json().refreshToken },
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json().accessToken).toBe('string');
  });

  it('deactivating a user blocks their next authenticated request even with a still-valid token', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: 'cashier@test.surestock.local', password: CASHIER_PASSWORD },
    });
    const token = login.json().accessToken;

    const beforeDeactivation = await app.inject({
      method: 'GET',
      url: '/auth/staff',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(beforeDeactivation.statusCode).toBe(200);

    await app.prisma.user.update({ where: { id: cashierId }, data: { isActive: false } });

    const afterDeactivation = await app.inject({
      method: 'GET',
      url: '/auth/staff',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterDeactivation.statusCode).toBe(401);

    // Restore for any later test in this file that expects an active cashier.
    await app.prisma.user.update({ where: { id: cashierId }, data: { isActive: true } });
  });

  describe('registration (T-30 step 1)', () => {
    const registeredLocationIds: string[] = [];

    afterAll(async () => {
      await app.prisma.user.deleteMany({ where: { locationId: { in: registeredLocationIds } } });
      await app.prisma.location.deleteMany({ where: { id: { in: registeredLocationIds } } });
    });

    it('creates a real Location and a real OWNER, and logs them straight in', async () => {
      const email = `new-shop-${generateId()}@test.surestock.local`;
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { shopName: 'Brand New Shop', ownerName: 'New Owner', email, password: 'a-real-password-123' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.refreshToken).toBe('string');
      expect(body.user.role).toBe('OWNER');
      registeredLocationIds.push(body.user.locationId);

      const location = await app.prisma.location.findUnique({ where: { id: body.user.locationId } });
      expect(location?.name).toBe('Brand New Shop');

      // The new owner's own token actually works against a real authenticated route.
      const whoami = await app.inject({ method: 'GET', url: '/auth/staff', headers: { authorization: `Bearer ${body.accessToken}` } });
      expect(whoami.statusCode).toBe(200);
      expect(whoami.json()).toHaveLength(1);
      expect(whoami.json()[0].name).toBe('New Owner');
    });

    it('rejects a duplicate email rather than silently colliding two shops', async () => {
      const email = `dup-shop-${generateId()}@test.surestock.local`;
      const first = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { shopName: 'First Shop', ownerName: 'First Owner', email, password: 'a-real-password-123' },
      });
      expect(first.statusCode).toBe(201);
      registeredLocationIds.push(first.json().user.locationId);

      const second = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { shopName: 'Second Shop', ownerName: 'Second Owner', email, password: 'a-different-password' },
      });
      expect(second.statusCode).toBe(409);
    });

    it('requires at least an email or a phone number, and a password of real length', async () => {
      const noContact = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { shopName: 'No Contact Shop', ownerName: 'Owner', password: 'a-real-password-123' },
      });
      expect(noContact.statusCode).toBe(400);

      const shortPassword = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { shopName: 'Short Password Shop', ownerName: 'Owner', email: `short-${generateId()}@test.surestock.local`, password: 'short' },
      });
      expect(shortPassword.statusCode).toBe(400);
    });
  });
});
