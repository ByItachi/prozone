import type { Env } from '@novapanel/config';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string;
      role: string;
      permissions: string[];
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    auth: {
      sessionId?: string;
    };
    rawBody?: Buffer;
  }
}