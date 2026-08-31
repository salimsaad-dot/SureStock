import { apiRequest, apiRequestBlob } from './client'
import type {
  CheckoutSettings,
  CreateStaffBody,
  LocationSettings,
  NotificationLogEntry,
  ResetCredentialsBody,
  StaffAdmin,
  UpdateLocationSettingsBody,
  UpdateStaffBody,
} from './types'

export interface InventoryDefaults {
  defaultReorderPoint: number | null
  defaultReorderQuantity: number | null
}

// ---- Business/location settings (Owner-only) ----

export function getLocationSettings() {
  return apiRequest<LocationSettings>('/settings/business')
}

export function updateLocationSettings(body: UpdateLocationSettingsBody) {
  return apiRequest<LocationSettings>('/settings/business', { method: 'PATCH', body })
}

// Any authenticated role — the Sell screen's payment sheet needs this.
export function getCheckoutSettings() {
  return apiRequest<CheckoutSettings>('/settings/checkout')
}

// Manager+Owner — matches NewProductPage's own route gate.
export function getInventoryDefaults() {
  return apiRequest<InventoryDefaults>('/settings/inventory-defaults')
}

// ---- Users & Roles (Owner-only) ----

export function listStaffAdmin() {
  return apiRequest<StaffAdmin[]>('/settings/users')
}

export function createStaff(body: CreateStaffBody) {
  return apiRequest<StaffAdmin>('/settings/users', { method: 'POST', body })
}

export function updateStaff(id: string, body: UpdateStaffBody) {
  return apiRequest<StaffAdmin>(`/settings/users/${id}`, { method: 'PATCH', body })
}

export function resetStaffCredentials(id: string, body: ResetCredentialsBody) {
  return apiRequest<StaffAdmin>(`/settings/users/${id}/reset-credentials`, { method: 'POST', body })
}

// ---- Data export (T-31, Owner-only) ----

export function exportAllData() {
  return apiRequestBlob('/settings/export')
}

// ---- Notifications (SMS, Manager+Owner) ----

export function sendTestSms() {
  return apiRequest<{ sent: true }>('/notifications/test', { method: 'POST' })
}

export function sendDailySummaryNow() {
  return apiRequest<{ sent: true }>('/notifications/daily-summary', { method: 'POST' })
}

export function getNotificationLog() {
  return apiRequest<NotificationLogEntry[]>('/notifications/log')
}
