import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { parseEnv } from '@novapanel/config';
import { createLogger } from '@novapanel/logger';
import { registerAuthPlugin } from './plugins/auth.ts';
import { registerRoutes } from './routes/index.ts';
import { errorHandler } from './utils/errors.ts';
import './types';

export async function buildServer(): Promise<FastifyInstance> {
  const env = parseEnv();
  const logger = createLogger('api');

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
  }) as unknown as FastifyInstance;

  app.decorate('env', env);

  // Preserve raw body (required for payment webhook signature verification)
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, rawBody, done) => {
    (request as FastifyRequestWithRaw).rawBody = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
    try {
      const text = rawBody.toString('utf8');
      done(null, text ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error);
    }
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await registerAuthPlugin(app);

  app.setErrorHandler(errorHandler);

  app.get('/health', async () => ({
    success: true,
    message: 'OK',
    data: { status: 'up', time: new Date().toISOString() },
  }));

  await registerRoutes(app);

  return app;
}

export type { Env } from '@novapanel/config';

type FastifyRequestWithRaw = { rawBody?: Buffer };