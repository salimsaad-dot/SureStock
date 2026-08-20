import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import prismaPlugin from './plugins/prisma.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import authPlugin from './plugins/auth.js';
import healthRoutes from './modules/health/routes.js';
import authRoutes from './modules/auth/routes.js';
import categoryRoutes from './modules/catalogue/category.routes.js';
import supplierRoutes from './modules/catalogue/supplier.routes.js';
import productRoutes from './modules/catalogue/product.routes.js';
import importRoutes from './modules/catalogue/import.routes.js';
import receiveRoutes from './modules/inventory/receive.routes.js';
import adjustmentRoutes from './modules/inventory/adjustment.routes.js';
import tillShiftRoutes from './modules/sales/till-shift.routes.js';
import saleRoutes from './modules/sales/sale.routes.js';

/**
 * Builds the Fastify instance without starting it — kept separate from
 * server.ts so tests can build an app, inject requests, and tear it
 * down without ever binding a port (Doc 6's "definition of done"
 * requires an integration test per endpoint; this is what makes those
 * fast).
 *
 * Route modules are registered under domain-scoped prefixes as they're
 * built — catalogue, inventory, sales, purchasing, reporting, admin —
 * per the module boundary in Doc 2 §3: each module owns its routes and
 * services, and reaches other modules through their service functions,
 * never by importing another module's Prisma queries directly.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  await app.register(errorHandlerPlugin);
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  // 10MB is generous for a spreadsheet even at the low thousands of
  // rows Doc 6's import task targets — bounded mainly to stop an
  // accidental (or malicious) huge upload from tying up a request.
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(categoryRoutes);
  await app.register(supplierRoutes);
  await app.register(productRoutes);
  await app.register(importRoutes);
  await app.register(receiveRoutes);
  await app.register(adjustmentRoutes);
  await app.register(tillShiftRoutes);
  await app.register(saleRoutes);

  return app;
}
