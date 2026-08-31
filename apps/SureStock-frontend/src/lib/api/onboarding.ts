import { apiRequest } from './client'
import type { OnboardingStatus } from './types'

export function getOnboardingStatus() {
  return apiRequest<OnboardingStatus>('/onboarding/status')
}
