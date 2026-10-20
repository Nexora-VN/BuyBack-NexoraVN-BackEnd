import type { Tx } from '../finance/finance.repository.js';
import { notify, notifyAdmins } from './notification-events.js';

describe('notification event delivery', () => {
  const createMany = jest.fn();
  const findMany = jest.fn();
  const tx = {
    notification: { createMany },
    user: { findMany },
  } as unknown as Tx;
  const event = {
    eventKey: 'withdrawal:request-1:completed',
    type: 'WITHDRAWAL_COMPLETED',
    title: 'Đã chuyển tiền',
    body: 'Yêu cầu đã hoàn tất.',
    href: '/app/withdrawals/request-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createMany.mockResolvedValue({ count: 1 });
  });

  it('writes a recipient-scoped unique key and ignores duplicate deliveries', async () => {
    await notify(tx, { ...event, userId: 'owner-id' });
    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ ...event, userId: 'owner-id' })],
      skipDuplicates: true,
    });
  });

  it('fans out only to active administrators', async () => {
    findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'super-admin-1' }]);
    await notifyAdmins(tx, { ...event, href: '/admin/withdrawals' });
    expect(findMany).toHaveBeenCalledWith({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'admin-1', eventKey: event.eventKey }),
        expect.objectContaining({ userId: 'super-admin-1', eventKey: event.eventKey }),
      ],
      skipDuplicates: true,
    });
  });
});
