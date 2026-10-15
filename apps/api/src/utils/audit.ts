import { prisma, type AuditAction } from '@novapanel/db';
import { getIp, getUserAgent } from './context.ts';
import type { FastifyRequest } from 'fastify';

interface AuditParams {
  action: AuditAction;
  actorId?: string | null;
  userId?: string | null;
  ip?: string;
  userAgent?: string;
  target?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

export async function writeAudit(params: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        actorId: params.actorId ?? undefined,
        userId: params.userId ?? undefined,
        ip: params.ip,
        userAgent: params.userAgent,
        target: params.target,
        targetId: params.targetId,
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      },
    });
  } catch (err) {
    // Audit should never break the request
    console.error('Audit log write failed', err);
  }
}

export function auditFromRequest(
  request: FastifyRequest,
  action: AuditAction,
  extra: Omit<AuditParams, 'action' | 'ip' | 'userAgent'>,
) {
  return writeAudit({
    action,
    ...extra,
    ip: getIp(request),
    userAgent: getUserAgent(request),
    correlationId: (request.headers['x-correlation-id'] as string) || undefined,
  });
}