'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Coupon = {
  id: string;
  code: string;
  discountPercent: number;
  discountAmount: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
};

export default function AdminCouponsPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => api<Coupon[]>('/api/admin/coupons'),
  });

  const create = useMutation({
    mutationFn: () =>
      api('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discountAmount: Number(discountAmount || 0),
          discountPercent: Number(discountPercent || 0),
          maxUses: Number(maxUses || 1),
          active: true,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      setCode('');
      setDiscountAmount('');
      setDiscountPercent('');
      setMaxUses('1');
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/admin/coupons/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }),
  });

  return (
    <div className="space-y-6">
      <div className="admin-card">
        <h2 className="admin-section__title mb-4">Create New Coupon</h2>
        {error && <p className="mb-2 text-xs text-[#ff6b6b]">{error}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CODE"
            className="admin-input"
          />
          <input
            type="number"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            placeholder="Fixed amount ($)"
            className="admin-input"
          />
          <input
            type="number"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder="Percent (%)"
            className="admin-input"
          />
          <input
            type="number"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="Max uses"
            className="admin-input"
          />
        </div>
        <button
          type="button"
          className="admin-btn mt-4"
          disabled={code.trim().length < 3 || create.isPending}
          onClick={() => create.mutate()}
        >
          Create Coupon
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="admin-table w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Discount</th>
              <th className="px-4 py-2">Uses</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-[#8b98a3]" colSpan={5}>
                  Loading...
                </td>
              </tr>
            )}
            {data?.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-mono font-bold text-white">{c.code}</td>
                <td className="px-4 py-2">
                  {c.discountAmount > 0 ? formatMoney(c.discountAmount) : `${c.discountPercent}%`}
                </td>
                <td className="px-4 py-2">
                  {c.usedCount} / {c.maxUses}
                </td>
                <td className="px-4 py-2">{c.active ? 'Active' : 'Passive'}</td>
                <td className="px-4 py-2">
                  <button type="button" className="admin-btn admin-btn--ghost !px-3" onClick={() => remove.mutate(c.id)}>
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
