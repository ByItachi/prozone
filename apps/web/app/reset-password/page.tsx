'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';
import { AuthField } from '@/components/auth-field';
import { Button } from '@/components/ui/button';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Loading…">
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#ed5d15]" /></div>
        </AuthShell>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!token) {
        setError('Invalid reset link');
        return;
      }
      if (password !== passwordConfirmation) {
        setError('Passwords do not match');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await api('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token, password, passwordConfirmation }),
        });
        setDone(true);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [token, password, passwordConfirmation],
  );

  return (
    <AuthShell
      title="New Password"
      footer={
        <Link href="/login" className="font-medium text-[#ed5d15] hover:underline">
          ← Back to Sign In
        </Link>
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <h2 className="auth-heading text-xl font-bold">Your password has been updated</h2>
          <Link href="/login" className="mt-2 w-full">
            <Button className="sitebutton block h-[60px] w-full rounded-[5px] bg-[#ed5d15] font-display text-2xl uppercase tracking-[1.5px] hover:bg-[#d85311]">
              Sign In
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-[20px]">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <AuthField id="password" icon={Lock} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New Password" autoComplete="new-password" autoFocus />
          <AuthField id="passwordConfirmation" icon={Lock} type="password" value={passwordConfirmation} onChange={(e) => setPasswordConfirmation(e.target.value)} placeholder="Repeat Password" autoComplete="new-password" />
          <Button
            type="submit"
            className="sitebutton block h-[60px] w-full rounded-[5px] bg-[#ed5d15] font-display text-2xl uppercase tracking-[1.5px] hover:bg-[#d85311]"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Update Password'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}