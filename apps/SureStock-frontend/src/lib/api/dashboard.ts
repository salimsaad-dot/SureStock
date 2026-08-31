import { apiRequest } from './client'
import type { DashboardResponse } from './types'

/** T-25: no filters — always "today" vs the same day last week, plus a 30-day trend. See dashboard.service.ts. */
export function getDashboard() {
  return apiRequest<DashboardResponse>('/dashboard')
}
