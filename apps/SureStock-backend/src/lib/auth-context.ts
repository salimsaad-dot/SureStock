import type { FastifyRequest } from 'fastify';
import { unauthorized } from './http-error.js';
import type { AccessTokenPayload } from '../types/jwt.js';

/**
 * `request.user` is typed as AccessTokenPayload | RefreshTokenPayload
 * because the same JWT plugin verifies both kinds of token — but every
 * route behind `app.authenticate` has already had its `kind` checked at
 * runtime by that preHandler. This just gives the type checker the same
 * fact it can't see across a preHandler boundary, in one place instead
 * of a repeated `if (request.user.kind !== 'access') throw ...` at every
 * route that needs role or locationId.
 */
export function accessUser(request: FastifyRequest): AccessTokenPayload {
  if (request.user.kind !== 'access') {
    throw unauthorized();
  }
  return request.user;
}
