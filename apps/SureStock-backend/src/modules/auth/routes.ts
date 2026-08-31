import type { FastifyInstance } from 'fastify';
import type { User } from '@prisma/client';
import { loginBodySchema, pinUnlockBodySchema, refreshBodySchema, registerBodySchema } from './schemas.js';
import { verifyPassword, verifyPin, listActiveStaffForLocation, registerShop } from './service.js';
import { parseBody } from '../../lib/validate.js';
import { unauthorized } from '../../lib/http-error.js';
import { accessUser } from '../../lib/auth-context.js';
import { env } from '../../config/env.js';
import type { AccessTokenPayload, RefreshTokenPayload } from '../../types/jwt.js';

function publicUser(user: User) {
  return { id: user.id, name: user.name, role: user.role, locationId: user.locationId };
}

export default async function authRoutes(app: FastifyInstance) {
  // Doc 3 §2, T-30 step 1: a brand-new shop signing itself up — the
  // other entry point that doesn't assume a session exists yet. Logs
  // the new owner straight in (same token shape as /auth/login) so
  // "reaches their first sale without help" doesn't require a second,
  // separate login right after registering.
  //
  // Product-testing pass, 2026-08-26, gap #2: rate-limited for the same
  // reason as /auth/login (see its own comment below) — a public,
  // unauthenticated, row-creating endpoint (a whole Location + first
  // OWNER per call) is a real abuse/resource-exhaustion surface without
  // one. A real shop registers once; the 5 Playwright E2E specs each
  // register exactly one throwaway shop per run, comfortably under this
  // ceiling even run back-to-back.
  app.post(
    '/auth/register',
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === 'test' ? 10_000 : 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const body = parseBody(registerBodySchema, request.body);
      const user = await registerShop(app.prisma, body);

      const accessToken = app.signAccessToken({ sub: user.id, role: user.role, locationId: user.locationId });
      const refreshToken = await app.signRefreshToken(user.id);

      return reply.code(201).send({ accessToken, refreshToken, user: publicUser(user) });
    },
  );

  // Full login: phone/email + password. The only entry point that
  // doesn't assume a device already has a session — everything else
  // (pin-unlock, staff roster) builds on top of the token this issues.
  //
  // Product-testing pass, 2026-08-26, gap #1: this had zero brute-force
  // protection — PIN-unlock has its own DB-tracked, per-account lockout
  // (5 attempts/5 minutes), but password login is a separate attack
  // surface on the same accounts an attacker can hit directly instead.
  // Keyed by IP (this plugin's default), not by identifier — there's no
  // per-account failed-password counter the way PIN has one; adding
  // that is a bigger, separate change from just closing the open door.
  // A much higher ceiling in test so this suite's many legitimate
  // back-to-back logins (several fixture files log in 5-7+ times each
  // building their own shop/staff) never trip it.
  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: env.NODE_ENV === 'test' ? 10_000 : 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      const { identifier, password } = parseBody(loginBodySchema, request.body);
      const user = await verifyPassword(app.prisma, identifier, password);

      const accessToken = app.signAccessToken({ sub: user.id, role: user.role, locationId: user.locationId });
      const refreshToken = await app.signRefreshToken(user.id);

      return { accessToken, refreshToken, user: publicUser(user) };
    },
  );

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
    const refreshToken = await app.signRefreshToken(user.id);

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

    // Product-testing pass, 2026-08-26, gap #5: the JWT's own signature
    // and `exp` claim being valid is no longer sufficient on its own —
    // a logged-out token is still cryptographically well-formed and
    // unexpired, so this is the check that actually makes logout real.
    const stored = await app.prisma.refreshToken.findUnique({ where: { id: decoded.jti } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw unauthorized('Refresh token is invalid or has expired — please log in again.');
    }

    const user = await app.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user?.isActive) {
      throw unauthorized('This account is no longer active.');
    }

    const accessToken = app.signAccessToken({ sub: user.id, role: user.role, locationId: user.locationId });
    const newRefreshToken = await app.signRefreshToken(user.id);

    return { accessToken, refreshToken: newRefreshToken };
  });

  // Product-testing pass, 2026-08-26, gap #5: the one entry point that
  // makes "Sign out" a real server-side action instead of only ever
  // clearing client-side storage. Takes the refresh token in the body
  // (same shape as /auth/refresh, no access-token auth required) since
  // the whole point is working even when the caller's access token has
  // already expired. Always 204, even for an already-invalid/expired/
  // unparseable token — the caller's actual goal ("this token no longer
  // works") is already true either way, and logout isn't a place to
  // leak whether a token was real.
  app.post('/auth/logout', async (request, reply) => {
    const { refreshToken } = parseBody(refreshBodySchema, request.body);

    try {
      const decoded = app.jwt.verify<AccessTokenPayload | RefreshTokenPayload>(refreshToken);
      if (decoded.kind === 'refresh') {
        await app.prisma.refreshToken.updateMany({
          where: { id: decoded.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // Already unparseable/expired — nothing to revoke, and that's fine.
    }

    return reply.code(204).send();
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
