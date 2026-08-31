import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

const OWNER_PASSWORD = 'owner-password-user-admin-test';
const MANAGER_PASSWORD = 'manager-password-user-admin-test';

describe('user administration (T-29 Users & Roles)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerId: string;
  let ownerToken: string;
  let managerToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'User Admin Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    ownerId = generateId();
    const ownerEmail = `useradmin-owner-${runSuffix.slice(-8)}@test.surestock.local`;
    await app.prisma.user.create({
      data: { id: ownerId, name: 'User Admin Owner', email: ownerEmail, passwordHash: await hashPassword(OWNER_PASSWORD), role: 'OWNER', locationId },
    });
    ownerToken = (await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: ownerEmail, password: OWNER_PASSWORD } })).json().accessToken;

    const managerId = generateId();
    const managerEmail = `useradmin-manager-${runSuffix.slice(-8)}@test.surestock.local`;
    await app.prisma.user.create({
      data: { id: managerId, name: 'User Admin Manager', email: managerEmail, passwordHash: await hashPassword(MANAGER_PASSWORD), role: 'MANAGER', locationId },
    });
    managerToken = (await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: managerEmail, password: MANAGER_PASSWORD } })).json().accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a manager cannot list, create, or manage staff — owner-only', async () => {
    const list = await app.inject({ method: 'GET', url: '/settings/users', headers: { authorization: `Bearer ${managerToken}` } });
    expect(list.statusCode).toBe(403);
    const create = await app.inject({
      method: 'POST',
      url: '/settings/users',
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { name: 'X', email: 'x@test.local', password: 'password123', role: 'CASHIER' },
    });
    expect(create.statusCode).toBe(403);
  });

  it('the owner creates a new staff member, who can immediately log in with the given password', async () => {
    const runSuffix = generateId();
    const email = `useradmin-new-cashier-${runSuffix.slice(-8)}@test.surestock.local`;
    const create = await app.inject({
      method: 'POST',
      url: '/settings/users',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'New Cashier', email, password: 'a-real-password-1', pin: '4321', role: 'CASHIER' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({ name: 'New Cashier', email, role: 'CASHIER', isActive: true });
    expect(create.json()).not.toHaveProperty('passwordHash');

    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password: 'a-real-password-1' } });
    expect(login.statusCode).toBe(200);
  });

  it('creating a staff member with a duplicate email is rejected', async () => {
    const runSuffix = generateId();
    const email = `useradmin-dup-${runSuffix.slice(-8)}@test.surestock.local`;
    await app.inject({
      method: 'POST',
      url: '/settings/users',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'First', email, password: 'password12345', role: 'CASHIER' },
    });
    const dup = await app.inject({
      method: 'POST',
      url: '/settings/users',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Second', email, password: 'password12345', role: 'CASHIER' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('the owner lists all staff at their location, including newly created ones', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings/users', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThanOrEqual(2);
  });

  it('the owner promotes a cashier to manager, deactivates a staff member, and a deactivated staff member cannot log in', async () => {
    const runSuffix = generateId();
    const email = `useradmin-promote-${runSuffix.slice(-8)}@test.surestock.local`;
    const create = await app.inject({
      method: 'POST',
      url: '/settings/users',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'To Promote', email, password: 'password12345', role: 'CASHIER' },
    });
    const id = create.json().id;

    const promote = await app.inject({
      method: 'PATCH',
      url: `/settings/users/${id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { role: 'MANAGER' },
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json().role).toBe('MANAGER');

    const deactivate = await app.inject({
      method: 'PATCH',
      url: `/settings/users/${id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { isActive: false },
    });
    expect(deactivate.statusCode).toBe(200);
    expect(deactivate.json().isActive).toBe(false);

    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password: 'password12345' } });
    expect(login.statusCode).toBe(401);
  });

  it('the owner cannot deactivate their own account or change their own role away from Owner', async () => {
    const deactivateSelf = await app.inject({
      method: 'PATCH',
      url: `/settings/users/${ownerId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { isActive: false },
    });
    expect(deactivateSelf.statusCode).toBe(409);

    const demoteSelf = await app.inject({
      method: 'PATCH',
      url: `/settings/users/${ownerId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { role: 'MANAGER' },
    });
    expect(demoteSelf.statusCode).toBe(409);
  });

  it('the owner resets a staff member\'s password and PIN directly — no email/SMS system needed', async () => {
    const runSuffix = generateId();
    const email = `useradmin-reset-${runSuffix.slice(-8)}@test.surestock.local`;
    const create = await app.inject({
      method: 'POST',
      url: '/settings/users',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'To Reset', email, password: 'old-password-123', pin: '1111', role: 'CASHIER' },
    });
    const id = create.json().id;

    const reset = await app.inject({
      method: 'POST',
      url: `/settings/users/${id}/reset-credentials`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { password: 'new-password-456', pin: '2222' },
    });
    expect(reset.statusCode).toBe(200);

    const oldLogin = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password: 'old-password-123' } });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password: 'new-password-456' } });
    expect(newLogin.statusCode).toBe(200);

    const newPin = await app.inject({ method: 'POST', url: '/auth/pin-unlock', payload: { userId: id, pin: '2222' } });
    expect(newPin.statusCode).toBe(200);
  });
});
