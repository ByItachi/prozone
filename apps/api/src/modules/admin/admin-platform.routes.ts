import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@novapanel/db';
import { z } from 'zod';
import { permission } from '../../utils/guards.ts';
import { auditFromRequest } from '../../utils/audit.ts';
import { AppError } from '../../utils/errors.ts';
import { hashToken, generateOpaqueToken } from '../../services/tokens.ts';
import { publishLive } from '../../services/live.service.ts';

const uuid = z.string().uuid();

function md5(v: string) {
  return createHash('md5').update(v.trim().toLowerCase(), 'utf8').digest('hex');
}

export function adminPlatformRoutes(app: FastifyInstance) {

  // ─── User administration ───
  app.post('/api/admin/users', { preHandler: permission(app, 'users.write') }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(60),
        surname: z.string().trim().min(2).max(60),
        username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_]+$/, 'Alfanümerik kullanıcı adı'),
        email: z.string().email(),
        password: z.string().min(8).max(80),
        phone: z.string().trim().optional().nullable(),
        role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'USER']).default('USER'),
        status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING', 'BANNED']).default('ACTIVE'),
        emailVerified: z.boolean().default(false),
      })
      .parse(request.body);
    if (await prisma.user.findFirst({ where: { OR: [{ email: body.email }, { username: body.username }], deletedAt: null } })) {
      throw new AppError('DUP_EMAIL', 'E-posta veya kullanıcı adı zaten kullanımda', 409);
    }
    const { hashPassword } = await import('../auth/auth.service.ts');
    const role = await prisma.role.findUnique({ where: { name: body.role } });
    const user = await prisma.user.create({
      data: {
        name: body.name,
        surname: body.surname,
        username: body.username,
        email: body.email,
        passwordHash: await hashPassword(body.password, app.env),
        phone: body.phone ?? null,
        roleId: role?.id,
        status: body.status,
        emailVerified: body.emailVerified,
        wallet: { create: { balance: 0, currency: 'USD' } },
      },
    });
    await auditFromRequest(request, 'ADMIN_CREATED', { userId: user.id, target: 'User', targetId: user.id, metadata: { role: body.role } });
    publishLive({ type: 'SYSTEM_EVENT', actor: request.user!.id, target: user.id, message: `Admin-created account: ${user.username}` });
    return reply.status(201).send({ success: true, message: 'Üye oluşturuldu', data: { id: user.id } });
  });

  app.patch('/api/admin/users/:id/status', { preHandler: permission(app, 'users.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING', 'BANNED']) }).parse(request.body);
    const user = await prisma.user.update({ where: { id }, data: { status: body.status } });
    if (body.status === 'SUSPENDED' || body.status === 'BANNED') {
      const sessions = await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      publishLive({
        type: 'SECURITY_ALERT',
        outcome: 'REVOKED',
        actor: request.user!.id,
        target: id,
        message: `${body.status === 'BANNED' ? 'Ban' : 'Suspension'} applied to ${user.username}; ${sessions.count} session(s) revoked`,
      });
    }
    await auditFromRequest(request, body.status === 'BANNED' ? 'USER_BANNED' : body.status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_UPDATED', {
      userId: id,
      target: 'User',
      targetId: id,
    });
    return reply.send({ success: true, message: 'Durum güncellendi', data: { id, status: user.status } });
  });

  app.delete('/api/admin/users/:id', { preHandler: permission(app, 'users.delete') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    if (id === request.user!.id) throw new AppError('SELF_DELETE', 'Kendi hesabınızı silemezsiniz', 400);
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'BANNED' } });
    await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await auditFromRequest(request, 'USER_UPDATED', { userId: id, target: 'User', targetId: id, metadata: { deleted: true } });
    return reply.send({ success: true, message: 'Üye silindi (soft)', data: null });
  });

  app.get('/api/admin/users/:id/activity', { preHandler: permission(app, 'users.read') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const [user, loginAttempts, sessions, orders, services, ticketCount, auditLogs, traffic, wallet] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        include: { role: { select: { name: true } }, twoFactor: true, accessAssignments: { include: { link: true } }, accessCodeFor: true, adminNotesReceived: { include: { author: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, take: 50 } },
      }),
      prisma.loginAttempt.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 25 } ),
      prisma.session.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 25 }),
      prisma.order.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 25, include: { items: true } }),
      prisma.service.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 25 }),
      prisma.ticket.count({ where: { userId: id } }),
      prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.trafficEvent.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.wallet.findUnique({ where: { userId: id }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 25 } } }),
    ]);
    if (!user) throw new AppError('NOT_FOUND', 'Üye bulunamadı', 404);
    return reply.send({
      success: true,
      message: 'Üye aktivite merkezi',
      data: {
        profile: {
          id: user.id, name: user.name, surname: user.surname, username: user.username, email: user.email,
          phone: user.phone, status: user.status, role: user.role.name, lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt, emailVerified: user.emailVerified, twoFactorEnabled: user.twoFactor?.enabled ?? false,
          balance: Number(wallet?.balance ?? 0),
        },
        loginAttempts: loginAttempts.map((l) => ({ id: l.id, success: l.success, reason: l.reason, ip: l.ip, userAgent: l.userAgent, createdAt: l.createdAt })),
        sessions: sessions.map((s) => ({ id: s.id, current: false, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, expiresAt: s.expiresAt, revoked: !!s.revokedAt })),
        orders: orders.map((o) => ({ id: o.id, kind: o.items.some((i) => /license|panel/i.test(i.name)) ? 'LICENSE' : 'SERVICE', total: Number(o.total), status: o.status, createdAt: o.createdAt })),
        services: services.map((s) => ({ id: s.id, name: s.name, startDate: s.startedAt, endDate: s.expiresAt, price: Number(s.price), status: s.status })),
        tickets: ticketCount,
        auditLogs,
        traffic: traffic.map((t) => ({ id: t.id, kind: t.kind, country: t.country, reliability: t.reliability, ipMasked: t.ipMasked, at: t.createdAt })),
        walletTransactions: (wallet?.transactions ?? []).map((w) => ({ id: w.id, amount: Number(w.amount), type: w.type, description: w.description, createdAt: w.createdAt })),
        access: { links: user.accessAssignments.map((a) => ({ linkId: a.link.id, name: a.link.name, url: a.link.url, active: a.link.active })), codes: user.accessCodeFor.map((c) => ({ prefix: c.prefix, scope: c.scope, usedAt: c.usedAt })) },
        notes: user.adminNotesReceived,
      },
    });
  });

  // ─── Sessions ───
  app.get('/api/admin/sessions', { preHandler: permission(app, 'sessions.read') }, async (request, reply) => {
    const q = z.object({ userId: uuid.optional(), scope: z.enum(['ALL', 'ACTIVE', 'STALE', 'EXPIRED', 'REVOKED']).default('ACTIVE') }).parse(request.query);
    const now = new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const where: Record<string, unknown> = {};
    if (q.userId) where.userId = q.userId;
    if (q.scope === 'ACTIVE') where.revokedAt = null;
    else if (q.scope === 'STALE') where.AND = [{ revokedAt: null }, { OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: thirtyDaysAgo } }] }];
    else if (q.scope === 'EXPIRED') where.expiresAt = { lt: now };
    else if (q.scope === 'REVOKED') where.revokedAt = { not: null };
    const sessions = await prisma.session.findMany({ where, include: { user: { select: { id: true, username: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    return reply.send({
      success: true,
      message: 'Oturumlar',
      data: sessions.map((s) => {
        const staleDays = s.lastUsedAt ? Math.floor((Date.now() - s.lastUsedAt.getTime()) / 86400000) : null;
        const reason = s.revokedAt ? 'REVOKED' : s.expiresAt < now ? 'EXPIRED' : staleDays !== null && staleDays > 30 ? 'STALE_30D' : 'ACTIVE';
        return {
          id: s.id, userId: s.userId, username: s.user.username, email: s.user.email, ip: s.ip, userAgent: s.userAgent,
          createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, expiresAt: s.expiresAt, staleDays, currentReason: reason,
          note: reason === 'STALE_30D' ? `Last used ${staleDays} days ago` : undefined,
        };
      }),
    });
  });

  app.post('/api/admin/sessions/revoke', { preHandler: permission(app, 'sessions.revoke') }, async (request, reply) => {
    const body = z.object({ userIds: z.array(uuid).max(500).default([]), olderThanDays: z.number().int().min(0).max(3650).optional() }).parse(request.body);
    if (body.userIds.includes(request.user!.id)) throw new AppError('SELF_REVOKED', 'Kendi oturum hedeflerinizi toplu kapatamazsınız.', 400);
    const now = new Date();
    let count = 0;
    if (body.olderThanDays !== undefined && body.userIds.length === 0) {
      const cutoff = new Date(Date.now() - body.olderThanDays * 86400000);
      count = (
        await prisma.session.updateMany({ where: { userId: request.user!.id, revokedAt: null, lastUsedAt: { lt: cutoff } }, data: { revokedAt: now } })
      ).count;
      return reply.send({ success: true, message: 'Oturumlar kapatıldı', data: { sessionsClosed: count, targetedUsers: 0, remainingAdmin: true } });
    }
    for (const uid of body.userIds) {
      const r = await prisma.session.updateMany({ where: { userId: uid, revokedAt: null }, data: { revokedAt: now } });
      count += r.count;
    }
    await auditFromRequest(request, 'SESSION_REVOKED', { target: 'Session', metadata: { users: body.userIds.length, olderThanDays: body.olderThanDays ?? null, closed: count } });
    publishLive({ type: 'ADMIN_ACTION', actor: request.user!.id, message: `Revoked ${count} session(s) for ${body.userIds.length} user(s)` });
    return reply.send({ success: true, message: 'Oturumlar kapatıldı', data: { sessionsClosed: count, targetedUsers: body.userIds.length, remainingAdmin: true } });
  });
}
