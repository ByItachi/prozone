import { prisma } from '@novapanel/db';

/**
 * Minimum cumulative top-up (in USD) a user must have deposited before the
 * query/inquiry screens unlock. Overridable via the ACCESS_MIN_DEPOSIT env var.
 */
export const ACCESS_MIN_DEPOSIT = Math.max(
  0,
  Number(process.env.ACCESS_MIN_DEPOSIT ?? 100) || 100,
);

/** Service slugs that stay locked until the deposit threshold is met. */
export const LOCKED_SLUGS: readonly string[] = [
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
];

/** Product categories that back the locked screens (cvv also pulls credit-cards). */
export const LOCKED_CATEGORIES: readonly string[] = [...LOCKED_SLUGS, 'credit-cards'];

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE'];

export function isStaffRole(role?: string | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export interface AccessStatus {
  totalDeposited: number;
  minDeposit: number;
  unlocked: boolean;
}

/**
 * Cumulative top-ups = wallet DEPOSIT transactions that came from a payment
 * gateway (referenceType 'payment'). This covers both synchronous deposits
 * (e.g. mock) and asynchronously finalized gateway deposits, while excluding
 * coupons (referenceType 'coupon') and admin manual credits (no referenceType).
 */
export async function getDepositTotal(userId: string): Promise<number> {
  const agg = await prisma.walletTransaction.aggregate({
    where: { userId, type: 'DEPOSIT', referenceType: 'payment' },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

/** Access status for a user, bypassing the gate for staff roles. */
export async function resolveAccess(userId: string): Promise<AccessStatus> {
  const [user, totalDeposited] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: { select: { name: true } } } }),
    getDepositTotal(userId),
  ]);
  const unlocked = isStaffRole(user?.role?.name) || totalDeposited >= ACCESS_MIN_DEPOSIT;
  return { totalDeposited, minDeposit: ACCESS_MIN_DEPOSIT, unlocked };
}
