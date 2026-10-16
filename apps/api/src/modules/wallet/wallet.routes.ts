import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@novapanel/db';
import { authed } from '../../utils/guards.ts';
import { AppError } from '../../utils/errors.ts';
import { walletService } from './wallet.service.ts';
import { getRedis } from '../../services/redis.service.ts';
import { resolveAccess } from '../../utils/access.ts';

const DEFAULT_RATES: Record<string, number> = { BTC: 67000, LTC: 80, USDT: 1 };

// Site-wide receiving addresses (shared deposit wallets)
const MAIN_ADDRESSES: Record<string, string> = {
  BTC: 'bc1qxerckerkuslxmrxra08hurhxu6ccl36gzx3299ggdn5spkhrnfgszln6nz',
  LTC: 'ltc1qj8tpjkysh2j8qpeq0ut58ca7u5d76tnyeunk3d83gf6729cwg4msc8334k',
  USDT: 'TQLdQEFHC4X7AexE98cv6BAZinQxLazw4W',
};

async function getRate(app: FastifyInstance, currency: string): Promise<number> {
  const redis = getRedis(app.env.REDIS_URL);
  const cacheKey = `billing:rate:${currency}`;
  try {
    const hit = await redis.get(cacheKey);
    if (hit) return Number(hit);
  } catch {
    // redis down — fall through to fetch/default
  }
  let rate = DEFAULT_RATES[currency] ?? 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,litecoin&vs_currencies=usd`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (res.ok) {
      const payload = (await res.json()) as { bitcoin?: { usd?: number }; litecoin?: { usd?: number } };
      rate = currency === 'BTC' ? payload.bitcoin?.usd ?? rate : payload.litecoin?.usd ?? rate;
      try {
        await redis.set(cacheKey, String(rate), 'EX', 120);
      } catch {
        // ignore cache failures
      }
    }
  } catch {
    // network failure — keep default
  }
  return rate;
}

function getAddress(currency: string): string | null {
  return MAIN_ADDRESSES[currency] ?? null;
}

export function walletRoutes(app: FastifyInstance) {
  const guard = authed(app);

  app.get('/api/wallet', { preHandler: guard }, async (request, reply) => {
    const [wallet, access] = await Promise.all([
      walletService.getOrCreate(request.user!.id),
      resolveAccess(request.user!.id),
    ]);
    return reply.send({
      success: true,
      message: 'Cüzdan',
      data: {
        id: wallet.id,
        balance: Number(wallet.balance),
        currency: wallet.currency,
        totalDeposited: access.totalDeposited,
        minDeposit: access.minDeposit,
        unlocked: access.unlocked,
      },
    });
  });

  app.get('/api/wallet/transactions', { preHandler: guard }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(request.query);
    const data = await walletService.listTransactions(request.user!.id, q.page, q.limit);
    return reply.send({ success: true, message: 'İşlemler', data });
  });

  // ─── Top up balance (billing) ───
  app.get('/api/wallet/billing', { preHandler: guard }, async (request, reply) => {
    const userId = request.user!.id;
    const [btcRate, ltcRate, tx] = await Promise.all([
      getRate(app, 'BTC'),
      getRate(app, 'LTC'),
      walletService.listTransactions(userId, 1, 25),
    ]);
    return reply.send({
      success: true,
      message: 'Billing',
      data: {
        address: getAddress('BTC'),
        ltc_address: getAddress('LTC'),
        usdt_address: getAddress('USDT'),
        rate: btcRate,
        ltc_rate: ltcRate,
        usdt_rate: 1,
        commission: 5,
        ltc_commission: 0,
        usdt_commission: 0,
        requiredConfirmations: 1,
        transactions: tx.items,
        coupons: [],
        incoming: [],
      },
    });
  });

  app.post('/api/wallet/coupon/avail', { preHandler: guard }, async (request, reply) => {
    const body = z.object({ code: z.string().trim().min(1).max(30) }).parse(request.body);
    const userId = request.user!.id;
    const code = body.code.toUpperCase().trim();

    const result = await prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.findUnique({ where: { code } });
      if (!coupon || !coupon.active) {
        throw new AppError('COUPON_INVALID', 'Invalid coupon code', 400);
      }
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new AppError('COUPON_EXPIRED', 'This coupon has expired', 400);
      }
      if (coupon.usedCount >= coupon.maxUses) {
        throw new AppError('COUPON_USED', 'This coupon has reached its usage limit', 400);
      }
      const alreadyUsed = await tx.couponUsage.findFirst({ where: { couponId: coupon.id, userId } });
      if (alreadyUsed) {
        throw new AppError('COUPON_USED', 'You have already used this coupon', 400);
      }
      const amount = Number(coupon.discountAmount);
      if (amount > 0) {
        const wallet = await tx.wallet.upsert({
          where: { userId },
          update: {},
          create: { userId, balance: 0, currency: 'USD' },
        });
        const balanceAfter = Number(wallet.balance) + amount;
        await tx.wallet.update({ where: { userId }, data: { balance: balanceAfter } });
        await tx.payment.create({
          data: {
            userId,
            provider: 'manual',
            amount: coupon.discountAmount,
            currency: wallet.currency,
            status: 'SUCCEEDED',
            description: `Coupon ${code}`,
            paidAt: new Date(),
            metadata: { couponId: coupon.id },
          },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId,
            type: 'DEPOSIT',
            amount: coupon.discountAmount,
            balanceAfter,
            referenceType: 'coupon',
            referenceId: coupon.id,
            description: `Coupon ${code}`,
            metadata: { couponId: coupon.id },
          },
        });
      }
      await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      await tx.couponUsage.create({ data: { couponId: coupon.id, userId } });
      return { amount, code };
    });

    return reply.send({
      success: true,
      message: result.amount > 0 ? `Coupon ${result.code} applied, $${result.amount.toFixed(2)} added to your balance` : 'Coupon applied',
      data: result,
    });
  });
}
