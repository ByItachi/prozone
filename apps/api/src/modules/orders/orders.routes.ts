import { prisma, type BillingCycle } from '@novapanel/db';
import { Decimal } from '@prisma/client/runtime/library';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authed } from '../../utils/guards.ts';
import { auditFromRequest } from '../../utils/audit.ts';
import { createNotification } from '../../services/notification.service.ts';
import { generateOrderNumber } from '../../services/tokens.ts';
import { AppError } from '../../utils/errors.ts';

const createOrderSchema = z.object({
  productId: z.string().uuid(),
  billingCycle: z.enum(['monthly', 'yearly', 'one_time']).default('monthly'),
  configuration: z.record(z.string(), z.any()).default({}),
  couponCode: z.string().trim().max(30).optional(),
});

async function priceFor(productId: string, cycle: BillingCycle): Promise<Decimal> {
  const price = await prisma.productPrice.findUnique({
    where: { productId_cycle: { productId, cycle } },
  });
  if (!price) throw new AppError('PRICE_NOT_FOUND', 'Bu ürün için fiyat tanımlı değil', 400);
  return price.amount;
}

export async function createOrder(userId: string, input: z.infer<typeof createOrderSchema>) {
  const product = await prisma.product.findFirst({ where: { id: input.productId, active: true, deletedAt: null } });
  if (!product) throw new AppError('NOT_FOUND', 'Ürün bulunamadı', 404);

  const unitPrice = await priceFor(product.id, input.billingCycle);
  const subtotal = unitPrice;
  let discount = new Decimal(0);
  let couponId: string | undefined;

  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: input.couponCode.toUpperCase() } });
    if (!coupon || !coupon.active) throw new AppError('COUPON_INVALID', 'Kupon bulunamadı', 400);
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new AppError('COUPON_EXPIRED', 'Kuponun süresi dolmuş', 400);
    if (coupon.usedCount >= coupon.maxUses) throw new AppError('COUPON_USED', 'Kupon kullanım limiti dolmuş', 400);

    const existingUsage = await prisma.couponUsage.findFirst({ where: { couponId: coupon.id, userId } });
    if (existingUsage) throw new AppError('COUPON_USED', 'Bu kuponu zaten kullandınız', 400);

    if (coupon.discountPercent.greaterThan(0)) {
      discount = unitPrice.mul(coupon.discountPercent).div(100);
    } else if (coupon.discountAmount.greaterThan(0)) {
      discount = coupon.discountAmount;
    }
    if (discount.greaterThan(subtotal)) discount = subtotal;
    couponId = coupon.id;
  }

  const total = subtotal.minus(discount);
  const order = await prisma.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      userId,
      status: 'PAYMENT_PENDING',
      subtotal,
      discount,
      total,
      currency: product.currency,
      billingCycle: input.billingCycle,
      configuration: input.configuration,
      couponId,
      items: {
        create: {
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice,
          config: input.configuration,
        },
      },
    },
    include: { items: true },
  });

  if (couponId) {
    await prisma.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
    await prisma.couponUsage.create({ data: { couponId, userId, orderId: order.id } });
  }

  await createNotification({
    userId,
    type: 'ORDER_CREATED',
    title: 'Sipariş oluşturuldu',
    body: `${order.orderNumber} numaralı siparişiniz oluşturuldu. Ödeme bekleniyor.`,
    link: `/dashboard/orders/${order.id}`,
  });

  return { order: { ...order, subtotal: Number(order.subtotal), discount: Number(order.discount), total: Number(order.total) } };
}

export async function listOrders(userId: string, page: number, limit: number, status?: string) {
  const where = { userId, ...(status ? { status: status as never } : {}) };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { items: { include: { product: { select: { slug: true } } } }, payments: true },
    }),
    prisma.order.count({ where }),
  ]);
  return {
    items: items.map((o) => ({ ...o, subtotal: Number(o.subtotal), discount: Number(o.discount), total: Number(o.total) })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export function orderRoutes(app: FastifyInstance) {
  const guard = authed(app);

  app.post('/api/orders', { preHandler: guard }, async (request, reply) => {
    const body = createOrderSchema.parse(request.body);
    const data = await createOrder(request.user!.id, body);
    await auditFromRequest(request, 'ORDER_CREATED', { userId: request.user!.id, target: 'Order', targetId: data.order.id, metadata: { total: data.order.total } });
    return reply.code(201).send({ success: true, message: 'Sipariş oluşturuldu', data });
  });

  app.get('/api/orders', { preHandler: guard }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.string().optional() }).parse(request.query);
    const data = await listOrders(request.user!.id, q.page, q.limit, q.status);
    return reply.send({ success: true, message: 'Siparişler', data });
  });

  app.get('/api/orders/:id', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const order = await prisma.order.findFirst({
      where: { id, userId: request.user!.id },
      include: { items: { include: { product: true } }, payments: true, invoice: true, coupon: true, services: true },
    });
    if (!order) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı', 404);
    const data = { ...order, subtotal: Number(order.subtotal), discount: Number(order.discount), total: Number(order.total) };
    return reply.send({ success: true, message: 'Sipariş detayı', data });
  });

  app.post('/api/orders/:id/cancel', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const order = await prisma.order.findFirst({ where: { id, userId: request.user!.id } });
    if (!order) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı', 404);
    if (!['PAYMENT_PENDING', 'PENDING'].includes(order.status)) {
      throw new AppError('INVALID_STATUS', 'Sipariş iptal edilemez durumda', 400);
    }
    const updated = await prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } });
    await auditFromRequest(request, 'ORDER_CANCELLED', { userId: request.user!.id, target: 'Order', targetId: id });
    return reply.send({ success: true, message: 'Sipariş iptal edildi', data: { id: updated.id } });
  });
}