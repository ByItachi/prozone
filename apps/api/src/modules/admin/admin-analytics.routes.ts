import type { FastifyInstance, FastifyReply } from 'fastify';
import { prisma } from '@novapanel/db';
import { z } from 'zod';
import { permission } from '../../utils/guards.ts';
import { auditFromRequest } from '../../utils/audit.ts';
import { AppError } from '../../utils/errors.ts';
import { publishLive, getRecentLive } from '../../services/live.service.ts';
import { sendTemplateEmail } from '../../services/email.service.ts';

const uuid = z.string().uuid();

function csvEscape(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function sendCsv(reply: FastifyReply, name: string, header: string[], rows: unknown[][]) {
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${name}-${Date.now()}.csv"`);
  return reply.send('\uFEFF' + [header.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n'));
}

export function adminAnalyticsRoutes(app: FastifyInstance) {
  // KPI + charts + live stream + countries (dashboard screen)
  app.get('/api/admin/overview', { preHandler: permission(app, 'dashboard.read') }, async (request, reply) => {
    const now = new Date();
    const d = (days: number) => new Date(now.getTime() - days * 86400000);
    const windowMin = Number((request.query as { min?: string }).min ?? 1440);
    const since = new Date(now.getTime() - windowMin * 60000);
    const [
      totalUsers, activeUsers, newUsers7d, revenue30, ordersCount, activeServices, openTickets,
      slaBreaches, avgFirstReply, trafficByKind, countries, recent, login24h, failed24h,
      sessionsTotal, sessionsStale, onlineNow, uptime,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.user.count({ where: { deletedAt: null, createdAt: { gte: d(7) } } }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'SUCCEEDED', createdAt: { gte: d(30) } } }),
      prisma.order.count(),
      prisma.service.count({ where: { status: 'ACTIVE' } }),
      prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] } } }),
      prisma.ticket.count({ where: { slaDueAt: { lt: now }, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] } } }),
      prisma.ticket.findMany({ where: { firstReplyAt: { not: null } }, select: { createdAt: true, firstReplyAt: true }, take: 200, orderBy: { createdAt: 'desc' } }),
      prisma.trafficEvent.groupBy({ by: ['kind'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.trafficEvent.groupBy({ by: ['country'], where: { createdAt: { gte: since }, country: { not: null } }, _count: { _all: true } }),
      getRecentLive(50),
      prisma.loginAttempt.count({ where: { success: true, createdAt: { gte: d(1) } } }),
      prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: d(1) } } }),
      prisma.session.count({ where: { revokedAt: null } }),
      prisma.session.count({ where: { revokedAt: null, lastUsedAt: { lt: new Date(now.getTime() - 30 * 86400000) } } }),
      prisma.session.count({ where: { revokedAt: null, lastUsedAt: { gte: d(1) } } }),
      process.uptime(),
    ]);
    const replies = avgFirstReply.filter((t) => t.firstReplyAt);
    const avgMin = replies.length
      ? Math.round(replies.reduce((s, t) => s + (t.firstReplyAt!.getTime() - t.createdAt.getTime()), 0) / replies.length / 60000)
      : null;
    // daily series (visits + orders + ticket counts) for charts
    const events = await prisma.trafficEvent.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, kind: true }, take: 5000, orderBy: { createdAt: 'asc' } });
    const series = new Map<string, { day: string; visits: number; errors: number }>();
    for (const e of events) {
      const key = e.createdAt.toISOString().slice(0, windowMin > 2880 ? 10 : 13);
      const cur = series.get(key) ?? { day: key, visits: 0, errors: 0 };
      cur.visits += 1;
      if (e.kind === 'API_ERROR' || e.kind === 'LOGIN_FAILED') cur.errors += 1;
      series.set(key, cur);
    }
    return reply.send({
      success: true,
      message: 'Yönetim özeti',
      data: {
        generatedAt: now.toISOString(),
        serverTime: now.toISOString(),
        lastSync: now.toISOString(),
        kpis: {
          totalUsers, activeUsers, newUsers7d,
          revenue30d: Number(revenue30._sum?.amount ?? 0),
          orders: ordersCount, activeServices, openTickets, slaBreaches,
          avgFirstReplyMin: avgMin, logins24h: login24h, failedLogins24h: failed24h,
          sessions: sessionsTotal, stale30d: sessionsStale, onlineNow,
          uptimeSeconds: Math.round(uptime),
        },
        trafficKinds: trafficByKind.map((t) => ({ kind: t.kind, count: t._count._all })),
        countries: countries.map((c) => ({ country: c.country as string, visits: c._count._all })),
        series: [...series.values()],
        recentEvents: recent,
      },
    });
  });

  app.get('/api/admin/live-stream', { preHandler: permission(app, 'dashboard.read') }, async (request, reply) => {
    const since = (request.query as { since?: string }).since;
    const rows = since ? getRecentLive(200).filter((e) => e.id > since) : getRecentLive(200);
    return reply.send({ success: true, message: 'Canlı akış', data: { events: rows, lastId: rows[0]?.id ?? since ?? null } });
  });
}

