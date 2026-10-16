'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthShell, useAuthTheme } from '@/components/auth-shell';
import { AuthField } from '@/components/auth-field';
import { CaptchaField } from '@/components/captcha-field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function AssetIcon({ src }: { src: string }) {
  const dark = useAuthTheme();
  return (
    <Image
      src={src}
      alt=""
      width={21}
      height={21}
      className={cn('h-[21px] w-[21px]', dark && 'brightness-0 invert')}
    />
  );
}

const PasswordIcon = () => <AssetIcon src="/main_f_password-d2.b34950d.svg" />;
const MdsIcon = () => <AssetIcon src="/main_f_lock-d2.7eeb585.svg" />;
const UserIcon = () => <AssetIcon src="/indir.svg" />;

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0b151e]">
          <Loader2 className="h-8 w-8 animate-spin text-[#ed5d15]" />
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mdsCode, setMdsCode] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [mdsNumber, setMdsNumber] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rememberMe = true;

  const [require2FA, setRequire2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  useEffect(() => {
    setMdsNumber(1 + Math.floor(Math.random() * 4));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const data = await api<{ requires2FA?: boolean; tempToken?: string; user?: unknown }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier, password, rememberMe }),
        });
        if (data.requires2FA && data.tempToken) {
          setTempToken(data.tempToken);
          setRequire2FA(true);
        } else {
          await refreshUser();
          router.push(next);
          router.refresh();
        }
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [identifier, password, rememberMe, router, next, refreshUser],
  );

  const handle2FA = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await api('/api/auth/2fa/verify', {
          method: 'POST',
          body: JSON.stringify({ tempToken, totpCode }),
        });
        await refreshUser();
        router.push(next);
        router.refresh();
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [tempToken, totpCode, router, next, refreshUser],
  );

  return (
    <AuthShell
      tabs
      activeTab="signin"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link
            href={`/register${next !== '/' ? `?next=${next}` : ''}`}
            className="font-display text-2xl uppercase leading-none text-[#ed5d15] hover:border-b hover:border-[#ed5d15]"
          >
            SIGN UP
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {require2FA ? (
        <form onSubmit={handle2FA} className="space-y-[20px]">
          <AuthField
            id="totp"
            icon={ShieldCheck}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter MDS-CODE"
            inputMode="numeric"
            className="text-center text-xl tracking-[0.4em]"
            autoFocus
          />
          <Button
            type="submit"
            className="sitebutton block h-[60px] w-full rounded-[5px] bg-[#ed5d15] font-display text-2xl uppercase tracking-[1.5px] hover:bg-[#d85311]"
            disabled={busy || totpCode.length !== 6}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verify'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-[20px]">
          <AuthField
            id="identifier"
            icon={UserIcon}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Enter Username"
            autoComplete="username"
            autoFocus
          />
          <AuthField
            id="password"
            icon={PasswordIcon}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter Password"
            autoComplete="current-password"
          />
          <AuthField
            id="mdsCode"
            icon={MdsIcon}
            value={mdsCode}
            onChange={(e) => setMdsCode(e.target.value)}
            placeholder={`Enter MDS-CODE #${mdsNumber}`}
            autoComplete="off"
          />

          <CaptchaField value={captchaInput} onChange={setCaptchaInput} />

          <Button
            type="submit"
            className="sitebutton block h-[60px] w-full rounded-[5px] bg-[#ed5d15] font-display text-2xl uppercase tracking-[1.5px] hover:bg-[#d85311]"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
