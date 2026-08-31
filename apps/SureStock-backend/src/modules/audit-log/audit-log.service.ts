import type { Prisma } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import type { ListAuditLogQuery } from './audit-log.schemas.js';

/**
 * Doc 6 T-31: "the audit log is searchable by user, action, and date."
 * `audit_log` has no `locationId` of its own — scoped through the
 * acting `user`'s own location, same technique as everywhere else this
 * gap comes up (see data-export.service.ts's fuller writeup). A
 * `userId`-null row (none exist in practice — every real writer in this
 * codebase always passes one) would fall outside this scope; an honest
 * consequence of joining through a nullable relation, not a bug.
 */
export async function listAuditLog(prisma: typeof PrismaClient, locationId: string, query: ListAuditLogQuery) {
  const where: Prisma.AuditLogWhereInput = { user: { locationId } };
  if (query.userId) where.userId = query.userId;
  if (query.action) where.action = query.action;
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {}),
    };
  }

  const [rows, totalCount, distinctActions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    // Real actions this shop has actually logged, not a hardcoded guess
    // at every action string any module might ever write.
    prisma.auditLog.findMany({ where: { user: { locationId } }, select: { action: true }, distinct: ['action'] }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user?.name ?? null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      before: r.before,
      after: r.after,
      ip: r.ip,
      deviceId: r.deviceId,
      createdAt: r.createdAt,
    })),
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
    availableActions: distinctActions.map((a) => a.action).sort(),
  };
}
