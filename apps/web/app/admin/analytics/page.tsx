'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { AdminCard } from '../_components/table';
import { COUNTRY_POINTS, toXY } from '@/lib/geo-map';

type Overview = {
  kpis: Record<string, number>;
  countries: Array<{ country: string; visits: number }>;
  trafficKinds: Array<{ kind: string; count: number }>;
  series: Array<{ day: string; visits: number; errors: number }>;
};

function friendlyKey(k: string) {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Minimal equirectangular world-outline (coarse) shown as grid + frame so pins
// read as "world map" without bundling a heavy path dataset.
const GRID_X = [-120, -80, -40, 1, 60, 110, 160];
const GRID_Y = [-60, -40, -20, 0, 25, 50];

export default function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api<Overview>('/api/admin/overview'),
  });

  const kpis = Object.entries(data?.kpis ?? {});
  const kinds = data?.trafficKinds ?? [];
  const countries = data?.countries ?? [];

  const maxCount = countries.reduce((m, c) => Math.max(m, Number(c.visits) || 0), 1);
  const pins = countries
    .map((c) => {
      const pt = COUNTRY_POINTS[c.country.toUpperCase()];
      if (!pt) return null;
      const { x, y } = toXY(pt.lon, pt.lat);
      const n = Number(c.visits) || 0;
      const r = n <= 0 ? 6 : 6 + Math.max(0, Math.min(8, Math.round((n / maxCount) * 8)));
      return { ...c, name: pt.name, x, y, r, n };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  pins.sort((a, b) => b.n - a.n);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(([k, v]) => (
          <div key={k} className="admin-card">
            <div className="admin-card__label">{friendlyKey(k)}</div>
            <div className="admin-card__value">{v ?? '—'}</div>
          </div>
        ))}
      </div>

      <AdminCard title="Giriş Lokasyonları — Dünya Haritası">
        <div className="relative">
          {isLoading && <p className="mb-2 text-sm text-[#8b98a3]">Yükleniyor...</p>}
          {!isLoading && pins.length === 0 && (
            <p className="mb-2 text-sm text-[#8b98a3]">
              Henüz ülke bazlı giriş verisi yok. Kullanıcı giriş yaptığında pin burada görünecek.
            </p>
          )}
          <svg viewBox="0 0 1000 500" className="w-full rounded-lg border border-[#22333f] bg-[#0d1a23]">
            {/* grid + frame to suggest a world map */}
            <rect x={0} y={0} width={1000} height={500} fill="none" stroke="#22333f" />
            {GRID_Y.map((gy) => (
              <line key={`h${gy}`} x1={0} x2={1000} y1={toXY(0, gy).y} y2={toXY(0, gy).y} stroke="#16242f" strokeWidth={1} />
            ))}
            {GRID_X.map((gx) => {
              const { x } = toXY(gx, 0);
              return (
                <line key={`v${gx}`} x1={x} x2={x} y1={0} y2={500} stroke="#16242f" strokeWidth={1} />
              );
            })}
            {pins.map((p) => (
              <g key={p.country}>
                <circle cx={p.x} cy={p.y} r={p.r} fill="#ed5d15" opacity={0.18} />
                <circle cx={p.x} cy={p.y} r={p.r * 0.55} fill="#ed5d15" stroke="#fff" strokeWidth={1.5} />
                <title>
                  {p.name} ({p.country}) — {p.n} ziyaret
                </title>
              </g>
            ))}
          </svg>
          {pins.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {pins.map((p) => (
                <span key={p.country} className="inline-flex items-center gap-1.5 rounded-md bg-[#1a2933] px-2 py-1 text-12 text-[#c3ccd4]" style={{ fontSize: 12 }}>
                  <MapPin className="h-3.5 w-3.5 text-[#ed5d15]" />
                  <b>{p.country}</b> · {p.n}
                </span>
              ))}
            </div>
          )}
        </div>
      </AdminCard>

      <AdminCard title="Trafik Türleri">
        {isLoading && <p className="text-sm text-[#8b98a3]">Yükleniyor...</p>}
        {kinds.length === 0 && !isLoading && <p className="text-sm text-[#8b98a3]">Kayıt yok.</p>}
        <table className="admin-table w-full text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2">Tür</th>
              <th className="px-3 py-2">Adet</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((c) => (
              <tr key={c.kind}>
                <td className="px-3 py-2">{c.kind}</td>
                <td className="px-3 py-2">{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}

