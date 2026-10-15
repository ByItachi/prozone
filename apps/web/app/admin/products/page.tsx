'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { ITEM_FIELDS } from '@/components/shop/configs';

const CATEGORIES = [
  { slug: 'cvv', label: 'CVV / Credit Cards' },
  { slug: 'ssn', label: 'SSN' },
  { slug: 'checkers', label: 'Checkers' },
  { slug: 'dumps', label: 'Dumps' },
  { slug: 'sms-activate', label: 'SMS Activate' },
  { slug: 'flooders', label: 'Flooders' },
  { slug: 'proxies', label: 'Proxies' },
  { slug: 'banks_and_accounts', label: 'Banks & Accounts' },
  { slug: 'otp-bot', label: 'OTP BOT' },
  { slug: 'rdp', label: 'RDPs' },
];

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  category: string;
  price: number;
  metadata: Record<string, string>;
  active: boolean;
};

export default function AdminProductsPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState('cvv');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const fields = ITEM_FIELDS[category] ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'products', category],
    queryFn: () => api<{ items: AdminProduct[] }>(`/api/admin/products?limit=100&category=${encodeURIComponent(category)}`),
    refetchInterval: 8000,
  });

  const create = useMutation({
    mutationFn: () =>
      api('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          slug: `${category}-${Date.now().toString(36)}`,
          category,
          price: Number(price || 0),
          metadata: meta,
          active: true,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      setName('');
      setPrice('');
      setMeta({});
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/admin/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'products'] }),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-6">
      <div className="admin-card">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="admin-section__title">Add Product</h2>
          <select
            className="admin-input w-auto"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setMeta({});
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="mb-2 text-xs text-[#ff6b6b]">{error}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Title (internal)"
            className="admin-input"
          />
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price ($)"
            className="admin-input"
          />
          {fields.map((f) => (
            <input
              key={f.key}
              type={f.type ?? 'text'}
              value={meta[f.key] ?? ''}
              onChange={(e) => setMeta((m) => ({ ...m, [f.key]: e.target.value }))}
              placeholder={f.label}
              className="admin-input"
            />
          ))}
        </div>
        <button
          type="button"
          className="admin-btn mt-4"
          disabled={!name.trim() || !price || create.isPending}
          onClick={() => create.mutate()}
        >
          Add To {CATEGORIES.find((c) => c.slug === category)?.label}
        </button>
        <p className="mt-2 text-xs text-[#8b98a3]">
          Products added here appear instantly (within ~5 seconds) on the user dashboard page for the same category.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="admin-table w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Title</th>
              {fields.slice(0, 6).map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th>Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-[#8b98a3]" colSpan={fields.length + 3}>
                  Loading...
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 text-left font-bold text-white">{p.name}</td>
                {fields.slice(0, 6).map((f) => (
                  <td key={f.key}>{p.metadata?.[f.key] || '—'}</td>
                ))}
                <td>{formatMoney(p.price)}</td>
                <td>
                  <button type="button" className="admin-btn admin-btn--ghost !px-3" onClick={() => remove.mutate(p.id)}>
                    <Trash2 className="h-4 w-4 text-[#ff6b6b]" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
