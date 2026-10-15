import { prisma } from '@novapanel/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authed } from '../../utils/guards.ts';
import { auditFromRequest } from '../../utils/audit.ts';
import { createNotification } from '../../services/notification.service.ts';
import { sendTemplateEmail } from '../../services/email.service.ts';
import { generateTicketNumber } from '../../services/tokens.ts';
import { AppError } from '../../utils/errors.ts';

const createTicketSchema = z.object({
  subject: z.string().trim().min(5).max(200),
  category: z.string().trim().min(2).max(60),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  message: z.string().trim().min(5).max(10000),
});

const replySchema = z.object({
  message: z.string().trim().min(1).max(10000),
  isInternal: z.boolean().default(false),
});

export function ticketRoutes(app: FastifyInstance) {
  const guard = authed(app);

  app.post('/api/tickets', { preHandler: guard }, async (request, reply) => {
    const body = createTicketSchema.parse(request.body);
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: generateTicketNumber(),
        userId: request.user!.id,
        subject: body.subject,
        category: body.category,
        priority: body.priority,
        status: 'OPEN',
        lastMessageAt: new Date(),
        messages: {
          create: { senderId: request.user!.id, body: body.message },
        },
      },
    });
    await auditFromRequest(request, 'TICKET_CREATED', { userId: request.user!.id, target: 'Ticket', targetId: ticket.id });
    return reply.code(201).send({ success: true, message: 'Destek talebi oluşturuldu', data: ticket });
  });

  app.get('/api/tickets', { preHandler: guard }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.string().optional() }).parse(request.query);
    const where = { userId: request.user!.id, ...(q.status ? { status: q.status as never } : {}) };
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.ticket.count({ where }),
    ]);
    return reply.send({ success: true, message: 'Talepler', data: { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  app.get('/api/tickets/:id', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const ticket = await prisma.ticket.findFirst({
      where: { id, userId: request.user!.id },
      // İç notlar (isInternal=true) ASLA üyeye gösterilmez — sorgu seviyesinde filtrelenir.
      include: { messages: { where: { isInternal: false }, orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, name: true, surname: true, username: true, role: { select: { name: true } } } } } } },
    });
    if (!ticket) throw new AppError('NOT_FOUND', 'Talep bulunamadı', 404);
    return reply.send({ success: true, message: 'Talep', data: ticket });
  });

  app.post('/api/tickets/:id/reply', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const body = replySchema.parse(request.body);
    const ticket = await prisma.ticket.findFirst({ where: { id, userId: request.user!.id } });
    if (!ticket) throw new AppError('NOT_FOUND', 'Talep bulunamadı', 404);
    if (ticket.status === 'CLOSED') throw new AppError('TICKET_CLOSED', 'Kapalı talebe yanıt gönderilemez', 400);

    await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        senderId: request.user!.id,
        body: body.message,
        isInternal: false,
      },
    });
    const updated = await prisma.ticket.update({
      where: { id },
      data: { status: ticket.status === 'WAITING_USER' ? 'OPEN' : ticket.status, lastMessageAt: new Date() },
    });
    return reply.send({ success: true, message: 'Yanıt gönderildi', data: updated });
  });

  app.post('/api/tickets/:id/close', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const ticket = await prisma.ticket.findFirst({ where: { id, userId: request.user!.id } });
    if (!ticket) throw new AppError('NOT_FOUND', 'Talep bulunamadı', 404);
    const updated = await prisma.ticket.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await auditFromRequest(request, 'TICKET_STATUS_CHANGED', { userId: request.user!.id, target: 'Ticket', targetId: id });
    return reply.send({ success: true, message: 'Talep kapatıldı', data: updated });
  });
}

export async function notifyTicketReply(app: FastifyInstance, ticketId: string, body: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true } });
  if (!ticket) return;
  await createNotification({
    userId: ticket.userId,
    type: 'TICKET_RESPONSE',
    title: 'Destek talebi yanıtlandı',
    body,
    link: `/dashboard/support/${ticket.id}`,
    ticketId: ticket.id,
  });
  await sendTemplateEmail(app, ticket.user.email, 'TICKET_REPLY', {
    ticket: ticket.ticketNumber,
    link: `${app.env.WEB_URL}/dashboard/support/${ticket.id}`,
  });
}