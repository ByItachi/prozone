'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '@/lib/api';
import { AdminCard, DataTable, AdminInput, badge } from '../_components/table';
import type { AdminColumn } from '../_components/table';

type Ticket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category?: string | null;
  assignedUserId?: string | null;
  breach?: boolean;
  createdAt: string;
  user?: { username?: string | null } | null;
};

const STATUS = ['OPEN', 'PENDING', 'IN_PROGRESS', 'AWAITING_USER', 'RESOLVED', 'CLOSED', 'REOPENED'];
const PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function AdminTicketsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const [priority, setPriority] = useState('');
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tickets', 'manager', status, priority, q],
    queryFn: () =>
      api<{ items: Ticket[] }>(
        `/api/admin/tickets/manager?limit=50${status && status !== 'ALL' ? `&status=${status}` : ''}${priority ? `&priority=${priority}` : ''}${q ? `&search=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: object }) => api(`/api/admin/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tickets', 'manager'] }),
    onError: (e) => alert(getErrorMessage(e)),
  });

  const cols: AdminColumn<Ticket>[] = [
    { key: 'subject', label: 'Konu', render: (t) => <span className="font-bold text-white">{t.subject}</span> },
    { key: 'user', label: 'Kullanıcı', render: (t) => t.user?.username ?? '—' },
    { key: 'priority', label: 'Öncelik', render: (t) => badge(t.priority, t.priority === 'HIGH' || t.priority === 'URGENT') },
    {
      key: 'status',
      label: 'Durum',
      render: (t) => (
        <select className="admin-input !h-8 !w-auto !px-2 text-xs" defaultValue={t.status} onChange={(e) => update.mutate({ id: t.id, patch: { status: e.target.value } })}>
          {STATUS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      ),
    },
    { key: 'breach', label: 'SLA', render: (t) => (t.breach ? badge('BREACH', false) : badge('OK')) },
    {
      key: 'assign',
      label: 'Atama',
      render: (t) => (
        <button type="button" className="admin-btn admin-btn--ghost !px-3" onClick={() => update.mutate({ id: t.id, patch: { assignedUserId: 'ME' } })}>
          Bana al
        </button>
      ),
    },
    { key: 'createdAt', label: 'Açılış', render: (t) => new Date(t.createdAt).toLocaleString('tr-TR') },
  ];

  return (
    <div className="space-y-6">
      <AdminCard title="Destek Merkezi">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select className="admin-input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['ALL', ...STATUS].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="admin-input !w-auto" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Tüm öncelikler</option>
            {PRIORITY.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <AdminInput placeholder="Ara..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} />
      </AdminCard>
    </div>
  );
}
