import type { FastifyInstance } from 'fastify';
import {
  openTillShiftBodySchema,
  closeTillShiftBodySchema,
  tillShiftIdParamsSchema,
  listTillShiftsQuerySchema,
} from './till-shift.schemas.js';
import { openTillShift, getCurrentTillShift, closeTillShift, listTillShifts } from './till-shift.service.js';
import { parseBody } from '../../lib/validate.js';
import { accessUser } from '../../lib/auth-context.js';

export default async function tillShiftRoutes(app: FastifyInstance) {
  // Every role that can sell can open/close their own shift — this
  // isn't a manage-only action, it's a cashier's own daily routine.
  const any = [app.authenticate];

  app.post('/till-shifts', { preHandler: any }, async (request, reply) => {
    const user = accessUser(request);
    const body = parseBody(openTillShiftBodySchema, request.body);
    const shift = await openTillShift(app.prisma, user.sub, body);
    return reply.code(201).send(shift);
  });

  app.get('/till-shifts', { preHandler: any }, async (request) => {
    const user = accessUser(request);
    const query = listTillShiftsQuerySchema.parse(request.query);
    return listTillShifts(app.prisma, user.locationId, user.sub, user.role, query);
  });

  app.get('/till-shifts/current', { preHandler: any }, async (request) => {
    const user = accessUser(request);
    const shift = await getCurrentTillShift(app.prisma, user.sub);
    return shift ?? null;
  });

  app.post('/till-shifts/:id/close', { preHandler: any }, async (request) => {
    const user = accessUser(request);
    const { id } = tillShiftIdParamsSchema.parse(request.params);
    const body = parseBody(closeTillShiftBodySchema, request.body);
    return closeTillShift(app.prisma, user.sub, id, body);
  });
}
