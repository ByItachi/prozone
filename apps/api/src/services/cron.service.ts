import { Queue, Worker, type Job } from 'bullmq';
import { getBullConnection } from './redis.service.ts';
import { createLogger } from '@novapanel/logger';
import { prisma } from '@novapanel/db';
import { parseEnv } from '@novapanel/config';
import { checkExpiredServices } from '../modules/services/services.service.ts';
import { sendTemplateEmail } from './email.service.ts';

const log = createLogger('cron');
const cronEnv = parseEnv();
const appLike = { env: cronEnv } as never;

export type CronJobName = 'service-expiry' | 'renewal-reminders' | 'cleanup';

export function setupCron(url: string, env: { NODE_ENV?: string } = {}) {
  if (env.NODE_ENV === 'test') return null;
  try {
    const connection = getBullConnection(url);

    const queue = new Queue<unknown>('novapanel-cron', { connection });

    const worker = new Worker<CronJobName>(
      'novapanel-cron',
      async (job: Job<CronJobName>) => {
        await handleJob(job.name as CronJobName);
      },
      { connection },
    );

    // Run every hour
    void queue.upsertJobScheduler('service-expiry', { pattern: '0 * * * *' }, { name: 'service-expiry' });
    void queue.upsertJobScheduler('renewal-reminders', { pattern: '15 * * * *' }, { name: 'renewal-reminders' });
    void queue.upsertJobScheduler('cleanup', { pattern: '30 3 * * *' }, { name: 'cleanup' });

    worker.on('failed', (job, err) => log.error({ job, err }, 'cron job failed'));
    log.info('Cron scheduler started');

    return { queue, worker };
  } catch (err) {
    log.warn({ err }, 'Cron scheduler disabled (Redis unavailable)');
    return null;
  }
}

async function handleJob(name: CronJobName) {
  switch (name) {
    case 'service-expiry': {
      const count = await checkExpiredServices();
      log.info({ count }, 'service expiry check');
      break;
    }
    case 'renewal-reminders': {
      const expiring = await prisma.service.findMany({
        where: { status: 'ACTIVE', renewalDate: { lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), gte: new Date() } },
        include: { user: true },
        take: 200,
      });
      for (const s of expiring) {
        await prisma.notification.create({
          data: {
            userId: s.userId,
            type: 'SERVICE_EXPIRING',
            title: 'Servis süresi yaklaşıyor',
            body: `${s.name} servisiniz ${s.renewalDate?.toISOString().slice(0, 10)} tarihinde sona erecek.`,
            link: `/dashboard/services/${s.id}`,
          },
        });
        try {
          await sendTemplateEmail(
            appLike,
            s.user.email,
            'SERVICE_EXPIRING',
            { service: s.name, date: s.renewalDate?.toISOString().slice(0, 10) ?? 'yakında' },
          );
        } catch {
          // ignore per-item email errors
        }
      }
      log.info({ count: expiring.length }, 'renewal reminders sent');
      break;
    }
    case 'cleanup': {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const abandoned = await prisma.order.updateMany({
        where: { status: 'PAYMENT_PENDING', createdAt: { lt: cutoff } },
        data: { status: 'CANCELLED' },
      });
      const oldSessions = await prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      });
      const oldNotifications = await prisma.notification.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      });
      log.info({ abandoned: abandoned.count, oldSessions: oldSessions.count, oldNotifications: oldNotifications.count }, 'cleanup done');
      break;
    }
  }
}