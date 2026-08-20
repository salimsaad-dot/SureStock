import { Prisma } from '@prisma/client';

/**
 * Integer minor units (pesewas: 1 GHS = 100). Doc 2 §3.3: "Floating
 * point is never used for money... handled as integer minor units in
 * application code." The database still stores numeric(12,2) — this is
 * the boundary that converts between the two, so every route that
 * touches a price does the conversion the same way instead of each one
 * quietly inventing its own.
 */
export type Pesewas = number;

export function toDecimal(pesewas: Pesewas): Prisma.Decimal {
  if (!Number.isInteger(pesewas)) {
    throw new Error(`Money must be an integer number of minor units, got ${pesewas}.`);
  }
  return new Prisma.Decimal(pesewas).dividedBy(100);
}

export function toPesewas(decimal: Prisma.Decimal | number | string): Pesewas {
  return new Prisma.Decimal(decimal).times(100).toNumber();
}

/**
 * Cedis-as-typed-by-a-human ("12.50", "12", " GH₵12.50 ") -> integer
 * pesewas. Distinct from toPesewas() above: that one trusts its input
 * is already a clean decimal; this one is the boundary for a spreadsheet
 * cell, which might have currency symbols, stray whitespace, or simply
 * not be a number at all — returns null rather than throwing, so the
 * caller (import validation) can turn "not a number" into a row-level
 * reason instead of a crash.
 */
export function parseCedisToPesewas(raw: string): Pesewas | null {
  const cleaned = raw.replace(/[^\d.-]/g, '').trim();
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return null;
  try {
    const pesewas = new Prisma.Decimal(cleaned).times(100).toDecimalPlaces(0).toNumber();
    return pesewas < 0 ? null : pesewas;
  } catch {
    return null;
  }
}
