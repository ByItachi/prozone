'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, ZapOff } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatMoney, formatDate, statusLabel, statusClass } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Paginated, Service } from '@/lib/types';

export default function ServicesPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api<Paginated<Service>>('/api/services?limit=25'),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      await api(`/api/services/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
    },
    onSuccess: () => {
      toast.success('Service cancelled', { position: 'top-center' });
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['me', 'stats'] });
    },
    onError: (err) => toast.error(getErrorMessage(err), { position: 'top-center' }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">My Services</h1>
        <p className="text-sm text-muted-foreground">All your active and past services.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-44 rounded-xl" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
          <ZapOff className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">You have no active services</p>
          <Link href="/#products" className="text-sm text-primary hover:underline">
            Buy a product
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((s) => (
            <div key={s.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <ZapOff className="h-4 w-4 rotate-45" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.category}</div>
                  </div>
                </div>
                <Badge className={statusClass(s.status)}>{statusLabel(s.status)}</Badge>
              </div>

              <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Start</span>
                  <span className="text-foreground">{formatDate(s.startedAt ?? s.createdAt)}</span>
                </div>
                {s.renewalDate && (
                  <div className="flex justify-between">
                    <span>Renewal</span>
                    <span className="text-foreground">{formatDate(s.renewalDate)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Price</span>
                  <span className="font-semibold text-foreground">
                    {formatMoney(s.price, s.currency)}
                    {s.billingCycle === 'monthly' ? '/mo' : s.billingCycle === 'yearly' ? '/yr' : ''}
                  </span>
                </div>
              </div>

              {s.status === 'ACTIVE' && (
                <div className="mt-4 border-t border-border/60 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                    onClick={() => cancel.mutate(s.id)}
                    disabled={cancel.isPending}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Cancel Service
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}