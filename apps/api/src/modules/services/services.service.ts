import { prisma, type ServiceStatus, type BillingCycle } from '@novapanel/db';
import type { FastifyInstance } from 'fastify';
import { createNotification } from '../../services/notification.service.ts';
import { sendTemplateEmail } from '../../services/email.service.ts';
import { writeAudit } from '../../utils/audit.ts';
import { AppError } from '../../utils/errors.ts';
import type { FastifyRequest } from 'fastify';

export async function provisionServiceFromOrder(
  app: FastifyInstance,
  orderId: string,
  actor?: { id?: string },
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } }, user: true },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı', 404);

  const now = new Date();
  const renewalDate =
    order.billingCycle === 'monthly'
      ? new Date(now.setMonth(now.getMonth() + 1))
      : order.billingCycle === 'yearly'
        ? new Date(now.setFullYear(now.getFullYear() + 1))
        : null;

  const services: { id: string; name: string }[] = [];
  for (const item of order.items) {
    const service = await prisma.service.create({
      data: {
        userId: order.userId,
        productId: item.productId,
        orderId: order.id,
        name: item.name,
        description: (item.product.description as string | undefined)?.slice(0, 500),
        category: item.product.category,
        status: 'ACTIVE',
        price: item.unitPrice,
        currency: order.currency,
        billingCycle: order.billingCycle,
        configuration: (item.config ?? undefined) as unknown as import('@prisma/client').Prisma.InputJsonValue | undefined,
        metadata: { source: 'ORDER', orderNumber: order.orderNumber },
        usage: {},
        startedAt: now,
        renewalDate: renewalDate ?? undefined,
      },
    });
    services.push({ id: service.id, name: service.name });
  }

  // Invoice issued
  const { generateInvoiceNumber } = await import('../../services/tokens.ts');
  const { Decimal } = await import('@prisma/client/runtime/library');
  await prisma.invoice.upsert({
    where: { orderId: order.id },
    update: {
      status: 'PAID',
      paidAt: now,
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
    },
    create: {
      invoiceNumber: generateInvoiceNumber(),
      userId: order.userId,
      orderId: order.id,
      subtotal: order.subtotal,
      tax: new Decimal(0),
      discount: order.discount,
      total: order.total,
      currency: order.currency,
      status: 'PAID',
      issueDate: now,
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      paidAt: now,
      items: {
        create: order.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      },
    },
  });

  await prisma.order.update({ where: { id: order.id }, data: { status: 'ACTIVE', paidAt: now } });

  for (const s of services) {
    await createNotification({
      userId: order.userId,
      type: 'SERVICE_ACTIVATED',
      title: 'Servis aktif edildi',
      body: `${s.name} servisiniz kullanıma hazır.`,
      link: `/dashboard/services/${s.id}`,
    });
  }
  await sendTemplateEmail(app, order.user.email, 'SERVICE_ACTIVATED', { service: services[0]?.name ?? 'Servis' });

  await writeAudit({
    action: 'SERVICE_ACTIVATED',
    userId: order.userId,
    actorId: actor?.id,
    target: 'Order',
    targetId: order.id,
    metadata: { services: services.map((s) => s.id) },
  });
  return services;
}

export async function listServices(userId: string, page: number, limit: number, status?: string) {
  const where = {
    userId,
    deletedAt: null,
    ...(status ? { status: status as ServiceStatus } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.service.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { product: { select: { slug: true, name: true } } },
    }),
    prisma.service.count({ where }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getServiceDetail(userId: string, serviceId: string) {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, userId, deletedAt: null },
    include: {
      product: { select: { slug: true, name: true, description: true, limits: true } },
      order: { include: { invoice: true, payments: true } },
    },
  });
  if (!service) throw new AppError('NOT_FOUND', 'Servis bulunamadı', 404);
  return service;
}

export async function cancelService(userId: string, serviceId: string, reason?: string) {
  const service = await prisma.service.findFirst({ where: { id: serviceId, userId, deletedAt: null } });
  if (!service) throw new AppError('NOT_FOUND', 'Servis bulunamadı', 404);
  if (service.status === 'CANCELLED') throw new AppError('ALREADY_CANCELLED', 'Servis zaten iptal edilmiş', 400);
  const updated = await prisma.service.update({
    where: { id: serviceId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      metadata: { ...(typeof service.metadata === 'object' && service.metadata ? service.metadata : {}), cancelReason: reason ?? null },
    },
  });
  return updated;
}

export async function checkExpiredServices() {
  const expired = await prisma.service.findMany({
    where: { status: 'ACTIVE', renewalDate: { lt: new Date() } },
    take: 200,
  });
  for (const s of expired) {
    await prisma.service.update({ where: { id: s.id }, data: { status: 'EXPIRED' } });
    await createNotification({
      userId: s.userId,
      type: 'SERVICE_EXPIRING',
      title: 'Servis süresi doldu',
      body: `${s.name} servisinizin süresi doldu. Yenilemek için servis sayfanızı ziyaret edin.`,
      link: `/dashboard/services/${s.id}`,
    });
  }
  return expired.length;
}