import type { FastifyReply } from 'fastify';

export interface LiveEvent {
  id: string;
  ts: string;
  type: string;
  outcome?: string;
  actor?: string;
  target?: string;
  targetId?: string;
  correlationId?: string;
  country?: string | null;
  countryName?: string | null;
  ipMasked?: string | null;
  message: string;
  details?: Record<string, unknown>;
}

const subscribers = new Set<(e: LiveEvent) => void>();
const recent: LiveEvent[] = [];
const MAX_RECENT = 300;
let seq = 0;

export function publishLive(event: Omit<LiveEvent, 'id' | 'ts'> & { id?: string }) {
  const full: LiveEvent = {
    id: event.id ?? `evt-${Date.now()}-${++seq}`,
    ts: new Date().toISOString(),
    type: event.type,
    outcome: event.outcome,
    actor: event.actor,
    target: event.target,
    targetId: event.targetId,
    correlationId: event.correlationId,
    country: event.country,
    countryName: event.countryName,
    ipMasked: event.ipMasked,
    message: event.message,
    details: event.details,
  };
  recent.unshift(full);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  for (const cb of subscribers) {
    try {
      cb(full);
    } catch {
      subscribers.delete(cb);
    }
  }
}

export function getRecentLive(limit = 50) {
  return recent.slice(0, limit);
}

export function subscribeLive(cb: (e: LiveEvent) => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function openSse(reply: FastifyReply) {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (e: LiveEvent) => {
    try {
      reply.raw.write(`event: activity\ndata: ${JSON.stringify(e)}\n\n`);
    } catch {
      /* ignore */
    }
  };
  // initial snapshot so the client does not miss the gap between REST fetch and subscribe
  for (const e of recent.slice(0, 20).reverse()) send(e);
  reply.raw.write(`event: ready\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  const unsubscribe = subscribeLive(send);
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(`: ping ${Date.now()}\n\n`);
    } catch {
      /* ignore */
    }
  }, 25_000);
  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  reply.raw.on('close', cleanup);
  reply.raw.on('error', cleanup);
}
