import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@prisma/client';
import type { prisma } from '../lib/prisma.js';
import type { AccessTokenPayload } from './jwt.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
    signAccessToken: (payload: Omit<AccessTokenPayload, 'kind'>) => string;
    signRefreshToken: (userId: string) => string;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
