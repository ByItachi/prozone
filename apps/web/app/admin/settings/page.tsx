'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '@/lib/api';
import { AdminCard, AdminInput } from '../_components/table';

type Setting = { id: string; key: string; value: string };
type SettingsData = { group: string; items: Setting[] };

const GROUPS = ['ALL', 'PAYMENTS', 'SECURITY', 'MAIL', 'SPAM', 'SHOP', 'MUISC', 'AFFILIATE', 'PLUGINS', 'OTHER'];

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const [group, setGroup] = useState('PAYMENTS');
  const [draft, setDraft] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ['admin', 'settings', group],
    queryFn: () => api<SettingsData>(`/api/admin/settings/detail?group=${group}`),
  });

  const save = useMutation({
    mutationFn: (changes: Record<string, string>) =>
      api('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(Object.entries(changes).map(([key, value]) => ({ key, value }))),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings', group] });
      setDraft({});
    },
    onError: (e) => alert(getErrorMessage(e)),
  });

  const current = (k: string) => {
    if (k in draft) return draft[k];
    return data?.items.find((i) => i.key === k)?.value ?? '';
  };

  return (
    <div className="space-y-6">
      <AdminCard title={`Ayarlar — ${group}`}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select className="admin-input !w-auto" value={group} onChange={(e) => setGroup(e.target.value)}>
            {GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <button
            type="button"
            className="admin-btn"
            disabled={Object.keys(draft).length === 0 || save.isPending}
            onClick={() => save.mutate(draft)}
          >
            {Object.keys(draft).length > 0 ? `Kaydet (${Object.keys(draft).length})` : 'Kaydet'}
          </button>
        </div>

        <div className="space-y-10">
          {(data?.items ?? []).map((item) => (
            <div key={item.key} className="grid items-center gap-2 sm:grid-cols-[240px_1fr]">
              <label className="text-sm text-[#8b98a3]">{item.key}</label>
              <input
                className="admin-input w-full"
                value={current(item.key)}
                onChange={(e) => setDraft((d) => ({ ...d, [item.key]: e.target.value }))}
              />
            </div>
          ))}
          {data?.items.length === 0 && <p className="text-sm text-[#8b98a3]">Bu grupta ayar yok.</p>}
        </div>
      </AdminCard>
    </div>
  );
}
