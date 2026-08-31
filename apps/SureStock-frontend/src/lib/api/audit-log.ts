import { apiRequest } from './client'
import type { AuditLogListParams, AuditLogListResponse } from './types'

/** T-31, Owner-only — searchable by user, action, and date. */
export function listAuditLog(params: AuditLogListParams = {}) {
  return apiRequest<AuditLogListResponse>('/audit-log', { query: params })
}
