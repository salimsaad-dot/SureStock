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
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload | RefreshTokenPayload;
    user: AccessTokenPayload | RefreshTokenPayload;
  }
}
