import { uuidv7 } from 'uuidv7';

/**
 * Every primary key in SureStock is a UUIDv7, minted here rather than as
 * a database default. Reason: an offline device must be able to create a
 * sale id before it has ever reached the server (Doc 2, §3.1 — the id
 * doubles as the sale's idempotency key), so the id-generation logic has
 * to be something a client can run too, not a Postgres/MySQL-side
 * function only the server can call.
 */
export function generateId(): string {
  return uuidv7();
}
