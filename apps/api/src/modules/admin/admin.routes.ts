import { prisma } from '@novapanel/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { admin, permission } from '../../utils/guards.ts';
import { auditFromRequest } from '../../utils/audit.ts';
import { AppError } from '../../utils/errors.ts';
import { walletService } from '../wallet/wallet.service.ts';
import { createNotification } from '../../services/notification.service.ts';
import { notifyTicketReply } from '../tickets/tickets.routes.ts';
import { hashPassword } from '../auth/auth.service.ts';
import { generateOpaqueToken } from '../../services/tokens.ts';

export function adminRoutes(app: FastifyInstance) {
  const guard = admin(app);

  // ─── Dashboard stats ───
  app.get('/api/admin/stats', { preHandler: guard }, async (request, reply) => {
    const days = Number(z.object({ days: z.coerce.number().int().min(1).max(730).default(30) }).parse(request.query).days);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers, revenue, orders, activeServices, openTickets, failedPayments, walletSum] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.payment.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amount: true } }),
      prisma.order.count(),
      prisma.service.count({ where: { status: 'ACTIVE' } }),
      prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.payment.count({ where: { status: 'FAILED' } }),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
    ]);

    const paid = await prisma.payment.findMany({
      where: { status: 'SUCCEEDED', paidAt: { gte: since } },
      select: { amount: true, paidAt: true, currency: true },
    });
    const byDay = new Map<string, number>();
    for (const p of paid) {
      const key = (p.paidAt ?? new Date()).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(p.amount));
    }
    const revenueChart = [...byDay.entries()].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));

    const newUsers = await prisma.user.groupBy({ by: ['createdAt'], where: { createdAt: { gte: since } }, _count: { _all: true } });
    const newUsersChart = newUsers
      .map((u) => u.createdAt.toISOString().slice(0, 10))
      .reduce<Record<string, number>>((acc, date) => {
        acc[date] = (acc[date] ?? 0) + 1;
        return acc;
      }, {});

    return reply.send({
      success: true,
      message: 'İstatistikler',
      data: {
        summary: {
          totalUsers,
          activeUsers,
          revenue: Number(revenue._sum.amount ?? 0),
          orders,
          activeServices,
          openTickets,
          failedPayments,
          totalBalance: Number(walletSum._sum.balance ?? 0),
        },
        charts: {
          revenue: revenueChart,
          newUsers: Object.entries(newUsersChart).map(([date, amount]) => ({ date, amount })),
          period: days,
        },
      },
    });
  });

  // ─── Users ───
  app.get('/api/admin/users', { preHandler: permission(app, 'users.read') }, async (request, reply) => {
    const q = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      search: z.string().optional(),
      status: z.string().optional(),
      role: z.string().optional(),
    }).parse(request.query);
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' as const } },
        { surname: { contains: q.search, mode: 'insensitive' as const } },
        { email: { contains: q.search, mode: 'insensitive' as const } },
        { username: { contains: q.search, mode: 'insensitive' as const } },
      ];
    }
    if (q.status) where.status = q.status;
    if (q.role) where.role = { name: q.role };
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { role: true, wallet: true, _count: { select: { orders: true, services: true, tickets: true } } },
        orderBy: { createdAt: 'desc' as const },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.user.count({ where }),
    ]);
    const data = items.map((u) => ({
      id: u.id, name: u.name, surname: u.surname, username: u.username, email: u.email,
      emailVerified: u.emailVerified, phone: u.phone, status: u.status, role: u.role.name,
      balance: Number(u.wallet?.balance ?? 0),
      lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
      orderCount: u._count.orders, serviceCount: u._count.services, ticketCount: u._count.tickets,
      twoFactorEnabled: u.twoFactorEnabled,
    }));
    return reply.send({ success: true, message: 'Kullanıcılar', data: { items: data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  app.get('/api/admin/users/:id', { preHandler: permission(app, 'users.read') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!user) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    return reply.send({ success: true, message: 'Kullanıcı', data: user });
  });

  const adminUpdateUserSchema = z.object({
    name: z.string().trim().min(2).max(60).optional(),
    surname: z.string().trim().min(2).max(60).optional(),
    phone: z.string().trim().optional().nullable(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING']).optional(),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'USER']).optional(),
    emailVerified: z.boolean().optional(),
  });

  app.patch('/api/admin/users/:id', { preHandler: permission(app, 'users.write') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const body = adminUpdateUserSchema.parse(request.body);
    if (body.status) {
      const auditAction = body.status === 'SUSPENDED' ? 'USER_SUSPENDED' : body.status === 'BANNED' ? 'USER_BANNED' : 'USER_UPDATED';
      await auditFromRequest(request, auditAction, { userId: id, target: 'User', targetId: id, metadata: { status: body.status } });
      if (body.status === 'SUSPENDED' || body.status === 'BANNED') {
        await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    }
    const roleId = body.role ? (await prisma.role.findUnique({ where: { name: body.role } }))?.id : undefined;
    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: body.name, surname: body.surname,
        phone: body.phone === undefined ? undefined : body.phone,
        status: body.status, roleId, emailVerified: body.emailVerified,
      },
    });
    await auditFromRequest(request, 'USER_UPDATED', { userId: id, target: 'User', targetId: id });
    return reply.send({ success: true, message: 'Kullanıcı güncellendi', data: { id: updated.id } });
  });

  app.post('/api/admin/users/:id/wallet', { preHandler: permission(app, 'wallets.adjust') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const body = z.object({ amount: z.number().min(-100000).max(100000), reason: z.string().trim().min(3).max(300), type: z.enum(['ADJUSTMENT', 'REFUND']).default('ADJUSTMENT') }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı', 404);

    let result;
    if (body.amount >= 0) {
      result = await walletService.credit(id, body.amount, `Admin ${body.type}: ${body.reason}`, { transactionType: body.type });
    } else {
      result = await walletService.debit(id, Math.abs(body.amount), `Admin ${body.type}: ${body.reason}`, { transactionType: body.type });
    }
    await createNotification({
      userId: id,
      type: 'WALLET',
      title: 'Bakiye güncellendi',
      body: `Hesabınıza ${body.amount >= 0 ? '+' : ''}${body.amount.toFixed(2)} birim bakiye işlendi. ${body.reason}`,
      link: '/dashboard/payments',
    });
    await auditFromRequest(request, 'WALLET_ADJUSTED', { userId: id, target: 'User', targetId: id, metadata: { amount: body.amount, reason: body.reason } });
    return reply.send({ success: true, message: 'Bakiye güncellendi', data: { balanceAfter: result.balanceAfter } });
  });

  // password-reset artık admin-security.routes.ts içinde (yeni şifre + geçici şifre modları)

  app.post('/api/admin/users/:id/2fa-reset', { preHandler: permission(app, 'users.write') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    await prisma.twoFactor.deleteMany({ where: { userId: id } });
    await prisma.user.update({ where: { id }, data: { twoFactorEnabled: false, twoFactorVerifiedAt: null } });
    await auditFromRequest(request, 'TWO_FA_DISABLED', { userId: id, target: 'User', targetId: id });
    return reply.send({ success: true, message: '2FA sıfırlandı', data: null });
  });

  // ─── Orders ───
  app.get('/api/admin/orders', { preHandler: permission(app, 'orders.read') }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.string().optional(), search: z.string().optional() }).parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.search) where.OR = [
      { orderNumber: { contains: q.search, mode: 'insensitive' as const } },
      { user: { OR: [{ email: { contains: q.search, mode: 'insensitive' as const } }, { username: { contains: q.search, mode: 'insensitive' as const } }] } },
    ];
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, include: { user: { select: { id: true, email: true, username: true } }, items: true }, orderBy: { createdAt: 'desc' as const }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.order.count({ where }),
    ]);
    const data = items.map((o) => ({ ...o, subtotal: Number(o.subtotal), discount: Number(o.discount), total: Number(o.total) }));
    return reply.send({ success: true, message: 'Siparişler', data: { items: data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  app.get('/api/admin/orders/:id', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const order = await prisma.order.findUnique({ where: { id }, include: { user: true, items: { include: { product: true } }, payments: true, invoice: { include: { items: true } }, services: true } });
    if (!order) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı', 404);
    const data = { ...order, subtotal: Number(order.subtotal), discount: Number(order.discount), total: Number(order.total) };
    return reply.send({ success: true, message: 'Sipariş', data });
  });

  // ─── Payments ───
  app.get('/api/admin/payments', { preHandler: permission(app, 'payments.read') }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.string().optional(), provider: z.string().optional() }).parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.provider) where.provider = q.provider;
    const [items, total] = await Promise.all([
      prisma.payment.findMany({ where, include: { user: { select: { id: true, email: true, username: true } }, order: { select: { orderNumber: true } } }, orderBy: { createdAt: 'desc' as const }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.payment.count({ where }),
    ]);
    const data = items.map((p) => ({ ...p, amount: Number(p.amount) }));
    return reply.send({ success: true, message: 'Ödemeler', data: { items: data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  app.post('/api/admin/payments/:id/refund', { preHandler: permission(app, 'payments.refund') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new AppError('NOT_FOUND', 'Ödeme bulunamadı', 404);
    if (payment.status !== 'SUCCEEDED') throw new AppError('INVALID_STATUS', 'Yalnızca başarılı ödemeler iade edilebilir', 400);

    if (payment.provider === 'wallet') {
      await walletService.credit(payment.userId, Number(payment.amount), `Admin iadesi`, { transactionType: 'REFUND', referenceType: 'payment', referenceId: payment.id, paymentId: payment.id });
    }
    await prisma.payment.update({ where: { id }, data: { status: 'REFUNDED', refundedAt: new Date() } });
    if (payment.orderId) {
      await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'REFUNDED' } });
      const orderServices = await prisma.service.findMany({ where: { orderId: payment.orderId } });
      for (const s of orderServices) {
        await prisma.service.update({ where: { id: s.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      }
    }
    await auditFromRequest(request, 'REFUND_CREATED', { userId: payment.userId, target: 'Payment', targetId: id, metadata: { amount: Number(payment.amount) } });
    return reply.send({ success: true, message: 'İade yapıldı', data: null });
  });

  // ─── Services ───
  app.get('/api/admin/services', { preHandler: guard }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.string().optional() }).parse(request.query);
    const where = q.status ? { status: q.status as never } : {};
    const [items, total] = await Promise.all([
      prisma.service.findMany({ where, include: { user: { select: { id: true, email: true, username: true } }, product: { select: { slug: true } } }, orderBy: { createdAt: 'desc' as const }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.service.count({ where }),
    ]);
    return reply.send({ success: true, message: 'Servisler', data: { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  app.post('/api/admin/services/:id/status', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const body = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', 'PENDING']) }).parse(request.body);
    const svc = await prisma.service.findUnique({ where: { id } });
    if (!svc) throw new AppError('NOT_FOUND', 'Servis bulunamadı', 404);
    const updated = await prisma.service.update({
      where: { id },
      data: { status: body.status, cancelledAt: body.status === 'CANCELLED' ? new Date() : undefined, startedAt: body.status === 'ACTIVE' ? (svc.startedAt ?? new Date()) : undefined },
    });
    await createNotification({
      userId: svc.userId,
      type: body.status === 'SUSPENDED' ? 'SERVICE_SUSPENDED' : 'SERVICE_ACTIVATED',
      title: 'Servis durumu güncellendi',
      body: `${svc.name} servisinizin durumu ${body.status} olarak güncellendi.`,
      link: `/dashboard/services/${id}`,
    });
    await auditFromRequest(request, 'ADMIN_ACTION', { userId: svc.userId, target: 'Service', targetId: id, metadata: { status: body.status } });
    return reply.send({ success: true, message: 'Servis güncellendi', data: updated });
  });

  // ─── Tickets ───
  app.get('/api/admin/tickets', { preHandler: permission(app, 'tickets.read') }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.string().optional(), priority: z.string().optional() }).parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({ where, include: { user: { select: { id: true, email: true, username: true } }, assignedTo: { select: { id: true, username: true } }, _count: { select: { messages: true } } }, orderBy: { updatedAt: 'desc' as const }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.ticket.count({ where }),
    ]);
    return reply.send({ success: true, message: 'Talepler', data: { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  app.get('/api/admin/tickets/:id', { preHandler: permission(app, 'tickets.read') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, surname: true, email: true, username: true, phone: true } },
        assignedTo: { select: { id: true, name: true, username: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, name: true, surname: true, username: true, role: { select: { name: true } } } } } },
      },
    });
    if (!ticket) throw new AppError('NOT_FOUND', 'Talep bulunamadı', 404);
    return reply.send({ success: true, message: 'Talep', data: ticket });
  });

  app.patch('/api/admin/tickets/:id', { preHandler: permission(app, 'tickets.write') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const body = z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED']).optional(),
      priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
      assignedToId: z.string().uuid().nullable().optional(),
    }).parse(request.body);
    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        status: body.status,
        priority: body.priority,
        assignedToId: body.assignedToId === undefined ? undefined : body.assignedToId,
        closedAt: body.status === 'CLOSED' ? new Date() : body.status === 'OPEN' ? null : undefined,
      },
    });
    await auditFromRequest(request, 'TICKET_STATUS_CHANGED', { target: 'Ticket', targetId: id, metadata: body });
    return reply.send({ success: true, message: 'Talep güncellendi', data: updated });
  });

  app.post('/api/admin/tickets/:id/reply', { preHandler: permission(app, 'tickets.write') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const body = z.object({ message: z.string().trim().min(1).max(10000), isInternal: z.boolean().default(false) }).parse(request.body);
    const message = await prisma.ticketMessage.create({
      data: { ticketId: id, senderId: request.user!.id, body: body.message, isInternal: body.isInternal },
    });
    const updated = await prisma.ticket.update({ where: { id }, data: { status: 'WAITING_USER', lastMessageAt: new Date() } });
    if (!body.isInternal) {
      await notifyTicketReply(app, id, body.message.slice(0, 200));
    }
    await auditFromRequest(request, 'TICKET_STATUS_CHANGED', { target: 'Ticket', targetId: id, metadata: { reply: true, internal: body.isInternal } });
    return reply.send({ success: true, message: 'Yanıt gönderildi', data: { message, ticket: updated } });
  });

  // ─── Coupons ───
  const couponSchema = z.object({
    code: z.string().trim().min(3).max(30).regex(/^[A-Z0-9-]+$/),
    discountPercent: z.number().min(0).max(100).default(0),
    discountAmount: z.number().min(0).default(0),
    maxUses: z.number().int().min(1).default(1),
    expiresAt: z.string().datetime().optional(),
    active: z.boolean().default(true),
  });

  app.get('/api/admin/coupons', { preHandler: permission(app, 'coupons.read') }, async (_request, reply) => {
    const items = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    const data = items.map((c) => ({ ...c, discountPercent: Number(c.discountPercent), discountAmount: Number(c.discountAmount) }));
    return reply.send({ success: true, message: 'Kuponlar', data: data });
  });

  app.post('/api/admin/coupons', { preHandler: permission(app, 'coupons.write') }, async (request, reply) => {
    const body = couponSchema.parse(request.body);
    const coupon = await prisma.coupon.create({
      data: {
        code: body.code.toUpperCase(),
        discountPercent: body.discountPercent,
        discountAmount: body.discountAmount,
        maxUses: body.maxUses,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        active: body.active,
      },
    });
    await auditFromRequest(request, 'PRODUCT_CREATED', { target: 'Coupon', targetId: coupon.id });
    return reply.code(201).send({ success: true, message: 'Kupon oluşturuldu', data: coupon });
  });

  app.delete('/api/admin/coupons/:id', { preHandler: permission(app, 'coupons.write') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    await prisma.coupon.delete({ where: { id } });
    return reply.send({ success: true, message: 'Kupon silindi', data: null });
  });

  // ─── Announcements ───
  const announcementSchema = z.object({
    title: z.string().trim().min(3).max(150),
    content: z.string().trim().min(3).max(10000),
    type: z.enum(['INFO', 'WARNING', 'MAINTENANCE', 'UPDATE', 'PROMO']).default('INFO'),
    active: z.boolean().default(true),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
  });

  app.get('/api/admin/announcements', { preHandler: permission(app, 'announcements.write') }, async (_request, reply) => {
    const items = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, include: { createdBy: { select: { id: true, username: true } } } });
    return reply.send({ success: true, message: 'Duyurular', data: items });
  });

  app.post('/api/admin/announcements', { preHandler: permission(app, 'announcements.write') }, async (request, reply) => {
    const body = announcementSchema.parse(request.body);
    const announcement = await prisma.announcement.create({
      data: { ...body, createdById: request.user!.id },
    });
    const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: 'ANNOUNCEMENT' as const,
        title: body.title,
        body: body.content.slice(0, 200),
        link: '/dashboard/notifications',
      })),
    });
    await auditFromRequest(request, 'ADMIN_ACTION', { target: 'Announcement', targetId: announcement.id });
    return reply.code(201).send({ success: true, message: 'Duyuru yayınlandı', data: announcement });
  });

  // ─── Settings ───
  app.get('/api/admin/settings', { preHandler: guard }, async (_request, reply) => {
    const settings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    const data = Object.fromEntries(settings.map((s) => [s.key, s.type === 'boolean' ? s.value === 'true' : s.type === 'number' ? Number(s.value) : s.value]));
    return reply.send({ success: true, message: 'Ayarlar', data });
  });

  app.get('/api/public/settings', async (_request, reply) => {
    const settings = await prisma.systemSetting.findMany({ where: { isPublic: true } });
    const data = Object.fromEntries(settings.map((s) => [s.key, s.type === 'boolean' ? s.value === 'true' : s.type === 'number' ? Number(s.value) : s.value]));
    return reply.send({ success: true, message: 'Ayarlar', data });
  });

  app.put('/api/admin/settings', { preHandler: permission(app, 'settings.write') }, async (request, reply) => {
    const body = z.object({
      name: z.string().max(100).optional(),
      currency: z.string().max(3).optional(),
      maintenance: z.boolean().optional(),
      registrationEnabled: z.boolean().optional(),
      minDeposit: z.number().optional(),
    }).parse(request.body);
    const updates: Record<string, { value: string; type: string }> = {};
    if (body.name !== undefined) updates['site.name'] = { value: body.name, type: 'string' };
    if (body.currency !== undefined) updates['site.currency'] = { value: body.currency, type: 'string' };
    if (body.maintenance !== undefined) updates['site.maintenance'] = { value: String(body.maintenance), type: 'boolean' };
    if (body.registrationEnabled !== undefined) updates['registration.enabled'] = { value: String(body.registrationEnabled), type: 'boolean' };
    if (body.minDeposit !== undefined) updates['payments.min_deposit'] = { value: String(body.minDeposit), type: 'number' };
    for (const [key, val] of Object.entries(updates)) {
      await prisma.systemSetting.upsert({ where: { key }, update: { value: val.value }, create: { key, value: val.value, type: val.type } });
    }
    await auditFromRequest(request, 'SETTINGS_CHANGED', { metadata: { keys: Object.keys(updates) } });
    return reply.send({ success: true, message: 'Ayarlar güncellendi', data: null });
  });

  // ─── Audit logs ───
  app.get('/api/admin/logs', { preHandler: permission(app, 'logs.read') }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), action: z.string().optional() }).parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.action) where.action = q.action;
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { user: { select: { id: true, username: true, email: true } }, actor: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' as const }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.auditLog.count({ where }),
    ]);
    return reply.send({ success: true, message: 'Loglar', data: { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  // ─── RBAC role/permission viewer ───
  app.get('/api/admin/roles', { preHandler: guard }, async (_request, reply) => {
    const roles = await prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
    });
    const data = roles.map((r) => ({
      name: r.name,
      permissions: r.permissions.map((p) => p.permission.key),
    }));
    return reply.send({ success: true, message: 'Roller', data });
  });
}