export function adminContentRoutes(app: FastifyInstance) {
  // System settings (branding/legal/general/security)
  app.get('/api/admin/settings/detail', { preHandler: permission(app, 'settings.read') }, async (request, reply) => {
    const group = (request.query as { group?: string }).group;
    const settingKeys: Record<string, string[]> = {
      GENERAL: ['SITE_NAME', 'SITE_SLOGAN', 'DEFAULT_CURRENCY', 'SUPPORT_EMAIL'],
      BRANDING: ['BRAND_PRIMARY', 'BRAND_ACCENT', 'BRAND_LOGO_URL', 'BRAND_DARK_MODE'],
      LEGAL: ['LEGAL_URL', 'PRIVACY_URL', 'TERMS_URL', 'LEGAL_DISCLAIMER'],
      ACCESS: ['ACCESS_LINK_STYLE', 'TOKEN_UI', 'LOGIN_HINT', 'ACCESS_HEADER_LABEL', 'ACCESS_ALLOWED_DOMAINS'],
      SECURITY: ['REGISTRATION', 'SESSION_TIMEOUT', 'MAX_LOGIN_ATTEMPTS', 'PASSWORD_POLICY', 'ADMIN_IP_ALLOWLIST', 'ADMIN_IP_DENYLIST'],
      MAIL: ['SMTP_HOST', 'SMTP_PORT', 'MAIL_FROM', 'EMAIL_VERIFICATION', 'RESEND_KEY_MASK', 'MASKED_KEYS'],
      NOTIFICATIONS: ['TG_BOT_TOKEN_MASK', 'TG_GROUP_1', 'TG_GROUP_2', 'TG_GROUP_3', 'TG_ALERT_CHANNEL'],
      PLUGINS: ['ACTIVE_PLUGINS', 'DISABLED_PLUGINS'],
      ADVANCED: ['CACHE_TTL', 'FEATURE_FLAGS', 'MAINTENANCE', 'CRON_INTERVALS', 'TELEMETRY'],
    };
    const keys = group ? settingKeys[group.toUpperCase()] : undefined;
    const rows = await prisma.systemSetting.findMany({ where: keys ? { key: { in: keys } } : undefined, orderBy: { key: 'asc' } });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return reply.send({ success: true, message: 'Ayarlar', data: { group: group ?? 'ALL', items: rows, map } });
  });

  const setSetting = z.object({ key: z.string().min(2).max(80), value: z.string().max(5000) });
  app.patch('/api/admin/settings', { preHandler: permission(app, 'settings.write') }, async (request, reply) => {
    const body = z.union([setSetting, z.array(setSetting).max(50)]).parse(request.body);
    const items = Array.isArray(body) ? body : [body];
    for (const it of items) {
      await prisma.systemSetting.upsert({ where: { key: it.key }, update: { value: it.value }, create: { key: it.key, value: it.value, type: 'STRING' } });
    }
    await Promise.all(items.map((it) => auditFromRequest(request, 'SETTINGS_CHANGED', { target: 'SystemSetting', targetId: it.key, metadata: { key: it.key } })));
    return reply.send({ success: true, message: `${items.length} ayar güncellendi`, data: null });
  });

  app.post('/api/admin/settings/smtp-test', { preHandler: permission(app, 'settings.write') }, async (request, reply) => {
    const body = z.object({ to: z.string().email() }).parse(request.body);
    try {
      await sendTemplateEmail(app, body.to, 'PASSWORD_RESET', { link: 'https://example.com/reset?token=test' });
      return reply.send({ success: true, message: 'SMTP test maili gönderildi', data: { delivered: true } });
    } catch {
      return reply.status(502).send({ success: false, message: 'SMTP test başarısız', data: { delivered: false } });
    }
  });

  app.post('/api/admin/settings/telegram-test', { preHandler: permission(app, 'settings.write') }, async (request, reply) => {
    const body = z.object({ chatId: z.string().min(1).max(60) }).parse(request.body);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    try {
      if (!token) throw new AppError('NOT_CONFIGURED', 'Bot token tanımlı değil', 400);
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: body.chatId, text: 'Prozone Telegram test mesajı ✔' }),
      });
      const j = (await r.json()) as { ok?: boolean; description?: string };
      if (!j.ok) return reply.status(400).send({ success: false, message: j.description ?? 'Telegram gönderim hatası' });
      return reply.send({ success: true, message: 'Telegram testi gönderildi' });
    } catch (e) {
      if (e instanceof AppError) throw e;
      return reply.status(502).send({ success: false, message: 'Telegram testi başarısız' });
    }
  });

  // ─── Pages / Help / Announcements / Email templates / Nav ───
  app.get('/api/admin/pages', { preHandler: permission(app, 'settings.read') }, async (_r, reply) => {
    const pages = await prisma.page.findMany({ orderBy: { navOrder: 'asc' } });
    return reply.send({ success: true, message: 'Sayfalar', data: { items: pages.map((p) => ({ id: p.id, navLabel: p.navLabel ?? p.title, title: p.title, slug: p.slug, status: p.status })) } });
  });
  app.get('/api/admin/pages/:slug', { preHandler: permission(app, 'settings.read') }, async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const page = await prisma.page.findUnique({ where: { slug } });
    if (!page) throw new AppError('NOT_FOUND', 'Sayfa yok', 404);
    return reply.send({ success: true, message: 'Sayfa', data: page });
  });
  app.patch('/api/admin/pages/:slug', { preHandler: permission(app, 'settings.write') }, async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const body = z.object({ title: z.string().min(2).max(200).optional(), content: z.string().max(200000).optional(), navLabel: z.string().max(80).nullable().optional(), navOrder: z.number().int().min(0).max(999).optional(), status: z.enum(['DRAFT', 'PUBLISHED']).optional() }).parse(request.body);
    const page = await prisma.page.upsert({ where: { slug }, update: body, create: { slug, title: body.title ?? slug, content: body.content ?? '', navLabel: body.navLabel, navOrder: body.navOrder, status: body.status, updatedBy: request.user!.id } });
    await auditFromRequest(request, 'PAGE_UPDATED', { target: 'Page', targetId: page.id, metadata: body });
    return reply.send({ success: true, message: 'Sayfa kaydedildi', data: page });
  });

  app.get('/api/admin/help', { preHandler: permission(app, 'settings.read') }, async (_r, reply) => {
    const items = await prisma.helpArticle.findMany({ orderBy: { updatedAt: 'desc' } });
    return reply.send({ success: true, message: 'Yardım makaleleri', data: { items } });
  });
  app.patch('/api/admin/help/:slug', { preHandler: permission(app, 'settings.write') }, async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const body = z.object({ title: z.string().min(2).max(200).optional(), body: z.string().max(100000).optional(), category: z.string().max(60).optional(), published: z.boolean().optional() }).parse(request.body);
    const article = await prisma.helpArticle.upsert({ where: { slug }, update: body, create: { slug, title: body.title ?? slug, body: body.body ?? '', category: body.category, published: body.published } });
    await auditFromRequest(request, 'HELP_UPDATED', { target: 'HelpArticle', targetId: article.id, metadata: body });
    return reply.send({ success: true, message: 'Makale kaydedildi', data: article });
  });

  app.get('/api/admin/email-templates', { preHandler: permission(app, 'templates.read') }, async (_r, reply) => {
    const items = await prisma.emailTemplate.findMany({ orderBy: { key: 'asc' } });
    return reply.send({ success: true, message: 'E-posta şablonları', data: { items } });
  });
  app.put('/api/admin/email-templates/:key', { preHandler: permission(app, 'templates.write') }, async (request, reply) => {
    const { key } = z.object({ key: z.string() }).parse(request.params);
    const body = z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(50000) }).parse(request.body);
    const t = await prisma.emailTemplate.upsert({ where: { key }, update: body, create: { key, ...body } });
    await auditFromRequest(request, 'EMAIL_TEMPLATE_UPDATED', { target: 'EmailTemplate', targetId: t.id, metadata: { key } });
    return reply.send({ success: true, message: 'Şablon kaydedildi', data: t });
  });

  app.get('/api/admin/announcements/inbox', { preHandler: permission(app, 'announcements.write') }, async (_r, reply) => {
    const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return reply.send({
      success: true,
      message: 'Duyurular',
      data: announcements.map((a) => ({ id: a.id, title: a.title, body: a.content, kind: a.type === 'POPUP' ? 'news' : a.type.toLowerCase(), active: a.active, startAt: a.publishedAt ?? a.createdAt, endAt: a.expiresAt, createdById: a.createdById, createdAt: a.createdAt })),
    });
  });
  app.post('/api/admin/announcements/publish', { preHandler: permission(app, 'announcements.write') }, async (request, reply) => {
    const body = z.object({ title: z.string().min(2).max(200), body: z.string().min(1).max(20000), kind: z.enum(['NEWS', 'POPUP', 'BANNER']).default('NEWS'), active: z.boolean().default(true), startAt: z.coerce.date().optional().nullable(), endAt: z.coerce.date().optional().nullable() }).parse(request.body);
    const a = await prisma.announcement.create({ data: { title: body.title, content: body.body, type: body.kind, active: body.active, publishedAt: body.active ? new Date() : body.startAt ?? null, expiresAt: body.endAt ?? null, createdById: request.user!.id } });
    await auditFromRequest(request, 'ANNOUNCEMENT_CREATED', { target: 'Announcement', targetId: a.id });
    publishLive({ type: 'ANNOUNCEMENT', actor: request.user!.id, message: `Announcement published: ${a.title}` });
    return reply.status(201).send({ success: true, message: 'Duyuru oluşturuldu', data: a });
  });
  app.delete('/api/admin/announcements/:id', { preHandler: permission(app, 'announcements.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    await prisma.announcement.delete({ where: { id } });
    await auditFromRequest(request, 'ANNOUNCEMENT_DELETED', { target: 'Announcement', targetId: id });
    return reply.send({ success: true, message: 'Silindi', data: null });
  });

  app.get('/api/content/pages/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const page = await prisma.page.findUnique({ where: { slug } });
    if (!page || page.status !== 'PUBLISHED') throw new AppError('NOT_FOUND', 'Sayfa yok', 404);
    return reply.send({ success: true, message: 'Sayfa', data: { title: page.title, content: page.content } });
  });

  // ─── Plugins / feature flags (from SystemSetting) ───
  app.get('/api/admin/plugins', { preHandler: permission(app, 'settings.read') }, async (_r, reply) => {
    const s = await prisma.systemSetting.findMany({ where: { key: { in: ['ACTIVE_PLUGINS', 'DISABLED_PLUGINS', 'FEATURE_FLAGS'] } } });
    const map = Object.fromEntries(s.map((x) => [x.key, x.value]));
    const active = (map.ACTIVE_PLUGINS ?? 'geo-traffic,live-pulse,md5-suite,ticket-sla,access-links').split(',').filter(Boolean);
    const disabled = (map.DISABLED_PLUGINS ?? '').split(',').filter(Boolean);
    const flags: Record<string, boolean> = JSON.parse(map.FEATURE_FLAGS ?? '{}') as Record<string, boolean>;
    const definitions = [
      { key: 'geo-traffic', name: 'Geo Traffic', version: '1.4.0', description: 'IP.country + mapanitor fallback, ülke bazlı trafik', required: true },
      { key: 'live-pulse', name: 'Live Pulse', version: '2.0.1', description: 'SSE canlı aktivite akışı', required: true },
      { key: 'md5-suite', name: 'MD5 Suite', version: '1.1.0', description: 'MD5 arama + içe aktarma', required: false },
      { key: 'ticket-sla', name: 'Ticket SLA', version: '1.2.3', description: 'SLA matrisi, ilk yanıt metrikleri', required: false },
      { key: 'access-links', name: 'Access Links', version: '3.0.0', description: 'Clearnet/onion erişim linkleri ve token doğrulama', required: true },
      { key: 'export-engine', name: 'Export Engine', version: '0.9.8', description: 'CSV/JSON dışa aktarımlar', required: false },
    ];
    return reply.send({
      success: true,
      message: 'Eklentiler',
      data: definitions.map((p) => ({
        key: p.key, name: p.name, version: p.version, description: p.description, required: p.required,
        active: active.includes(p.key) && !disabled.includes(p.key),
        featureFlag: flags[p.key] ?? active.includes(p.key),
      })),
    });
  });
  app.put('/api/admin/plugins', { preHandler: permission(app, 'settings.write') }, async (request, reply) => {
    const body = z.object({ active: z.array(z.string()).max(50), flags: z.record(z.boolean()).optional() }).parse(request.body);
    await prisma.systemSetting.upsert({ where: { key: 'ACTIVE_PLUGINS' }, update: { value: body.active.join(',') }, create: { key: 'ACTIVE_PLUGINS', value: body.active.join(','), type: 'STRING' } });
    if (body.flags) await prisma.systemSetting.upsert({ where: { key: 'FEATURE_FLAGS' }, update: { value: JSON.stringify(body.flags) }, create: { key: 'FEATURE_FLAGS', value: JSON.stringify(body.flags), type: 'JSON' } });
    await auditFromRequest(request, 'SETTINGS_CHANGED', { target: 'Plugins', metadata: { active: body.active } });
    return reply.send({ success: true, message: 'Eklenti ayarları kaydedildi', data: { savedAt: new Date().toISOString() } });
  });

  // ─── Reports: bulk exports ───
  const memberFilters = z.object({ search: z.string().optional(), status: z.string().optional(), role: z.string().optional(), createdFrom: z.coerce.date().optional(), createdTo: z.coerce.date().optional(), balanceMin: z.coerce.number().optional(), balanceMax: z.coerce.number().optional(), onlineOnly: z.coerce.boolean().optional() });

  function memberWhere(q: z.infer<typeof memberFilters>) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.role) where.role = { name: q.role } as never;
    if (q.createdFrom || q.createdTo) where.createdAt = { ...(q.createdFrom ? { gte: q.createdFrom } : {}), ...(q.createdTo ? { lte: q.createdTo } : {}) };
    if (q.onlineOnly) where.sessions = { some: { revokedAt: null, lastUsedAt: { gte: new Date(Date.now() - 86400000) } } };
    if (q.balanceMin !== undefined || q.balanceMax !== undefined) {
      where.wallet = {
        balance: {
          ...(q.balanceMin !== undefined ? { gte: String(q.balanceMin) } : {}),
          ...(q.balanceMax !== undefined ? { lte: String(q.balanceMax) } : {}),
        },
      };
    }
    if (q.search) where.OR = [{ username: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }, { surname: { contains: q.search, mode: 'insensitive' } }];
    return where;
  }

  app.get('/api/reports/members', { preHandler: permission(app, 'export.run') }, async (request, reply) => {
    const q = memberFilters.parse(request.query);
    const rows = await prisma.user.findMany({ where: memberWhere(q), include: { role: { select: { name: true } }, wallet: true, accessCodeFor: true, _count: { select: { orders: true, tickets: true, services: true } } }, orderBy: { createdAt: 'desc' }, take: 2000 });
    return reply.send({
      success: true,
      message: 'Üye raporu',
      data: rows.map((u) => ({ id: u.id, name: [u.name, u.surname].filter(Boolean).join(' '), username: u.username, email: u.email, role: u.role?.name ?? 'USER', status: u.status, hasAccess: ((u.accessCodeFor ?? []).length ?? 0) > 0 || u.status === 'ACTIVE', balance: Number(u.wallet?.balance ?? 0), orders: u._count.orders, tickets: u._count.tickets, services: u._count.services, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })),
    });
  });

  app.get('/api/reports/members/export', { preHandler: permission(app, 'export.run') }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const q = memberFilters.parse(request.query);
    const ids = (request.query as { ids?: string }).ids?.split(',').filter((s) => s) ?? [];
    const rows = await prisma.user.findMany({ where: { ...memberWhere(q), ...(ids.length ? { id: { in: ids } } : {}) }, include: { role: { select: { name: true } }, wallet: true }, orderBy: { createdAt: 'desc' }, take: 5000 });
    await auditFromRequest(request, 'EXPORT_RAN', { target: 'User', metadata: { rows: rows.length } });
    return sendCsv(reply, 'members', ['id', 'name', 'username', 'email', 'status', 'created', 'role', 'balance', 'lastLogin'], rows.map((u) => [u.id, [u.name, u.surname].filter(Boolean).join(' '), u.username ?? '', u.email, u.status, u.createdAt.toISOString(), u.role?.name ?? '', String(Number(u.wallet?.balance ?? 0)), u.lastLoginAt?.toISOString() ?? '']));
  });

  app.get('/api/reports/orders/export', { preHandler: permission(app, 'export.run') }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const q = z.object({ status: z.string().optional(), kind: z.enum(['SERVICE', 'LICENSE', 'ALL']).default('ALL'), createdFrom: z.coerce.date().optional(), createdTo: z.coerce.date().optional() }).parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.createdFrom || q.createdTo) where.createdAt = { ...(q.createdFrom ? { gte: q.createdFrom } : {}), ...(q.createdTo ? { lte: q.createdTo } : {}) };
    let rows = await prisma.order.findMany({ where, include: { user: { select: { username: true } }, items: { take: 1, select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5000 });
    if (q.kind !== 'ALL') rows = rows.filter((o) => (q.kind === 'LICENSE' ? /license|panel|erişim/i.test(o.items[0]?.name ?? '') : !/license|panel|erişim/i.test(o.items[0]?.name ?? '')));
    await auditFromRequest(request, 'EXPORT_RAN', { target: 'Order', metadata: { rows: rows.length, kind: q.kind } });
    return sendCsv(reply, 'orders', ['id', 'member', 'type', 'items', 'amount', 'created', 'status', 'reference'], rows.map((o) => [o.id, o.user.username, q.kind === 'ALL' ? (/\u006cicense|panel/i.test(o.items[0]?.name ?? '') ? 'LICENSE' : 'SERVICE') : q.kind, String(o.items.length), String(Number(o.total)), o.createdAt.toISOString(), o.status, o.orderNumber]));
  });

  app.get('/api/reports/services/export', { preHandler: permission(app, 'export.run') }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const q = z.object({ status: z.string().optional(), user: z.string().optional(), expiresFrom: z.coerce.date().optional(), expiresTo: z.coerce.date().optional() }).parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.user) where.userId = q.user;
    if (q.expiresFrom || q.expiresTo) where.expiresAt = { ...(q.expiresFrom ? { gte: q.expiresFrom } : {}), ...(q.expiresTo ? { lte: q.expiresTo } : {}) };
    const rows = await prisma.service.findMany({ where, include: { user: { select: { username: true } } }, orderBy: { createdAt: 'desc' }, take: 5000 });
    await auditFromRequest(request, 'EXPORT_RAN', { target: 'Service', metadata: { rows: rows.length } });
    return sendCsv(reply, 'services', ['id', 'username', 'name', 'startDate', 'endDate', 'price', 'status'], rows.map((s) => [s.id, s.user.username, s.name, s.startedAt?.toISOString() ?? s.createdAt.toISOString(), s.expiresAt?.toISOString() ?? '', String(Number(s.price)), s.status]));
  });

  app.get('/api/reports/tickets/export', { preHandler: permission(app, 'export.run') }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const q = z.object({ status: z.string().optional(), category: z.string().optional(), priority: z.string().optional(), createdFrom: z.coerce.date().optional(), createdTo: z.coerce.date().optional(), slaOnly: z.coerce.boolean().default(true) }).parse(request.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status; else if (q.slaOnly) where.status = { in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] };
    if (q.category) where.category = q.category;
    if (q.priority) where.priority = q.priority;
    if (q.createdFrom || q.createdTo) where.createdAt = { ...(q.createdFrom ? { gte: q.createdFrom } : {}), ...(q.createdTo ? { lte: q.createdTo } : {}) };
    const rows = await prisma.ticket.findMany({ where, include: { user: { select: { username: true } }, assignedTo: { select: { username: true } } }, orderBy: { slaDueAt: 'asc' }, take: 5000 });
    const now = Date.now();
    await auditFromRequest(request, 'EXPORT_RAN', { target: 'Ticket', metadata: { rows: rows.length, slaOnly: q.slaOnly } });
    return sendCsv(reply, 'tickets', ['id', 'subject', 'status', 'member', 'category', 'priority', 'openDate', 'firstRepliedAt', 'lastUserReplyAt', 'remainingMin', 'assignee'], rows.map((t) => [t.id, t.subject, t.status, t.user.username, t.category, t.priority, t.createdAt.toISOString(), t.firstReplyAt?.toISOString() ?? '', t.lastMessageAt?.toISOString() ?? '', t.slaDueAt ? String(Math.round((t.slaDueAt.getTime() - now) / 60000)) : '', t.assignedTo?.username ?? '']));
  });
}

