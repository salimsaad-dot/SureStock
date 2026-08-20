import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { HttpError, notFound } from '../../lib/http-error.js';
import type { CreateSupplierBody, UpdateSupplierBody } from './supplier.schemas.js';

function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, 'CONFLICT', message, details);
}

export function listSuppliers(prisma: typeof PrismaClient, includeArchived: boolean) {
  return prisma.supplier.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: { name: 'asc' },
  });
}

export function createSupplier(prisma: typeof PrismaClient, body: CreateSupplierBody) {
  return prisma.supplier.create({ data: { id: generateId(), ...body } });
}

export async function updateSupplier(prisma: typeof PrismaClient, id: string, body: UpdateSupplierBody) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw notFound('Supplier not found.');
  return prisma.supplier.update({ where: { id }, data: body });
}

export async function archiveSupplier(prisma: typeof PrismaClient, id: string) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw notFound('Supplier not found.');
  return prisma.supplier.update({ where: { id }, data: { archivedAt: new Date() } });
}

export async function restoreSupplier(prisma: typeof PrismaClient, id: string) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw notFound('Supplier not found.');
  return prisma.supplier.update({ where: { id }, data: { archivedAt: null } });
}

/** Same reasoning as category delete: the RESTRICT foreign keys (to
 * product and purchase_order) already enforce this; this check turns
 * that into a clear 409 instead of a raw SQL error. */
export async function deleteSupplier(prisma: typeof PrismaClient, id: string) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw notFound('Supplier not found.');

  const [productCount, purchaseOrderCount] = await Promise.all([
    prisma.product.count({ where: { supplierId: id } }),
    prisma.purchaseOrder.count({ where: { supplierId: id } }),
  ]);

  if (productCount > 0 || purchaseOrderCount > 0) {
    throw conflict('This supplier is in use and cannot be deleted — archive it instead.', {
      productCount,
      purchaseOrderCount,
    });
  }

  await prisma.supplier.delete({ where: { id } });
}
