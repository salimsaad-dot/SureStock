import type { FastifyInstance } from 'fastify';
import { getOnboardingStatus } from './onboarding.service.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function onboardingRoutes(app: FastifyInstance) {
  // Doc 3 §2: "First-run setup happens once, on the owner's account" — Owner-only, not Manager/Cashier.
  app.get('/onboarding/status', { preHandler: [app.authenticate, app.requireRole('OWNER')] }, async (request) => {
    const user = accessUser(request);
    return getOnboardingStatus(app.prisma, user.locationId);
  });
}
