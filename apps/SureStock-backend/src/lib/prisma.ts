import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { env } from '../config/env.js';
import { parseDatabaseUrl } from './db-url.js';

// Prisma 7 has no bundled query engine — PrismaClient talks to the
// database only through an explicit driver adapter (see prisma.config.ts
// for why Migrate's connection is configured separately from this one).
const adapter = new PrismaMariaDb(parseDatabaseUrl(env.DATABASE_URL));

// Every model uses a plain `String @id` with no `@default(...)` — ids
// are always minted by generateId() (see id.ts) at the call site, never
// by the database, so the same path works for a server-side create and
// a client that has to mint one offline before it's ever reached the
// server (a sale's id doubles as its idempotency key). Call sites pass
// `id: generateId()` explicitly rather than through a client-wide
// extension — an earlier version tried the extension, for the usual
// "avoid repeating this everywhere" reason, but every service ended up
// passing the id explicitly anyway, which made the extension dead code
// nobody was actually relying on.
export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
