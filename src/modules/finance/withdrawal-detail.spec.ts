import type { ConfigService } from '@nestjs/config';
import { FinanceQueryService } from './finance-query.service.js';
import type { FinanceRepository } from './finance.repository.js';

describe('User withdrawal detail', () => {
  const findFirst = jest.fn();
  const repo = { db: { withdrawal: { findFirst } } } as unknown as FinanceRepository;
  const service = new FinanceQueryService(repo, {} as ConfigService);
  const id = '37139c82-813b-4e8a-82a6-0f7bb99083fe';

  beforeEach(() => findFirst.mockReset());

  it('returns a receipt from the original bank snapshot without payment secrets or admin notes', async () => {
    findFirst.mockResolvedValue({
      id,
      amount: 50000n,
      status: 'COMPLETED',
      createdAt: new Date('2026-10-15T07:00:00Z'),
      transferReference: 'BANK-123',
      bankSnapshot: {
        bankCode: 'VCB',
        bankName: 'Vietcombank',
        accountHolder: 'NGUYEN VAN AN',
        lastFour: '8901',
        ciphertext: 'secret',
        iv: 'secret-iv',
        tag: 'secret-tag',
      },
      history: [
        { status: 'PENDING', createdAt: new Date('2026-10-15T07:00:00Z'), reason: 'internal' },
        { status: 'PROCESSING', createdAt: new Date('2026-10-15T07:05:00Z'), reason: 'internal' },
        { status: 'COMPLETED', createdAt: new Date('2026-10-15T07:12:00Z'), reason: 'internal' },
      ],
    });

    const receipt = await service.withdrawal(id, 'owner-1');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, userId: 'owner-1' } }),
    );
    expect(receipt).toEqual({
      id,
      amount: '50000',
      status: 'COMPLETED',
      createdAt: new Date('2026-10-15T07:00:00Z'),
      transferReference: 'BANK-123',
      bank: {
        bankCode: 'VCB',
        bankName: 'Vietcombank',
        accountHolder: 'NGUYEN VAN AN',
        lastFour: '8901',
      },
      timeline: [
        { status: 'PENDING', at: new Date('2026-10-15T07:00:00Z') },
        { status: 'PROCESSING', at: new Date('2026-10-15T07:05:00Z') },
        { status: 'COMPLETED', at: new Date('2026-10-15T07:12:00Z') },
      ],
    });
    expect(JSON.stringify(receipt)).not.toMatch(/secret|internal|reason|actorId/);
  });

  it('returns not found for absent or another user’s withdrawal', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.withdrawal(id, 'other-user')).rejects.toMatchObject({ status: 404 });
  });
});

it('filters unsuccessful withdrawals across rejected and failed states before pagination', async () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const repo = { db: { withdrawal: { findMany, count } } } as unknown as FinanceRepository;
  const service = new FinanceQueryService(repo, {} as ConfigService);
  await service.list(
    'withdrawals',
    { page: 1, limit: 20, status: 'UNSUCCESSFUL', sort: 'desc' },
    'owner-1',
  );
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: 'owner-1', status: { in: ['REJECTED', 'FAILED'] } },
    }),
  );
  expect(count).toHaveBeenCalledWith({
    where: { userId: 'owner-1', status: { in: ['REJECTED', 'FAILED'] } },
  });
});

it('finds a pending withdrawal by its full request ID before a transfer reference exists', async () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const repo = { db: { withdrawal: { findMany, count } } } as unknown as FinanceRepository;
  const service = new FinanceQueryService(repo, {} as ConfigService);
  const id = '37139c82-813b-4e8a-82a6-0f7bb99083fe';
  await service.list('withdrawals', { page: 1, limit: 20, search: id, sort: 'desc' }, 'owner-1');
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: 'owner-1', OR: [{ transferReference: { contains: id } }, { id }] },
    }),
  );
});
