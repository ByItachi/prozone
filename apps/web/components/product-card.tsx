'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Check, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import type { Product } from '@/lib/types';

function cyclePrice(product: Product, cycle: string): number {
  const found = product.prices?.find((p) => p.cycle === cycle);
  return found?.amount ?? product.price;
}

export function ProductCard({ product }: { product: Product }) {
  const monthly = cyclePrice(product, 'monthly');
  const yearly = cyclePrice(product, 'yearly');
  const imageUrl = (product.metadata?.image as string | undefined) ?? null;

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
      <div className="relative h-40 w-full overflow-hidden border-b border-border/60 bg-gradient-to-br from-zinc-900 to-zinc-950">
        {imageUrl ? (
          <Image src={imageUrl} alt={product.name} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Zap className="h-10 w-10 text-primary/40" />
          </div>
        )}
        {product.featured && (
          <div className="absolute left-3 top-3">
            <Badge className="border-transparent bg-primary text-primary-foreground">Featured</Badge>
          </div>
        )}
        <div className="absolute right-3 top-3">
          <Badge className="border-transparent bg-black/50 text-muted-foreground backdrop-blur">
            {product.category}
          </Badge>
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="text-base font-semibold">{product.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        </div>

        <ul className="mt-1 space-y-1.5 text-sm">
          {(product.features ?? []).slice(0, 3).map((feat, i) => (
            <li key={i} className="flex items-start gap-2 text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="line-clamp-1">{feat}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold">{formatMoney(yearly, product.currency)}</span>
            <span className="text-xs text-muted-foreground">/yr</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            or {formatMoney(monthly, product.currency)}/mo · {formatMoney(cyclePrice(product, 'one_time'), product.currency)} one-time
          </div>
        </div>
      </CardContent>

      <CardFooter className="border-t border-border/60 p-4">
        <Link href={`/product/${product.slug}`} className="w-full">
          <Button variant="outline" className="w-full group-hover:border-primary/60 group-hover:text-primary">
            View
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}