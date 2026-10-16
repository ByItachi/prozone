import { prisma, type PaymentProvider as ProviderName } from '@novapanel/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors.ts';
import { walletService } from '../modules/wallet/wallet.service.ts';

export interface CreatePaymentInput {
  userId: string;
  amount: number;
  currency: string;
  description?: string;
  orderId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentIntent {
  id: string;
  providerRef: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentProviderAdapter {
  name: ProviderName;
  createPayment(app: FastifyInstance, input: CreatePaymentInput): Promise<PaymentIntent>;
  verifyPayment(app: FastifyInstance, providerRef: string): Promise<'SUCCEEDED' | 'PENDING' | 'FAILED'>;
  refundPayment(app: FastifyInstance, providerRef: string, amount?: number): Promise<void>;
  handleWebhook(app: FastifyInstance, rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<{ event: string; providerRef: string }>;
}

// ─── Wallet (balance) provider ───
class WalletProvider implements PaymentProviderAdapter {
  name = 'wallet' as const;

  async createPayment(app: FastifyInstance, input: CreatePaymentInput): Promise<PaymentIntent> {
    const result = await walletService.debit(input.userId, input.amount, `Sipariş ödemesi: ${input.description ?? ''}`, {
      transactionType: 'PURCHASE',
      referenceType: 'order',
      referenceId: input.orderId,
    });
    return {
      id: input.orderId ?? `w-${Date.now()}`,
      providerRef: result.paymentId,
      status: 'SUCCEEDED',
      metadata: { balanceAfter: result.balanceAfter },
    };
  }

  verifyPayment(): Promise<'SUCCEEDED'> {
    return Promise.resolve('SUCCEEDED');
  }

  async refundPayment(_app: FastifyInstance, paymentId: string): Promise<void> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new AppError('NOT_FOUND', 'Ödeme bulunamadı', 404);
    await walletService.credit(
      payment.userId,
      Number(payment.amount),
      `Ödeme iadesi (${payment.description ?? payment.providerRef})`,
      { transactionType: 'REFUND', referenceType: 'payment', referenceId: payment.id },
    );
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundedAt: new Date() } });
  }

  async handleWebhook(): Promise<{ event: string; providerRef: string }> {
    throw new AppError('UNSUPPORTED', 'Wallet ödemeleri webhook gerektirmez', 400);
  }
}

// ─── Mock provider (development/CI test gateway) ───
class MockProvider implements PaymentProviderAdapter {
  name = 'mock' as const;

  async createPayment(_app: FastifyInstance, input: CreatePaymentInput): Promise<PaymentIntent> {
    return {
      id: `mock-${input.userId}-${Date.now()}`,
      providerRef: `mock_${crypto.randomUUID()}`,
      status: 'PENDING',
      redirectUrl: undefined,
    };
  }

  verifyPayment(_app: FastifyInstance, _providerRef: string): Promise<'SUCCEEDED' | 'PENDING' | 'FAILED'> {
    return Promise.resolve('SUCCEEDED');
  }

  refundPayment(): Promise<void> {
    return Promise.resolve();
  }

  handleWebhook(): Promise<{ event: string; providerRef: string }> {
    return Promise.resolve({ event: 'payment.succeeded', providerRef: '' });
  }
}

// ─── Stripe provider (REST fetch client, no SDK dependency) ───
class StripeProvider implements PaymentProviderAdapter {
  name = 'stripe' as const;

  async createPayment(app: FastifyInstance, input: CreatePaymentInput): Promise<PaymentIntent> {
    const { STRIPE_SECRET_KEY } = app.env;
    if (!STRIPE_SECRET_KEY) throw new AppError('PAYMENT_UNAVAILABLE', 'Stripe yapılandırılmadı', 503);
    const resp = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: String(Math.round(input.amount * 100)),
        currency: input.currency.toLowerCase(),
        description: input.description ?? 'Prozone ödeme',
        metadata: JSON.stringify(input.metadata ?? {}),
        'automatic_payment_methods[enabled]': 'true',
      }),
    });
    const data = (await resp.json()) as { id?: string; error?: { message?: string } };
    if (!resp.ok || !data.id) {
      throw new AppError('PAYMENT_ERROR', data.error?.message ?? 'Stripe hatası', 502);
    }
    return {
      id: data.id,
      providerRef: data.id,
      status: 'PENDING',
      metadata: { clientSecret: `pi_...` },
    };
  }

  async verifyPayment(app: FastifyInstance, providerRef: string): Promise<'SUCCEEDED' | 'PENDING' | 'FAILED'> {
    const { STRIPE_SECRET_KEY } = app.env;
    if (!STRIPE_SECRET_KEY) return 'PENDING';
    const resp = await fetch(`https://api.stripe.com/v1/payment_intents/${providerRef}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    if (!resp.ok) return 'FAILED';
    const data = (await resp.json()) as { status?: string };
    if (data.status === 'succeeded') return 'SUCCEEDED';
    if (data.status === 'failed' || data.status === 'canceled') return 'FAILED';
    return 'PENDING';
  }

  async refundPayment(app: FastifyInstance, providerRef: string): Promise<void> {
    const { STRIPE_SECRET_KEY } = app.env;
    if (!STRIPE_SECRET_KEY) throw new AppError('PAYMENT_UNAVAILABLE', 'Stripe yapılandırılmadı', 503);
    await fetch(`https://api.stripe.com/v1/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ payment_intent: providerRef }),
    });
  }

  async handleWebhook(app: FastifyInstance, rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    return { event: 'payment.succeeded', providerRef: '' };
  }
}

class PayTRProvider implements PaymentProviderAdapter {
  name = 'paytr' as const;

  createPayment(): Promise<PaymentIntent> {
    return Promise.resolve({
      id: `paytr-${Date.now()}`,
      providerRef: `paytr_${crypto.randomUUID()}`,
      status: 'PENDING',
    });
  }

  verifyPayment(): Promise<'PENDING'> {
    return Promise.resolve('PENDING');
  }

  refundPayment(): Promise<void> {
    return Promise.resolve();
  }

  handleWebhook(): Promise<{ event: string; providerRef: string }> {
    return Promise.resolve({ event: 'payment.succeeded', providerRef: '' });
  }
}

export const paymentProviders: Record<string, PaymentProviderAdapter> = {
  wallet: new WalletProvider(),
  balance: new WalletProvider(),
  mock: new MockProvider(),
  stripe: new StripeProvider(),
  paytr: new PayTRProvider(),
};

export function getProvider(name: string): PaymentProviderAdapter {
  const p = paymentProviders[name];
  if (!p) throw new AppError('PAYMENT_UNAVAILABLE', `Desteklenmeyen ödeme sağlayıcı: ${name}`, 400);
  return p;
}

export type { ProviderName };