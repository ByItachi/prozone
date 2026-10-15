'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PackageOpen, ShoppingCart, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { SHOP_CONFIGS } from '@/components/shop/configs';
import type { ShopProduct } from '@/components/shop/ui';

export default function CartPage() {
  const [removed, setRemoved] = useState<Record<string, boolean>>({});

  const products = useQuery({
    queryKey: ['products', 'cart-all'],
    queryFn: () => api<{ items: ShopProduct[] }>('/api/products?limit=50'),
    refetchInterval: 5000,
  });

  const items = useMemo(
    () => (products.data?.items ?? []).filter((p) => p.active && !removed[p.id]),
    [products.data, removed],
  );
  const total = items.reduce((sum, p) => sum + p.price, 0);

  return (
    <div className="shop">
      <div className="shop__head">
        <h1 className="shop__title">CART</h1>
        <span className="shop__price">{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <div className="shop__empty">
          <PackageOpen className="mx-auto mb-3 h-10 w-10 opacity-50" />
          Your cart is empty. Products added by admin appear here and on category pages.
          <div className="mt-3">
            <Link href="/" className="text-[#ed5d15] hover:underline">
              Browse categories
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="shop__table-wrap">
            <table className="shop__table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Details</th>
                  <th>Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="font-bold text-white">{p.name}</td>
                    <td>{SHOP_CONFIGS[p.category]?.title ?? p.category}</td>
                    <td className="text-xs">{Object.values(p.metadata ?? {}).filter(Boolean).slice(0, 4).join(' · ') || '—'}</td>
                    <td>{formatMoney(p.price)}</td>
                    <td>
                      <button
                        type="button"
                        className="shop__btn shop__btn--ghostback !px-2 !py-1"
                        onClick={() => setRemoved((r) => ({ ...r, [p.id]: true }))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="shop__row-actions">
            <span />
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold text-white">Total: {formatMoney(total)}</span>
              <button type="button" className="shop__btn shop__btn--lg" style={{ background: '#3f9e0f', color: '#fff' }}>
                <ShoppingCart className="h-5 w-5" /> CHECKOUT
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
