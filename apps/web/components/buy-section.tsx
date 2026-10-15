'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, CreditCard, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Product } from '@/lib/types';

type Cycle = 'one_time' | 'monthly' | 'yearly';

const CYCLES: { value: Cycle; label: string; suffix: string }[] = [
  { value: 'one_time', label: 'One-time', suffix: '' },
  { value: 'monthly', label: 'Monthly', suffix: '/mo' },
  { value: 'yearly', label: 'Yearly', suffix: '/yr' },
];

const METHODS: { value: 'wallet' | 'mock'; icon: typeof Wallet; label: string; desc: string }[] = [
  { value: 'wallet', icon: Wallet, label: 'Wallet Balance', desc: 'Deducted instantly from your balance' },
  { value: 'mock', icon: CreditCard, label: 'Credit Card (Test)', desc: 'Mock payment gateway' },
];

export function BuySection({ product }: { product: Product }) {
  const { user } = useAuth();
  const router = useRouter();
  const [cycle, setCycle] = useState<Cycle>('yearly');
  const [method, setMethod] = useState<'wallet' | 'mock'>('wallet');
  const [busy, setBusy] = useState(false);

  const amountFor = (c: Cycle) => product.prices?.find((p) => p.cycle === c)?.amount ?? product.price;

  const handleBuy = async () => {
    if (!user) {
      router.push(`/login?next=/product/${product.slug}`);
      return;
    }
    setBusy(true);
    try {
      const orderData = await api<{ order: { id: string } }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          billingCycle: cycle,
          configuration: {},
        }),
      });
      const payData = await api<{ finalized?: boolean; requiresConfirmation?: boolean; providerRef?: string; payment?: unknown }>(
        `/api/orders/${orderData.order.id}/pay`,
        {
          method: 'POST',
          body: JSON.stringify({ method }),
        },
      );
      if (payData.requiresConfirmation && !payData.finalized && payData.providerRef) {
        await api('/api/payments/confirm', {
          method: 'POST',
          body: JSON.stringify({ providerRef: payData.providerRef }),
        });
      }
      toast.success('Payment successful, your service has been activated!', { position: 'top-center' });
      router.push('/services');
    } catch (err) {
      const msg = getErrorMessage(err);
      toast.error(msg, { position: 'top-center' });
      if (msg.includes('log in') || msg.includes('permission')) {
        router.push(`/login?next=/product/${product.slug}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-baseline gap-2">
        <span className="text-3xl font-bold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: product.currency, maximumFractionDigits: 0 }).format(amountFor(cycle))}</span>
        <span className="text-sm text-muted-foreground">
          {CYCLES.find((c) => c.value === cycle)?.suffix}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {CYCLES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCycle(c.value)}
            className={cn(
              'rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors',
              cycle === c.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-zinc-600',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mb-5 space-y-2">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMethod(m.value)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
              method === m.value
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-zinc-600',
            )}
          >
            <m.icon className="h-4 w-4 text-primary" />
            <span className="flex-1">
              <span className="block text-sm font-medium">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      <Button className="w-full" size="lg" onClick={handleBuy} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            Buy Now
            <ChevronRight className="h-4 w-4" />
          </>
        )}
      </Button>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Your services are added to the panel instantly after purchase.
      </p>
    </div>
  );
}