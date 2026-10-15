import { pino } from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export function createLogger(name = 'novapanel') {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
    base: { service: name },
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        }
      : undefined,
  });
}

export const logger = createLogger();

export type Logger = ReturnType<typeof createLogger>;