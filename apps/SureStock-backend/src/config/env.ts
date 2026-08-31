import 'dotenv/config';
import { z } from 'zod';

// Fails fast, once, at boot — every module downstream imports `env` and
// trusts it's already valid instead of re-checking process.env itself.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  // Product-testing pass, 2026-08-26, gap #3: comma-separated exact
  // origins the frontend is actually served from in production (e.g.
  // "https://app.surestock.example"). Only consulted outside dev/test —
  // see app.ts's CORS origin resolver for why local dev doesn't need
  // this set at all.
  CORS_ORIGIN: z.string().optional(),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
