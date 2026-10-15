import type { FastifyInstance } from 'fastify';
import { prisma } from '@novapanel/db';
import { z } from 'zod';
import { permission } from '../../utils/guards.ts';
import { auditFromRequest } from '../../utils/audit.ts';
import { AppError } from '../../utils/errors.ts';
import { publishLive } from '../../services/live.service.ts';
import { generateOpaqueToken } from '../../services/tokens.ts';

const uuid = z.string().uuid();
const corr = (request: { headers: Record<string, unknown> }) => (request.headers['x-correlation-id'] as string) ?? undefined;

export function adminSecurityRoutes(app: FastifyInstance) {
  // ─── Password reset (requires read+write) ───
  app.post('/api/admin/users/:id/password-reset', { preHandler: permission(app, 'users.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z
      .object({ newPassword: z.string().min(10).max(100).optional(), mode: z.enum(['SET', 'GENERATE']).default('SET'), invalidateSessions: z.boolean().default(true) })
      .parse(request.body);
    const { hashPassword } = await import('../auth/auth.service.ts');
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppError('NOT_FOUND', 'Üye bulunamadı', 404);
    let temp: string | null = null;
    let hash: string;
    if (body.mode === 'GENERATE') {
      temp = generateOpaqueToken().slice(0, 20);
      hash = await hashPassword(temp, app.env);
    } else {
      if (!body.newPassword) throw new AppError('VALIDATION', 'newPassword veya mode=GENERATE gerekli', 400);
      hash = await hashPassword(body.newPassword, app.env);
    }
    await prisma.user.update({ where: { id }, data: { passwordHash: hash, lockedUntil: null, failedLoginCount: 0 } });
    let sessionsRevoked = 0;
    if (body.invalidateSessions && id !== request.user!.id) {
      sessionsRevoked = (await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })).count;
    }
    await auditFromRequest(request, 'PASSWORD_CHANGED', { userId: id, target: 'User', targetId: id, metadata: { byAdmin: true, invalidated: sessionsRevoked }, correlationId: corr(request) });
    publishLive({ type: 'SECURITY_ALERT', actor: request.user!.id, target: id, message: `Admin password reset for ${user.username}; ${sessionsRevoked} session(s) revoked` });
    return reply.send({
      success: true,
      message: 'Şifre değiştirildi',
      data: { passwordChanged: true, invalidatedSessions: sessionsRevoked, temporaryPassword: temp },
    });
  });

  // ─── Sessions: current for self list ───
  app.get('/api/admin/sessions/mine', { preHandler: app.requireAdmin }, async (request, reply) => {
    const rows = await prisma.session.findMany({ where: { userId: request.user!.id }, orderBy: { createdAt: 'desc' } });
    return reply.send({
      success: true,
      message: 'Kendi oturumların',
      data: rows.map((s) => ({
        id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt,
        expiresAt: s.expiresAt, revoked: !!s.revokedAt,
        current: !!request.auth?.sessionId && s.tokenFamily === request.auth.sessionId,
      })),
    });
  });

  app.post('/api/admin/sessions/revoke-others', { preHandler: app.requireAdmin }, async (request, reply) => {
    const count = (await prisma.session.updateMany({ where: { userId: request.user!.id, revokedAt: null, NOT: { tokenFamily: request.auth?.sessionId ?? undefined } }, data: { revokedAt: new Date() } })).count;
    await auditFromRequest(request, 'SESSION_REVOKED', { target: 'Session', metadata: { scope: 'self-others', count }, correlationId: corr(request) });
    return reply.send({ success: true, message: 'Kendi diğer oturumların kapatıldı', data: { count } });
  });

  // ─── Roles & Permissions ───
  app.get('/api/admin/rbac/roles', { preHandler: permission(app, 'roles.read') }, async (_request, reply) => {
    const [roles, permissions] = await Promise.all([
      prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { name: 'asc' } }),
      prisma.permission.findMany({ orderBy: { key: 'asc' } }),
    ]);
    return reply.send({
      success: true,
      message: 'Roller',
      data: {
        permissions: permissions.map((p) => ({ id: p.id, key: p.key, description: p.description })),
        roles: roles.map((r) => ({
          id: r.id, name: r.name, description: r.description, builtin: true, usersCount: r._count.users,
          permissions: r.permissions.map((rp) => rp.permission.key),
        })),
      },
    });
  });

  app.post('/api/admin/rbac/roles', { preHandler: permission(app, 'roles.write') }, async (request, reply) => {
    const body = z.object({ key: z.string().regex(/^[A-Z][A-Z0-9_]{2,40}$/), name: z.string().trim().min(2).max(80), description: z.string().trim().max(200).optional(), permissionKeys: z.array(z.string()).max(200).default([]) }).parse(request.body);
    if (await prisma.role.findUnique({ where: { name: body.key as never } })) throw new AppError('DUP_ROLE', 'Bu rol anahtarı mevcut', 409);
    const perms = await prisma.permission.findMany({ where: { key: { in: body.permissionKeys } } });
    const role = await prisma.role.create({
      data: { name: body.key as never, description: body.description ?? null, permissions: { createMany: { data: perms.map((p) => ({ permissionId: p.id })) } } },
    });
    await auditFromRequest(request, 'ROLE_CREATED', { target: 'Role', targetId: role.id, metadata: { key: body.key }, correlationId: corr(request) });
    return reply.status(201).send({ success: true, message: 'Rol oluşturuldu (kopyala ile başlanmalı)', data: role });
  });

  app.put('/api/admin/roles/:id/permissions', { preHandler: permission(app, 'roles.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ permissionKeys: z.array(z.string()).min(0).max(200) }).parse(request.body);
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw new AppError('NOT_FOUND', 'Rol yok', 404);
    if (role.name === 'SUPER_ADMIN' || role.name === 'USER') throw new AppError('LOCKED', 'Çekirdek rollerin izinleri değiştirilemez', 400);
    const perms = await prisma.permission.findMany({ where: { key: { in: body.permissionKeys } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })) });
    await auditFromRequest(request, 'PERMISSION_ASSIGNED', { target: 'Role', targetId: id, metadata: { count: perms.length }, correlationId: corr(request) });
    return reply.send({ success: true, message: 'İzinler güncellendi', data: { count: perms.length } });
  });

  // ─── Ticket management (admin console) ───
  const ticketFilters = z.object({
    status: z.string().optional(), priority: z.string().optional(), category: z.string().optional(),
    assignedToId: z.string().optional(), q: z.string().optional(), flag: z.enum(['breach', 'waiting', 'all']).default('all'),
    page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
  });

  app.get('/api/admin/tickets/manager', { preHandler: permission(app, 'tickets.read') }, async (request, reply) => {
    const q = ticketFilters.parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.category) where.category = q.category;
    if (q.assignedToId) where.assignedToId = q.assignedToId === 'me' ? request.user!.id : q.assignedToId;
    if (q.q) where.OR = [{ subject: { contains: q.q, mode: 'insensitive' } }, { user: { email: { contains: q.q, mode: 'insensitive' } } }, { user: { username: { contains: q.q, mode: 'insensitive' } } }];
    if (q.flag === 'breach') { where.slaDueAt = { lt: new Date() }; where.status = { in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] } as never; }
    if (q.flag === 'waiting') where.status = 'IN_PROGRESS';
    const [items, total, categories] = await Promise.all([
        prisma.ticket.findMany({
          where,
          include: {
            user: { select: { id: true, username: true, email: true, status: true } },
            assignedTo: { select: { id: true, username: true } },
            _count: { select: { messages: { where: { isInternal: false } } } },
          },
          orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
        }),
        prisma.ticket.count({ where }),
        prisma.ticketCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
      ]);
    const now = Date.now();
    return reply.send({
      success: true,
      message: 'Ticket merkezi',
      data: {
        categories,
        items: items.map((t) => ({
          id: t.id, subject: t.subject, status: t.status, priority: t.priority, category: t.category, tags: t.tags,
          username: t.user.username, email: t.user.email, memberStatus: t.user.status,
          assignedTo: t.assignedTo?.username ?? null, firstRepliedAt: t.firstReplyAt,
          lastUserReplyAt: t.lastMessageAt, waitingSince: t.waitingSince, slaDueAt: t.slaDueAt,
          slaRemainingMin: t.slaDueAt ? Math.round((t.slaDueAt.getTime() - now) / 60000) : null,
          unread: t._count.messages, openDate: t.createdAt,
        })),
        meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
      },
    });
  });

  app.patch('/api/admin/tickets/:id/assign', { preHandler: permission(app, 'tickets.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ assignTo: z.enum(['ME', 'TEAM', 'UNASSIGNED']).nullable().optional(), assignedToId: uuid.nullable().optional() }).parse(request.body);
    const actorId = request.user!.id;
    let assignedToId: string | null = body.assignedToId ?? null;
    if (body.assignTo === 'ME') assignedToId = actorId;
    if (body.assignTo === 'TEAM' || body.assignTo === 'UNASSIGNED') assignedToId = null;
    const isTeam = body.assignTo === 'TEAM';
    const ticket = await prisma.ticket.update({ where: { id }, data: { assignedToId, status: isTeam ? 'IN_PROGRESS' : undefined } });
    await prisma.ticketEvent.create({ data: { ticketId: id, actorId, kind: 'ASSIGN', toValue: body.assignTo ?? 'MANUAL', note: '' } });
    await auditFromRequest(request, 'TICKET_UPDATED', { target: 'Ticket', targetId: id, metadata: { assign: body.assignTo ?? 'manual' }, correlationId: corr(request) });
    publishLive({ type: 'ADMIN_ACTION', actor: actorId, target: id, message: `Ticket ${ticket.subject} → ${body.assignTo ?? 'assigned'}` });
    return reply.send({ success: true, message: 'Atama yapıldı', data: ticket });
  });

  const prioritySchema = z.object({ priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']) });
  const statusSchema = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED']), resolutionReason: z.string().max(300).optional() });

  app.patch('/api/admin/tickets/:id/priority', { preHandler: permission(app, 'tickets.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = prioritySchema.parse(request.body);
    const before = await prisma.ticket.findUnique({ where: { id }, select: { priority: true } });
    const ticket = await prisma.ticket.update({ where: { id }, data: { priority: body.priority, slaDueAt: slaFor(body.priority) } });
    await prisma.ticketEvent.create({ data: { ticketId: id, actorId: request.user!.id, kind: 'PRIORITY', fromValue: before?.priority, toValue: body.priority } });
    await auditFromRequest(request, 'TICKET_UPDATED', { target: 'Ticket', targetId: id, metadata: { priority: body.priority }, correlationId: corr(request) });
    publishLive({ type: 'ADMIN_ACTION', actor: request.user!.id, target: id, message: `Priority of ${ticket.subject} → ${body.priority}` });
    return reply.send({ success: true, message: 'Öncelik güncellendi', data: { slaDueAt: ticket.slaDueAt } });
  });

  app.patch('/api/admin/tickets/:id/status', { preHandler: permission(app, 'tickets.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = statusSchema.parse(request.body);
    const before = await prisma.ticket.findUnique({ where: { id }, select: { status: true } });
    if (before?.status === body.status) throw new AppError('NO_CHANGE', 'Aynı durum', 400);
    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        status: body.status,
        closedAt: body.status === 'CLOSED' ? new Date() : body.status === 'OPEN' ? null : undefined,
        waitingSince: body.status === 'IN_PROGRESS' ? new Date() : body.status === 'WAITING_USER' || body.status === 'RESOLVED' ? null : undefined,
        resolutionReason: body.resolutionReason ?? undefined,
      },
    });
    await prisma.ticketEvent.create({ data: { ticketId: id, actorId: request.user!.id, kind: 'STATUS', fromValue: before?.status, toValue: body.status, note: body.resolutionReason ?? '' } });
    await auditFromRequest(request, 'TICKET_STATUS_CHANGED', { target: 'Ticket', targetId: id, metadata: { status: body.status }, correlationId: corr(request) });
    publishLive({ type: 'ADMIN_ACTION', actor: request.user!.id, target: id, message: `Status of ${ticket.subject} → ${body.status}` });
    return reply.send({ success: true, message: 'Durum güncellendi', data: { waitingSince: ticket.waitingSince, resolutionReason: ticket.resolutionReason } });
  });

  app.post('/api/admin/tickets/:id/move', { preHandler: permission(app, 'tickets.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ category: z.string().min(2).max(80), note: z.string().max(300).optional() }).parse(request.body);
    const ticket = await prisma.ticket.update({ where: { id }, data: { category: body.category } });
    await prisma.ticketEvent.create({ data: { ticketId: id, actorId: request.user!.id, kind: 'MOVE', toValue: body.category, note: body.note ?? '' } });
    await auditFromRequest(request, 'TICKET_UPDATED', { target: 'Ticket', targetId: id, metadata: { category: body.category }, correlationId: corr(request) });
    return reply.send({ success: true, message: 'Kategori taşındı', data: ticket });
  });

  app.post('/api/admin/tickets/:id/merge', { preHandler: permission(app, 'tickets.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ intoTicketId: uuid }).parse(request.body);
    if (id === body.intoTicketId) throw new AppError('SELF_MERGE', 'Kendi kendine birleştirilemez', 400);
    const target = await prisma.ticket.findUnique({ where: { id: body.intoTicketId } });
    if (!target) throw new AppError('NOT_FOUND', 'Hedef ticket yok', 404);
    const src = await prisma.ticket.findUnique({ where: { id } });
    if (!src) throw new AppError('NOT_FOUND', 'Ticket yok', 404);
    await prisma.ticketMessage.updateMany({ where: { ticketId: id }, data: { ticketId: body.intoTicketId } });
    await prisma.ticket.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date(), mergedIntoId: body.intoTicketId, resolutionReason: `Merged into #${target.id.slice(0, 8)}` } });
    await prisma.ticketEvent.create({ data: { ticketId: body.intoTicketId, actorId: request.user!.id, kind: 'MERGE', fromValue: id, note: `Merged ${src.subject}` } });
    await auditFromRequest(request, 'TICKET_UPDATED', { target: 'Ticket', targetId: id, metadata: { mergedInto: body.intoTicketId }, correlationId: corr(request) });
    return reply.send({ success: true, message: 'Birleştirildi', data: { thread: body.intoTicketId } });
  });

  app.patch('/api/admin/tickets/:id/tags', { preHandler: permission(app, 'tickets.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ tags: z.array(z.string().trim().min(1).max(30)).max(15) }).parse(request.body);
    const ticket = await prisma.ticket.update({ where: { id }, data: { tags: body.tags } });
    await prisma.ticketEvent.create({ data: { ticketId: id, actorId: request.user!.id, kind: 'TAGS', toValue: body.tags.join(','), note: '' } });
    return reply.send({ success: true, message: 'Etiketler güncellendi', data: { tags: ticket.tags } });
  });

  app.get('/api/admin/tickets/:id/timeline', { preHandler: permission(app, 'tickets.read') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        events: { include: { actor: { select: { id: true, username: true } } }, orderBy: { createdAt: 'asc' } },
        messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, username: true, role: { select: { name: true } } } } } },
      },
    });
    if (!ticket) throw new AppError('NOT_FOUND', 'Ticket yok', 404);
    type Item = { kind: 'NOTE'; note: string; authorId: string; createdAt: Date; username: string; isInternal: boolean } | { kind: string; createdAt: Date; actorId: string | null; fromValue: string | null; toValue: string | null; note: string | null; username: string | null };
    const notes: Item[] = ticket.messages
      .filter((m) => m.isInternal)
      .map((m) => ({ kind: 'NOTE' as const, note: m.body, authorId: m.senderId, createdAt: m.createdAt, username: m.sender.username, isInternal: true }));
    const merged: Item[] = [...ticket.events.map((e) => ({ kind: e.kind, createdAt: e.createdAt, actorId: e.actorId, fromValue: e.fromValue, toValue: e.toValue, note: e.note, username: e.actor?.username ?? null })), ...notes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstReply = ticket.messages.find((m) => !m.isInternal && m.sender.role.name !== 'USER')?.createdAt ?? ticket.firstReplyAt;
    return reply.send({
      success: true,
      message: 'Zaman çizgisi',
      data: {
        mergedTimeline: merged,
        firstRepliedAt: firstReply,
        waitingSince: ticket.waitingSince,
        slaRemainingMin: ticket.slaDueAt ? Math.round((ticket.slaDueAt.getTime() - Date.now()) / 60000) : null,
        tags: ticket.tags,
        resolutionReason: ticket.resolutionReason,
      },
    });
  });

  app.post('/api/admin/quick-replies', { preHandler: permission(app, 'tickets.write') }, async (request, reply) => {
    const body = z.object({ title: z.string().min(2).max(80), body: z.string().min(5).max(5000) }).parse(request.body);
    const qr = await prisma.quickReply.create({ data: { ...body, createdById: request.user!.id } });
    return reply.status(201).send({ success: true, message: 'Hızlı yanıt', data: qr });
  });

  function slaFor(p: string) {
    const mins = p === 'URGENT' ? 60 : p === 'HIGH' ? 240 : p === 'NORMAL' ? 1440 : 4320;
    return new Date(Date.now() + mins * 60000);
  }

  // ─── Audit logs ───
  const auditQuery = z.object({
    actor: z.string().optional(), userId: z.string().optional(), action: z.string().optional(),
    from: z.coerce.date().optional(), to: z.coerce.date().optional(), q: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
  });

  app.get('/api/admin/audit-logs', { preHandler: permission(app, 'audit.read') }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const q = auditQuery.parse(request.query);
    const where = buildAuditWhere(q, request.user!.id, request.user!.role);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, username: true, role: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.auditLog.count({ where: await buildAuditWhere(q, request.user!.id, request.user!.role) }),
    ]);
    return reply.send({
      success: true,
      message: 'Denetim kayıtları',
      data: {
        items: items.map((l) => ({ id: l.id, ts: l.createdAt, actorId: l.actorId ?? null, actorName: l.actor?.username ?? 'System', actorRole: l.actor?.role ?? null, action: l.action, ip: l.ip, userAgent: l.userAgent, target: l.target, targetId: l.targetId, before: null, after: null, result: ((l.metadata as Record<string, unknown> | null)?.result as string) ?? 'SUCCESS', correlationId: l.metadata ? ((l.metadata as Record<string, unknown>).correlationId as string) ?? null : null, severity: severityOf(l.action), metadata: l.metadata })),
        meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit), immutableRange: items.length > 0 ? undefined : null },
      },
    });
  });

  app.get('/api/admin/audit-logs/:id', { preHandler: permission(app, 'audit.read') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const log = await prisma.auditLog.findUnique({ where: { id }, include: { actor: { select: { id: true, username: true, email: true, role: true } } } });
    if (!log) throw new AppError('NOT_FOUND', 'Kayıt yok', 404);
    if (log.actor?.role?.name !== 'SUPER_ADMIN' && request.user!.role !== 'SUPER_ADMIN' && log.actorId !== request.user!.id) {
      // staff can see all; nothing hidden
    }
    return reply.send({ success: true, message: 'Denetim detayı', data: log });
  });

  app.get('/api/admin/audit-logs/export', { preHandler: permission(app, 'export.run') }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const q = auditQuery.parse(Object.assign({}, request.query, { limit: '100' }));
    const fmt = (request.query as { format?: string }).format === 'json' ? 'json' : 'csv';
    let cursor: string | undefined;
    const all: Awaited<ReturnType<typeof prisma.auditLog.findMany>> = [];
    do {
      const where = buildAuditWhere(q, request.user!.id, request.user!.role);
      if (cursor) (where as Record<string, unknown>).id = { lt: cursor };
      const batch = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, cursor: cursor ? { id: cursor } : undefined, skip: cursor ? 1 : 0 });
      if (batch.length === 0) break;
      all.push(...batch);
      cursor = batch[batch.length - 1]!.id;
      if (all.length > 100_000) break;
    } while (cursor);
    await auditFromRequest(request, 'EXPORT_RAN', { target: 'AuditLog', metadata: { rows: all.length, format: fmt }, correlationId: corr(request) });
    if (fmt === 'json') {
      reply.header('Content-Type', 'application/json');
      return reply.send({ rows: all });
    }
    const header = 'ts,action,actor,ip,target,targetId,correlationId';
    const rows = all.map((l) => [l.createdAt.toISOString(), l.action, l.actorId ?? '', l.ip ?? '', l.target ?? '', l.targetId ?? '', (l.metadata ? ((l.metadata as Record<string, unknown>)?.correlationId as string) ?? '' : '')].join(','));
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.csv"`);
    return reply.send([header, ...rows].join('\n'));
  });

  function buildAuditWhere(q: z.infer<typeof auditQuery>, actorId: string, role: string) {
    const where: Record<string, unknown> = {};
    if (q.action) where.action = { contains: q.action.toUpperCase(), mode: 'insensitive' };
    if (q.userId) where.userId = q.userId;
    if (q.actor) where.actorId = q.actor === 'me' ? actorId : q.actor;
    if (role !== 'SUPER_ADMIN') where.actorId = actorId;
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) };
    if (q.q) where.OR = [{ target: { contains: q.q, mode: 'insensitive' } }, { targetId: { contains: q.q, mode: 'insensitive' } }, { ip: { contains: q.q, mode: 'insensitive' } }];
    return where;
  }
  function severityOf(action: string) {
    if (action.includes('LOCK') || action.includes('BANN') || action.includes('DENIED') || action.includes('FAILED') || action.includes('ADMIN_')) return 'HIGH';
    if (action.includes('REVOK') || action.includes('DELET') || action.includes('PASSWORD') || action.includes('ROLE') || action.includes('ACCESS')) return 'MEDIUM';
    return 'LOW';
  }
}
