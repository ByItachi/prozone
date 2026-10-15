'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Wallet as WalletType } from '@/lib/types';
import { NewsPopup } from '@/components/news-popup';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '/sider/sider_m1_1.svg', exact: true },
  { href: '/cvv', label: 'Credit Cards', icon: '/sider/sider_m1_2.svg' },
  { href: '/ssn', label: 'SSN', icon: '/sider/sider_m1_3.svg' },
  { href: '/checkers', label: 'Checkers', icon: '/sider/sider_m1_4.svg' },
  { href: '/dumps', label: 'Dumps', icon: '/sider/sider_m1_5.svg' },
  { href: '/sms-activate', label: 'SMS activate', icon: '/sider/sider_m1_6.svg' },
  { href: '/flooders', label: 'Flooders', icon: '/sider/sider_m1_7.svg' },
  { href: '/proxies', label: 'Proxies', icon: '/sider/sider_m1_8.svg' },
  { href: '/banks_and_accounts', label: 'Banks & Accounts', icon: '/sider/sider_m1_9.svg' },
  { href: '/otp-bot', label: 'OTP BOT', icon: '/sider/sider_m1_10.svg' },
  { href: '/rdp', label: 'RDPs', icon: '/sider/sider_m1_11.svg' },
];

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10.5" fill="#2AABEE" />
      <path
        d="M5.6 11.9l10.2-4.1c.5-.2.9.1.7.9l-1.7 8.1c-.1.6-.5.7-1 .5l-2.9-2.1-1.4 1.4c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.3-.1L8 12.7l-2.9-.9c-.6-.2-.6-.6.5-.9z"
        fill="#fff"
      />
    </svg>
  );
}

