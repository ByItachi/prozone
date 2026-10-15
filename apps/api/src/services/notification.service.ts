import { prisma, type NotificationType } from '@novapanel/db';

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
  ticketId?: string;
}

export async function createNotification(input: NotifyInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { notificationWeb: true, notificationEmail: true },
  });
  if (!user || !user.notificationWeb) return;

  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      metadata: (input.metadata ?? {}) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      ticketId: input.ticketId,
    },
  });
}