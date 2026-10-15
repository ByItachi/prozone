'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="auth-shell-dark flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <Link href="/" className="font-[family-name:var(--font-bebas)] text-4xl tracking-wide text-white">
        PROZONE
      </Link>
      <h1 className="mt-6 font-[family-name:var(--font-bebas)] text-[120px] leading-none text-[#ed5d15] md:text-[160px]">
        404
      </h1>
      <p className="mt-2 max-w-sm text-lg text-[#8b98a3]">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#ed5d15] px-8 py-3 font-[family-name:var(--font-bebas)] text-xl tracking-wide text-white transition hover:bg-[#ff7a33]"
      >
        Back to Home
      </Link>
    </div>
  );
}
