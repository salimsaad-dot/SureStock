import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import { generateId } from './id.js';
import { HttpError } from './http-error.js';

/**
 * Local-disk image storage (product photos, staff avatars) — a
 * deliberate choice over cloud object storage (S3, Cloudinary, etc.):
 * this is a single-location, self-hosted system already running on
 * XAMPP/MariaDB, so a cloud dependency and its cost/config would be
 * overkill. Files live under this backend's own `uploads/` directory
 * (gitignored, never committed) and are served back out by
 * `@fastify/static` at the `/uploads/` prefix registered in app.ts.
 * Revisit if this ever moves to multi-location or cloud hosting — local
 * disk ties images to this one machine, with no redundancy or CDN.
 */
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

/** @fastify/static requires its `root` directory to already exist at registration time — called once from app.ts before that registration. */
export async function ensureUploadsDir(): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Generous for a phone photo but bounded — the app-wide multipart limit
// (10MB, app.ts) is sized for CSV import; a product/avatar photo has no
// business being anywhere near that.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Validates and writes an uploaded image, returning the relative URL to
 * store on the owning record (Product.imageUrl, User.avatarUrl). The
 * stored filename is always server-generated — a client-supplied
 * filename/extension is never trusted directly (path traversal, content
 * spoofing), only the sniffed mimetype decides the extension.
 */
export async function saveUploadedImage(file: MultipartFile): Promise<{ url: string }> {
  const ext = ALLOWED_MIME_TO_EXT[file.mimetype];
  if (!ext) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Only JPEG, PNG, or WebP images are allowed.');
  }

  const buffer = await file.toBuffer();
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Image must be 5MB or smaller.');
  }
  if (buffer.length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'The uploaded file is empty.');
  }

  await mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${generateId()}.${ext}`;
  await writeFile(path.join(UPLOADS_DIR, filename), buffer);

  return { url: `/uploads/${filename}` };
}

/**
 * Best-effort cleanup when an image is replaced or removed — never
 * throws, since a stray orphaned file on disk is a non-issue but a
 * failed delete blocking the actual record update (the part the user is
 * waiting on) would be a real regression. Only ever touches paths under
 * our own `/uploads/` prefix, never an arbitrary external URL a record
 * might otherwise hold.
 */
export async function deleteUploadedImage(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith('/uploads/')) return;
  const filename = url.slice('/uploads/'.length);
  if (!filename || filename.includes('/') || filename.includes('..')) return;
  try {
    await unlink(path.join(UPLOADS_DIR, filename));
  } catch {
    // Already gone, or never existed — nothing to do either way.
  }
}
