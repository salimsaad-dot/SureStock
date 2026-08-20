import type { FastifyInstance } from 'fastify';
import { parseSpreadsheet } from './import.parser.js';
import { suggestMapping, validateRows, commitImport } from './import.service.js';
import { validateImportBodySchema, IMPORT_FIELDS } from './import.schemas.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';
import { HttpError } from '../../lib/http-error.js';

const TEMPLATE_HEADERS = ['Name', 'SKU', 'Cost Price', 'Selling Price', 'Barcode', 'Variant Name', 'Category', 'Supplier', 'Unit', 'Reorder Point', 'Reorder Quantity', 'Opening Quantity', 'Perishable', 'Description'];

export default async function importRoutes(app: FastifyInstance) {
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  // Doc 3 §2: onboarding's "download template" step. A header row only —
  // matches TEMPLATE_HEADERS 1:1 with IMPORT_FIELDS below so a filled-in
  // copy of this exact file maps itself with no manual work.
  app.get('/products/import/template', { preHandler: manage }, async (_request, reply) => {
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="surestock-product-import-template.csv"')
      .send(TEMPLATE_HEADERS.join(',') + '\n');
  });

  // Parses the uploaded file and hands the raw rows straight back —
  // nothing is persisted server-side between steps (see import.service.ts
  // header comment on validateRows for why: every later step re-sends
  // the same {headers, rows, mapping}, kept stateless like the rest of
  // the API rather than holding an in-progress upload in server memory).
  app.post('/products/import/parse', { preHandler: manage }, async (request) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, 'VALIDATION_ERROR', 'No file was uploaded.');
    const buffer = await file.toBuffer();
    const parsed = await parseSpreadsheet(buffer, file.filename);
    return { ...parsed, suggestedMapping: suggestMapping(parsed.headers), availableFields: IMPORT_FIELDS };
  });

  // Doc 6, T-08: "a preview lists valid and invalid rows with reasons."
  // Never writes anything — see commit below for the version that does.
  app.post('/products/import/validate', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const body = parseBody(validateImportBodySchema, request.body);
    return validateRows(app.prisma, user.locationId, body.headers, body.rows, body.mapping);
  });

  app.post('/products/import/commit', { preHandler: manage }, async (request, reply) => {
    const user = accessUser(request);
    const body = parseBody(validateImportBodySchema, request.body);
    const result = await commitImport(app.prisma, user.locationId, user.sub, body.headers, body.rows, body.mapping);
    return reply.code(result.committed ? 201 : 422).send(result);
  });
}
