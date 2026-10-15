'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type AdminStats = {
  summary: {
    totalUsers: number;
    activeUsers: number;
    revenue: number;
    orders: number;
    activeServices: number;
    openTickets: number;
    failedPayments: number;
    totalBalance: number;
  };
};

const WALLET_ADDRESSES = [
  { label: 'Bitcoin (BTC)', value: 'bc1qxerckerkuslxmrxra08hurhxu6ccl36gzx3299ggdn5spkhrnfgszln6nz' },
  { label: 'Litecoin (LTC)', value: 'ltc1qj8tpjkysh2j8qpeq0ut58ca7u5d76tnyeunk3d83gf6729cwg4msc8334k' },
  { label: 'USDT (TRC20)', value: 'TQLdQEFHC4X7AexE98cv6BAZinQxLazw4W' },
];

export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api<AdminStats>('/api/admin/stats'),
  });

  const cards = data
    ? [
        { label: 'Total Users', value: String(data.summary.totalUsers) },
        { label: 'Active Users', value: String(data.summary.activeUsers) },
        { label: 'Revenue', value: formatMoney(data.summary.revenue) },
        { label: 'Orders', value: String(data.summary.orders) },
        { label: 'Active Services', value: String(data.summary.activeServices) },
        { label: 'Open Tickets', value: String(data.summary.openTickets) },
        { label: 'Failed Payments', value: String(data.summary.failedPayments) },
        { label: 'Total Wallet Balance', value: formatMoney(data.summary.totalBalance) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading && <div className="col-span-full text-sm text-[#8b98a3]">Loading...</div>}
        {cards.map((c) => (
          <div key={c.label} className="admin-card">
            <div className="admin-card__label">{c.label}</div>
            <div className="admin-card__value">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="admin-card">
        <h2 className="admin-section__title mb-4">Crypto Payment Addresses</h2>
        <div className="space-y-2">
          {WALLET_ADDRESSES.map((w) => (
            <div
              key={w.label}
              className="flex flex-col gap-1 rounded-lg bg-[#22333f] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-[#8b98a3]">{w.label}</span>
              <code className="admin-code break-all text-xs">{w.value}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
