import { prisma } from '@novapanel/db';
import type { FastifyInstance } from 'fastify';
import z from 'zod';
import { authed } from '../../utils/guards.ts';
import { auditFromRequest } from '../../utils/audit.ts';
import { AppError } from '../../utils/errors.ts';

export function userRoutes(app: FastifyInstance) {
  const guard = authed(app);

  // ─── Profile ───
  app.get('/api/users/me', { preHandler: guard }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      include: {
        role: { select: { name: true } },
        wallet: true,
        twoFactor: { select: { enabled: true } },
      },
    });
    if (!user) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    return reply.send({
      success: true,
      message: 'Profil',
      data: {
        id: user.id,
        name: user.name,
        surname: user.surname,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
        phone: user.phone,
        role: user.role.name,
        status: user.status,
        language: user.language,
        timezone: user.timezone,
        notificationEmail: user.notificationEmail,
        notificationWeb: user.notificationWeb,
        twoFactorEnabled: user.twoFactor?.enabled ?? false,
        avatarUrl: user.avatarUrl,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        wallet: user.wallet ? { balance: Number(user.wallet.balance), currency: user.wallet.currency } : null,
      },
    });
  });

  const updateProfileSchema = z.object({
    name: z.string().trim().min(2).max(60).optional(),
    surname: z.string().trim().min(2).max(60).optional(),
    phone: z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/).optional().nullable(),
    language: z.string().min(2).max(10).optional(),
    timezone: z.string().min(1).max(60).optional(),
    notificationEmail: z.boolean().optional(),
    notificationWeb: z.boolean().optional(),
  });

  app.patch('/api/users/me', { preHandler: guard }, async (request, reply) => {
    const body = updateProfileSchema.parse(request.body);
    const updated = await prisma.user.update({
      where: { id: request.user!.id },
      data: {
        name: body.name,
        surname: body.surname,
        phone: body.phone === undefined ? undefined : body.phone,
        language: body.language,
        timezone: body.timezone,
        notificationEmail: body.notificationEmail,
        notificationWeb: body.notificationWeb,
      },
    });
    await auditFromRequest(request, 'USER_UPDATED', { userId: updated.id, target: 'User', targetId: updated.id });
    return reply.send({ success: true, message: 'Profil güncellendi', data: { id: updated.id } });
  });

  // ─── Sessions ───
  app.get('/api/users/me/sessions', { preHandler: guard }, async (request, reply) => {
    const sessions = await prisma.session.findMany({
      where: { userId: request.user!.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
    });
    return reply.send({ success: true, message: 'Oturumlar', data: sessions });
  });

  app.delete('/api/users/me/sessions/:id', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    await prisma.session.updateMany({
      where: { id, userId: request.user!.id },
      data: { revokedAt: new Date() },
    });
    return reply.send({ success: true, message: 'Oturum sonlandırıldı', data: null });
  });

  app.delete('/api/users/me/sessions', { preHandler: guard }, async (request, reply) => {
    await prisma.session.updateMany({
      where: { userId: request.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await auditFromRequest(request, 'ADMIN_ACTION', { userId: request.user!.id, metadata: { action: 'revoke_all_sessions' } });
    return reply.send({ success: true, message: 'Tüm oturumlar sonlandırıldı', data: null });
  });

  // ─── Stats ───
  app.get('/api/users/me/stats', { preHandler: guard }, async (request, reply) => {
    const uid = request.user!.id;
    const [
      activeServices,
      totalOrders,
      pendingOrders,
      openTickets,
      wallet,
      spent,
    ] = await Promise.all([
      prisma.service.count({ where: { userId: uid, status: 'ACTIVE', deletedAt: null } }),
      prisma.order.count({ where: { userId: uid } }),
      prisma.order.count({ where: { userId: uid, status: 'PENDING' } }),
      prisma.ticket.count({ where: { userId: uid, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] } } }),
      prisma.wallet.findUnique({ where: { userId: uid } }),
      prisma.order.aggregate({ where: { userId: uid }, _sum: { total: true } }),
    ]);
    return reply.send({
      success: true,
      message: 'İstatistikler',
      data: {
        activeServices,
        totalOrders,
        pendingOrders,
        openTickets,
        accountBalance: Number(wallet?.balance ?? 0),
        totalSpent: Number(spent._sum?.total ?? 0),
      },
    });
  });
}