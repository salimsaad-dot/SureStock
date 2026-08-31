import type { FastifyInstance } from 'fastify';
import { sendTestSms, sendDailySummary, listNotificationLog } from './notification.service.js';
import { accessUser } from '../../lib/auth-context.js';

/** Manager+Owner — matches the Settings page's own tab set (Notifications is reachable by both, unlike Users & Roles). */
export default async function notificationsRoutes(app: FastifyInstance) {
  const managerUp = [app.authenticate, app.requireRole('OWNER', 'MANAGER')];

  app.post('/notifications/test', { preHandler: managerUp }, async (request) => {
    await sendTestSms(app.prisma, accessUser(request).locationId);
    return { sent: true };
  });

  // Doc 3/mockup "Daily summary": no scheduler exists to fire this
  // automatically (same gap T-31's backup feature hit) — this is both
  // the Notifications tab's manual "Send now" button today and the exact
  // endpoint a future OS-level cron should call once one exists.
  app.post('/notifications/daily-summary', { preHandler: managerUp }, async (request) => {
    await sendDailySummary(app.prisma, accessUser(request).locationId);
    return { sent: true };
  });

  app.get('/notifications/log', { preHandler: managerUp }, async (request) => {
    return listNotificationLog(app.prisma, accessUser(request).locationId);
  });
}
