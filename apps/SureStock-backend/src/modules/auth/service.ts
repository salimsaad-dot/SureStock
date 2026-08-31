import { Prisma, type User } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { hashSecret, verifySecret } from '../../lib/hash.js';
import { HttpError, unauthorized, locked } from '../../lib/http-error.js';
import type { RegisterBody } from './schemas.js';

// Deliberately the same message for "no such account" and "wrong
// password" — a login endpoint that says which one it was tells an
// attacker whether an identifier is registered at all.
const INVALID_CREDENTIALS = 'Incorrect phone/email or password.';
const INVALID_PIN = 'Incorrect PIN.';

export async function verifyPassword(
  prisma: typeof PrismaClient,
  identifier: string,
  password: string,
): Promise<User> {
  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      OR: [{ email: identifier }, { phone: identifier }],
    },
  });

  if (!user || !(await verifySecret(user.passwordHash, password))) {
    throw unauthorized(INVALID_CREDENTIALS);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

/**
 * PIN unlock, with lockout (Doc 6, T-03: "five failed PINs lock the
 * account for five minutes"). The lockout state lives in the database
 * (User.failedPinAttempts / pinLockedUntil) rather than in memory — see
 * the schema comment for why that's not optional. The attempt count and
 * lockout duration (Doc 6 T-29, Settings' Security tab) are real
 * per-location values on `Location` now, read via the user's own
 * `locationId` — no longer hardcoded constants.
 */
export async function verifyPin(prisma: typeof PrismaClient, userId: string, pin: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !user.pinHash) {
    throw unauthorized(INVALID_PIN);
  }

  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    throw locked(
      `Too many incorrect PIN attempts. Try again after ${user.pinLockedUntil.toISOString()}.`,
      { lockedUntil: user.pinLockedUntil },
    );
  }

  const correct = await verifySecret(user.pinHash, pin);

  if (!correct) {
    const location = await prisma.location.findUniqueOrThrow({
      where: { id: user.locationId },
      select: { pinLockoutAttempts: true, pinLockoutMinutes: true },
    });
    const attempts = user.failedPinAttempts + 1;
    const lockingNow = attempts >= location.pinLockoutAttempts;
    const lockedUntil = new Date(Date.now() + location.pinLockoutMinutes * 60_000);

    await prisma.user.update({
      where: { id: user.id },
      data: lockingNow
        ? { failedPinAttempts: 0, pinLockedUntil: lockedUntil }
        : { failedPinAttempts: attempts },
    });

    if (lockingNow) {
      await prisma.auditLog.create({
        data: {
          id: generateId(),
          userId: user.id,
          action: 'PIN_LOCKOUT',
          entityType: 'user',
          entityId: user.id,
          after: { lockedForMinutes: location.pinLockoutMinutes },
        },
      });
      // The attempt that *triggers* the lock must say so (423), not just
      // "wrong PIN" (401) — otherwise the cashier gets no signal that
      // this failure was different from the previous four.
      throw locked(`Too many incorrect PIN attempts. Try again after ${lockedUntil.toISOString()}.`, {
        lockedUntil,
      });
    }

    throw unauthorized(INVALID_PIN);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedPinAttempts: 0, pinLockedUntil: null, lastLoginAt: new Date() },
  });
  return user;
}

/** Non-sensitive roster for the "who's using this device" PIN-unlock picker. */
export function listActiveStaffForLocation(prisma: typeof PrismaClient, locationId: string) {
  return prisma.user.findMany({
    where: { locationId, isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });
}

export function hashPassword(plain: string): Promise<string> {
  return hashSecret(plain);
}

export function hashPin(plain: string): Promise<string> {
  return hashSecret(plain);
}

function conflict(message: string): HttpError {
  return new HttpError(409, 'CONFLICT', message);
}

/**
 * Doc 3 §2, T-30 step 1. The one entry point that creates a `Location`
 * at all — every other Location in this codebase (including every test
 * fixture) has always been created by hand, since nothing before this
 * ever needed a real "a brand-new shop signs itself up" path. Location
 * and its first OWNER are created in one transaction so a failure
 * partway (e.g. the email collides) never leaves an orphaned shop with
 * no owner.
 */
export async function registerShop(prisma: typeof PrismaClient, body: RegisterBody): Promise<User> {
  try {
    return await prisma.$transaction(async (tx) => {
      const locationId = generateId();
      await tx.location.create({ data: { id: locationId, name: body.shopName } });
      return tx.user.create({
        data: {
          id: generateId(),
          name: body.ownerName,
          email: body.email,
          phone: body.phone,
          role: 'OWNER',
          locationId,
          passwordHash: await hashPassword(body.password),
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('That email or phone number is already registered — sign in instead.');
    }
    throw err;
  }
}
