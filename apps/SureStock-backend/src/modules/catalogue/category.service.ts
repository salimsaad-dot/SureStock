import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { HttpError, notFound } from '../../lib/http-error.js';
import type { CreateCategoryBody, UpdateCategoryBody } from './category.schemas.js';

function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, 'CONFLICT', message, details);
}

async function assertNoCycle(prisma: typeof PrismaClient, categoryId: string, proposedParentId: string) {
  if (proposedParentId === categoryId) {
    throw conflict('A category cannot be its own parent.');
  }
  // Walk up from the proposed parent — if we ever reach categoryId, this
  // move would make the category an ancestor of itself. Shop catalogues
  // are shallow (a handful of levels at most), so this walk is cheap;
  // it also can't loop forever, since a cycle is exactly what it's
  // checking for.
  let current: string | null = proposedParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === categoryId) {
      throw conflict('That would nest the category inside one of its own descendants.');
    }
    if (seen.has(current)) break; // pre-existing cycle, not this operation's problem
    seen.add(current);
    const parent: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = parent?.parentId ?? null;
  }
}

export function listCategories(prisma: typeof PrismaClient, includeArchived: boolean) {
  return prisma.category.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function createCategory(prisma: typeof PrismaClient, body: CreateCategoryBody) {
  if (body.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: body.parentId } });
    if (!parent) throw notFound('Parent category not found.');
  }
  return prisma.category.create({
    data: {
      id: generateId(),
      name: body.name,
      parentId: body.parentId ?? null,
      sortOrder: body.sortOrder ?? 0,
      colour: body.colour ?? null,
    },
  });
}

export async function updateCategory(prisma: typeof PrismaClient, id: string, body: UpdateCategoryBody) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFound('Category not found.');

  if (body.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: body.parentId } });
    if (!parent) throw notFound('Parent category not found.');
    await assertNoCycle(prisma, id, body.parentId);
  }

  return prisma.category.update({
    where: { id },
    data: {
      name: body.name,
      // `=== undefined` (not falsy) so parentId: null is applied but an
      // omitted parentId leaves the existing value alone — see the
      // schema comment for why the distinction matters here.
      parentId: body.parentId === undefined ? undefined : body.parentId,
      sortOrder: body.sortOrder,
      colour: body.colour === undefined ? undefined : body.colour,
    },
  });
}

export async function archiveCategory(prisma: typeof PrismaClient, id: string) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFound('Category not found.');
  return prisma.category.update({ where: { id }, data: { archivedAt: new Date() } });
}

export async function restoreCategory(prisma: typeof PrismaClient, id: string) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFound('Category not found.');
  return prisma.category.update({ where: { id }, data: { archivedAt: null } });
}

/**
 * Hard delete — separate from archive, and deliberately harder to
 * reach (Owner-only in the routes). Doc 6, T-05: "a category in use
 * cannot be deleted." The database's own RESTRICT foreign key already
 * guarantees this at the storage layer; this check exists so the
 * failure is a clear, actionable 409 instead of a raw SQL error leaking
 * up through the generic error handler.
 */
export async function deleteCategory(prisma: typeof PrismaClient, id: string) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFound('Category not found.');

  const [productCount, childCount] = await Promise.all([
    prisma.product.count({ where: { categoryId: id } }),
    prisma.category.count({ where: { parentId: id } }),
  ]);

  if (productCount > 0 || childCount > 0) {
    throw conflict('This category is in use and cannot be deleted — archive it instead.', {
      productCount,
      childCount,
    });
  }

  await prisma.category.delete({ where: { id } });
}
