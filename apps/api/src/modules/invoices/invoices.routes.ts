import { prisma } from '@novapanel/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authed } from '../../utils/guards.ts';
import { AppError } from '../../utils/errors.ts';

export function invoiceRoutes(app: FastifyInstance) {
  const guard = authed(app);

  app.get('/api/invoices', { preHandler: guard }, async (request, reply) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.string().optional() }).parse(request.query);
    const where = { userId: request.user!.id, ...(q.status ? { status: q.status as never } : {}) };
    const [items, total] = await Promise.all([
      prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.invoice.count({ where }),
    ]);
    const data = items.map((i) => ({ ...i, subtotal: Number(i.subtotal), tax: Number(i.tax), discount: Number(i.discount), total: Number(i.total) }));
    return reply.send({ success: true, message: 'Faturalar', data: { items: data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } } });
  });

  app.get('/api/invoices/:id', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const invoice = await prisma.invoice.findFirst({ where: { id, userId: request.user!.id }, include: { items: true, order: { include: { items: true } } } });
    if (!invoice) throw new AppError('NOT_FOUND', 'Fatura bulunamadı', 404);
    const data = { ...invoice, subtotal: Number(invoice.subtotal), tax: Number(invoice.tax), discount: Number(invoice.discount), total: Number(invoice.total) };
    return reply.send({ success: true, message: 'Fatura', data });
  });

  app.get('/api/invoices/:id/pdf', { preHandler: guard }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse((request.params as Record<string, unknown>).id ? { id: String((request.params as Record<string, unknown>).id) } : { id: "" });
    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: request.user!.id },
      include: { items: true, user: { select: { name: true, surname: true, username: true, email: true, phone: true } } },
    });
    if (!invoice) throw new AppError('NOT_FOUND', 'Fatura bulunamadı', 404);

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    doc.fontSize(20).fillColor('#6366f1').text(app.env.APP_NAME, { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(12).fillColor('#111827').text('INVOICE', { align: 'right' });
    doc.fontSize(9).fillColor('#6b7280').text(invoice.invoiceNumber, { align: 'right' });
    doc.moveDown();

    doc.fontSize(10).fillColor('#374151');
    doc.text(
      `Billing to:\n${invoice.user.name} ${invoice.user.surname}\n${invoice.user.email}\n${invoice.user.phone ?? ''}`,
      { align: 'left' },
    );
    doc.moveDown();

    doc.fontSize(9).fillColor('#6b7280');
    doc.text(`Issue date: ${invoice.issueDate.toISOString().slice(0, 10)}`);
    doc.text(`Due date: ${invoice.dueDate.toISOString().slice(0, 10)}`);
    doc.text(`Status: ${invoice.status}`);
    doc.moveDown(1.5);

    const startY = doc.y;
    doc.fontSize(10).fillColor('#111827').text('Description', 50, startY);
    doc.text('Qty', 350, startY, { width: 80, align: 'right' });
    doc.text('Amount', 460, startY, { width: 90, align: 'right' });
    doc.moveTo(50, startY + 16).lineTo(560, startY + 16).strokeColor('#e5e7eb').stroke();

    let y = startY + 28;
    for (const item of invoice.items) {
      doc.text(item.name.length > 45 ? item.name.slice(0, 45) + '...' : item.name, 50, y);
      doc.text(String(item.quantity), 350, y, { width: 80, align: 'right' });
      doc.text(Number(item.unitPrice).toFixed(2), 460, y, { width: 90, align: 'right' });
      y += 20;
    }

    y += 20;
    doc.text('Subtotal', 350, y, { width: 200, align: 'right' });
    doc.text(`${Number(invoice.subtotal).toFixed(2)} ${invoice.currency}`, 470, y, { width: 90, align: 'right' });
    y += 18;
    doc.text(`Discount: ${Number(invoice.discount).toFixed(2)}`, 350, y, { width: 200, align: 'right' });
    y += 18;
    doc.text('Total', 350, y, { width: 200, align: 'right' });
    doc.text(`${Number(invoice.total).toFixed(2)} ${invoice.currency}`, 470, y, { width: 90, align: 'right' });

    doc.end();
    const buf = await done;

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    return reply.send(buf);
  });
}