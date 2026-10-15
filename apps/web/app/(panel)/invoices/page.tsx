'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, FileDown } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney, formatDate, statusLabel, statusClass } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Invoice, Paginated } from '@/lib/types';

export default function InvoicesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api<Paginated<Invoice>>('/api/invoices?limit=25'),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-sm text-muted-foreground">View and download your invoices as PDF.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">You have no invoices yet</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Invoice No</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data?.items.map((inv) => (
                  <tr key={inv.id} className="hover:bg-accent/40">
                    <td className="px-5 py-3.5 font-medium">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{formatDate(inv.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold">
                      {formatMoney(inv.total, inv.currency)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge className={statusClass(inv.status)}>{statusLabel(inv.status)}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm">
                          <FileDown className="h-3.5 w-3.5" />
                          PDF
                        </Button>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}