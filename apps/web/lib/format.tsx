export function formatMoney(amount: number | string | undefined | null, currency = 'USD'): string {
  const value = Number(amount ?? 0);
  if (Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatDate(input: string | Date | undefined | null): string {
  if (!input) return '—';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function formatDateOnly(input: string | Date | undefined | null): string {
  if (!input) return '—';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(d);
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  PAYMENT_PENDING: 'Payment Pending',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  PROCESSING: 'Processing',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
  EXPIRED: 'Expired',
  SUSPENDED: 'Suspended',
  BANNED: 'Banned',
  CLOSED: 'Closed',
  OPEN: 'Open',
  REFUNDED: 'Refunded',
  READ: 'Read',
  UNREAD: 'Unread',
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  SUCCEEDED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  PAID: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  OPEN: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  PAYMENT_PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  PROCESSING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  UNREAD: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  FAILED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  CANCELLED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  EXPIRED: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  CLOSED: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  SUSPENDED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  REFUNDED: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  READ: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

export function statusLabel(status: string | null | undefined): string {
  return status ? (STATUS_LABELS[status] ?? status) : '—';
}

export function statusClass(status: string | null | undefined): string {
  return status ? (STATUS_STYLES[status] ?? 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30') : 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30';
}

export function cycleLabel(cycle: string | null | undefined): string {
  switch (cycle) {
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    case 'one_time':
      return 'One-time';
    default:
      return cycle ?? '—';
  }
}