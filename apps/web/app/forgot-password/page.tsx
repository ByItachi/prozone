'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { AuthShell } from '@/components/auth-shell';
import { AuthField } from '@/components/auth-field';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await api('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setDone(true);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [email],
  );

  return (
    <AuthShell
      title="Reset Password"
      footer={
        <Link href="/login" className="font-medium text-[#ed5d15] hover:underline">
          ← Back to Sign In
        </Link>
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <h2 className="auth-heading text-xl font-bold">Link sent</h2>
          <p className="auth-subtle text-sm">
            A password reset link has been sent to your email address.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-[20px]">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <AuthField id="email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter E-mail" autoComplete="email" autoFocus />
          <Button
            type="submit"
            className="sitebutton block h-[60px] w-full rounded-[5px] bg-[#ed5d15] font-display text-2xl uppercase tracking-[1.5px] hover:bg-[#d85311]"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send Reset Link'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}