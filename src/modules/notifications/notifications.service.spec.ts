import type { FinanceRepository } from '../finance/finance.repository.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  const notification = {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  };
  const notificationSend = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const user = { findFirst: jest.fn() };
  const tx = { notification, notificationSend, user, $executeRaw: jest.fn() };
  const repo = {
    db: { notification, notificationSend },
    transaction: jest.fn(async (operation: (value: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  } as unknown as FinanceRepository;
  const service = new NotificationsService(repo);

  beforeEach(() => {
    jest.clearAllMocks();
    notification.findMany.mockResolvedValue([]);
    notification.count.mockResolvedValue(0);
    notification.updateMany.mockResolvedValue({ count: 1 });
  });

  it('lists and counts only the caller’s unread notifications', async () => {
    await service.list('owner-id', { page: '2', limit: '10', unread: 'true' });
    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner-id', readAt: null },
        skip: 10,
        take: 10,
      }),
    );
    expect(notification.count).toHaveBeenCalledWith({
      where: { userId: 'owner-id', readAt: null },
    });
    await service.unreadCount('owner-id');
    expect(notification.count).toHaveBeenLastCalledWith({
      where: { userId: 'owner-id', readAt: null },
    });
  });

  it('returns 404 for another user’s notification without updating it', async () => {
    notification.findFirst.mockResolvedValue(null);
    await expect(
      service.read('owner-id', '37139c82-813b-4e8a-82a6-0f7bb99083fe'),
    ).rejects.toMatchObject({ status: 404 });
    expect(notification.findFirst).toHaveBeenCalledWith({
      where: { id: '37139c82-813b-4e8a-82a6-0f7bb99083fe', userId: 'owner-id' },
      select: { id: true },
    });
    expect(notification.updateMany).not.toHaveBeenCalled();
  });

  it('marks only the caller’s unread rows and preserves an existing read timestamp', async () => {
    notification.findFirst.mockResolvedValue({ id: 'notification-id' });
    notification.findUniqueOrThrow.mockResolvedValue({ id: 'notification-id', readAt: new Date() });
    await service.read('owner-id', 'notification-id');
    expect(notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notification-id', userId: 'owner-id', readAt: null },
      }),
    );
    await service.readAll('owner-id');
    expect(notification.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: 'owner-id', readAt: null },
      }),
    );
  });

  it('rejects an inactive or admin target for a one-user send', async () => {
    notificationSend.findUnique.mockResolvedValue(null);
    user.findFirst.mockResolvedValue(null);
    await expect(
      service.send('sender-id', {
        target: 'USER',
        userId: '37139c82-813b-4e8a-82a6-0f7bb99083fe',
        idempotencyKey: 'request-key-123',
        title: 'Notice',
        body: 'Message',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(user.findFirst).toHaveBeenCalledWith({
      where: { id: '37139c82-813b-4e8a-82a6-0f7bb99083fe', role: 'USER', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(notificationSend.create).not.toHaveBeenCalled();
  });

  it('returns a prior send for the same key and rejects a changed payload', async () => {
    notificationSend.findUnique.mockResolvedValue({
      id: 'send-id',
      senderId: 'sender-id',
      idempotencyKey: 'request-key-123',
      target: 'ALL',
      targetUserId: null,
      title: 'Notice',
      body: 'Message',
      recipientCount: 3,
      createdAt: new Date(),
    });
    const input = {
      target: 'ALL',
      idempotencyKey: 'request-key-123',
      title: 'Notice',
      body: 'Message',
    };
    await expect(service.send('sender-id', input)).resolves.toMatchObject({
      id: 'send-id',
      recipientCount: 3,
    });
    expect(notificationSend.create).not.toHaveBeenCalled();
    await expect(service.send('sender-id', { ...input, body: 'Changed' })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('sends to active USER recipients with one set-based insert and stores the count', async () => {
    notificationSend.findUnique.mockResolvedValue(null);
    notificationSend.create.mockImplementation(({ data }: { data: { id: string } }) =>
      Promise.resolve({ ...data, createdAt: new Date() }),
    );
    tx.$executeRaw.mockResolvedValue(7);
    await expect(
      service.send('sender-id', {
        target: 'ALL',
        idempotencyKey: 'request-key-123',
        title: 'Notice',
        body: 'Message',
      }),
    ).resolves.toMatchObject({ target: 'ALL', recipientCount: 7 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const statement = (tx.$executeRaw.mock.calls[0]?.[0] as TemplateStringsArray).join('');
    expect(statement).toContain('"role" = \'USER\'');
    expect(statement).toContain('"status" = \'ACTIVE\'');
    expect(notificationSend.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { recipientCount: 7 } }),
    );
  });
});
