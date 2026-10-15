import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(error: unknown): { statusCode: number; body: Record<string, unknown> } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        message: error.message,
        code: error.code,
        data: null,
      },
    };
  }

  if (error instanceof ZodError) {
    const first = error.issues[0];
    return {
      statusCode: 400,
      body: {
        success: false,
        message: first ? `${first.path.join('.')}: ${first.message}` : 'Validasyon hatası',
        code: 'VALIDATION_ERROR',
        data: null,
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  }

  // Prisma unique constraint
  const anyErr = error as { code?: string; meta?: { target?: string[] } };
  if (anyErr.code === 'P2002') {
    const target = anyErr.meta?.target?.join(', ') ?? 'field';
    return {
      statusCode: 409,
      body: {
        success: false,
        message: `Bu ${target} zaten kullanımda`,
        code: 'CONFLICT',
        data: null,
      },
    };
  }

  if (anyErr.code === 'P2025') {
    return {
      statusCode: 404,
      body: { success: false, message: 'Kayıt bulunamadı', code: 'NOT_FOUND', data: null },
    };
  }

  if (anyErr.code === 'P2003') {
    return {
      statusCode: 400,
      body: { success: false, message: 'Bağlı kayıt işlemi engelledi', code: 'FK_CONSTRAINT', data: null },
    };
  }

  const err = error as Error;
  return {
    statusCode: 500,
    body: {
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      code: 'INTERNAL_ERROR',
      data: null,
    },
  };
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const { statusCode, body } = handleError(error);
  request.log.error({ err: error }, 'request failed');
  reply.code(statusCode).send(body);
}