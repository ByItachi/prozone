'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import type { Order, Paginated, Wallet } from '@/lib/types';

type Stats = {
  activeServices: number;
  totalOrders: number;
  pendingOrders: number;
  openTickets: number;
  accountBalance: number;
  totalSpent: number;
};

const USAGE_CURVE = [46, 43, 31, 33, 35, 21, 23, 25, 15, 17, 19, 11];
const SPEND_CURVE = [36, 31, 33, 26, 21, 23, 19, 16, 17, 13, 9, 11];

const DOUGHNUT_COLORS = ['#ed5d15', '#d85311', '#ff8142', '#1a2833', '#8b98a3'];

function rankOf(totalOrders: number): string {
  if (totalOrders >= 1000) return 'Diamond User';
  if (totalOrders >= 200) return 'Platinum User';
  if (totalOrders >= 50) return 'Gold User';
  if (totalOrders >= 1) return 'Silver User';
  return 'Bronze User';
}

function Sparkline({ data, width = 200, height = 57 }: { data: number[]; width?: number; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - 7 - ((v - min) / range) * (height - 16),
  }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <path d={area} fill="rgba(237,93,21,0.18)" />
      <path
        d={line}
        stroke="#ed5d15"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DoughnutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0 | 0;
  const arcs = total > 0 ? segments.map((s) => { const len = (s.value / total) * C; const a = arc(acc / total, len, R, s.color); acc += s.value; return a; }) : [];

  function arc(startF: number, len: number, radius: number, color: string) {
    const offset = C - startF * C;
    return (
      <circle
        key={`${color}-${startF}`}
        cx="90"
        cy="90"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="26"
        strokeDasharray={`${Math.max(len - 3, 0)} ${C - Math.max(len - 3, 0)}`}
        strokeDashoffset={offset}
        strokeLinecap="butt"
      />
    );
  }

  return (
    <div className="pz-doughnut-wrap">
      <div className="pz-doughnut">
        <svg viewBox="0 0 180 180" aria-hidden="true">
          <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(36,44,54,0.08)" strokeWidth="26" />
          {arcs}
        </svg>
        <div className="pz-doughnut-center">
          <div>{total}</div>
          <span>Total</span>
        </div>
      </div>
      {segments.length > 0 ? (
        <ul className="pz-doughnut-legend">
          {segments.map((s) => (
            <li key={s.label}>
              <i style={{ background: s.color }} />
              <span className="pz-doughnut-legend-label">{s.label}</span>
              <span className="pz-doughnut-legend-value">{s.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pz-chart-empty">No data yet</p>
      )}
    </div>
  );
}

function ActivityChart({ days }: { days: { label: string; value: number }[] }) {
  const W = 600;
  const H = 240;
  const PAD_Y = 12;
  const PAD_BOT = 30;
  const PAD_X = 12;
  const top = Math.max(...days.map((d) => d.value), 1);
  const scaled = Math.max(Math.ceil(top * 1.2), 4);
  const chartH = H - PAD_Y - PAD_BOT;
  const y = (v: number) => PAD_Y + chartH - (v / scaled) * chartH;
  const xStep = (W - PAD_X * 2) / (days.length - 1 || 1);
  const bottom = PAD_Y + chartH;

  const pts = days.map((d, i) => ({ x: PAD_X + i * xStep, y: y(d.value) }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${PAD_X + (days.length - 1) * xStep},${bottom} L${PAD_X},${bottom} Z`;

  return (
    <div className="pz-activity-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="pz-act-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ed5d15" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ed5d15" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(scaled * f)}
            y2={y(scaled * f)}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeDasharray="4 6"
          />
        ))}
        <path d={area} fill="url(#pz-act-fill)" />
        <path d={line} stroke="#ed5d15" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4.5" fill="#fff" stroke="#ed5d15" strokeWidth="2.5" />
        ))}
        {days.map((d, i) => (
          <text key={i} x={PAD_X + i * xStep} y={H - 8} textAnchor="middle" fontSize="13" className="pz-chart-xlabel">
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['me', 'stats'],
    queryFn: () => api<Stats>('/api/users/me/stats'),
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<Wallet>('/api/wallet'),
  });

  const { data: ordersPage } = useQuery({
    queryKey: ['orders', 'charts'],
    queryFn: () => api<Paginated<Order>>('/api/orders?limit=100'),
  });

  const totalOrders = stats?.totalOrders ?? 0;
  const totalSpent = stats?.totalSpent ?? 0;

  const orders = ordersPage?.items ?? [];

  const byName = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items) {
      const key = it.name || (it.product as { slug?: string } | undefined)?.slug || 'Service';
      byName.set(key, (byName.get(key) ?? 0) + it.quantity);
    }
  }
  const doughnutSegments = [...byName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value], i) => ({ label, value, color: DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length]! }));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
    return { label, value: 0 };
  });
  const dayIdx = (ts: string) => {
    const a = new Date(ts);
    const b = new Date();
    b.setHours(0, 0, 0, 0);
    const diff = Math.round((b.getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000);
    return 6 - diff;
  };
  for (const o of orders) {
    const i = dayIdx(o.createdAt);
    if (i >= 0 && i < 7 && days[i]) days[i]!.value += 1;
  }

  return (
    <div className="dashboard grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="xl:col-span-4">
        <div className="pz-dashboard-block" style={{ height: '100%' }}>
          <div className="pz-dashboard-block-text">Your rank on our service</div>
          <div className="pz-dashboard-block-value">{rankOf(totalOrders)}</div>
        </div>
      </div>
      <div className="xl:col-span-4">
        <div className="pz-dashboard-block" style={{ height: '100%' }}>
          <div className="pz-dashboard-block-text">The number of services you have used</div>
          <div className="pz-dashboard-block-value">{totalOrders} times</div>
          <div className="pz-dashboard-block-graph">
            <Sparkline data={USAGE_CURVE} />
          </div>
        </div>
      </div>
      <div className="xl:col-span-4">
        <div className="pz-dashboard-block" style={{ height: '100%' }}>
          <div className="pz-dashboard-block-text">The amount of money you spent</div>
          <div className="pz-dashboard-block-value">{formatMoney(totalSpent, wallet?.currency ?? 'USD')}</div>
          <div className="pz-dashboard-block-graph">
            <Sparkline data={SPEND_CURVE} />
          </div>
        </div>
      </div>
      <div className="xl:col-span-4">
        <div className="pz-dashboard-bg flex aic jcc">
          <div className="pz-dashboard-bg-wrap">
            <div id="container2">
              <DoughnutChart segments={doughnutSegments} />
            </div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-8">
        <div className="pz-dashboard-bg">
          <div className="pz-dashboard-bg-title">Your activity on our service for a week</div>
          <div id="container">
            <ActivityChart days={days} />
          </div>
        </div>
      </div>

      {user && !user.emailVerified && (
        <div className="xl:col-span-12">
          <Link
            href="/verify-email"
            className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 hover:bg-amber-500/15"
          >
            <Receipt className="h-4 w-4" />
            You haven&apos;t verified your email yet. Click to get the verification link.
          </Link>
        </div>
      )}
    </div>
  );
}
