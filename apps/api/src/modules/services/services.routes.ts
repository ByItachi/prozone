import { prisma } from '@novapanel/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authed } from '../../utils/guards.ts';
import { auditFromRequest } from '../../utils/audit.ts';
import { listServices, getServiceDetail, cancelService, checkExpiredServices } from './services.service.ts';

export function serviceRoutes(app: FastifyInstance) {
  const guard = authed(app);

  app.get('/api/services', { preHandler: guard }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.string().optional() }).parse(request.query);
    const data = await listServices(request.user!.id, q.page, q.limit, q.status);
    return reply.send({ success: true, message: 'Servisler', data });
  });

  app.get('/api/services/:id', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const data = await getServiceDetail(request.user!.id, id);
    return reply.send({ success: true, message: 'Servis detayı', data });
  });

  app.post('/api/services/:id/cancel', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const body = z.object({ reason: z.string().max(500).optional() }).parse(request.body ?? {});
    const data = await cancelService(request.user!.id, id, body.reason);
    await auditFromRequest(request, 'SERVICE_CANCELLED', { userId: request.user!.id, target: 'Service', targetId: id });
    return reply.send({ success: true, message: 'Servis iptal edildi', data });
  });

  // Admin helper: trigger expiry check (for cron/dev)
  app.post('/api/admin/services/check-expiry', async (_request, _reply) => {
    const count = await checkExpiredServices();
    return { success: true, message: `${count} servis kontrol edildi`, data: { expiredCount: count } };
  });
}