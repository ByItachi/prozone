'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ShopPage } from '@/components/shop/ui';
import { SHOP_CONFIGS } from '@/components/shop/configs';

export default function CategoryPage() {
  const params = useParams<{ slug: string }>();
  const config = params?.slug ? SHOP_CONFIGS[params.slug] : undefined;

  if (!config || RESERVED_SLUGS.has(params.slug)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
        <p className="font-medium">Category not found</p>
        <Link href="/" className="text-sm text-primary hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <ShopPage config={config} category={params.slug} />;
}

const RESERVED_SLUGS = new Set(['orders', 'invoices', 'tickets', 'settings', 'wallet', 'services']);
