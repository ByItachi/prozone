import { buildServer } from './app.ts';
import { setupCron } from './services/cron.service.ts';

const port = Number(process.env.PORT ?? 4000);
const host = '0.0.0.0';

async function start() {
  const app = await buildServer();
  const cron = setupCron(app.env.REDIS_URL, app.env);

  try {
    await app.listen({ port, host });
    app.log.info(`API running on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down...`);
    if (cron) {
      await cron.worker.close();
      await cron.queue.close();
    }
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();