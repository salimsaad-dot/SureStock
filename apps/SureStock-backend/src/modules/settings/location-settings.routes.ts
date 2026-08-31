import type { FastifyInstance } from 'fastify';
import { updateLocationSettingsBodySchema } from './location-settings.schemas.js';
import { getLocationSettings, getCheckoutSettings, getInventoryDefaults, updateLocationSettings } from './location-settings.service.js';
import { exportAllData } from './data-export.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function locationSettingsRoutes(app: FastifyInstance) {
  const ownerOnly = [app.authenticate, app.requireRole('OWNER')];
  const any = [app.authenticate];

  app.get('/settings/business', { preHandler: ownerOnly }, async (request) => {
    return getLocationSettings(app.prisma, accessUser(request).locationId);
  });

  app.patch('/settings/business', { preHandler: ownerOnly }, async (request) => {
    const user = accessUser(request);
    const body = parseBody(updateLocationSettingsBodySchema, request.body);
    return updateLocationSettings(app.prisma, user.locationId, body);
  });

  // Any authenticated role — the Sell screen's payment sheet (cashiers
  // included) needs to know which methods are enabled and the discount
  // threshold, without seeing the rest of the owner-only settings.
  app.get('/settings/checkout', { preHandler: any }, async (request) => {
    return getCheckoutSettings(app.prisma, accessUser(request).locationId);
  });

  // Manager+Owner — matches NewProductPage's own route gate (T-06).
  app.get(
    '/settings/inventory-defaults',
    { preHandler: [app.authenticate, app.requireRole('OWNER', 'MANAGER')] },
    async (request) => {
      return getInventoryDefaults(app.prisma, accessUser(request).locationId);
    },
  );

  // T-31: the shop's own real safety net — see data-export.service.ts's
  // doc comment for why this replaced a literal whole-database backup
  // (which would have leaked every other shop's data to any Owner).
  app.get('/settings/export', { preHandler: ownerOnly }, async (request, reply) => {
    const csv = await exportAllData(app.prisma, accessUser(request).locationId);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="surestock-export.csv"')
      .send(csv);
  });
}
