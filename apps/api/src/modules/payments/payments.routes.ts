import { prisma, type PaymentProvider } from '@novapanel/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authed } from '../../utils/guards.ts';
import { AppError } from '../../utils/errors.ts';
import { getProvider } from '../../services/payment-providers.ts';
import { getIp, getUserAgent } from '../../utils/context.ts';
import { writeAudit, auditFromRequest } from '../../utils/audit.ts';
import { createNotification } from '../../services/notification.service.ts';
import { sendTemplateEmail } from '../../services/email.service.ts';
import { walletService } from '../wallet/wallet.service.ts';
import { provisionServiceFromOrder } from '../services/services.service.ts';

async function finalizePayment(app: FastifyInstance, paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, order: true },
  });
  if (!payment) throw new AppError('NOT_FOUND', 'Ödeme bulunamadı', 404);
  if (payment.status === 'SUCCEEDED') {
    // Idempotent: already finalized
    return { status: 'SUCCEEDED', idempotent: true };
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'SUCCEEDED', paidAt: new Date() },
  });

  await createNotification({
    userId: payment.userId,
    type: 'PAYMENT_SUCCESS',
    title: 'Ödeme başarılı',
    body: `${Number(payment.amount).toFixed(2)} ${payment.currency} tutarındaki ödeme tamamlandı.`,
  });

  await sendTemplateEmail(app, payment.user.email, 'PAYMENT_SUCCESS', {
    amount: String(Number(payment.amount)),
    currency: payment.currency,
  });

  await writeAudit({
    action: 'PAYMENT_COMPLETED',
    userId: payment.userId,
    target: 'Payment',
    targetId: payment.id,
    metadata: { provider: payment.provider, amount: Number(payment.amount) },
  });

  if (payment.orderId) {
    await provisionServiceFromOrder(app, payment.orderId);
  } else {
    // Deposit (no order) → credit wallet
    await walletService.credit(payment.userId, Number(payment.amount), `Bakiye yükleme (${payment.provider})`, {
      transactionType: 'DEPOSIT',
      referenceType: 'payment',
      referenceId: payment.id,
      paymentId: payment.id,
    });
  }
  await prisma.walletTransaction.updateMany({ where: { paymentId: payment.id }, data: { paymentId: payment.id } });
  return { status: 'SUCCEEDED', idempotent: false };
}

async function createOrderPayment(app: FastifyInstance, request: FastifyRequest, orderId: string, method: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: request.user!.id } });
  if (!order) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı', 404);
  if (order.status !== 'PAYMENT_PENDING') throw new AppError('INVALID_STATUS', 'Sipariş ödeme için uygun değil', 400);

  const provider = getProvider(method);
  const idempotencyKey = `order:${order.id}:${method}`;
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { payment: existing, requiresConfirmation: existing.status === 'PENDING' || existing.status === 'PROCESSING' };
  }

  const intent = await provider.createPayment(app, {
    userId: request.user!.id,
    amount: Number(order.total),
    currency: order.currency,
    description: `Sipariş ${order.orderNumber}`,
    orderId: order.id,
    idempotencyKey,
  });

  const payment = await prisma.payment.create({
    data: {
      userId: request.user!.id,
      orderId: order.id,
      provider: provider.name,
      providerRef: intent.providerRef,
      amount: order.total,
      currency: order.currency,
      status: intent.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING',
      description: `Sipariş ${order.orderNumber}`,
      idempotencyKey,
      paidAt: intent.status === 'SUCCEEDED' ? new Date() : undefined,
    },
  });

  if (intent.status === 'SUCCEEDED') {
    await finalizePayment(app, payment.id);
    return { payment, requiresConfirmation: false, finalized: true, redirectUrl: intent.redirectUrl };
  }

  await prisma.order.update({ where: { id: order.id }, data: { status: 'PAYMENT_PENDING' } });
  return { payment, requiresConfirmation: true, redirectUrl: intent.redirectUrl, providerRef: intent.providerRef };
}

