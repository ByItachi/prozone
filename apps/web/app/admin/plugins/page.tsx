'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AdminCard, badge } from '../_components/table';

type Plugin = { key: string; name: string; version: string; description: string; enabled: boolean };

export default function AdminPluginsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'plugins'],
    queryFn: () => api<Plugin[]>('/api/admin/plugins'),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {isLoading && <p className="text-sm text-[#8b98a3]">Yükleniyor...</p>}
      {(data ?? []).map((p) => (
        <div key={p.key} className="admin-card">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">{p.name}</span>
            <span className="text-xs text-[#8b98a3]">v{p.version}</span>
          </div>
          <p className="mt-2 text-xs text-[#8b98a3]">{p.description}</p>
          <div className="mt-3">{badge(p.enabled ? 'AKTİF' : 'KAPALI', p.enabled)}</div>
        </div>
      ))}
    </div>
  );
}
