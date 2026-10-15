'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney, formatDate, statusLabel, statusClass } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Order, Paginated } from '@/lib/types';

type TabKey = 'ALL' | 'PANEL' | 'SOCIAL' | 'STREAM' | 'OTHER';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ALL', label: 'ALL' },
  { key: 'PANEL', label: 'PANELS' },
  { key: 'SOCIAL', label: 'SOCIAL' },
  { key: 'STREAM', label: 'STREAMING' },
  { key: 'OTHER', label: 'OTHER' },
];

const PAGE_SIZE = 25;

function orderCategory(o: Order): TabKey {
  const slug = o.items?.[0]?.product?.slug ?? o.items?.[0]?.name ?? '';
  const s = slug.toLowerCase();
  if (/panel/.test(s)) return 'PANEL';
  if (/(social|instagram|follow|boost|profil)/.test(s)) return 'SOCIAL';
  if (/(stream|streaming|tv|iptv|broadcast)/.test(s)) return 'STREAM';
  return 'OTHER';
}

function CheckboxCell({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="pz-check" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <Check />
      </span>
    </label>
  );
}

export default function OrdersPage() {
  const [tab, setTab] = useState<TabKey>('ALL');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api<Paginated<Order>>('/api/orders?limit=100'),
  });

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { ALL: 0, PANEL: 0, SOCIAL: 0, STREAM: 0, OTHER: 0 };
    data?.items.forEach((o) => {
      c.ALL += 1;
      c[orderCategory(o)] += 1;
    });
    return c;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return tab === 'ALL' ? data.items : data.items.filter((o) => orderCategory(o) === tab);
  }, [data, tab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectPage = (p: number) => {
    setPage(Math.min(Math.max(1, p), totalPages));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleRow = (id: string, v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allSelected = pageItems.length > 0 && pageItems.every((o) => selected.has(o.id));

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wide">My Orders</h1>
          <p className="text-sm text-muted-foreground">Your full order history and statuses.</p>
        </div>
        <span className="pz-deleteafter">{filtered.length} orders</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
          <PackageOpen className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">You have no orders yet</p>
          <Link href="/#products" className="text-sm text-primary hover:underline">
            Browse products
          </Link>
        </div>
      ) : (
        <>
          <div className="pz-tabs">
            {TABS.map((t) => (
              <label key={t.key}>
                <input
                  type="radio"
                  name="order-type"
                  checked={tab === t.key}
                  onChange={() => {
                    setTab(t.key);
                    setPage(1);
                    setSelected(new Set());
                  }}
                />
                <span>
                  {t.label}
                  {counts[t.key] > 0 && <em>{counts[t.key]}</em>}
                </span>
              </label>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-[10px] bg-[#242c36] px-4 py-3 text-white">
              <span className="text-sm">{selected.size} orders selected</span>
              <button
                onClick={() => setSelected(new Set())}
                className="flex h-[35px] min-w-[100px] items-center justify-center rounded-[5px] bg-[#ed5d15] px-4 font-display text-xl uppercase tracking-[1.5px] hover:bg-[#d85311]"
              >
                Clear
              </button>
            </div>
          )}

          <div className="pz-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>
                    <CheckboxCell
                      checked={allSelected}
                      onChange={(v) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          pageItems.forEach((o) => {
                            if (v) next.add(o.id);
                            else next.delete(o.id);
                          });
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th>ORDER ID</th>
                  <th>SERVICE</th>
                  <th>DATE</th>
                  <th>CASH MOVEMENTS</th>
                  <th>STATUS</th>
                  <th>DELETE AFTER</th>
                  <th>SHOW</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((o) => {
                  const refunded = o.status === 'REFUNDED' || o.status === 'FAILED';
                  const isOpen = expanded.has(o.id);
                  const isSelected = selected.has(o.id);
                  const item = o.items?.[0];
                  return (
                    <Fragment key={o.id}>
                      <tr className={isOpen ? 'active' : undefined}>
                        <td>
                          <CheckboxCell
                            checked={isSelected}
                            onChange={(v) => toggleRow(o.id, v)}
                          />
                        </td>
                        <td className="font-bold whitespace-nowrap">#{o.orderNumber ?? o.id.slice(0, 8)}</td>
                        <td className="font-medium">{item?.name ?? item?.product?.slug ?? '—'}</td>
                        <td className="whitespace-nowrap">{formatDate(o.createdAt)}</td>
                        <td>
                          <div className={cn('pz-movements', refunded ? 'green' : 'red')}>
                            <span>
                              {refunded ? (
                                <ArrowUpRight className="h-4 w-4 text-white" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 text-white" />
                              )}
                            </span>
                            {refunded ? '+' : '-'}
                            {formatMoney(o.total, o.currency)}
                          </div>
                        </td>
                        <td>
                          <Badge className={statusClass(o.status)}>{statusLabel(o.status)}</Badge>
                        </td>
                        <td className="pz-deleteafter">—</td>
                        <td>
                          <button
                            onClick={() => toggleExpanded(o.id)}
                            className="sitebutton min-h-[35px] min-w-[100px] rounded-[5px] bg-[#ed5d15] px-4 font-display text-xl uppercase tracking-[1.5px] text-white hover:bg-[#d85311]"
                          >
                            {isOpen ? 'Hide' : 'Show'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="!border-0 !bg-card text-left">
                            <div className="max-w-3xl space-y-2 p-4 text-sm">
                              <div className="space-y-1.5">
                                {(o.items ?? []).map((it) => (
                                  <div key={it.id} className="flex justify-between gap-4">
                                    <span>{it.name}</span>
                                    <span className="text-muted-foreground">
                                      {it.quantity} × {formatMoney(it.unitPrice, o.currency)} / {o.billingCycle}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between gap-4 border-t border-border pt-2">
                                <span className="text-muted-foreground">Total</span>
                                <span className="font-semibold">{formatMoney(o.total, o.currency)}</span>
                              </div>
                              {o.payments && o.payments.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                  {(o.payments ?? []).map((p) => (
                                    <Badge key={p.id} className={statusClass(p.status)}>
                                      {p.provider} · {statusLabel(p.status)}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="pz-pagination">
              <ul>
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (safePage > 1) selectPage(safePage - 1);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </a>
                </li>
                {Array.from({ length: totalPages }).map((_, i) => {
                  const p = i + 1;
                  return p === safePage ? (
                    <li key={p}>
                      <span>{p}</span>
                    </li>
                  ) : (
                    <li key={p}>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          selectPage(p);
                        }}
                      >
                        {p}
                      </a>
                    </li>
                  );
                })}
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (safePage < totalPages) selectPage(safePage + 1);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </li>
              </ul>
            </nav>
          )}
        </>
      )}
    </div>
  );
}