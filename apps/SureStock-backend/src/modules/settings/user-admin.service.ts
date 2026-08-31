import { Prisma, type User } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { HttpError, notFound } from '../../lib/http-error.js';
import { hashPassword, hashPin } from '../auth/service.js';
import type { CreateStaffBody, UpdateStaffBody, ResetCredentialsBody } from './user-admin.schemas.js';

function conflict(message: string): HttpError {
  return new HttpError(409, 'CONFLICT', message);
}

// Same P2002-shape translation as product.service.ts's own
// extractConstraintName — this Prisma 7 + MariaDB combination doesn't
// use the documented `error.meta.target` shape (see surestock-lessons).
function extractConstraintName(err: Prisma.PrismaClientKnownRequestError): string {
  const meta = err.meta as Record<string, unknown> | undefined;
  const target = meta?.target;
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return target.join(',');
  const driverError = meta?.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverError?.cause as Record<string, unknown> | undefined;
  const constraint = cause?.constraint as Record<string, unknown> | undefined;
  if (typeof constraint?.index === 'string') return constraint.index;
  return '';
}

function translateUniqueConstraintError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const name = extractConstraintName(err);
    if (name.includes('email')) throw conflict('That email is already used by another staff member.');
    if (name.includes('phone')) throw conflict('That phone number is already used by another staff member.');
  }
  throw err;
}

function serializeStaff(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

/** Doc 3/mockup Users & Roles tab. Owner-only throughout, matching Settings' own nav gate — the mockup never carves out a Manager-level admin surface. */
export async function listStaff(prisma: typeof PrismaClient, locationId: string) {
  const rows = await prisma.user.findMany({ where: { locationId }, orderBy: { name: 'asc' } });
  return rows.map(serializeStaff);
}

export async function createStaff(prisma: typeof PrismaClient, locationId: string, body: CreateStaffBody) {
  try {
    const user = await prisma.user.create({
      data: {
        id: generateId(),
        name: body.name,
        email: body.email,
        phone: body.phone,
        role: body.role,
        locationId,
        passwordHash: await hashPassword(body.password),
        pinHash: body.pin ? await hashPin(body.pin) : undefined,
      },
    });
    return serializeStaff(user);
  } catch (err) {
    return translateUniqueConstraintError(err);
  }
}

/**
 * No email/SMS system exists to send an invite or a reset link (same
 * honest gap as everywhere else notification infra is missing) — an
 * owner just sets the new credential directly, verified in person. Self
 * deactivation/self-demotion is blocked here: locking your own account
 * or your own role out of OWNER would leave nobody able to reverse it.
 */
export async function updateStaff(
  prisma: typeof PrismaClient,
  locationId: string,
  callerUserId: string,
  id: string,
  body: UpdateStaffBody,
) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.locationId !== locationId) throw notFound('Staff member not found.');

  if (id === callerUserId) {
    if (body.isActive === false) throw conflict('You cannot deactivate your own account.');
    if (body.role && body.role !== 'OWNER') throw conflict('You cannot change your own role away from Owner.');
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: { name: body.name, email: body.email, phone: body.phone, role: body.role, isActive: body.isActive },
    });
    return serializeStaff(updated);
  } catch (err) {
    return translateUniqueConstraintError(err);
  }
}

export async function resetStaffCredentials(
  prisma: typeof PrismaClient,
  locationId: string,
  id: string,
  body: ResetCredentialsBody,
) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.locationId !== locationId) throw notFound('Staff member not found.');

  const updated = await prisma.user.update({
    where: { id },
    data: {
      passwordHash: body.password ? await hashPassword(body.password) : undefined,
      // A reset PIN also clears any prior lockout — a fresh credential
      // shouldn't inherit the old one's failed-attempt count.
      pinHash: body.pin ? await hashPin(body.pin) : undefined,
      ...(body.pin ? { failedPinAttempts: 0, pinLockedUntil: null } : {}),
    },
  });
  return serializeStaff(updated);
}
