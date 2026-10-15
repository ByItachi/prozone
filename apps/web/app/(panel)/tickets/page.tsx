'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Headset, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, statusLabel, statusClass } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Paginated, Ticket } from '@/lib/types';

const PRIORITY_STYLE: Record<string, string> = {
  LOW: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  NORMAL: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  HIGH: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  URGENT: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export default function TicketsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => api<Paginated<Ticket>>('/api/tickets?limit=25'),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Support Tickets</h1>
          <p className="text-sm text-muted-foreground">Create a support ticket for your questions.</p>
        </div>
        <Link href="/tickets/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
          <Headset className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">You have no support tickets yet</p>
          <Link href="/tickets/new" className="text-sm text-primary hover:underline">
            Create your first ticket
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.items.map((t) => (
            <Link
              key={t.id}
              href={`/tickets/${t.id}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{t.subject}</span>
                  <Badge className={PRIORITY_STYLE[t.priority] ?? undefined}>{t.priority}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="text-primary">{t.ticketNumber}</span> · {t.category} · {formatDate(t.updatedAt)}
                </div>
              </div>
              <Badge className={statusClass(t.status)}>{statusLabel(t.status)}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}