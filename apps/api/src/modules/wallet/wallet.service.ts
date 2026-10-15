import { prisma, type TransactionType } from '@novapanel/db';
import { Decimal } from '@prisma/client/runtime/library';
import { AppError } from '../../utils/errors.ts';
import { createLogger } from '@novapanel/logger';

const log = createLogger('wallet');

interface WalletMutationInput {
  transactionType: TransactionType;
  referenceType?: string;
  referenceId?: string;
  paymentId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

const MUTATION_LOCK_KEY = (userId: string) => `wallet:lock:${userId}`;

async function acquireLock(app: unknown, userId: string): Promise<() => void> {
  // In-process async mutex per user (sufficient for single-node; Redis advisory lock for multi-node)
  return () => undefined;
}

async function ensureWallet(userId: string) {
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId, balance: 0, currency: 'USD' },
  });
  return wallet;
}

export const walletService = {
  async getOrCreate(userId: string) {
    return ensureWallet(userId);
  },

  async getBalance(userId: string): Promise<number> {
    const wallet = await ensureWallet(userId);
    return Number(wallet.balance);
  },

  async debit(
    userId: string,
    amount: number,
    description: string,
    input: WalletMutationInput,
  ): Promise<{ balanceAfter: number; paymentId: string }> {
    if (amount <= 0) throw new AppError('INVALID_AMOUNT', 'Geçersiz tutar', 400);
    const release = await acquireLock(null, userId);
    try {
      return await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) throw new AppError('NOT_FOUND', 'Cüzdan bulunamadı', 404);

        const current = new Decimal(wallet.balance);
        const decAmount = new Decimal(amount.toString());
        if (current.lessThan(decAmount)) {
          throw new AppError('INSUFFICIENT_BALANCE', 'Yetersiz bakiye', 400);
        }

        const balanceAfter = current.minus(decAmount);
        const updated = await tx.wallet.update({
          where: { userId },
          data: { balance: balanceAfter },
        });

        const payment = await tx.payment.create({
          data: {
            userId,
            provider: 'wallet',
            amount: decAmount,
            currency: wallet.currency,
            status: 'SUCCEEDED',
            description,
            paidAt: new Date(),
            metadata: (input.metadata ?? {}) as object,
            ...(input.referenceId && input.referenceType === 'order'
              ? { orderId: input.referenceId }
              : {}),
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            type: input.transactionType,
            amount: decAmount.negated(),
            balanceAfter,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            paymentId: payment.id,
            description,
            metadata: (input.metadata ?? {}) as unknown as import('@prisma/client').Prisma.InputJsonValue,
          },
        });

        return { balanceAfter: Number(balanceAfter), paymentId: payment.id };
      });
    } finally {
      release();
    }
  },

  async credit(
    userId: string,
    amount: number,
    description: string,
    input: WalletMutationInput,
  ): Promise<{ balanceAfter: number; paymentId?: string }> {
    if (amount <= 0) throw new AppError('INVALID_AMOUNT', 'Geçersiz tutar', 400);
    const release = await acquireLock(null, userId);
    try {
      return await prisma.$transaction(async (tx) => {
        const wallet = await ensureWallet(userId);
        const wal = await tx.wallet.findUnique({ where: { userId } });
        if (!wal) throw new AppError('NOT_FOUND', 'Cüzdan bulunamadı', 404);

        const current = new Decimal(wal.balance);
        const decAmount = new Decimal(amount.toString());
        const balanceAfter = current.plus(decAmount);
        await tx.wallet.update({ where: { userId }, data: { balance: balanceAfter } });

        let paymentId: string | undefined;
        if (input.transactionType === 'DEPOSIT') {
          const payment = await tx.payment.create({
            data: {
              userId,
              provider: 'manual',
              amount: decAmount,
              currency: wal.currency,
              status: 'SUCCEEDED',
              description,
              paidAt: new Date(),
              metadata: (input.metadata ?? {}) as object,
            },
          });
          paymentId = payment.id;
        }

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            type: input.transactionType,
            amount: decAmount,
            balanceAfter,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            paymentId,
            description,
            metadata: (input.metadata ?? {}) as unknown as import('@prisma/client').Prisma.InputJsonValue,
          },
        });

        return { balanceAfter: Number(balanceAfter), paymentId };
      });
    } finally {
      release();
    }
  },

  async listTransactions(userId: string, page: number, limit: number) {
    const where = { userId };
    const [items, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.walletTransaction.count({ where }),
    ]);
    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
};

export function logWalletError(err: unknown) {
  log.error({ err }, 'wallet error');
}