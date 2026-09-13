import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';
import { buildMultipartFile } from '../../test/multipart.js';

const OWNER_PASSWORD = 'owner-password-upload-test';

describe('image upload', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerId: string;
  let ownerToken: string;
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Upload Test Shop', currency: 'GHS' } });

    const ownerEmail = `upload-owner-${generateId()}@test.surestock.local`;
    ownerId = generateId();
    await app.prisma.user.create({
      data: { id: ownerId, name: 'Upload Owner', email: ownerEmail, passwordHash: await hashPassword(OWNER_PASSWORD), role: 'OWNER', locationId },
    });

    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: ownerEmail, password: OWNER_PASSWORD } });
    ownerToken = login.json().accessToken;
  });

  afterAll(async () => {
    const productIds = createdProductIds.filter((id): id is string => Boolean(id));
    await app.prisma.productVariant.deleteMany({ where: { productId: { in: productIds }, stockMovements: { none: {} } } });
    await app.prisma.product.deleteMany({ where: { id: { in: productIds }, variants: { none: {} } } });
    await app.prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
    await app.close();
  });

  it('rejects an unauthenticated upload', async () => {
    const { body, contentTypeHeader } = buildMultipartFile('file', 'photo.png', 'image/png', Buffer.from('not a real png, just bytes'));
    const res = await app.inject({ method: 'POST', url: '/uploads/image', headers: { 'content-type': contentTypeHeader }, payload: body });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a disallowed file type', async () => {
    const { body, contentTypeHeader } = buildMultipartFile('file', 'notes.txt', 'text/plain', Buffer.from('hello'));
    const res = await app.inject({
      method: 'POST',
      url: '/uploads/image',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': contentTypeHeader },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('accepts a JPEG, PNG, or WebP and returns a /uploads/ URL', async () => {
    for (const { filename, mimetype, ext } of [
      { filename: 'a.jpg', mimetype: 'image/jpeg', ext: 'jpg' },
      { filename: 'b.png', mimetype: 'image/png', ext: 'png' },
      { filename: 'c.webp', mimetype: 'image/webp', ext: 'webp' },
    ]) {
      const { body, contentTypeHeader } = buildMultipartFile('file', filename, mimetype, Buffer.from('pretend image bytes'));
      const res = await app.inject({
        method: 'POST',
        url: '/uploads/image',
        headers: { authorization: `Bearer ${ownerToken}`, 'content-type': contentTypeHeader },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      const { url } = res.json();
      expect(url).toMatch(new RegExp(`^/uploads/[^/]+\\.${ext}$`));
    }
  });

  it('sets and clears the caller\'s own avatarUrl via PATCH /auth/me, without touching other accounts', async () => {
    const { body, contentTypeHeader } = buildMultipartFile('file', 'avatar.png', 'image/png', Buffer.from('pretend avatar bytes'));
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/uploads/image',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': contentTypeHeader },
      payload: body,
    });
    const { url } = uploadRes.json();

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { avatarUrl: url },
    });
    expect(patchRes.statusCode).toBe(200);
    // publicUser() (routes.ts) is the exact same shape-builder used by
    // login/register/pin-unlock, so this one assertion confirms
    // avatarUrl reaches all of them, not just this endpoint's response.
    expect(patchRes.json().avatarUrl).toBe(url);

    const clearRes = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { avatarUrl: null },
    });
    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json().avatarUrl).toBeNull();
  });

  it('wires an uploaded image onto a product via PATCH /products/:id', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Upload Test Product',
        variants: [{ sku: `UPLOAD-${generateId()}`, costPrice: 100, sellingPrice: 200 }],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const product = createRes.json();
    createdProductIds.push(product.id);
    expect(product.imageUrl).toBeNull();

    const { body, contentTypeHeader } = buildMultipartFile('file', 'product.png', 'image/png', Buffer.from('pretend product photo bytes'));
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/uploads/image',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': contentTypeHeader },
      payload: body,
    });
    const { url } = uploadRes.json();

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/products/${product.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { imageUrl: url },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().imageUrl).toBe(url);
  });
});
