import fp from 'fastify-plugin';
import jwtPlugin from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env.js';
import { unauthorized, forbidden } from '../lib/http-error.js';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types/jwt.js';

/**
 * Registers @fastify/jwt and layers three things every protected route
 * needs on top of it:
 *
 *  - signAccessToken / signRefreshToken: the only place token TTLs are
 *    decided, so a call site can't accidentally issue a long-lived
 *    "access" token or a short-lived "refresh" token.
 *  - authenticate: a preHandler that verifies the token AND re-checks
 *    the user is still active in the database. That DB check is what
 *    makes deactivating a user (Doc 6, T-29) take effect on the user's
 *    very next request rather than waiting up to JWT_ACCESS_TTL for a
 *    stale token to expire on its own.
 *  - requireRole: layered after authenticate, rejects with 403 if the
 *    caller's role isn't in the allowed set (Doc 1 §2: permissions are
 *    enforced on the server, never only hidden in the UI).
 */
export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(jwtPlugin, { secret: env.JWT_SECRET });

  app.decorate(
    'signAccessToken',
    (payload: Omit<AccessTokenPayload, 'kind'>) =>
      app.jwt.sign({ ...payload, kind: 'access' }, { expiresIn: env.JWT_ACCESS_TTL }),
  );

  app.decorate('signRefreshToken', (userId: string) =>
    app.jwt.sign({ sub: userId, kind: 'refresh' } satisfies RefreshTokenPayload, {
      expiresIn: env.JWT_REFRESH_TTL,
    }),
  );

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized('Your session has expired or is invalid — please log in again.');
    }

    if (request.user.kind !== 'access') {
      throw unauthorized('This token cannot be used to authenticate requests.');
    }

    const user = await app.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { isActive: true },
    });
    if (!user?.isActive) {
      throw unauthorized('This account is no longer active.');
    }
  });

  app.decorate('requireRole', (...roles: UserRole[]) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      if (request.user.kind !== 'access' || !roles.includes(request.user.role)) {
        throw forbidden();
      }
    };
  });
});
