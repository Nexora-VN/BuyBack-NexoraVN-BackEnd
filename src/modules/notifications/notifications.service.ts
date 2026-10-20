import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FinanceRepository } from '../finance/finance.repository.js';
import { FirebaseMessagingService } from '../../infrastructure/firebase/firebase-messaging.service.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unread: z.enum(['true', 'false']).optional(),
});
const sendBody = z.discriminatedUnion('target', [
  z.object({
    target: z.literal('USER'),
    userId: z.uuid(),
    idempotencyKey: z.string().trim().min(8).max(150),
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(1000),
  }),
  z.object({
    target: z.literal('ALL'),
    idempotencyKey: z.string().trim().min(8).max(150),
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(1000),
  }),
]);
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}
const fields = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  createdAt: true,
  readAt: true,
} as const;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: FinanceRepository,
    @Optional() private readonly firebaseMessaging?: FirebaseMessagingService,
  ) {}

  async list(userId: string, query: unknown) {
    const { page, limit, unread } = parse(listQuery, query);
    const where = { userId, ...(unread === 'true' ? { readAt: null } : {}) };
    const [data, total] = await Promise.all([
      this.repo.db.notification.findMany({
        where,
        select: fields,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.repo.db.notification.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
  async unreadCount(userId: string) {
    return { count: await this.repo.db.notification.count({ where: { userId, readAt: null } }) };
  }
  async read(userId: string, id: string) {
    return this.repo.transaction(async (tx) => {
      const found = await tx.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('NOTIFICATION_NOT_FOUND');
      await tx.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
      });
      return tx.notification.findUniqueOrThrow({ where: { id }, select: fields });
    });
  }
  async readAll(userId: string) {
    const result = await this.repo.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }
  async sends(query: unknown) {
    const { page, limit } = parse(listQuery, query);
    const [data, total] = await Promise.all([
      this.repo.db.notificationSend.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          senderId: true,
          sender: { select: { email: true, displayName: true } },
          target: true,
          targetUserId: true,
          title: true,
          body: true,
          recipientCount: true,
          createdAt: true,
        },
      }),
      this.repo.db.notificationSend.count(),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
  async send(senderId: string, input: unknown) {
    const data = parse(sendBody, input);
    const result = await this.repo.transaction(async (tx) => {
      const prior = await tx.notificationSend.findUnique({
        where: { senderId_idempotencyKey: { senderId, idempotencyKey: data.idempotencyKey } },
      });
      if (prior) {
        if (
          prior.target !== data.target ||
          prior.targetUserId !== (data.target === 'USER' ? data.userId : null) ||
          prior.title !== data.title ||
          prior.body !== data.body
        )
          throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return {
          id: prior.id,
          target: prior.target,
          recipientCount: prior.recipientCount,
          createdAt: prior.createdAt,
        };
      }
      if (data.target === 'USER') {
        const exists = await tx.user.findFirst({
          where: { id: data.userId, role: 'USER', status: 'ACTIVE' },
          select: { id: true },
        });
        if (!exists) throw new NotFoundException('USER_NOT_FOUND');
      }
      const sendId = randomUUID();
      const send = await tx.notificationSend.create({
        data: {
          id: sendId,
          senderId,
          idempotencyKey: data.idempotencyKey,
          target: data.target,
          targetUserId: data.target === 'USER' ? data.userId : null,
          title: data.title,
          body: data.body,
        },
      });
      const recipientCount =
        data.target === 'ALL'
          ? await tx.$executeRaw`INSERT INTO "aff"."notifications" ("id", "user_id", "event_key", "type", "title", "body", "href", "send_id", "created_at") SELECT gen_random_uuid(), u."id", ${`manual:${sendId}`}, 'ADMIN_ANNOUNCEMENT', ${data.title}, ${data.body}, '/app/notifications', ${sendId}::uuid, CURRENT_TIMESTAMP FROM "aff"."users" u WHERE u."role" = 'USER'::"aff"."user_role" AND u."status" = 'ACTIVE'::"aff"."user_status" ON CONFLICT ("user_id", "event_key") DO NOTHING`
          : await tx.$executeRaw`INSERT INTO "aff"."notifications" ("id", "user_id", "event_key", "type", "title", "body", "href", "send_id", "created_at") SELECT gen_random_uuid(), u."id", ${`manual:${sendId}`}, 'ADMIN_ANNOUNCEMENT', ${data.title}, ${data.body}, '/app/notifications', ${sendId}::uuid, CURRENT_TIMESTAMP FROM "aff"."users" u WHERE u."id" = ${data.userId}::uuid AND u."role" = 'USER'::"aff"."user_role" AND u."status" = 'ACTIVE'::"aff"."user_status" ON CONFLICT ("user_id", "event_key") DO NOTHING`;
      await tx.notificationSend.update({ where: { id: sendId }, data: { recipientCount } });
      return { id: send.id, target: send.target, recipientCount, createdAt: send.createdAt };
    });

    if (this.firebaseMessaging) {
      const payload = {
        title: data.title,
        body: data.body,
        href: '/app/notifications',
        data: { type: 'ADMIN_ANNOUNCEMENT' },
      };
      if (data.target === 'ALL') {
        void this.firebaseMessaging.sendToAllUsers(payload).catch(() => {});
      } else if (data.target === 'USER') {
        void this.firebaseMessaging.sendToUsers([data.userId], payload).catch(() => {});
      }
    }

    return result;
  }
}
