import type { UserRole } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  locationId: string;
  kind: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  kind: 'refresh';
  /** Also the `RefreshToken.id` row this token maps to — how `/auth/refresh` and `/auth/logout` find it to check/revoke. */
  jti: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload | RefreshTokenPayload;
    user: AccessTokenPayload | RefreshTokenPayload;
  }
}
