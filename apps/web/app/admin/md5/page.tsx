'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '@/lib/api';
import { AdminCard, DataTable, AdminInput, badge } from '../_components/table';
import type { AdminColumn } from '../_components/table';

type Md5Entry = { valueMd5: string; source?: string; note?: string | null; count?: number };

export default function AdminMd5Page() {
  const qc = useQueryClient();
  const [source, setSource] = useState('EMAIL');
  const [value, setValue] = useState('');
  const [mode, setMode] = useState('APPEND');
  const [lookup, setLookup] = useState('');
  const [found, setFound] = useState<null | { FOUND: boolean; HASH: string; MATCH?: string }>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'md5', source, value || 'test'],
    queryFn: () => api<Md5Entry[]>(`/api/admin/md5/suggest?type=${source}&q=${encodeURIComponent(value || 'test')}&limit=30`),
  });

  const importer = useMutation({
    mutationFn: () => api('/api/admin/md5/import', { method: 'POST', body: JSON.stringify({ mode, source, items: [{ value }] }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'md5'] });
      setValue('');
    },
    onError: (e) => alert(getErrorMessage(e)),
  });
  const lkp = useMutation({
    mutationFn: () => api('/api/admin/md5/lookup', { method: 'POST', body: JSON.stringify({ email: lookup }) }),
    onSuccess: (r) => setFound(r as { FOUND: boolean; HASH: string; MATCH?: string }),
    onError: (e) => alert(getErrorMessage(e)),
  });

  const cols: AdminColumn<Md5Entry>[] = [
    { key: 'valueMd5', label: 'Hash', render: (e) => <code className="admin-code">{e.valueMd5}</code> },
    { key: 'note', label: 'Not', render: (e) => e.note ?? '—' },
    { key: 'source', label: 'Kaynak', render: (e) => (e.source ? badge(e.source) : '—') },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <AdminCard title="Hash Ekle / İçe Aktar">
          <div className="flex flex-wrap items-center gap-3">
            <select className="admin-input !w-auto" value={mode} onChange={(e) => setMode(e.target.value)}>
              {['APPEND', 'REPLACE', 'KEEP_BEST'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <select className="admin-input !w-auto" value={source} onChange={(e) => setSource(e.target.value)}>
              {['EMAIL', 'USERNAME', 'PHONE'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <AdminInput placeholder="Değer (e-posta / kullanıcı adı / tel)" value={value} onChange={(e) => setValue(e.target.value)} />
            <button type="button" className="admin-btn" disabled={importer.isPending || !value} onClick={() => importer.mutate()}>
              Ekle
            </button>
          </div>
        </AdminCard>
        <AdminCard title={`Hashes (${source})`}>
          <DataTable columns={cols} rows={data ?? []} loading={isLoading} />
        </AdminCard>
      </div>
      <AdminCard title="Sorgula">
        <div className="flex flex-col gap-3">
          <AdminInput placeholder="E-posta" value={lookup} onChange={(e) => setLookup(e.target.value)} />
          <button type="button" className="admin-btn" disabled={lkp.isPending || !lookup} onClick={() => lkp.mutate()}>
            MD5 Sorgula
          </button>
          {found && (
            <div className="rounded-lg bg-[#22333f] p-3 text-xs">
              <p className="text-[#8b98a3]">Durum: {found.FOUND ? 'Kayıtlı' : 'Yok'}</p>
              {found.HASH && <code className="mt-2 block break-all text-[#5ee087]">{found.HASH}</code>}
              {found.MATCH && <p className="mt-2 text-white">Eşleşme: {found.MATCH}</p>}
            </div>
          )}
        </div>
      </AdminCard>
    </div>
  );
}
