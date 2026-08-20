import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 removed `datasource.url` from schema.prisma — Migrate now
// reads the connection from here instead. This governs `prisma migrate`
// and `prisma studio` only; the running application connects separately
// through the driver adapter in src/lib/prisma.ts (see that file's
// comment for why the two aren't the same code path).
//
// Deliberately MIGRATE_DATABASE_URL, not DATABASE_URL: Migrate needs
// CREATE DATABASE to build its shadow database, which the app's scoped
// runtime user doesn't have and shouldn't — see .env.example.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('MIGRATE_DATABASE_URL'),
  },
});
