import { prisma } from '@novapanel/db';
import { publishLive } from './live.service.ts';

export type GeoReliability = 'PROVIDER' | 'LOCAL' | 'UNKNOWN';

const cache = new Map<string, { iso2: string | null; name: string | null; at: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;
const COUNTRY_NAMES = new Map<string, string>();

export function isPrivateIp(ip: string | null | undefined): boolean {
  if (!ip) return true;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') return true;
  if (/^(10\.|127\.|169\.254\.|192\.168\.)/.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  if (/^(fc|fd|fe80)/i.test(ip)) return true;
  return !/^[0-9a-fA-F:.]+$/.test(ip);
}

export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 3).join(':')}:****`;
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return '***';
  return `${parts[0]}.${parts[1]}.***.***`;
}

interface LookupResult {
  iso2: string | null;
  name: string | null;
  reliability: GeoReliability;
}

export async function resolveCountry(ip: string | null | undefined): Promise<LookupResult> {
  if (!ip || isPrivateIp(ip)) {
    return { iso2: null, name: null, reliability: 'LOCAL' };
  }
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return { iso2: hit.iso2, name: hit.name, reliability: hit.iso2 ? 'PROVIDER' : 'UNKNOWN' };
  }
  let iso2: string | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?success=true`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const json = (await res.json()) as { success?: boolean; country_code?: string; country?: string };
    if (json.success && json.country_code) {
      iso2 = json.country_code.toUpperCase();
      if (json.country) COUNTRY_NAMES.set(iso2, json.country);
    }
  } catch {
    /* provider unreachable → bilinmiyor, uydurma yok */
  }
  cache.set(ip, { iso2, name: iso2 ? COUNTRY_NAMES.get(iso2) ?? null : null, at: Date.now() });
  return { iso2, name: iso2 ? COUNTRY_NAMES.get(iso2) ?? null : null, reliability: iso2 ? 'PROVIDER' : 'UNKNOWN' };
}

export function parseUserAgent(ua: string | null | undefined) {
  const s = ua ?? '';
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) && !/Chrome/.test(s) ? 'Safari' : /Firefox\//.test(s) ? 'Firefox' : null;
  const os = /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Linux/.test(s) ? 'Linux' : null;
  const deviceType = /Mobile|Android|iPhone|iPad|iPod/.test(s) ? 'MOBILE' : /Tablet|iPad/.test(s) ? 'TABLET' : s ? 'DESKTOP' : null;
  return { browser, os, deviceType };
}

/**
 * Kaynak IP'yi proxy yapılandırmasına göre çözer.
 * trustProxy=true olduğu için request.ip X-Forwarded-For'dan gelir;
 * ancak doğrudan (doğrulanmamış) başlık yerine request.ip kullanıyoruz.
 */
export function sourceIp(request: { ip?: string }): string | null {
  return request.ip ?? null;
}

export async function recordTraffic(params: {
  kind: string;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  path?: string | null;
  method?: string | null;
  status?: number | null;
  ms?: number | null;
  country?: string | null;
  countryName?: string | null;
  reliability?: GeoReliability;
  metadata?: Record<string, unknown>;
  liveMessage?: string;
}) {
  const parsed = parseUserAgent(params.userAgent);
  const ipMasked = maskIp(params.ip);
  const event = await prisma.trafficEvent.create({
    data: {
      kind: params.kind,
      userId: params.userId ?? undefined,
      country: params.country ?? undefined,
      countryCode: params.countryName ?? undefined,
      reliability: params.reliability ?? 'UNKNOWN',
      ipMasked: ipMasked ?? undefined,
      path: params.path ?? undefined,
      method: params.method ?? undefined,
      status: params.status ?? undefined,
      ms: params.ms ?? undefined,
      userAgent: params.userAgent?.slice(0, 500) ?? undefined,
      deviceType: parsed.deviceType ?? undefined,
      browser: parsed.browser ?? undefined,
      os: parsed.os ?? undefined,
      metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
    },
  });
  publishLive({
    type: params.kind,
    outcome: 'SUCCESS',
    actor: params.userId ?? undefined,
    country: params.country ?? null,
    countryName: params.countryName ?? null,
    ipMasked,
    message: params.liveMessage ?? `Traffic: ${params.kind}`,
    details: { eventId: event.id, path: params.path, method: params.method, status: params.status },
  });
  return event;
}
