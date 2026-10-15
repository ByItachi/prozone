'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const AuthThemeContext = React.createContext(true);

export function useAuthTheme() {
  return React.useContext(AuthThemeContext);
}

export function AuthShell({
  title,
  tabs = false,
  activeTab = 'signin',
  wide = false,
  footer,
  notice,
  children,
}: {
  title?: string;
  tabs?: boolean;
  activeTab?: 'signin' | 'signup';
  wide?: boolean;
  footer?: React.ReactNode;
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AuthShellSuspense
      title={title}
      tabs={tabs}
      activeTab={activeTab}
      wide={wide}
      footer={footer}
      notice={notice}
    >
      {children}
    </AuthShellSuspense>
  );
}

function AuthShellSuspense({
  title,
  tabs,
  activeTab,
  wide,
  footer,
  notice,
  children,
}: {
  title?: string;
  tabs?: boolean;
  activeTab?: 'signin' | 'signup';
  wide?: boolean;
  footer?: React.ReactNode;
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0b151e]">
          <svg className="h-8 w-8 animate-spin text-[#ed5d15]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="#ed5d15" strokeOpacity="0.25" strokeWidth="4" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#ed5d15" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
      }
    >
      <AuthShellInner
        title={title}
        tabs={tabs}
        activeTab={activeTab}
        wide={wide}
        footer={footer}
        notice={notice}
      >
        {children}
      </AuthShellInner>
    </Suspense>
  );
}

