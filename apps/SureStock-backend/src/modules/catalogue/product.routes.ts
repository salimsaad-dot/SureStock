import type { FastifyInstance } from 'fastify';
import {
  createProductBodySchema,
  updateProductBodySchema,
  productStatusBodySchema,
  createVariantBodySchema,
  updateVariantBodySchema,
  productIdParamsSchema,
  variantParamsSchema,
  listProductsQuerySchema,
  barcodeLookupQuerySchema,
  popularProductsQuerySchema,
  recentProductsQuerySchema,
} from './product.schemas.js';
import {
  createProduct,
  getProduct,
  listProducts,
  lookupByBarcode,
  updateProduct,
  updateProductStatus,
  addVariant,
  updateVariant,
  getPopularProducts,
  getRecentProducts,
} from './product.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';
import { listMovementsQuerySchema, variantMovementsParamsSchema } from '../inventory/movement.schemas.js';
import { listVariantMovements } from '../inventory/movement.service.js';

export default async function productRoutes(app: FastifyInstance) {
  // Doc 3 §7: product list/detail is readable by every role (the Sell
  // screen needs it for cashiers too); editing is Manager+.
  const readAny = [app.authenticate];
  const manage = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.post('/products', { preHandler: manage }, async (request, reply) => {
    const user = accessUser(request);
    const body = parseBody(createProductBodySchema, request.body);
    const product = await createProduct(app.prisma, user.locationId, user.sub, user.role, body);
    return reply.code(201).send(product);
  });

  app.get('/products', { preHandler: readAny }, async (request) => {
    const user = accessUser(request);
    const query = listProductsQuerySchema.parse(request.query);
    return listProducts(app.prisma, user.locationId, user.role, query);
  });

  // A scanner is a keyboard device (Doc 2 §4) sending an exact barcode —
  // this is the fast, exact-match path Doc 2's API surface names
  // separately from the fuzzy /products search above; scanning has
  // nothing to do with typo tolerance.
  app.get('/products/lookup', { preHandler: readAny }, async (request) => {
    const user = accessUser(request);
    const { barcode } = barcodeLookupQuerySchema.parse(request.query);
    return lookupByBarcode(app.prisma, user.locationId, user.role, barcode);
  });

  // Doc 3 App Flow §3: the Sell screen's default browse view (before
  // any search query is typed) — real top-sellers and real
  // recently-sold products, same readAny gate as everything else here.
  app.get('/products/popular', { preHandler: readAny }, async (request) => {
    const user = accessUser(request);
    const query = popularProductsQuerySchema.parse(request.query);
    return getPopularProducts(app.prisma, user.locationId, query);
  });

  app.get('/products/recent', { preHandler: readAny }, async (request) => {
    const user = accessUser(request);
    const query = recentProductsQuerySchema.parse(request.query);
    return getRecentProducts(app.prisma, user.locationId, query);
  });

  app.get('/products/:id', { preHandler: readAny }, async (request) => {
    const user = accessUser(request);
    const { id } = productIdParamsSchema.parse(request.params);
    return getProduct(app.prisma, user.locationId, id, user.role);
  });

  app.patch('/products/:id', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = productIdParamsSchema.parse(request.params);
    const body = parseBody(updateProductBodySchema, request.body);
    return updateProduct(app.prisma, user.locationId, id, user.role, body);
  });

  // Doc 3 §4.3: "Discontinuing hides a product from the sell screen
  // without deleting its history" — a business-state change, not a
  // delete, so it's a dedicated small endpoint rather than folded into
  // the general PATCH above.
  app.patch('/products/:id/status', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { id } = productIdParamsSchema.parse(request.params);
    const { status } = parseBody(productStatusBodySchema, request.body);
    return updateProductStatus(app.prisma, user.locationId, id, user.role, status);
  });

  app.post('/products/:id/variants', { preHandler: manage }, async (request, reply) => {
    const user = accessUser(request);
    const { id } = productIdParamsSchema.parse(request.params);
    const body = parseBody(createVariantBodySchema, request.body);
    const variant = await addVariant(app.prisma, id, user.locationId, user.sub, user.role, body);
    return reply.code(201).send(variant);
  });

  app.patch('/products/:id/variants/:variantId', { preHandler: manage }, async (request) => {
    const user = accessUser(request);
    const { variantId } = variantParamsSchema.parse(request.params);
    const body = parseBody(updateVariantBodySchema, request.body);
    return updateVariant(app.prisma, user.locationId, variantId, user.sub, user.role, body);
  });

  // Doc 6 T-13: paginated, filterable-by-reason movement history — same
  // readAny gate as product detail itself, with unitCost stripped for
  // cashiers inside listVariantMovements.
  app.get('/products/:id/variants/:variantId/movements', { preHandler: readAny }, async (request) => {
    const user = accessUser(request);
    const { variantId } = variantMovementsParamsSchema.parse(request.params);
    const query = listMovementsQuerySchema.parse(request.query);
    return listVariantMovements(app.prisma, user.locationId, variantId, user.role, query);
  });
}
