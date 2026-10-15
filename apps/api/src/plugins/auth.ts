import jwt from '@fastify/jwt';
import { prisma } from '@novapanel/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors.ts';
import '../types';

interface JwtPayload {
  sub: string;
  sessionId?: string;
  type: 'access' | 'refresh' | '2fa';
}

export interface AuthedUser {
  id: string;
  role: { name: string; permissions: { permission: { key: string } }[] };
}

export const registerAuthPlugin = async (app: FastifyInstance) => {
  const env = app.env;

  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
    sign: {
      expiresIn: '7d',
    },
  });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      const payload = await request.jwtVerify<JwtPayload>();
      if (payload.type !== 'access') {
        throw new AppError('UNAUTHORIZED', 'Geçersiz token', 401);
      }
      request.user = {
        id: payload.sub,
        role: '',
        permissions: [],
      };
      request.auth = { sessionId: payload.sessionId };
      if (payload.sessionId) {
        prisma.session
          .updateMany({ where: { tokenFamily: payload.sessionId, revokedAt: null }, data: { lastUsedAt: new Date() } })
          .catch(() => {});
      }
    } catch {
      throw new AppError('UNAUTHORIZED', 'Oturum geçersiz veya süresi dolmuş', 401);
    }
  });

  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      try {
        await app.authenticate(request, reply);
      } catch {
        throw new AppError('UNAUTHORIZED', 'Giriş yapmanız gerekiyor', 401);
      }
    }
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: {
        status: true,
        role: { select: { name: true, permissions: { select: { permission: { select: { key: true } } } } } },
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('FORBIDDEN', 'Hesabınız aktif değil', 403);
    }
    const permissions = user.role.permissions.map((p) => p.permission.key);
    request.user.role = user.role.name;
    request.user.permissions = permissions;
    if (!['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE'].includes(user.role.name)) {
      throw new AppError('FORBIDDEN', 'Bu alana erişim yetkiniz yok', 403);
    }
  });

  app.decorate(
    'requirePermission',
    (permission: string) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        await app.requireAdmin(request, reply);
        if (!request.user!.permissions.includes(permission) && request.user!.role !== 'SUPER_ADMIN') {
          throw new AppError('FORBIDDEN', `Yetki eksik: ${permission}`, 403);
        }
      },
  );
};