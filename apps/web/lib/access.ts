/** Service slugs that stay locked until the deposit threshold is met. */
export const LOCKED_SLUGS = [
  'cvv',
  'ssn',
  'checkers',
  'dumps',
  'proxies',
  'banks_and_accounts',
  'rdp',
  'sms-activate',
  'flooders',
  'otp-bot',
] as const;

export const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE'];

export function isStaffRole(role?: string | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function isLockedSlug(slug: string | undefined | null): boolean {
  return !!slug && (LOCKED_SLUGS as readonly string[]).includes(slug);
}

/** First path segment, e.g. "/cvv?x=1" -> "cvv". */
export function pathSlug(pathname: string): string {
  return (pathname.split('?')[0] ?? '').split('/')[1] ?? '';
}
