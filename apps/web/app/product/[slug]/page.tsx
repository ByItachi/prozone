import { notFound } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Product } from '@/lib/types';
import { Navbar } from '@/components/navbar';
import { BuySection } from '@/components/buy-section';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/format';

async function getProduct(slug: string): Promise<Product | null> {
  try {
    const data = await api<Product>(`/api/products/${slug}`, { cache: 'no-store' as RequestCache });
    return data;
  } catch {
    return null;
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) notFound();

  const limits = Object.entries(product.limits ?? {}) as [string, unknown][];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to products
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="border-transparent bg-primary/15 text-primary">{product.category}</Badge>
              {product.featured && <Badge className="border-transparent bg-emerald-500/15 text-emerald-300">Featured</Badge>}
            </div>
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">{product.description}</p>

            {(product.features?.length ?? 0) > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 font-semibold">Features</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {product.features!.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {limits.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 font-semibold">Package Details</h2>
                <div className="overflow-hidden rounded-xl border border-border">
                  {limits.map(([key, value], i) => (
                    <div key={key} className={`flex items-center justify-between px-4 py-3 text-sm ${i % 2 ? 'bg-card' : 'bg-card/50'}`}>
                      <span className="text-muted-foreground">{key}</span>
                      <span className="font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(product.prices?.length ?? 0) > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 font-semibold">Pricing</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {product.prices!.map((p) => (
                    <div key={p.cycle} className="rounded-xl border border-border bg-card p-4 text-center">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {p.cycle === 'one_time' ? 'One-time' : p.cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                      </div>
                      <div className="mt-2 text-xl font-bold">{formatMoney(p.amount, product.currency)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <BuySection product={product} />
          </div>
        </div>
      </div>
    </div>
  );
}