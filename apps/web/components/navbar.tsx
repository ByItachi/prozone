'use client';

import Link from 'next/link';
import Image from 'next/image';
import { LayoutDashboard, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Navbar({ transparent = false }: { transparent?: boolean }) {
  const { user, loading } = useAuth();

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-border/60 backdrop-blur-xl',
        transparent ? 'bg-background/60' : 'bg-background/80',
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo_b_1.png"
            alt="Prozone"
            width={149}
            height={32}
            priority
            className="h-8 w-auto dark:hidden"
          />
          <Image
            src="/logo_b_2.png"
            alt="Prozone"
            width={149}
            height={32}
            priority
            className="hidden h-8 w-auto dark:block"
          />
        </Link>

        <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          <Link href="/#products" className="rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground">
            Products
          </Link>
          <Link href="/#features" className="rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground">
            Features
          </Link>
          <Link href="/#why-us" className="rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground">
            Why Us?
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {loading ? null : user ? (
            <>
              <Link href="/">
                <Button size="sm" className="hidden sm:inline-flex">
                  <LayoutDashboard className="h-4 w-4" />
                  Panel
                </Button>
              </Link>
              <Link href="/" className="sm:hidden">
                <Button size="icon" variant="secondary">
                  <LayoutDashboard className="h-4 w-4" />
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">
                  <Shield className="h-4 w-4" />
                  Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}