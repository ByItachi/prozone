'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(async () => {
    if (!token) {
      setState('error');
      setError('Invalid verification link');
      return;
    }
    try {
      await api('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setState('done');
    } catch (err) {
      setState('error');
      setError(getErrorMessage(err));
    }
  }, [token]);

  useEffect(() => {
    void verify();
  }, [verify]);

  return (
    <AuthShell
      title="Verify E-mail"
      footer={
        <Link href="/login" className="font-medium text-[#ed5d15] hover:underline">
          ← Back to Sign In
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        {state === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-[#ed5d15]" />
            <p className="auth-subtle text-sm">Verifying...</p>
          </>
        )}
        {state === 'done' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <h2 className="auth-heading font-display text-3xl">Your email has been verified!</h2>
            <Link href="/login" className="mt-2 w-full">
              <Button className="sitebutton block h-[60px] w-full rounded-[5px] bg-[#ed5d15] font-display text-2xl uppercase tracking-[1.5px] hover:bg-[#d85311]">
                Sign In
              </Button>
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <AlertTriangle className="h-12 w-12 text-rose-500" />
            <h2 className="auth-heading text-xl font-bold">Verification failed</h2>
            <p className="auth-subtle text-sm">{error}</p>
          </>
        )}
      </div>
    </AuthShell>
  );
}