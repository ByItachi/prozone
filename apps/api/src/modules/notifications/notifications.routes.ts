import { prisma } from '@novapanel/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authed } from '../../utils/guards.ts';

export function notificationRoutes(app: FastifyInstance) {
  const guard = authed(app);

  app.get('/api/notifications', { preHandler: guard }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(request.query);
    const where = { userId: request.user!.id };
    const [items, total] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.notification.count({ where }),
    ]);
    return reply.send({ success: true, message: 'Bildirimler', data: { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  app.get('/api/notifications/unread-count', { preHandler: guard }, async (request, reply) => {
    const count = await prisma.notification.count({ where: { userId: request.user!.id, isRead: false } });
    return reply.send({ success: true, message: 'Okunmamış', data: { count } });
  });

  app.post('/api/notifications/read', { preHandler: guard }, async (request, reply) => {
    const body = z.object({ ids: z.array(z.string().uuid()).optional() }).parse(request.body ?? {});
    if (body.ids?.length) {
      await prisma.notification.updateMany({
        where: { userId: request.user!.id, id: { in: body.ids } },
        data: { isRead: true, readAt: new Date() },
      });
    } else {
      await prisma.notification.updateMany({
        where: { userId: request.user!.id, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
    }
    return reply.send({ success: true, message: 'Bildirimler okundu', data: null });
  });

  app.get('/api/announcements', { preHandler: guard }, async (_request, reply) => {
    const items = await prisma.announcement.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, take: 10 });
    return reply.send({ success: true, message: 'Duyurular', data: items });
  });
}