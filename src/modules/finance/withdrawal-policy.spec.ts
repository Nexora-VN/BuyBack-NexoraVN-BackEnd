import type { ConfigService } from '@nestjs/config';
import type { FinanceCrypto } from './crypto.service.js';
import { FinanceQueryService } from './finance-query.service.js';
import type { FinanceRepository } from './finance.repository.js';
import type { WalletService } from './wallet.service.js';
import { WithdrawalService } from './withdrawal.service.js';

describe('Configured withdrawal minimum', () => {
  const policy = { minWithdrawal: 10000n };
  const tx = {
    affiliatePolicy: {
      findUnique: jest.fn().mockResolvedValue(policy),
      upsert: jest.fn().mockResolvedValue(policy),
    },
    withdrawal: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'withdrawal-1', status: 'PENDING' }),
    },
    userBank: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'bank-1',
        bankCode: 'VCB',
        bankName: 'Vietcombank',
        accountHolder: 'Test User',
        lastFour: '1234',
        accountCiphertext: 'ciphertext',
        accountIv: 'iv',
        accountTag: 'tag',
      }),
    },
    withdrawalStatusHistory: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const repo = {
    db: { affiliatePolicy: tx.affiliatePolicy },
    transaction: jest.fn(async (operation: (value: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  } as unknown as FinanceRepository;
  const wallets = { post: jest.fn() } as unknown as WalletService;
  const config = { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService;
  const service = new WithdrawalService(repo, wallets, {} as FinanceCrypto, config);

  beforeEach(() => jest.clearAllMocks());

  it('exposes the current policy to the withdrawal form', async () => {
    const query = new FinanceQueryService(repo, config);
    await expect(query.withdrawalPolicy()).resolves.toEqual({ minWithdrawal: '10000' });
  });

  it('accepts 20,000 VND when the admin minimum is 10,000 VND', async () => {
    await expect(
      service.create('user-1', { bankId: 'bank-1', amount: '20000', idempotencyKey: 'request-1' }),
    ).resolves.toEqual({ id: 'withdrawal-1', status: 'PENDING', amount: 20000n });
    expect(tx.withdrawal.create).toHaveBeenCalledTimes(1);
  });

  it('rejects amounts below the current minimum and returns that minimum', async () => {
    await expect(
      service.create('user-1', { bankId: 'bank-1', amount: '9999', idempotencyKey: 'request-2' }),
    ).rejects.toMatchObject({
      response: { message: 'MINIMUM_WITHDRAWAL_NOT_MET', minWithdrawal: '10000' },
    });
    expect(tx.withdrawal.create).not.toHaveBeenCalled();
  });
});
