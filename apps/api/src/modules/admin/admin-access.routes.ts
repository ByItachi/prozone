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
const corr = (request: { headers: Record<string, unknown> }) => (request.headers['x-correlation-id'] as string) ?? undefined;

function md5(v: string) {
  return createHash('md5').update(v.trim().toLowerCase(), 'utf8').digest('hex');
}
function newSecret(prefix: string) {
  const raw = `${prefix}_${generateOpaqueToken().slice(0, 24)}`;
  return { raw, hash: hashToken(raw), prefix };
}

export function adminAccessRoutes(app: FastifyInstance) {
  // ─── Access Links ───
  app.get('/api/admin/access/links', { preHandler: permission(app, 'access.read') }, async (_request, reply) => {
    const links = await prisma.accessLink.findMany({
      include: { _count: { select: { assignments: true } }, createdBy: { select: { username: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    return reply.send({ success: true, message: 'Erişim linkleri', data: links.map((l) => ({ ...l, assignedUsers: l._count.assignments })) });
  });

  app.post('/api/admin/access/links', { preHandler: permission(app, 'access.write') }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(120),
        url: z.string().trim().url().max(500),
        kind: z.enum(['CLEARNET', 'ONION', 'OTHER']).default('CLEARNET'),
        description: z.string().trim().max(500).optional().nullable(),
        priority: z.number().int().min(0).max(9999).default(100),
        validFrom: z.coerce.date().optional().nullable(),
        validUntil: z.coerce.date().optional().nullable(),
        userIds: z.array(uuid).max(100).default([]),
      })
      .parse(request.body);
    if (body.kind === 'ONION' && !body.url.endsWith('.onion')) throw new AppError('BAD_LINK', 'Onion linki .onion ile bitmelidir', 400);
    if (body.validFrom && body.validUntil && body.validUntil < body.validFrom) throw new AppError('BAD_RANGE', 'Bitiş, başlangıçtan önce olamaz', 400);
    if (await prisma.accessLink.findUnique({ where: { url: body.url } })) throw new AppError('DUP_LINK', 'Bu link zaten kayıtlı', 409);
    const link = await prisma.accessLink.create({
      data: {
        name: body.name, url: body.url, kind: body.kind, description: body.description ?? null,
        priority: body.priority, validFrom: body.validFrom ?? null, validUntil: body.validUntil ?? null,
        createdById: request.user!.id,
        assignments: { createMany: { data: [...new Set(body.userIds)].map((userId) => ({ userId, createdById: request.user!.id })), skipDuplicates: true } },
      },
    });
    await auditFromRequest(request, 'ACCESS_LINK_CREATED', { target: 'AccessLink', targetId: link.id, metadata: { url: link.url, users: body.userIds.length }, correlationId: corr(request) });
    publishLive({ type: 'ADMIN_ACTION', actor: request.user!.id, message: `Access link created: ${link.name} (assigned to ${body.userIds.length})`, correlationId: corr(request) });
    return reply.status(201).send({ success: true, message: 'Link oluşturuldu', data: link });
  });

  app.patch('/api/admin/access/links/:id', { preHandler: permission(app, 'access.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        active: z.boolean().optional(),
        priority: z.number().int().min(0).max(9999).optional(),
        validFrom: z.coerce.date().nullable().optional(),
        validUntil: z.coerce.date().nullable().optional(),
      })
      .parse(request.body);
    const link = await prisma.accessLink.update({ where: { id }, data: body });
    await auditFromRequest(request, 'ACCESS_LINK_RESTORED', { target: 'AccessLink', targetId: id, metadata: body, correlationId: corr(request) });
    return reply.send({ success: true, message: 'Link güncellendi', data: link });
  });

  app.post('/api/admin/access/links/:id/revoke', { preHandler: permission(app, 'access.revoke') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ userIds: z.array(uuid).max(500).optional() }).parse(request.body ?? {});
    if (!body.userIds || body.userIds.length === 0) {
      await prisma.accessLink.update({ where: { id }, data: { active: false, revokedAt: new Date(), revokedById: request.user!.id } });
      await auditFromRequest(request, 'ACCESS_LINK_REVOKED', { target: 'AccessLink', targetId: id, metadata: { scope: 'global' }, correlationId: corr(request) });
      publishLive({ type: 'ADMIN_ACTION', actor: request.user!.id, message: `Access link disabled: ${id}`, correlationId: corr(request) });
      return reply.send({ success: true, message: 'Tüm üyelere kapatıldı', data: { scope: 'global' } });
    }
    await prisma.userAccessAssignment.deleteMany({ where: { linkId: id, userId: { in: body.userIds } } });
    await auditFromRequest(request, 'ACCESS_ASSIGNMENT_REVOKED', { target: 'AccessLink', targetId: id, metadata: { users: body.userIds }, correlationId: corr(request) });
    publishLive({ type: 'ADMIN_ACTION', actor: request.user!.id, message: `Access removed for ${body.userIds.length} user(s) on link ${id}`, correlationId: corr(request) });
    return reply.send({ success: true, message: 'Kullanıcı erişimleri kapatıldı', data: { scope: 'users' } });
  });

  // ─── Assignments ───
  app.get('/api/admin/access/assignments', { preHandler: permission(app, 'access.read') }, async (request, reply) => {
    const q = z.object({ userId: uuid.optional(), linkId: uuid.optional(), search: z.string().optional() }).parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.userId) where.userId = q.userId;
    if (q.linkId) where.linkId = q.linkId;
    if (q.search) where.user = { OR: [{ username: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] };
    const rows = await prisma.userAccessAssignment.findMany({
      where,
      include: { link: true, user: { select: { id: true, username: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return reply.send({
      success: true,
      message: 'Erişim ödemleri',
      data: rows.map((r) => ({
        assignmentId: r.id, linkId: r.link.id, url: r.link.url, name: r.link.name, kind: r.link.kind,
        active: r.link.active, status: r.link.active && r.link.revokedAt === null ? 'GRANTED' : 'DISABLED',
        validUntil: r.link.validUntil, user: r.user, assignedAt: r.createdAt,
      })),
    });
  });
}

export function adminTokenRoutes(app: FastifyInstance) {
  // ─── Access Tokens ───
  app.get('/api/admin/access/tokens', { preHandler: permission(app, 'access.read') }, async (_request, reply) => {
    const tokens = await prisma.accessToken.findMany({
      include: { user: { select: { id: true, username: true } }, revokedBy: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return reply.send({
      success: true,
      message: 'Erişim tokenları',
      data: tokens.map((t) => ({
        id: t.id, name: t.name, prefix: t.prefix, scope: t.scope,
        status: t.revokedAt ? 'REVOKED' : t.expiresAt && t.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE',
        uses: t.uses, maxUses: t.maxUses, lastUsedAt: t.lastUsedAt, lastFailureAt: t.lastFailureAt, failureCount: t.failureCount,
        expiresAt: t.expiresAt, createdAt: t.createdAt, username: t.user.username, revokedBy: t.revokedBy?.username ?? null,
      })),
    });
  });

  app.post('/api/admin/access/tokens', { preHandler: permission(app, 'access.write') }, async (request, reply) => {
    const body = z
      .object({
        userId: uuid,
        name: z.string().trim().min(2).max(120),
        scope: z.enum(['USER', 'ADMIN']).default('USER'),
        maxUses: z.number().int().min(1).max(100000).nullable().optional(),
        expiresAt: z.coerce.date().nullable().optional(),
      })
      .parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) return reply.status(400).send({ success: false, message: 'Üye gerekli', error: { type: 'VALIDATION' } });
    if (body.expiresAt && body.expiresAt < new Date()) return reply.status(400).send({ success: false, message: 'Bitiş gelecekte olmalı', error: { type: 'VALIDATION' } });
    const secret = newSecret(body.scope === 'ADMIN' ? 'padmin' : 'puser');
    const token = await prisma.accessToken.create({
      data: {
        userId: body.userId, name: body.name, scope: body.scope, tokenHash: secret.hash, prefix: token_prefix(secret.prefix),
        maxUses: body.maxUses ?? null, expiresAt: body.expiresAt ?? null, createdById: request.user!.id,
      },
    });
    await auditFromRequest(request, 'ACCESS_TOKEN_CREATED', { target: 'AccessToken', targetId: token.id, metadata: { userId: body.userId, scope: body.scope }, correlationId: corr(request) });
    publishLive({ type: 'ADMIN_ACTION', actor: request.user!.id, target: body.userId, message: `API token created for ${user.username}`, correlationId: corr(request) });
    return reply.status(201).send({ success: true, message: 'Token oluşturuldu — tek sefer gösterilir', data: { id: token.id, token: secret.raw, prefix: token.prefix } });
  });

  app.post('/api/admin/access/tokens/:id/rotate', { preHandler: permission(app, 'access.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const t = await prisma.accessToken.findUnique({ where: { id } });
    if (!t) throw new AppError('NOT_FOUND', 'Token bulunamadı', 404);
    const secret = newSecret(t.scope === 'ADMIN' ? 'padmin' : 'puser');
    await prisma.accessToken.update({ where: { id }, data: { revokedAt: new Date(), revokedById: request.user!.id } });
    const fresh = await prisma.accessToken.create({
      data: { userId: t.userId, name: t.name, scope: t.scope, tokenHash: secret.hash, prefix: token_prefix(secret.prefix), maxUses: t.maxUses, expiresAt: t.expiresAt, createdById: request.user!.id },
    });
    await auditFromRequest(request, 'ACCESS_TOKEN_ROTATED', { target: 'AccessToken', targetId: fresh.id, correlationId: corr(request) });
    return reply.status(201).send({ success: true, message: 'Token döndürüldü', data: { id: fresh.id, token: secret.raw } });
  });

  app.post('/api/admin/access/tokens/:id/revoke', { preHandler: permission(app, 'access.revoke') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    await prisma.accessToken.update({ where: { id }, data: { revokedAt: new Date(), revokedById: request.user!.id } });
    await auditFromRequest(request, 'ACCESS_TOKEN_REVOKED', { target: 'AccessToken', targetId: id, correlationId: corr(request) });
    return reply.send({ success: true, message: 'Token iptal edildi', data: null });
  });
}

function token_prefix(raw: string) {
  const parts = raw.split('_');
  return parts.length > 1 ? parts[0] + '_' + (parts[1] ?? '').slice(0, 3) : raw.slice(0, 8);
}

export function adminCodeRoutes(app: FastifyInstance) {
  // ─── Access Codes ───
  app.get('/api/admin/access/codes', { preHandler: permission(app, 'access.read') }, async (_request, reply) => {
    const codes = await prisma.accessCode.findMany({
      include: { user: { select: { id: true, username: true, email: true } }, createdBy: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return reply.send({
      success: true,
      message: 'Erişim kodları',
      data: codes.map((c) => ({
        id: c.id, prefix: c.prefix, scope: c.scope, singleUse: c.singleUse, maxUses: c.maxUses, uses: c.uses,
        status: c.revokedAt ? 'REVOKED' : c.usedAt ? 'USED' : c.expiresAt && c.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE',
        user: c.user, expiresAt: c.expiresAt ?? null, usedAt: c.usedAt ?? null, createdAt: c.createdAt, createdBy: c.createdBy?.username ?? null,
      })),
    });
  });

  app.post('/api/admin/access/codes', { preHandler: permission(app, 'access.write') }, async (request, reply) => {
    const body = z
      .object({
        scope: z.string().trim().min(2).max(120),
        userId: uuid.nullable().optional(),
        singleUse: z.boolean().default(true),
        maxUses: z.number().int().min(1).max(10000).default(1),
        expiresAt: z.coerce.date().nullable().optional(),
      })
      .parse(request.body);
    if (body.userId) {
      const exists = await prisma.user.findUnique({ where: { id: body.userId } });
      if (!exists) throw new AppError('VALIDATION', 'Üye bulunamadı', 400);
    }
    if (body.expiresAt && body.expiresAt < new Date()) throw new AppError('VALIDATION', 'Bitiş zamanı gelecekte olmalı', 400);
    const secret = newSecret('ACC');
    const code = await prisma.accessCode.create({
      data: {
        codeHash: secret.hash, prefix: secret.prefix.slice(0, 10), scope: body.scope, userId: body.userId ?? null,
        singleUse: body.singleUse, maxUses: body.singleUse ? 1 : body.maxUses, expiresAt: body.expiresAt ?? null, createdById: request.user!.id,
      },
    });
    await auditFromRequest(request, 'ACCESS_CODE_CREATED', { target: 'AccessCode', targetId: code.id, metadata: { scope: body.scope, singleUse: body.singleUse }, correlationId: corr(request) });
    return reply.status(201).send({ success: true, message: 'Kod oluşturuldu — tek sefer gösterilir', data: { id: code.id, code: secret.raw } });
  });

  app.post('/api/admin/access/codes/:id/revoke', { preHandler: permission(app, 'access.revoke') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    await prisma.accessCode.update({ where: { id }, data: { revokedAt: new Date() } });
    await auditFromRequest(request, 'ACCESS_CODE_REVOKED', { target: 'AccessCode', targetId: id, correlationId: corr(request) });
    return reply.send({ success: true, message: 'Kod iptal edildi', data: null });
  });
}

export function adminMd5Routes(app: FastifyInstance) {
  // ─── MD5 lookup ───
  app.get('/api/admin/md5/suggest', { preHandler: permission(app, 'md5.read') }, async (request, reply) => {
    const type = (request.query as { type?: string }).type ?? 'EMAIL';
    const q = (request.query as { q?: string }).q ?? '';
    const values = await prisma.md5Record.findMany({ where: { source: { contains: type, mode: 'insensitive' }, valueMd5: md5(q) }, select: { valueMd5: true, note: true }, take: 5 });
    return reply.send({ success: true, message: 'Kayıtlı hashler', data: values });
  });

  app.post('/api/admin/md5/lookup', { preHandler: permission(app, 'md5.read') }, async (request, reply) => {
    const body = z.object({ email: z.string().optional(), username: z.string().optional(), phone: z.string().optional() }).parse(request.body);
    const provided = [body.email, body.username, body.phone].filter((v) => v && v.trim().length > 0);
    if (provided.length === 0) return reply.status(400).send({ success: false, message: 'En az bir alan girin (email/username/phone)', data: { FOUND: false, HASH: null, MATCHED: null } });
    const value = body.email ?? body.username ?? body.phone!;
    const source = body.email ? 'EMAIL' : body.username ? 'USERNAME' : 'PHONE';
    const hash = md5(value);
    const match = await prisma.md5Record.findFirst({ where: { valueMd5: hash }, orderBy: { createdAt: 'desc' } });
    await auditFromRequest(request, 'MD5_LOOKUP', { target: 'Md5Record', metadata: { source, hashFound: !!match, correlationId: corr(request) } });
    return reply.send({
      success: true,
      message: match ? 'Hash kayıtlı' : 'Hash bulunamadı',
      data: { FOUND: !!match, HASH: hash, MATCHED: match ? { createdAt: match.createdAt, source: match.source, note: match.note } : null, note: match?.note ?? null },
    });
  });

  app.post('/api/admin/md5/import', { preHandler: permission(app, 'md5.write') }, async (request, reply) => {
    const body = z.object({ mode: z.enum(['REPLACE', 'APPEND', 'KEEP_BEST']).default('APPEND'), items: z.array(z.object({ value: z.string().min(4), source: z.enum(['EMAIL', 'USERNAME', 'PHONE']), note: z.string().max(300).optional() })).max(1000) }).parse(request.body);
    const hashes = [...new Set(body.items.map((i) => md5(i.value)))];
    if (body.mode === 'REPLACE') await prisma.md5Record.deleteMany({});
    let inserted = 0;
    for (const h of hashes) {
      const exists = await prisma.md5Record.findFirst({ where: { valueMd5: h } });
      if (exists && body.mode === 'KEEP_BEST') continue;
      const src = body.items.find((i) => md5(i.value) === h);
      await prisma.md5Record.create({ data: { valueMd5: h, source: src?.source ?? 'IMPORT', note: src?.note ?? null } });
      inserted += 1;
    }
    await auditFromRequest(request, 'MD5_IMPORT', { target: 'Md5Record', metadata: { mode: body.mode, total: body.items.length, inserted }, correlationId: corr(request) });
    return reply.send({ success: true, message: 'İçe aktarım tamam', data: { mode: body.mode, total: body.items.length, inserted, duplicatesSkipped: body.items.length - inserted } });
  });
}