function AuthShellInner({
  title,
  tabs,
  activeTab,
  wide,
  footer,
  notice,
  children,
}: {
  title?: string;
  tabs?: boolean;
  activeTab?: 'signin' | 'signup';
  wide?: boolean;
  footer?: React.ReactNode;
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const qs = next && next !== '/' ? `?next=${next}` : '';

  const [dark, setDark] = React.useState(true);
  const [showVideo, setShowVideo] = React.useState(true);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('np-auth-theme');
      if (saved) setDark(saved === 'dark');
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem('np-auth-theme', dark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [dark]);

  return (
    <AuthThemeContext.Provider value={dark}>
      <div
        className={cn(
          'new-auth-bg relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-[60px]',
          dark ? 'auth-shell-dark' : 'auth-shell-light',
        )}
        style={{ backgroundColor: dark ? '#0b151e' : '#f9f9f9', color: dark ? '#fff' : '#242c36' }}
      >
        {/* Theme toggle (.main__theme) */}
        <button
          type="button"
          onClick={() => setDark((v) => !v)}
          title="Theme"
          aria-label="Toggle theme"
          className={cn(
            'absolute right-[40px] top-[40px] z-20 flex h-[40px] w-[40px] items-center justify-center rounded-[10px] border transition-colors',
            dark
              ? 'border-white/10 bg-[#0f131e] text-white hover:bg-[#162027]'
              : 'border-[rgba(15,19,30,0.1)] bg-white text-[#1a2833] hover:bg-black/5',
          )}
        >
          {/* theme_l icon (prozone) is white; darken it on the white (light) button */}
          <Image src="/theme-l.svg" alt="" width={18} height={19} className={cn('h-[18px] w-[18px]', !dark && 'brightness-0')} />
        </button>

        {/* Card wrapper (.main__wrapper) */}
        <div
          className={cn(
            'relative z-10 w-full',
            notice
              ? 'grid grid-cols-1 justify-items-center gap-[20px] lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-[50px]'
              : 'flex flex-col items-center justify-center',
          )}
        >
          {notice && (
            <div className="flex w-full justify-center lg:col-start-3 lg:row-start-1 lg:justify-start">
              {notice}
            </div>
          )}

          {/* Card (.whitebg .main__form) */}
          <div
            className={cn(
              'relative w-full animate-fade-in rounded-[20px]',
              notice && 'lg:col-start-2 lg:row-start-1',
              notice
                ? 'max-w-[500px] p-5 lg:px-[40px] lg:py-[30px]'
                : 'max-w-[600px] p-5 sm:px-[40px] sm:py-[30px] lg:p-[70px]',
              dark ? 'bg-[#040e16]' : 'bg-white shadow-[0_4px_40px_rgba(18,26,34,0.08)]',
            )}
          >
            <div className={cn('mx-auto', wide ? 'max-w-[440px]' : 'max-w-[380px]')}>
            {/* Logo (.main__form-logo) */}
            <div className="mb-[40px] flex justify-center">
              <Link href="/" className="flex items-center">
                <Image
                  src={dark ? '/logo_b_2.png' : '/logo_b_1.png'}
                  alt="Prozone"
                  width={223}
                  height={48}
                  priority
                  className="h-[48px] w-auto"
                />
              </Link>
            </div>

            {/* Tabs (.main__form-tab) */}
            {tabs ? (
              <div className="mx-auto max-w-[300px]">
                <ul className="m-0 flex list-none p-0 pb-[20px]">
                  <li className="basis-1/2">
                    <Link href={`/login${qs}`} className="block cursor-pointer">
                      <span
                        className={cn(
                          'block border-b pb-[10px] text-center font-display text-[30px] uppercase leading-[33px] transition-colors',
                          activeTab === 'signin'
                            ? cn('border-[#ed5d15]', dark ? 'text-white' : 'text-[#1a2833]')
                            : dark
                              ? 'border-[#272a34] text-[#272a34]'
                              : 'border-[#e6e6e6] text-[#e6e6e6]',
                        )}
                      >
                        SIGN in
                      </span>
                    </Link>
                  </li>
                  <li className="basis-1/2">
                    <Link href={`/register${qs}`} className="block cursor-pointer">
                      <span
                        className={cn(
                          'block border-b pb-[10px] text-center font-display text-[30px] uppercase leading-[33px] transition-colors',
                          activeTab === 'signup'
                            ? cn('border-[#ed5d15]', dark ? 'text-white' : 'text-[#1a2833]')
                            : dark
                              ? 'border-[#272a34] text-[#272a34]'
                              : 'border-[#e6e6e6] text-[#e6e6e6]',
                        )}
                      >
                        SIGN up
                      </span>
                    </Link>
                  </li>
                </ul>
              </div>
            ) : (
              title && (
                <div className="mx-auto mb-[40px] max-w-[300px]">
                  <span
                    className={cn(
                      'block border-b border-[#ed5d15] pb-[10px] text-center font-display text-[30px] uppercase leading-[33px]',
                      dark ? 'text-white' : 'text-[#1a2833]',
                    )}
                  >
                    {title}
                  </span>
                </div>
              )
            )}

            {children}

            {footer && (
              <div className={cn('mt-[50px] text-center text-[20px] leading-[1.5]', dark ? 'text-white' : 'text-[#242c36]')}>
                {footer}
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Video instruction frame (.fixVideo__frame) */}
        {showVideo && (
          <div className="absolute bottom-[35px] right-[35px] z-10 hidden w-[320px] lg:block">
            <button
              type="button"
              onClick={() => setShowVideo(false)}
              aria-label="Close video"
              className="absolute right-0 top-[-32px] h-[20px] w-[20px]"
            >
              <Image src="/closevideo.svg" alt="Close" width={20} height={20} className="h-[20px] w-[20px] opacity-70 transition-opacity hover:opacity-100" />
            </button>
            <div className="relative overflow-hidden rounded-[10px]">
              <Image src="/videoimg.png" alt="Video instruction" width={640} height={400} className="block h-auto w-full" />
              <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(26,40,51,0.8),rgba(26,40,51,0.8))]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px] px-6 text-center text-white">
                <span className="flex h-[40px] w-[56px] items-center justify-center rounded-[10px] bg-[#ed5d15]">
                  <Play className="h-[18px] w-[18px] fill-white text-white" />
                </span>
                <span className="font-display text-[24px] font-normal leading-none">Video instruction</span>
                <span className="font-display text-[24px] font-bold leading-none">How to register on Prozone</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthThemeContext.Provider>
  );
}
