import { randomUUID } from 'node:crypto';
import type { Tx } from '../finance/finance.repository.js';

export type NotificationEvent = {
  userId: string;
  eventKey: string;
  type: string;
  title: string;
  body: string;
  href: string;
};

export type PushDispatcher = (event: {
  userIds: string[];
  title: string;
  body: string;
  href: string;
  type: string;
}) => Promise<void> | void;

let pushDispatcher: PushDispatcher | null = null;

export function registerPushDispatcher(dispatcher: PushDispatcher | null) {
  pushDispatcher = dispatcher;
}

export function getPushDispatcher() {
  return pushDispatcher;
}

/** A unique event key per recipient makes retries and repeated syncs harmless. */
export async function notify(tx: Tx, event: NotificationEvent) {
  await tx.notification.createMany({
    data: [{ id: randomUUID(), ...event }],
    skipDuplicates: true,
  });
  if (pushDispatcher) {
    void Promise.resolve()
      .then(() =>
        pushDispatcher?.({
          userIds: [event.userId],
          title: event.title,
          body: event.body,
          href: event.href,
          type: event.type,
        }),
      )
      .catch(() => {});
  }
}

export async function notifyAdmins(tx: Tx, event: Omit<NotificationEvent, 'userId'>) {
  const admins = await tx.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!admins.length) return;
  await tx.notification.createMany({
    data: admins.map((admin) => ({ id: randomUUID(), userId: admin.id, ...event })),
    skipDuplicates: true,
  });
  if (pushDispatcher) {
    const adminIds = admins.map((admin) => admin.id);
    void Promise.resolve()
      .then(() =>
        pushDispatcher?.({
          userIds: adminIds,
          title: event.title,
          body: event.body,
          href: event.href,
          type: event.type,
        }),
      )
      .catch(() => {});
  }
}
