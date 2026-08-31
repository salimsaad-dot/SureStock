import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './config/env.js';
import prismaPlugin from './plugins/prisma.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import { HttpError } from './lib/http-error.js';
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
import reportsRoutes from './modules/reports/reports.routes.js';
import purchaseOrderRoutes from './modules/purchasing/purchase-order.routes.js';
import locationSettingsRoutes from './modules/settings/location-settings.routes.js';
import userAdminRoutes from './modules/settings/user-admin.routes.js';
import syncRoutes from './modules/sync/sync.routes.js';
import reviewQueueRoutes from './modules/review-queue/review-queue.routes.js';
import stockTakeRoutes from './modules/stock-take/stock-take.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import onboardingRoutes from './modules/onboarding/onboarding.routes.js';
import auditLogRoutes from './modules/audit-log/audit-log.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';

/**
 * Product-testing pass, 2026-08-26, gap #3: no CORS plugin existed at
 * all — silently fine in dev only because Vite's own proxy makes every
 * request same-origin from the browser's point of view (see
 * `vite.config.ts`), and completely untested against a real cross-origin
 * deployment. No cookies are ever sent (the frontend authenticates with
 * a Bearer header, confirmed in `client.ts` — see `credentials` staying
 * unset below), so this doesn't need the more sensitive
 * reflect-origin-plus-credentials combination.
 *
 * - No `Origin` header at all (curl, a mobile client, same-origin
 *   requests in some browsers) is always allowed — CORS is a browser
 *   enforcement mechanism, not an auth boundary; real access control
 *   still happens at the JWT/RBAC layer regardless of origin.
 * - Outside production, any `http://localhost:<port>` or
 *   `http://127.0.0.1:<port>` origin is allowed — Vite has no fixed dev
 *   port in this project (it picks whatever's free starting from 5173,
 *   confirmed empirically: this session's dev server actually landed on
 *   5183), so pinning one exact port here would be fragile in a way
 *   that doesn't buy any real security in a local dev context.
 * - In production, only the exact origin(s) in `CORS_ORIGIN` (comma-
 *   separated) are allowed — unset means nothing is allowed, a safe
 *   default that fails closed rather than open.
 */
function corsOriginResolver(origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) {
  if (!origin) return callback(null, true);

  if (env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return callback(null, true);
  }

  const allowed = env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((o) => o.trim()) : [];
  callback(null, allowed.includes(origin));
}

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

  // Real bug found 2026-08-25 building T-32's Playwright E2E suite (the
  // first tool in this project's history to reliably click through a
  // full UI flow instead of falling back to curl when `browse` crashed —
  // curl never reproduces this, since it never sends a Content-Type
  // header without a body). Every bodyless POST from the frontend
  // (`apiRequest` always sets `Content-Type: application/json`, even
  // with no body — see client.ts) hit Fastify's own
  // `FST_ERR_CTP_EMPTY_JSON_BODY`, which this app's custom error handler
  // didn't recognize and turned into a generic 500 instead of Fastify's
  // own reasonable 400. Affected every bodyless action button in the
  // app: stock-take post/abandon, category/supplier archive/restore,
  // purchase-order send/cancel — none of which had ever actually been
  // click-tested end-to-end before Playwright existed to do it reliably.
  // Fixed at the root: an empty `application/json` body now parses to
  // `undefined` instead of throwing, for every route that doesn't
  // require one.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = body as string;
    if (text.trim() === '') {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      const error = new Error('Body is not valid JSON.') as Error & { statusCode: number };
      error.statusCode = 400;
      done(error, undefined);
    }
  });

  await app.register(errorHandlerPlugin);
  await app.register(cors, { origin: corsOriginResolver });
  // Product-testing pass, 2026-08-26, gap #4: no security-headers plugin
  // existed at all (no CSP, X-Frame-Options, X-Content-Type-Options,
  // etc.). `crossOriginResourcePolicy: 'cross-origin'` overrides
  // helmet's own default (`same-origin`) deliberately — that default is
  // meant for a content-serving origin, not an API whose entire job is
  // being consumed cross-origin by the frontend (see item 3's CORS fix
  // immediately above; leaving helmet's default here would fight it).
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  // Product-testing pass, 2026-08-26, gap #1: POST /auth/login had zero
  // brute-force protection — PIN-unlock has its own DB-tracked lockout,
  // but password login is a separate attack surface on the same
  // accounts. `global: false` means no route is limited unless it opts
  // in via its own `config.rateLimit` (see auth/routes.ts) — registering
  // this plugin doesn't silently throttle every other endpoint.
  await app.register(rateLimit, {
    global: false,
    // The plugin does `throw errorResponseBuilder(...)` internally (confirmed
    // by reading its source, not assumed from docs — same discipline this
    // project applies to every other Prisma/Fastify surprise) with no
    // `statusCode` of its own attached to a plain returned object, so a
    // bare {code, message, details} object here fell through this app's
    // error handler's generic-4xx check straight to a false 500. Returning
    // a real `HttpError` instead means it's thrown as one, and the error
    // handler's existing, already-tested `instanceof HttpError` branch
    // (its first, most specific check) handles it correctly for free.
    errorResponseBuilder: (_request, context) => {
      const retryAfterSeconds = Math.ceil(context.ttl / 1000);
      return new HttpError(429, 'RATE_LIMITED', `Too many attempts — try again in ${retryAfterSeconds} seconds.`, {
        retryAfterSeconds,
      });
    },
  });
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
  await app.register(reportsRoutes);
  await app.register(purchaseOrderRoutes);
  await app.register(locationSettingsRoutes);
  await app.register(userAdminRoutes);
  await app.register(syncRoutes);
  await app.register(reviewQueueRoutes);
  await app.register(stockTakeRoutes);
  await app.register(dashboardRoutes);
  await app.register(onboardingRoutes);
  await app.register(auditLogRoutes);
  await app.register(notificationsRoutes);

  return app;
}
