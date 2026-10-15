import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export function authed(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(request, reply);
  };
}

export function admin(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await app.requireAdmin(request, reply);
  };
}

export function permission(app: FastifyInstance, perm: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await app.requirePermission(perm)(request, reply);
  };
}