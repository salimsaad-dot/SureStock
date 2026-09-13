import type { FastifyInstance } from 'fastify';
import { saveUploadedImage } from '../../lib/uploads.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * A single, domain-agnostic image upload endpoint reused by both product
 * photos (catalogue) and staff avatars (auth) — storing a file is not
 * itself a sensitive action, so this only requires being signed in, not
 * a specific role. What IS sensitive is attaching the returned URL to a
 * record: PATCH /products/:id already requires Manager+ (product.routes.ts),
 * and PATCH /auth/me only ever writes the caller's own account
 * (auth/routes.ts) — each of those enforces its own real authorization,
 * this endpoint just produces a URL for them to use.
 */
export default async function uploadRoutes(app: FastifyInstance) {
  app.post('/uploads/image', { preHandler: [app.authenticate] }, async (request) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, 'VALIDATION_ERROR', 'No file was uploaded.');
    return saveUploadedImage(file);
  });
}
