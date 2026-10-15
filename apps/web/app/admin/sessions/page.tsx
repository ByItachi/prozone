'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '@/lib/api';
import { AdminCard, DataTable, AdminInput, badge, type AdminColumn } from '../_components/table';

type Session = {
  id: string;
  scope: string;
  userId: string;
  user?: { username?: string | null; email?: string | null } | null;
  latestIp?: string | null;
  latestCountry?: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
};

const SCOPE = ['ACTIVE', 'STALE', 'EXPIRED', 'REVOKED'];

export default function AdminSessionsPage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState('ACTIVE');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'sessions', scope],
    queryFn: () => api<{ items: Session[] }>(`/api/admin/sessions?scope=${scope}&limit=50`),
  });

  const revoke = useMutation({
    mutationFn: ({ id }: { id: string }) => api(`/api/admin/sessions/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
    onError: (e) => alert(getErrorMessage(e)),
  });

  const revokeAll = useMutation({
    mutationFn: () => api('/api/admin/sessions/revoke', { method: 'POST', body: JSON.stringify({ scope }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
    onError: (e) => alert(getErrorMessage(e)),
  });

  const cols: AdminColumn<Session>[] = [
    {
      key: 'user',
      label: 'Kullanıcı',
      render: (s) => (s.user?.username ? `${s.user.username} (${s.user.email})` : s.user?.email ?? s.userId),
    },
    { key: 'scope', label: 'Durum', render: (s) => badge(s.scope, s.scope === 'ACTIVE') },
    { key: 'ip', label: 'IP / Ülke', render: (s) => `${s.latestIp ?? '—'} ${s.latestCountry ? `· ${s.latestCountry}` : ''}` },
    { key: 'createdAt', label: 'Oluşturma', render: (s) => new Date(s.createdAt).toLocaleString('tr-TR') },
    { key: 'lastUsedAt', label: 'Son kullanım', render: (s) => (s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString('tr-TR') : '—') },
    {
      key: 'actions',
      label: '',
      render: (s) =>
        s.scope === 'ACTIVE' ? (
          <button type="button" className="admin-btn admin-btn--ghost !px-3" onClick={() => revoke.mutate({ id: s.id })}>
            İptal
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminCard title="Oturumlar">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select className="admin-input !w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>
            {SCOPE.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="admin-btn" onClick={() => revokeAll.mutate()}>
            {scope} → Tümünü iptal et
          </button>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} />
      </AdminCard>
    </div>
  );
}
