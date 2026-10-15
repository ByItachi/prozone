'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AdminCard } from '../_components/table';

type Role = { id: string; name: string; description?: string | null; builtin?: boolean; usersCount?: number; permissions: string[] };
type Permission = { id: string; key: string; description?: string | null };
type RbacData = { permissions: Permission[]; roles: Role[] };

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mb-1 mr-1 inline-block rounded px-2 py-0.5 text-xs font-semibold"
      style={{ background: 'rgba(63,158,15,.15)', color: '#5ee087' }}
    >
      {children}
    </span>
  );
}

export default function AdminRolesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'rbac', 'roles'],
    queryFn: () => api<RbacData>('/api/admin/rbac/roles'),
  });

  const roles = data?.roles ?? [];
  const permissions = data?.permissions ?? [];

  return (
    <div className="space-y-6">
      <AdminCard title="Roller ve İzinler">
        {isLoading && <p className="text-sm text-[#8b98a3]">Yükleniyor...</p>}
        {roles.map((r) => (
          <div key={r.name} className="mb-4 rounded-lg bg-[#22333f] p-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{r.name}</span>
              <span className="text-xs text-[#8b98a3]">
                ({r.permissions.length} izin{r.builtin ? ' · dahili' : ''})
              </span>
            </div>
            <div className="mt-2 flex flex-wrap">
              {r.permissions.map((p) => (
                <Pill key={p}>{p}</Pill>
              ))}
            </div>
          </div>
        ))}
      </AdminCard>

      <AdminCard title="Tüm İzin Sistemi">
        <div className="flex flex-wrap">
          {permissions.map((p) => (
            <Pill key={p.id}>{p.key}</Pill>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}
