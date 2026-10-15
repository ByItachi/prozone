'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, LayoutDashboard, Users,
  TicketPercent, Box, Cable, Activity, ScanLine, Tags as TagsIcon,
  Shield, ScrollText, Hash, BarChart3, Settings as SettingsIcon, FileClock, Puzzle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import './admin.css';

const TABS = [
  { href: '/admin', label: 'Dashboard', exact: true, icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/coupons', label: 'Coupons', icon: TicketPercent },
  { href: '/admin/products', label: 'Products', icon: Box },
  { href: '/admin/access', label: 'Access Links', icon: Cable },
  { href: '/admin/sessions', label: 'Sessions', icon: Activity },
  { href: '/admin/tickets', label: 'Tickets', icon: ScanLine },
  { href: '/admin/roles', label: 'Roles', icon: TagsIcon },
  { href: '/admin/audit-logs', label: 'Audit', icon: ScrollText },
  { href: '/admin/md5', label: 'MD5', icon: Hash },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings', icon: SettingsIcon },
  { href: '/admin/logs', label: 'Logs', icon: FileClock },
  { href: '/admin/plugins', label: 'Plugins', icon: Puzzle },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = !!user && ['ADMIN', 'SUPER_ADMIN'].includes(user.role);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login?next=/admin');
    } else if (!isAdmin) {
      router.replace('/');
    }
  }, [loading, user, isAdmin, router]);

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b151e]">
        <Shield className="h-6 w-6 animate-spin text-[#ed5d15]" />
      </div>
    );
  }

  function isActive(tab: { href: string; exact?: boolean }) {
    return tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
  }

  return (
    <div className="dashboard-shell dark dark_theme admin-shell min-h-screen">
      <aside className="admin-sidenav">
        <a className="admin-sidenav__logo" href="/admin">
          PROZONE <b>ADMIN</b>
        </a>
        <span className="admin-sidenav__title">Menü</span>
        <nav className="admin-sidenav__nav">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link key={tab.href} href={tab.href} className={cn('admin-sidenav__link', isActive(tab) && 'active')}>
                <span className="admin-sidenav__icon"><Icon className="h-5 w-5" /></span>
                <span className="admin-sidenav__label">{tab.label}</span>
                <ChevronLeft className="admin-sidenav__arrow h-4 w-4" />
              </Link>
            );
          })}
        </nav>
        <div className="admin-sidenav__foot">
          <Link href="/" className="admin-sidenav__back">
            <ChevronLeft className="h-4 w-4" />
            <span>Back to Panel</span>
          </Link>
        </div>
      </aside>

      <div className="admin-side">
        <header className="header2 flex items-center justify-between" style={{ position: 'sticky', top: 0 }}>
          <div className="flex items-center gap-4">
            <a className="header2__logo" href="/admin">
              PROZONE <b>ADMIN</b>
            </a>
          </div>
          <a className="header2__order" href="/">
            <ChevronLeft className="h-4 w-4" />
            <span>Back to Panel</span>
          </a>
        </header>
        <main className="admin-main">{children}</main>
        <footer className="px-6 pb-5 text-right text-[15px] text-[#505961]">
          Prozone © 2021-2025 | Version 2.1
        </footer>
      </div>
    </div>
  );
}
