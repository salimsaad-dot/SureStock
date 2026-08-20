import { useAuthStore } from '../auth-store'
import { ApiError, type ApiErrorBody } from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Set false for the login/pin-unlock/refresh calls that carry no session yet. */
  authenticated?: boolean
  query?: object
  /**
   * Statuses that carry a real, typed JSON body rather than the error
   * envelope — e.g. the import commit endpoint's 422 `{committed:false,...}`.
   * Returned as data instead of thrown as an ApiError.
   */
  treatAsSuccess?: number[]
}

function buildQueryString(query?: RequestOptions['query']): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody
  } catch {
    return { code: 'UNKNOWN_ERROR', message: response.statusText || 'Something went wrong.' }
  }
}

async function rawFetch(path: string, options: RequestOptions, accessToken?: string) {
  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {}
  if (!isFormData) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  return fetch(`${API_BASE}${path}${buildQueryString(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body: isFormData ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
}

/**
 * A 401 on an authenticated call could mean the 15-minute access token just
 * expired mid-shift — refresh once and retry before giving up (Blueprint §09,
 * T-03's refresh endpoint). Anything else (wrong password, wrong PIN, a locked
 * account) is a real rejection and is never retried.
 */
async function refreshSession(): Promise<string | null> {
  const session = useAuthStore.getState().session
  if (!session) return null

  const response = await rawFetch('/auth/refresh', { method: 'POST', body: { refreshToken: session.refreshToken } })
  if (!response.ok) {
    useAuthStore.getState().clearSession()
    return null
  }

  const { accessToken, refreshToken } = (await response.json()) as { accessToken: string; refreshToken: string }
  useAuthStore.getState().setSession({ ...session, accessToken, refreshToken })
  return accessToken
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const authenticated = options.authenticated ?? true
  const session = useAuthStore.getState().session
  const accessToken = authenticated ? session?.accessToken : undefined

  let response = await rawFetch(path, options, accessToken)

  if (response.status === 401 && authenticated && session) {
    const newAccessToken = await refreshSession()
    if (newAccessToken) {
      response = await rawFetch(path, options, newAccessToken)
    }
  }

  if (!response.ok && !options.treatAsSuccess?.includes(response.status)) {
    throw new ApiError(response.status, await parseErrorBody(response))
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** For non-JSON responses, e.g. the import template's CSV download. */
export async function apiRequestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const session = useAuthStore.getState().session
  let response = await rawFetch(path, options, session?.accessToken)

  if (response.status === 401 && session) {
    const newAccessToken = await refreshSession()
    if (newAccessToken) response = await rawFetch(path, options, newAccessToken)
  }

  if (!response.ok) throw new ApiError(response.status, await parseErrorBody(response))
  return response.blob()
}
