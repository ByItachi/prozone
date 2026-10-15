'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type AdminUser = {
  id: string;
  name: string | null;
  surname: string | null;
  username: string | null;
  email: string;
  status: string;
  role: string;
  balance: number;
  orderCount: number;
  serviceCount: number;
  ticketCount: number;
};

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () =>
      api<{ items: AdminUser[] }>(`/api/admin/users?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const adjust = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      api(`/api/admin/users/${id}/wallet`, {
        method: 'POST',
        body: JSON.stringify({ amount, reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSelected(null);
      setAmount('');
      setReason('');
      setError(null);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, username or email..."
        className="admin-input w-full max-w-sm"
      />

      <div className="overflow-x-auto">
        <table className="admin-table w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Balance</th>
              <th className="px-4 py-2">Orders / Services / Tickets</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-[#8b98a3]" colSpan={6}>
                  Loading...
                </td>
              </tr>
            )}
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2 text-left">
                  <div className="font-bold text-white">
                    {u.name} {u.surname}
                  </div>
                  <div className="text-xs text-[#8b98a3]">
                    {u.username ?? u.email} · {u.email}
                  </div>
                </td>
                <td>{u.role}</td>
                <td>{u.status}</td>
                <td>{formatMoney(u.balance)}</td>
                <td className="text-xs text-[#8b98a3]">
                  {u.orderCount} / {u.serviceCount} / {u.ticketCount}
                </td>
                <td>
                  <button type="button" className="admin-btn" onClick={() => setSelected(u)}>
                    Edit Balance
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="admin-card w-full max-w-sm" style={{ background: '#1a2933' }}>
            <h3 className="admin-section__title mb-1 !text-[20px]">
              {selected.name} {selected.surname}
            </h3>
            <p className="mb-3 text-xs text-[#8b98a3]">
              Current balance: {formatMoney(selected.balance)}. Negative amount deducts from balance.
            </p>
            {error && <p className="mb-2 text-xs text-[#ff6b6b]">{error}</p>}
            <div className="space-y-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount (e.g. 25 or -10)"
                className="admin-input w-full"
              />
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason"
                className="admin-input w-full"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn"
                disabled={!amount || reason.trim().length < 3 || adjust.isPending}
                onClick={() =>
                  selected &&
                  adjust.mutate({ id: selected.id, amount: Number(amount), reason: reason.trim() })
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
