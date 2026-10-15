'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, statusLabel, statusClass } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Ticket, TicketMessage } from '@/lib/types';

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['tickets', params.id],
    queryFn: () => api<Ticket>(`/api/tickets/${params.id}`),
  });

  const [body, setBody] = useState<string>('');

  const reply = useMutation({
    mutationFn: async () => {
      await api<{ id: string }>(`/api/tickets/${params.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: body }),
      });
    },
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['tickets', params.id] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (err) => toast.error(getErrorMessage(err), { position: 'top-center' }),
  });

  const close = useMutation({
    mutationFn: async () => {
      await api(`/api/tickets/${params.id}/close`, { method: 'POST', body: JSON.stringify({}) });
    },
    onSuccess: () => {
      toast.success('Ticket closed', { position: 'top-center' });
      qc.invalidateQueries({ queryKey: ['tickets', params.id] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (err) => toast.error(getErrorMessage(err), { position: 'top-center' }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground/50" />
        <p className="font-medium">Ticket not found</p>
        <Button variant="outline" onClick={() => router.push('/tickets')}>Go back</Button>
      </div>
    );
  }

  const isClosed = ticket.status === 'CLOSED';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold">{ticket.subject}</h1>
            <Badge className={statusClass(ticket.status)}>{statusLabel(ticket.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.ticketNumber} · {ticket.category} · {formatDate(ticket.createdAt)}
          </p>
        </div>
        {!isClosed && (
          <Button variant="outline" size="sm" className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10" onClick={() => close.mutate(undefined)} disabled={close.isPending}>
            Close Ticket
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {ticket.messages?.map((m) => {
          const sender = m.sender as { name?: string; surname?: string; username?: string; role?: { name?: string } } | undefined;
          const me = user?.id === m.senderId;
          const isStaff = m.isStaff || sender?.role?.name === 'ADMIN' || sender?.role?.name === 'SUPPORT';
          return (
            <div key={m.id} className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl border px-4 py-3 ${
                  me
                    ? 'border-primary/40 bg-primary/10'
                    : isStaff
                      ? 'border-violet-500/30 bg-violet-500/10'
                      : 'border-border bg-card'
                }`}
              >
                <div className={`mb-1 text-xs text-muted-foreground ${me ? 'text-right' : ''}`}>
                  <span className="font-medium text-foreground">
                    {me ? 'You' : sender?.name ? [sender.name, sender.surname].filter(Boolean).join(' ') : 'Support Team'}
                  </span>
                  {isStaff && !me && <span className="ml-1.5 text-violet-400">· Support</span>}
                  <span className="ml-1.5">{formatDate(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {!isClosed ? (
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Write your reply..."
          />
          <Button onClick={() => reply.mutate(undefined)} disabled={reply.isPending || body.trim().length === 0}>
            {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">This ticket has been closed.</p>
      )}
    </div>
  );
}