'use client';

import { Suspense, useCallback, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthShell, useAuthTheme } from '@/components/auth-shell';
import { AuthField } from '@/components/auth-field';
import { CaptchaField } from '@/components/captcha-field';
import { DepositNoticeModal } from '@/components/deposit-notice';
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
const UserIcon = () => <AssetIcon src="/indir.svg" />;

function WarningIcon() {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 25 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-[25px] w-[25px] shrink-0"
    >
      <path
        d="M24.5002 18.2161L15.7417 3.0456C14.3111 0.539486 10.6934 0.539486 9.26797 3.0456L0.504274 18.2161C-0.926323 20.7222 0.854204 23.8356 3.74113 23.8356H21.2325C24.1194 23.8356 25.9308 20.6914 24.5002 18.2161ZM12.4997 20.4701C11.7381 20.4701 11.1051 19.8371 11.1051 19.0755C11.1051 18.3139 11.7381 17.6809 12.4997 17.6809C13.2613 17.6809 13.8943 18.3139 13.8634 19.1115C13.8994 19.8371 13.2304 20.4701 12.4997 20.4701ZM13.7708 11.4542C13.709 12.5349 13.6421 13.6104 13.5803 14.6911C13.5495 15.041 13.5495 15.3601 13.5495 15.7048C13.5186 16.2761 13.0709 16.7186 12.4997 16.7186C11.9285 16.7186 11.4859 16.3069 11.4499 15.7357C11.3573 14.053 11.2595 12.4011 11.1669 10.7183C11.136 10.2758 11.1051 9.82808 11.0691 9.38552C11.0691 8.65478 11.4808 8.0527 12.1497 7.86229C12.8187 7.70276 13.4826 8.02182 13.7708 8.65478C13.8685 8.87606 13.8994 9.09734 13.8994 9.35464C13.8685 10.0596 13.8016 10.7595 13.7708 11.4542Z"
        fill="#F00000"
      />
    </svg>
  );
}

function SignupNotice() {
  const dark = useAuthTheme();
  return (
    <aside
      className={cn(
        'w-full max-w-[472px] rounded-[10px] p-[25px] lg:rounded-[30px] lg:p-[50px]',
        dark
          ? 'bg-[#040e16] text-white'
          : 'border border-[rgba(15,19,30,0.08)] bg-white text-[#242c36] shadow-[0_4px_40px_rgba(18,26,34,0.08)]',
      )}
    >
      <div className="mb-[20px] flex items-center gap-[5px] font-display text-[30px] font-bold leading-[30px] text-[#f00000]">
        <span className="flex h-[30px] w-[25px] items-center">
          <WarningIcon />
        </span>
        Attention!
      </div>
      <ul className="m-0 list-none p-0 text-[16px] leading-[19.2px]">
        <li className="pl-[10px]">
          All new accounts will be <br />
          <strong className="font-bold">removed if will not be topped up within 72 hours from registration</strong>
        </li>
        <li className="pl-[10px]">
          All account will be automatically <br />
          <strong className="font-bold">removed within 90 days of inactivity</strong>
        </li>
        <li className="pl-[10px]">
          It is not possible to restore account <strong className="font-bold">if removed</strong>
        </li>
        <li className="pl-[10px]">
          Unused balance will <strong className="font-bold">be lost on removal process</strong>
        </li>
      </ul>
    </aside>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0b151e]">
          <Loader2 className="h-8 w-8 animate-spin text-[#ed5d15]" />
        </div>
      }
    >
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const { register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (password !== passwordConfirmation) {
        setError('Passwords do not match');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await register({
          name: username,
          surname: username,
          username,
          email: `${username}@prozone.local`,
          password,
          passwordConfirmation,
          terms: true,
        });
        setDone(true);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [username, password, passwordConfirmation, register],
  );

  return (
    <AuthShell
      tabs
      activeTab="signup"
      notice={done ? undefined : <SignupNotice />}
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={`/login${next !== '/' ? `?next=${next}` : ''}`}
            className="font-display text-2xl uppercase leading-none text-[#ed5d15] hover:border-b hover:border-[#ed5d15]"
          >
            SIGN IN
          </Link>
        </>
      }
    >
      {done ? (
        <>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <h2 className="auth-heading text-xl font-bold">Your account has been created!</h2>
            <Link href="/" className="mt-2 w-full">
              <Button className="sitebutton block h-[60px] w-full rounded-[5px] bg-[#ed5d15] font-display text-2xl uppercase tracking-[1.5px] hover:bg-[#d85311]">
                Go to Panel
              </Button>
            </Link>
          </div>
          <DepositNoticeModal
            open
            onContinue={() => router.push('/wallet')}
            onClose={() => router.push('/')}
          />
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-[20px]">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <AuthField
            id="username"
            icon={UserIcon}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            autoComplete="new-password"
          />
          <AuthField
            id="passwordConfirmation"
            icon={PasswordIcon}
            type="password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            placeholder="Confirm Password"
            autoComplete="new-password"
          />

          <CaptchaField value={captchaInput} onChange={setCaptchaInput} />

          <Button
            type="submit"
            className="sitebutton block h-[60px] w-full rounded-[5px] bg-[#ed5d15] font-display text-2xl uppercase tracking-[1.5px] hover:bg-[#d85311]"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign Up'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
