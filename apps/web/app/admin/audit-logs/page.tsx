'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AdminCard, DataTable, AdminInput, badge } from '../_components/table';
import type { AdminColumn } from '../_components/table';

type AuditLog = { id: string; actorName?: string | null; actor?: { username?: string | null; email?: string | null } | null; action: string; ip: string; ts?: string; createdAt?: string; detail: string };

export default function AdminAuditLogsPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', action, q],
    queryFn: () =>
      api<{ items: AuditLog[] }>(
        `/api/admin/audit-logs?limit=50${action ? `&action=${encodeURIComponent(action)}` : ''}${q ? `&search=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  const cols: AdminColumn<AuditLog>[] = [
    { key: 'createdAt', label: 'Zaman', render: (l) => new Date(l.ts ?? l.createdAt ?? '').toLocaleString('tr-TR') },
    { key: 'actor', label: 'Kullanıcı', render: (l) => l.actor?.username ?? l.actor?.email ?? l.actorName ?? '—' },
    { key: 'action', label: 'İşlem', render: (l) => badge(l.action) },
    { key: 'detail', label: 'Detay', render: (l) => <span className="break-all text-xs">{l.detail}</span> },
    { key: 'ip', label: 'IP' },
  ];

  return (
    <div className="space-y-6">
      <AdminCard title="Denetim Kayıtları">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select className="admin-input !w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Tüm işlemler</option>
            <option>USER_LOGIN_SUCCESS</option>
            <option>USER_LOGIN_FAILED</option>
            <option>USER_REGISTER</option>
            <option>ORDER_CREATE</option>
            <option>ORDER_CANCEL</option>
            <option>WALLET_TOPUP</option>
            <option>WALLET_ADJUST</option>
            <option>SECURITY_ALERT</option>
          </select>
          <AdminInput placeholder="Ara..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} />
      </AdminCard>
    </div>
  );
}