// Admin notes on members
export function adminNotesRoutes(app: FastifyInstance) {
  app.get('/api/admin/notes/:userId', { preHandler: permission(app, 'users.read') }, async (request, reply) => {
    const { userId } = z.object({ userId: uuid }).parse(request.params);
    const items = await prisma.adminNote.findMany({ where: { userId }, include: { author: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' } });
    return reply.send({ success: true, message: 'Notlar', data: items.map((n) => ({ id: n.id, authorId: n.authorId, author: n.author?.username ?? '', text: n.body, createdAt: n.createdAt, updatedAt: n.updatedAt })) });
  });
  app.post('/api/admin/notes/:userId', { preHandler: permission(app, 'notes.write') }, async (request, reply) => {
    const { userId } = z.object({ userId: uuid }).parse(request.params);
    const body = z.object({ text: z.string().trim().min(1).max(5000) }).parse(request.body);
    const n = await prisma.adminNote.create({ data: { userId, authorId: request.user!.id, body: body.text }, include: { author: { select: { username: true } } } });
    await auditFromRequest(request, 'ADMIN_NOTE_CREATED', { target: 'AdminNote', targetId: n.id, metadata: { userId } });
    return reply.status(201).send({ success: true, message: 'Not eklendi', data: n });
  });
  app.patch('/api/admin/notes/:id', { preHandler: permission(app, 'notes.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ text: z.string().trim().min(1).max(5000) }).parse(request.body);
    const note = await prisma.adminNote.findUnique({ where: { id } });
    if (!note) throw new AppError('NOT_FOUND', 'Not yok', 404);
    if (note.authorId !== request.user!.id && request.user!.role !== 'SUPER_ADMIN') throw new AppError('FORBIDDEN', 'Sadece sahibi düzenleyebilir', 403);
    const updated = await prisma.adminNote.update({ where: { id }, data: { body: body.text }, include: { author: { select: { username: true } } } });
    await auditFromRequest(request, 'ADMIN_NOTE_CREATED', { target: 'AdminNote', targetId: id, metadata: { edited: true } });
    return reply.send({ success: true, message: 'Not güncellendi', data: updated });
  });
  app.delete('/api/admin/notes/:id', { preHandler: permission(app, 'notes.write') }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const note = await prisma.adminNote.findUnique({ where: { id } });
    if (!note) throw new AppError('NOT_FOUND', 'Not yok', 404);
    if (note.authorId !== request.user!.id && request.user!.role !== 'SUPER_ADMIN') throw new AppError('FORBIDDEN', 'Sadece sahibi silebilir', 403);
    await prisma.adminNote.delete({ where: { id } });
    await auditFromRequest(request, 'ADMIN_NOTE_DELETED', { target: 'AdminNote', targetId: id });
    return reply.send({ success: true, message: 'Not silindi', data: null });
  });
}
