import type { FastifyInstance } from 'fastify';
import type { User } from '@prisma/client';
import { loginBodySchema, pinUnlockBodySchema, refreshBodySchema } from './schemas.js';
import { verifyPassword, verifyPin, listActiveStaffForLocation } from './service.js';
import { parseBody } from '../../lib/validate.js';
import { unauthorized } from '../../lib/http-error.js';
import { accessUser } from '../../lib/auth-context.js';
import type { AccessTokenPayload, RefreshTokenPayload } from '../../types/jwt.js';

function publicUser(user: User) {
  return { id: user.id, name: user.name, role: user.role, locationId: user.locationId };
}

export default async function authRoutes(app: FastifyInstance) {
  // Full login: phone/email + password. The only entry point that
  // doesn't assume a device already has a session — everything else
  // (pin-unlock, staff roster) builds on top of the token this issues.
  app.post('/auth/login', async (request) => {
    const { identifier, password } = parseBody(loginBodySchema, request.body);
    const user = await verifyPassword(app.prisma, identifier, password);

    const accessToken = app.signAccessToken({ sub: user.id, role: user.role, locationId: user.locationId });
    const refreshToken = app.signRefreshToken(user.id);

    return { accessToken, refreshToken, user: publicUser(user) };
  });

  // Quick-switch on a device that's already been through a full login
  // once (Doc 2 §2: "the device is trusted; the person is verified by
  // PIN"). Takes a userId rather than trying to identify the user from
  // the PIN alone — PINs are hashed, so there's no way to look up "whose
  // PIN is this" without an identifier, only "does this PIN match this
  // specific user".
  app.post('/auth/pin-unlock', async (request) => {
    const { userId, pin } = parseBody(pinUnlockBodySchema, request.body);
    const user = await verifyPin(app.prisma, userId, pin);

    const accessToken = app.signAccessToken({ sub: user.id, role: user.role, locationId: user.locationId });
    const refreshToken = app.signRefreshToken(user.id);

    return { accessToken, refreshToken, user: publicUser(user) };
  });

  app.post('/auth/refresh', async (request) => {
    const { refreshToken } = parseBody(refreshBodySchema, request.body);

    let decoded: AccessTokenPayload | RefreshTokenPayload;
    try {
      decoded = app.jwt.verify<AccessTokenPayload | RefreshTokenPayload>(refreshToken);
    } catch {
      throw unauthorized('Refresh token is invalid or has expired — please log in again.');
    }
    if (decoded.kind !== 'refresh') {
      throw unauthorized('That is not a refresh token.');
    }

    const user = await app.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user?.isActive) {
      throw unauthorized('This account is no longer active.');
    }

    const accessToken = app.signAccessToken({ sub: user.id, role: user.role, locationId: user.locationId });
    const newRefreshToken = app.signRefreshToken(user.id);

    return { accessToken, refreshToken: newRefreshToken };
  });

  // Feeds the "who's using this device" picker that has to come before
  // a PIN pad (see the pin-unlock comment above). Scoped to the caller's
  // own location, taken from their token rather than a query parameter —
  // a cashier at one shop has no legitimate reason to enumerate staff at
  // another.
  app.get('/auth/staff', { preHandler: [app.authenticate] }, async (request) => {
    return listActiveStaffForLocation(app.prisma, accessUser(request).locationId);
  });
}
