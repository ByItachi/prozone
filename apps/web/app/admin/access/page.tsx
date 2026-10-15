'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '@/lib/api';
import { AdminCard, DataTable, AdminInput, badge } from '../_components/table';
import type { AdminColumn } from '../_components/table';

type AccessLink = { id: string; name: string; url: string; kind: string; active: boolean; createdAt: string };
type AccessCode = { id: string; code: string; user?: { username?: string | null } | null; grantedAt: string; active: boolean };

export default function AdminAccessLinksPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState('CLEARNET');
  const [error, setError] = useState('');

  const links = useQuery({
    queryKey: ['admin', 'access', 'links'],
    queryFn: () => api<AccessLink[]>('/api/admin/access/links?limit=50'),
  });
  const codes = useQuery({
    queryKey: ['admin', 'access', 'codes'],
    queryFn: () => api<AccessCode[]>('/api/admin/access/codes?limit=50'),
  });

  const create = useMutation({
    mutationFn: () => api('/api/admin/access/links', { method: 'POST', body: JSON.stringify({ name, url, kind }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'access'] });
      setName('');
      setUrl('');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/api/admin/access/links/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'access'] }),
    onError: (e) => setError(getErrorMessage(e)),
  });

  const linkCols: AdminColumn<AccessLink>[] = [
    { key: 'name', label: 'Ad' },
    { key: 'url', label: 'URL', render: (l) => <code className="admin-code">{l.url}</code> },
    { key: 'kind', label: 'Tür', render: (l) => badge(l.kind) },
    { key: 'active', label: 'Durum', render: (l) => badge(l.active ? 'AKTİF' : 'KAPALI', l.active) },
    {
      key: 'actions',
      label: '',
      render: (l) => (
        <button type="button" className="admin-btn admin-btn--ghost !px-3" onClick={() => toggle.mutate({ id: l.id, active: l.active })}>
          {l.active ? 'Kapat' : 'Aç'}
        </button>
      ),
    },
  ];
  const codeCols: AdminColumn<AccessCode>[] = [
    { key: 'code', label: 'Kod', render: (c) => <code className="admin-code">{c.code}</code> },
    { key: 'user', label: 'Kullanıcı', render: (c) => c.user?.username ?? '—' },
    { key: 'active', label: 'Durum', render: (c) => badge(c.active ? 'AKTİF' : 'KAPALI', c.active) },
  ];

  return (
    <div className="space-y-6">
      <AdminCard title="Yeni Erişim Linki">
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <AdminInput placeholder="Ad" value={name} onChange={(e) => setName(e.target.value)} />
          <AdminInput placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <select className="admin-input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
            {['CLEARNET', 'TOR', 'DEEP', 'OTHER'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <button type="submit" className="admin-btn" disabled={!name || !url || create.isPending}>
            Oluştur
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-[#ff8a80]">{error}</p>}
      </AdminCard>

      <AdminCard title="Erişim Linkleri">
        <DataTable columns={linkCols} rows={links.data ?? []} loading={links.isLoading} />
      </AdminCard>

      <AdminCard title="Erişim Kodları">
        <DataTable columns={codeCols} rows={codes.data ?? []} loading={codes.isLoading} />
      </AdminCard>
    </div>
  );
}
