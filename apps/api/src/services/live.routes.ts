import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@novapanel/db';
import { recordTraffic, sourceIp } from '../services/geo.service.ts';
import { getUserAgent } from '../utils/context.ts';
import { publishLive, getRecentLive, openSse } from '../services/live.service.ts';

const SENSITIVE_PATHS = [/\/api\/auth\/(login|register|2fa|password)/i, /\/api\/admin\/users\/[0-9a-f-]+\/password-reset/i];
const AUDIT_KINDS = /(USER_|ADMIN_|ROLE_|SETTINGS_|TICKET_|PRODUCT_|ORDER_|PAYMENT_|WALLET|ACCESS_|TOKEN_)/;

export async function registerLiveRoutes(app: FastifyInstance) {
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0] ?? '';
    const status = reply.statusCode;
    const ms = Math.round((reply.elapsedTime ?? 0) as number);
    try {
      if (SENSITIVE_PATHS.some((re) => re.test(path))) return;
      if (path.startsWith('/api/admin/live') || path === '/health') return;
      if (status === 401 && /\/api\/admin\//.test(path)) {
        await recordTraffic({
          kind: 'ACCESS_DENIED',
          ip: sourceIp(request),
          userAgent: getUserAgent(request),
          path,
          method: request.method,
          status,
          ms,
          liveMessage: `Unauthorized admin API attempt: ${request.method} ${path}`,
        });
        publishLive({ type: 'SECURITY_ALERT', outcome: 'DENIED', message: `Denied admin API access: ${path}` });
        return;
      }
      if (path === '/' || path.startsWith('/dashboard') || /^\/[a-z-]+$/.test(path)) {
        await recordTraffic({
          kind: 'PAGE_VIEW',
          userId: request.user?.id ?? null,
          ip: sourceIp(request),
          userAgent: getUserAgent(request),
          path,
          method: 'GET',
          status,
          ms,
        });
        return;
      }
      if (path.startsWith('/api/') && (status >= 400 || AUDIT_KINDS.test(request.method + ' ' + path))) {
        await recordTraffic({
          kind: status >= 400 ? 'API_ERROR' : 'API_ACCESS',
          userId: request.user?.id ?? null,
          ip: sourceIp(request),
          userAgent: getUserAgent(request),
          path,
          method: request.method,
          status,
          ms,
        });
      }
    } catch {
      /* observer must never break responses */
    }
  });

  app.get('/api/admin/live', { preHandler: app.requireAdmin }, async (_request, reply) =>
    reply.send({ success: true, message: 'Son olaylar', data: getRecentLive(60) }),
  );

  app.get('/api/admin/live/stream', { preHandler: app.requireAdmin }, async (_request, reply) => {
    openSse(reply);
  });

  app.get('/api/admin/live/countries', { preHandler: app.requireAdmin }, async (request, reply) => {
    const windowMin = Number((request.query as { min?: string }).min ?? 24 * 60);
    const since = new Date(Date.now() - windowMin * 60 * 1000);
    const rows = await prisma.trafficEvent.groupBy({
      by: ['country'],
      where: { createdAt: { gte: since }, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: 'desc' } },
    });
    const [sessions, unresolved] = await Promise.all([
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.trafficEvent.count({ where: { createdAt: { gte: since }, country: null } }),
    ]);
    return reply.send({
      success: true,
      message: 'Ülke bazlı trafik',
      data: {
        windowMinutes: windowMin,
        generatedAt: new Date().toISOString(),
        activeSessions: sessions,
        knownCountries: rows.length,
        unresolvedEvents: unresolved,
        countries: rows.map((r) => ({ country: r.country as string, visits: r._count._all })),
      },
    });
  });
}
