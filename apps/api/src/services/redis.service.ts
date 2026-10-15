import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(url: string): Redis {
  if (redis) return redis;
  redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    enableReadyCheck: true,
  });
  redis.on('error', (err) => {
    if (process.env.NODE_ENV !== 'test') console.error('Redis error', err.message);
  });
  return redis;
}

export function getBullConnection(url: string): Redis {
  const conn = new Redis(url, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
    enableReadyCheck: true,
  });
  conn.on('error', () => {
    // BullMQ requires maxRetriesPerRequest: null; errors are surfaced via BullMQ events
  });
  return conn;
}