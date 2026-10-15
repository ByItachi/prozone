import { prisma } from '@novapanel/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authed, permission } from '../../utils/guards.ts';
import { auditFromRequest } from '../../utils/audit.ts';

const productSchema = z.object({
  name: z.string().trim().min(3).max(100),
  slug: z.string().trim().min(3).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(5000).default(''),
  category: z.string().trim().min(2).max(60),
  price: z.number().nonnegative(),
  setupFee: z.number().nonnegative().default(0),
  monthlyPrice: z.number().nonnegative().default(0),
  yearlyPrice: z.number().nonnegative().default(0),
  features: z.array(z.string()).default([]),
  limits: z.record(z.string(), z.any()).default({}),
  currency: z.string().length(3).default('USD'),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  metadata: z.record(z.string(), z.any()).default({}),
});

function serializeProduct(p: {
  id: string; name: string; slug: string; description: string; category: string;
  price: unknown; setupFee: unknown; currency: string; features: unknown; limits: unknown;
  metadata: unknown; active: boolean; featured: boolean; createdAt: Date; updatedAt: Date;
  prices?: { cycle: string; amount: unknown }[];
}) {
  return {
    ...p,
    price: Number(p.price),
    setupFee: Number(p.setupFee),
    prices: p.prices?.map((pr) => ({ ...pr, amount: Number(pr.amount) })),
  };
}

export function productRoutes(app: FastifyInstance) {
  const guard = authed(app);

  // ─── Public catalog ───
  app.get('/api/products', async (request, reply) => {
    const q = z
      .object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(24), category: z.string().optional() })
      .parse(request.query);
    const where = {
      active: true,
      deletedAt: null,
      ...(q.category ? { category: q.category } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { prices: true },
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.product.count({ where }),
    ]);
    return reply.send({
      success: true,
      message: 'Ürünler',
      data: { items: items.map(serializeProduct), meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } },
    });
  });

  app.get('/api/products/categories', async (_request, reply) => {
    const cats = await prisma.product.groupBy({ by: ['category'], where: { active: true, deletedAt: null }, _count: { _all: true } });
    return reply.send({ success: true, message: 'Kategoriler', data: cats });
  });

  app.get('/api/products/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params as Record<string, unknown>);
    const product = await prisma.product.findUnique({ where: { slug }, include: { prices: true } });
    if (!product || !product.active) {
      return reply.code(404).send({ success: false, message: 'Ürün bulunamadı', code: 'NOT_FOUND', data: null });
    }
    return reply.send({ success: true, message: 'Ürün', data: serializeProduct(product) });
  });

  // ─── Admin ───
  app.get('/api/admin/products', { preHandler: permission(app, 'products.read') }, async (request, reply) => {
    const q = z
      .object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), search: z.string().optional() })
      .parse(request.query);
    const where = {
      deletedAt: null,
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' as const } }, { slug: { contains: q.search, mode: 'insensitive' as const } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, include: { prices: true }, orderBy: { createdAt: 'desc' as const }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.product.count({ where }),
    ]);
    return reply.send({ success: true, message: 'Ürünler', data: { items: items.map(serializeProduct), meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  app.post('/api/admin/products', { preHandler: permission(app, 'products.write') }, async (request, reply) => {
    const body = productSchema.parse(request.body);
    const product = await prisma.product.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        category: body.category,
        price: body.price,
        setupFee: body.setupFee,
        currency: body.currency,
        active: body.active,
        featured: body.featured,
        features: body.features,
        limits: body.limits,
        metadata: body.metadata,
        prices: {
          create: [
            { cycle: 'one_time', amount: body.price },
            { cycle: 'monthly', amount: body.price },
            { cycle: 'yearly', amount: body.price },
          ],
        },
      },
      include: { prices: true },
    });
    await auditFromRequest(request, 'PRODUCT_CREATED', { target: 'Product', targetId: product.id, metadata: { slug: body.slug } });
    return reply.code(201).send({ success: true, message: 'Ürün oluşturuldu', data: serializeProduct(product) });
  });

  app.put('/api/admin/products/:id', { preHandler: permission(app, 'products.write') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const body = productSchema.partial().parse(request.body);
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...body,
        features: body.features,
        limits: body.limits,
        metadata: body.metadata,
        price: body.price,
        setupFee: body.setupFee,
      },
      include: { prices: true },
    });
    if (body.price !== undefined) {
      await prisma.productPrice.upsert({
        where: { productId_cycle: { productId: id, cycle: 'one_time' } },
        update: { amount: body.price },
        create: { productId: id, cycle: 'one_time', amount: body.price },
      });
    }
    await auditFromRequest(request, 'PRODUCT_UPDATED', { target: 'Product', targetId: id });
    return reply.send({ success: true, message: 'Ürün güncellendi', data: serializeProduct(product) });
  });

  app.delete('/api/admin/products/:id', { preHandler: permission(app, 'products.delete') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    await auditFromRequest(request, 'PRODUCT_DELETED', { target: 'Product', targetId: id });
    return reply.send({ success: true, message: 'Ürün silindi', data: null });
  });
}