'use client';

import { useState } from 'react';
import type { ReactNode, InputHTMLAttributes } from 'react';

export type AdminColumn<T> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
};

export function AdminCard({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`admin-card ${className ?? ''}`} style={{ background: '#1a2933', borderRadius: 12, border: '1px solid #22333f', padding: 18 }}>
      {title && <h2 className="admin-section__title mb-4">{title}</h2>}
      {children}
    </div>
  );
}

export function DataTable<T extends object>({
  columns,
  rows,
  loading,
  empty = 'Henüz kayıt yok.',
}: {
  columns: AdminColumn<T>[];
  rows: T[];
  loading?: boolean;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto admin-table-wrap">
      <table className="admin-table w-full text-left text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="px-3 py-3 text-[#8b98a3]" colSpan={columns.length}>
                Yükleniyor...
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td className="px-3 py-3 text-[#8b98a3]" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((r, idx) => (
              <tr key={(r as { id?: string }).id ?? idx}>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2">
                    {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminInput({ ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`admin-input ${props.className ?? ''}`} />;
}

export function badge(value: string, active = true) {
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
      style={{
        background: active ? 'rgba(63,158,15,.15)' : 'rgba(146,35,27,.15)',
        color: active ? '#5ee087' : '#ff8a80',
      }}
    >
      {value}
    </span>
  );
}

export function useSearchState() {
  const [search, setSearch] = useState('');
  return { search, setSearch };
}