function SwapIcon({
  light,
  dark,
  w = 18,
  h = 18,
}: {
  light: string;
  dark: string;
  w?: number;
  h?: number;
}) {
  return (
    <span className="changeimg">
      <Image src={light} alt="" width={w} height={h} />
      <Image src={dark} alt="" width={w} height={h} />
    </span>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuHidden, setMenuHidden] = useState(false);
  const [dark, setDark] = useState(true);

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<WalletType>('/api/wallet'),
  });

  const balance = formatMoney(wallet?.balance ?? 0, wallet?.currency ?? 'USD');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('np-dark');
      if (saved) {
        setDark(saved === '1');
      } else {
        setDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('np-dark', dark ? '1' : '0');
    } catch {
      // ignore
    }
  }, [dark]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('np-menu-hidden');
      if (saved) setMenuHidden(saved === '1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('np-menu-hidden', menuHidden ? '1' : '0');
    } catch {
      // ignore
    }
  }, [menuHidden]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login?next=/');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1a2833]">
        <div className="space-y-3 text-center">
          <div className="skeleton mx-auto h-10 w-10 rounded-xl" />
          <p className="text-sm text-[#8b98a3]">Loading panel...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className={cn('dashboard-shell', dark && 'dark dark_theme', menuHidden && 'sidebar-hidden')}>
      {user && <NewsPopup />}
      <header
        className="header2 flex items-center justify-between"
        data-testid="header2"
      >
        <div className="flex items-center">
          <Link href="/" className="header2__logo">
            <Image
              src="/header2/header_logo2.png"
              alt="Prozone"
              width={160}
              height={35}
              priority
              style={{ height: 40, width: 'auto' }}
            />
          </Link>
        </div>

        <div className="header2__right flex items-center">
          <div>
            <Link href="/services" className="header2__button">
              <Image src="/header2/h2_seller.svg" alt="" width={18} height={17} />
              Become seller
            </Link>
          </div>

          <div className="header2__whitebutton">
            <SwapIcon light="/header2/h2_wallet.svg" dark="/header2/h2_wallet_d.svg" />
            {balance}
          </div>

          <Link href="/" className="header2__order">
            <SwapIcon light="/header2/h2_news.svg" dark="/header2/h2_news_d.svg" />
            News
          </Link>

          <button
            type="button"
            className="header2__theme changeimg"
            onClick={() => setDark((v) => !v)}
            title="Theme"
          >
            <Image src="/header2/h2_theme_l.svg" alt="" width={40} height={40} />
            <Image src="/header2/h2_theme_d.svg" alt="" width={40} height={40} />
          </button>

          <div className="header2__right-border flex items-center">
            <div className="header2__balance">
              <div className="header2__balance-left">
                <SwapIcon light="/header2/h2_balance.svg" dark="/header2/h2_balance_d.svg" />
                <span>{balance}</span>
              </div>
              <Link href="/wallet">Top up balance</Link>
            </div>

            <Link href="/cart" className="header2__order">
              <SwapIcon
                light="/header2/h2_orders.svg"
                dark="/header2/h2_orders_d.svg"
                w={14}
                h={18}
              />
              CART
            </Link>

            <Link href="/orders" className="header2__order">
              <SwapIcon
                light="/header2/h2_orders.svg"
                dark="/header2/h2_orders_d.svg"
                w={14}
                h={18}
              />
              MY ORDERS
            </Link>

            <div className="header2__user">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/header2/h2_user.png"
                alt=""
                width={40}
                height={40}
                className={cn('js-openUserList', menuOpen && 'active')}
                onClick={() => setMenuOpen((v) => !v)}
              />
              <div className="header2__user-body">
                <ul>
                  <li>
                    <Link href="/settings" onClick={() => setMenuOpen(false)}>
                      <Image src="/header2/profile-1.svg" alt="" width={18} height={18} />
                      Profile
                    </Link>
                  </li>
                  <li>
                    <Link href="/settings" onClick={() => setMenuOpen(false)}>
                      <Image src="/header2/profile-7.svg" alt="" width={18} height={18} />
                      Invitation
                    </Link>
                  </li>
                  <li>
                    <Link href="#" onClick={() => setMenuOpen(false)}>
                      <Image src="/header2/profile-2.svg" alt="" width={18} height={18} />
                      Rules
                    </Link>
                  </li>
                  <li>
                    <Link href="#" onClick={() => setMenuOpen(false)}>
                      <Image src="/header2/profile-3.svg" alt="" width={18} height={18} />
                      FAQ
                    </Link>
                  </li>
                  <li>
                    <Link href="/tickets" onClick={() => setMenuOpen(false)}>
                      <Image src="/header2/profile-4.svg" alt="" width={18} height={18} />
                      Support
                    </Link>
                  </li>
                  <li>
                    <button type="button" onClick={() => void logout()}>
                      <Image src="/header2/profile-5.svg" alt="" width={18} height={18} />
                      Log out
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={cn('burger__wrap', sidebarOpen && 'open')}
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Menu"
          >
            <div className="burger">
              <span />
              <span />
              <span />
              <span />
            </div>
          </button>
        </div>
      </header>

      <aside
        className={cn('sidebar', sidebarOpen && 'open', menuHidden && 'hide')}
        data-testid="sidebar"
      >
        <div className="sidebar__wrapper">
          <div className="sidebar__top">
            <div className="sidebar__header">
              <Link href="/services" className="header2__button">
                <Image src="/header2/h2_seller.svg" alt="" width={18} height={17} />
                Become seller
              </Link>
              <div className="header2__whitebutton">
                <SwapIcon light="/header2/h2_wallet.svg" dark="/header2/h2_wallet_d.svg" />
                {balance}
              </div>
              <div className="header2__balance">
                <div className="header2__balance-left">
                  <SwapIcon light="/header2/h2_balance.svg" dark="/header2/h2_balance_d.svg" />
                  <span>{balance}</span>
                </div>
                <Link href="/wallet" onClick={() => setSidebarOpen(false)}>
                  Top up balance
                </Link>
              </div>
            </div>

            <div className="sidebar__block">
              <div className="sidebar__block-title">Our Services</div>
              <ul>
                {NAV.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <li key={item.href} className={cn(active && 'active')}>
                      <Link href={item.href} onClick={() => setSidebarOpen(false)}>
                        <Image src={item.icon} alt="" width={20} height={20} className="h-5 w-5 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="sidebar__block">
              <div className="sidebar__block-title">Contacts</div>
              <ul>
                <li>
                  <a
                    href="https://t.me/+OKpO3b2M5nxlN2Zk"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <TelegramIcon />
                    <span>Telegram</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="sidebar__border" />
      </aside>

      <button
        type="button"
        className={cn('sidebar__hidetoggle', menuHidden && 'hide')}
        onClick={() => setMenuHidden((v) => !v)}
        aria-label={menuHidden ? 'Show menu' : 'Hide menu'}
      >
        {menuHidden ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        <span>{menuHidden ? 'Show menu' : 'Hide menu'}</span>
      </button>

      <div className="layout">
        <main className="w-full px-5 py-5 lg:px-8 lg:py-6">
          {children}
        </main>
        <footer className="px-6 pb-5 text-right text-[15px] text-[#505961] dark:text-[#d1d7df]">
          Prozone © 2021-2025 | Version 2.1
        </footer>
      </div>
    </div>
  );
}
