import { apiRequest } from './client'

/** Product photos and staff avatars share this one endpoint — see the backend's upload.routes.ts for why. */
export function uploadImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<{ url: string }>('/uploads/image', { method: 'POST', body: form })
}
