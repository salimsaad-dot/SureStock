import type { LocationSettings, UpdateLocationSettingsBody } from '../../lib/api/types'

/** Shared by every configurable Settings tab — one query/mutation at the SettingsPage level, each tab's form submits only its own relevant subset. */
export interface SettingsTabProps {
  settings: LocationSettings
  onSave: (patch: UpdateLocationSettingsBody) => Promise<LocationSettings>
  saving: boolean
}
