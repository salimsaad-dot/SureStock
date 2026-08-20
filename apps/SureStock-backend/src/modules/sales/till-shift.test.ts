import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

const CASHIER_PASSWORD = 'cashier-password-tillshift-test';

describe('till shifts (T-20)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let cashierToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Till Shift Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Till Shift Cashier',
        email: `tillshift-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword(CASHIER_PASSWORD),
        role: 'CASHIER',
        locationId,
      },
    });
    cashierToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `tillshift-cashier-${runSuffix}@test.surestock.local`, password: CASHIER_PASSWORD },
      })
    ).json().accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('opens a shift, reports it as current, and rejects opening a second one', async () => {
    const noneYet = await app.inject({
      method: 'GET',
      url: '/till-shifts/current',
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(noneYet.json()).toBeNull();

    const open = await app.inject({
      method: 'POST',
      url: '/till-shifts',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { openingFloat: 5000 },
    });
    expect(open.statusCode).toBe(201);
    expect(open.json()).toMatchObject({ openingFloat: 5000, closedAt: null });

    const current = await app.inject({
      method: 'GET',
      url: '/till-shifts/current',
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(current.json().id).toBe(open.json().id);

    const secondOpen = await app.inject({
      method: 'POST',
      url: '/till-shifts',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { openingFloat: 1000 },
    });
    expect(secondOpen.statusCode).toBe(409);
  });

  it('closing a shift with no sales computes expected cash as just the opening float, variance zero when counted matches', async () => {
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: {
        id: generateId(),
        name: 'Solo Shift Cashier',
        email: `solo-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('solo-password'),
        role: 'CASHIER',
        locationId,
      },
    });
    const soloToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `solo-cashier-${runSuffix}@test.surestock.local`, password: 'solo-password' },
      })
    ).json().accessToken;

    const open = await app.inject({
      method: 'POST',
      url: '/till-shifts',
      headers: { authorization: `Bearer ${soloToken}` },
      payload: { openingFloat: 10000 },
    });
    const shiftId = open.json().id;

    const close = await app.inject({
      method: 'POST',
      url: `/till-shifts/${shiftId}/close`,
      headers: { authorization: `Bearer ${soloToken}` },
      payload: { countedCash: 10000 },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json()).toMatchObject({ expectedCash: 10000, countedCash: 10000, variance: 0 });

    const doubleClose = await app.inject({
      method: 'POST',
      url: `/till-shifts/${shiftId}/close`,
      headers: { authorization: `Bearer ${soloToken}` },
      payload: { countedCash: 10000 },
    });
    expect(doubleClose.statusCode).toBe(409);
  });

  it('a variance beyond the alert threshold writes an audit log entry', async () => {
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: {
        id: generateId(),
        name: 'Variance Cashier',
        email: `variance-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('variance-password'),
        role: 'CASHIER',
        locationId,
      },
    });
    const token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `variance-cashier-${runSuffix}@test.surestock.local`, password: 'variance-password' },
      })
    ).json().accessToken;

    const open = await app.inject({
      method: 'POST',
      url: '/till-shifts',
      headers: { authorization: `Bearer ${token}` },
      payload: { openingFloat: 5000 },
    });
    const shiftId = open.json().id;

    // Expected is 5000 (no sales); counted way off — well past the
    // GH₵20.00 (2000 pesewas) threshold.
    const close = await app.inject({
      method: 'POST',
      url: `/till-shifts/${shiftId}/close`,
      headers: { authorization: `Bearer ${token}` },
      payload: { countedCash: 2000 },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().variance).toBe(-3000);

    const audit = await app.prisma.auditLog.findFirst({
      where: { entityType: 'till_shift', entityId: shiftId, action: 'TILL_VARIANCE_ALERT' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.after).toMatchObject({ variance: -3000 });
  });

  it('a cashier cannot close another cashier’s shift', async () => {
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: {
        id: generateId(),
        name: 'Shift Owner Peek',
        email: `shift-owner-peek-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('owner-password'),
        role: 'OWNER',
        locationId,
      },
    });
    const ownerToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `shift-owner-peek-${runSuffix}@test.surestock.local`, password: 'owner-password' },
      })
    ).json().accessToken;

    const open = await app.inject({
      method: 'POST',
      url: '/till-shifts',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { openingFloat: 1000 },
    });
    const shiftId = open.json().id;

    const stolenClose = await app.inject({
      method: 'POST',
      url: `/till-shifts/${shiftId}/close`,
      headers: { authorization: `Bearer ${cashierToken}` }, // a different user's token
      payload: { countedCash: 1000 },
    });
    expect(stolenClose.statusCode).toBe(404);
  });

  describe('list till shifts (App Flow §5 — Sales screen "Till shifts" tab)', () => {
    async function makeOwner() {
      const runSuffix = generateId();
      const ownerId = generateId();
      await app.prisma.user.create({
        data: {
          id: ownerId,
          name: 'List Till Shifts Owner',
          email: `list-tillshift-owner-${runSuffix}@test.surestock.local`,
          passwordHash: await hashPassword('owner-list-password'),
          role: 'OWNER',
          locationId,
        },
      });
      const token = (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { identifier: `list-tillshift-owner-${runSuffix}@test.surestock.local`, password: 'owner-list-password' },
        })
      ).json().accessToken;
      return { ownerId, token };
    }

    it('a cashier only ever sees their own shifts', async () => {
      const runSuffix = generateId();
      const cashierId = generateId();
      await app.prisma.user.create({
        data: {
          id: cashierId,
          name: 'List Scope Cashier',
          email: `list-scope-cashier-${runSuffix}@test.surestock.local`,
          passwordHash: await hashPassword('list-scope-password'),
          role: 'CASHIER',
          locationId,
        },
      });
      const token = (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { identifier: `list-scope-cashier-${runSuffix}@test.surestock.local`, password: 'list-scope-password' },
        })
      ).json().accessToken;
      await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${token}` }, payload: { openingFloat: 500 } });

      const { token: otherOwnerToken } = await makeOwner();
      const asOwnerFiltered = await app.inject({
        method: 'GET',
        url: `/till-shifts?userId=${cashierId}`,
        headers: { authorization: `Bearer ${otherOwnerToken}` },
      });
      expect(asOwnerFiltered.json().items.length).toBeGreaterThanOrEqual(1);

      const asCashier = await app.inject({
        method: 'GET',
        url: `/till-shifts`, // no filter — should still only ever show their own
        headers: { authorization: `Bearer ${token}` },
      });
      expect(asCashier.json().items.every((s: { userId: string }) => s.userId === cashierId)).toBe(true);
    });

    it('filters by status and reports OPEN vs CLOSED correctly, with pagination totals', async () => {
      const { ownerId, token } = await makeOwner();

      const open1 = await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${token}` }, payload: { openingFloat: 1000 } });
      await app.inject({
        method: 'POST',
        url: `/till-shifts/${open1.json().id}/close`,
        headers: { authorization: `Bearer ${token}` },
        payload: { countedCash: 1000 },
      });
      await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${token}` }, payload: { openingFloat: 2000 } });

      const openOnly = await app.inject({
        method: 'GET',
        url: `/till-shifts?userId=${ownerId}&status=OPEN`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(openOnly.json().items).toHaveLength(1);
      expect(openOnly.json().items[0]).toMatchObject({ status: 'OPEN', closedAt: null });

      const closedOnly = await app.inject({
        method: 'GET',
        url: `/till-shifts?userId=${ownerId}&status=CLOSED`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(closedOnly.json().items).toHaveLength(1);
      expect(closedOnly.json().items[0].status).toBe('CLOSED');

      const all = await app.inject({
        method: 'GET',
        url: `/till-shifts?userId=${ownerId}&pageSize=1`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(all.json()).toMatchObject({ page: 1, pageSize: 1, totalCount: 2, totalPages: 2 });
      expect(all.json().items[0].userName).toBe('List Till Shifts Owner');
    });
  });
});
