/**
 * Opaque cursor for keyset pagination (Doc 2 §5: "cursor pagination on
 * list endpoints"). Deliberately not offset-based: an OFFSET page
 * shifts under a list that's changing between requests — a product
 * inserted while a manager is on page 2 pushes everything over by one,
 * and they either see a duplicate or skip a row. A cursor encoding the
 * last-seen sort key doesn't have that failure mode, which is what
 * T-07's "paginates without jumping" actually requires.
 */
export function encodeCursor<T extends object>(value: T): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T>(cursor: string): T {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
}