export function paymentRoutes(app: FastifyInstance) {
  const guard = authed(app);

  const paySchema = z.object({ method: z.enum(['wallet', 'stripe', 'paytr', 'mock']) });
  app.post('/api/orders/:id/pay', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const body = paySchema.parse(request.body);
    const data = await createOrderPayment(app, request, id, body.method);
    return reply.send({ success: true, message: 'Ödeme işlemi başlatıldı', data });
  });

  const depositSchema = z.object({
    amount: z.number().positive().max(100000),
    provider: z.enum(['stripe', 'paypal', 'iyzico', 'paytr', 'crypto', 'mock']).default('mock'),
    currency: z.string().length(3).default('USD'),
  });

  app.post('/api/payments/deposit', { preHandler: guard }, async (request, reply) => {
    const body = depositSchema.parse(request.body);
    const provider = getProvider(body.provider);
    const idempotencyKey = `deposit:${request.user!.id}:${body.amount}:${body.provider}:${Date.now()}`;
    const intent = await provider.createPayment(app, {
      userId: request.user!.id,
      amount: body.amount,
      currency: body.currency,
      description: `Bakiye yükleme ${body.amount} ${body.currency}`,
      idempotencyKey,
    });

    if (intent.status === 'SUCCEEDED') {
      const res = await walletService.credit(request.user!.id, body.amount, `Bakiye yükleme (${body.provider})`, {
        transactionType: 'DEPOSIT',
        referenceType: 'payment',
        metadata: { providerRef: intent.providerRef },
      });
      return reply.send({ success: true, message: 'Bakiye yüklendi', data: { balanceAfter: res.balanceAfter, paymentId: res.paymentId } });
    }

    const payment = await prisma.payment.create({
      data: {
        userId: request.user!.id,
        provider: provider.name,
        providerRef: intent.providerRef,
        amount: body.amount,
        currency: body.currency,
        status: 'PENDING',
        description: 'Bakiye yükleme',
        idempotencyKey,
      },
    });
    return reply.send({ success: true, message: 'Ödemeniz oluşturuldu', data: { payment, requiresConfirmation: true } });
  });

  const confirmSchema = z.object({ providerRef: z.string().min(3), token: z.string().optional() });
  app.post('/api/payments/confirm', { preHandler: guard }, async (request, reply) => {
    const body = confirmSchema.parse(request.body);
    const payment = await prisma.payment.findFirst({ where: { providerRef: body.providerRef, userId: request.user!.id } });
    if (!payment) throw new AppError('NOT_FOUND', 'Ödeme bulunamadı', 404);

    if (payment.provider !== 'wallet') {
      const provider = getProvider(payment.provider);
      const status = await provider.verifyPayment(app, payment.providerRef ?? '');
      if (status !== 'SUCCEEDED') {
        throw new AppError('PAYMENT_PENDING', 'Ödemeniz henüz onaylanmadı', 400);
      }
    }

    const result = await finalizePayment(app, payment.id);
    return reply.send({ success: true, message: 'Ödeme tamamlandı', data: result });
  });

  app.get('/api/payments', { preHandler: guard }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(request.query);
    const [items, total] = await Promise.all([
      prisma.payment.findMany({ where: { userId: request.user!.id }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.payment.count({ where: { userId: request.user!.id } }),
    ]);
    const data = items.map((p) => ({ ...p, amount: Number(p.amount) }));
    return reply.send({ success: true, message: 'Ödemeler', data: { items: data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  // ─── Webhook (raw body, signature enforced per provider) ───
  app.post<{ Params: { provider: string }; Body: unknown }>(
    '/api/payments/webhook/:provider',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { provider: providerName } = z.object({ provider: z.string() }).parse(request.params as Record<string, unknown>);
      const provider = getProvider(providerName);
      const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
      const { providerRef } = await provider.handleWebhook(app, raw, request.headers as Record<string, string | string[] | undefined>);
      if (providerRef) {
        const payment = await prisma.payment.findFirst({ where: { providerRef, provider: providerName as PaymentProvider } });
        if (payment) await finalizePayment(app, payment.id);
      }
      await writeAudit({
        action: 'PAYMENT_COMPLETED',
        target: 'Payment',
        metadata: { webhook: providerName, providerRef },
      });
      return reply.send({ received: true });
    },
  );
}