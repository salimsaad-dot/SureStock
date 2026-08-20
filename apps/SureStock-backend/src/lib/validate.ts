import type { ZodType } from 'zod';
import { HttpError } from './http-error.js';

/**
 * Every route validates its body through zod, not Fastify's built-in
 * AJV-based schema option — but both need to fail the same way (Doc 2,
 * §5's one error shape), so this is the single place a zod failure
 * becomes an HttpError instead of every route handler reimplementing
 * that mapping slightly differently.
 */
export function parseBody<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'The request body failed validation.', result.error.issues);
  }
  return result.data;
}
