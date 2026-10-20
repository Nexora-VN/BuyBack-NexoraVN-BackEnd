import type { ConfigService } from '@nestjs/config';
import type { FinanceRepository } from './finance.repository.js';
import type { WalletService } from './wallet.service.js';
import type { FinanceCrypto } from './crypto.service.js';
import type { RegistrationMailService } from '../auth/services/registration-mail.service.js';
import { SettlementService } from './settlement.service.js';
import { WithdrawalService } from './withdrawal.service.js';

describe('Finance email notifications', () => {
  describe('Settlement confirmation email', () => {
    it('sends cashback credited email to users when settlement batch is confirmed', async () => {
      process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES = 'Đã đối soát';
      const batchId = 'batch-uuid-1';
      const batch = {
        id: batchId,
        status: 'DRAFT',
        netVnd: 50000n,
        items: [
          {
            commissionId: 'comm-1',
            netVnd: 50000n,
            revisionSnapshot: 1,
            rawSnapshot: 50000n,
            commission: {
              id: 'comm-1',
              state: 'VALIDATED',
              userId: 'user-1',
              rawAmount: 50000n,
              checkout: {
                revision: 1,
                provider: 'ADDLIVETAG:MAIN',
                accountId: 'acc-1',
                checkoutId: 'chk-1',
                payload: [{ status_code: 'completed', commission_status: 'Đã đối soát' }],
              },
              cashback: { userBps: 10000 }, // 100% to user = 50,000 VND
              user: {
                email: 'user1@example.com',
                displayName: 'User One',
                fullName: 'Nguyen Van Mot',
              },
            },
          },
        ],
      };

      const tx = {
        settlementBatch: {
          findUnique: jest.fn().mockResolvedValue(batch),
          update: jest.fn().mockResolvedValue({ id: batchId, status: 'CONFIRMED' }),
        },
        providerCredential: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ADDLIVETAG',
            status: 'ACTIVE',
            verifiedAt: new Date(),
            accountId: 'acc-1',
          }),
        },
        commission: { update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
        cashbackAllocation: { update: jest.fn() },
        reconciliationIssue: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(0),
        },
        notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { create: jest.fn() },
      };

      const repo = {
        transaction: jest.fn(async (op: (t: typeof tx) => Promise<unknown>) => op(tx)),
      } as unknown as FinanceRepository;

      const wallets = {
        post: jest.fn().mockResolvedValue({ id: 'w-1' }),
      } as unknown as WalletService;
      const config = {
        get: jest.fn((key: string) => (key === 'SETTLEMENT_ENABLED' ? true : undefined)),
      } as unknown as ConfigService;

      const mail = {
        isConfigured: jest.fn().mockReturnValue(true),
        sendMail: jest.fn().mockResolvedValue(undefined),
      } as unknown as RegistrationMailService;

      const service = new SettlementService(repo, wallets, config, mail);
      const res = await service.confirm(batchId, 'admin-1');

      expect(res).toEqual({ id: batchId, status: 'CONFIRMED' });
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      expect(mail.sendMail).toHaveBeenCalledWith(
        'user1@example.com',
        expect.objectContaining({
          subject: expect.stringContaining('hoàn tiền đã vào ví'),
          html: expect.stringContaining('50.000'),
        }),
      );
    });
  });

  describe('Withdrawal completed email', () => {
    it('sends withdrawal completed email when transition status is COMPLETED', async () => {
      const withdrawalId = 'withdrawal-uuid-1';
      const withdrawalRow = {
        id: withdrawalId,
        userId: 'user-1',
        amount: 100000n,
        status: 'PROCESSING',
        bankSnapshot: {
          bankCode: 'MBB',
          bankName: 'MB Bank',
          accountHolder: 'NGUYEN VAN MOT',
          lastFour: '6789',
        },
        user: {
          email: 'user1@example.com',
          displayName: 'User One',
          fullName: 'Nguyen Van Mot',
        },
      };

      const tx = {
        withdrawal: {
          findUnique: jest.fn().mockResolvedValue(withdrawalRow),
          update: jest.fn().mockResolvedValue({ id: withdrawalId, status: 'COMPLETED' }),
        },
        wallet: { findUnique: jest.fn().mockResolvedValue({ available: 50000n }) },
        withdrawalStatusHistory: { create: jest.fn() },
        auditLog: { create: jest.fn() },
        notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };

      const repo = {
        transaction: jest.fn(async (op: (t: typeof tx) => Promise<unknown>) => op(tx)),
      } as unknown as FinanceRepository;

      const wallets = {
        post: jest.fn().mockResolvedValue({ id: 'w-1' }),
      } as unknown as WalletService;
      const config = { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService;
      const crypto = {} as FinanceCrypto;

      const mail = {
        isConfigured: jest.fn().mockReturnValue(true),
        sendMail: jest.fn().mockResolvedValue(undefined),
      } as unknown as RegistrationMailService;

      const service = new WithdrawalService(repo, wallets, crypto, config, mail);
      const res = await service.transition(withdrawalId, 'admin-1', {
        status: 'COMPLETED',
        transferReference: 'FT123456',
        reason: 'Payment sent',
      });

      expect(res).toEqual({ id: withdrawalId, status: 'COMPLETED' });
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      expect(mail.sendMail).toHaveBeenCalledWith(
        'user1@example.com',
        expect.objectContaining({
          subject: expect.stringContaining('Rút tiền thành công'),
          html: expect.stringContaining('100.000'),
        }),
      );
    });

    it('does not send withdrawal email when status transition is not COMPLETED (e.g. PROCESSING)', async () => {
      const withdrawalId = 'withdrawal-uuid-2';
      const withdrawalRow = {
        id: withdrawalId,
        userId: 'user-1',
        amount: 100000n,
        status: 'PENDING',
        bankSnapshot: {
          bankCode: 'MBB',
          bankName: 'MB Bank',
          accountHolder: 'USER',
          lastFour: '1234',
        },
        user: { email: 'user1@example.com' },
      };

      const tx = {
        withdrawal: {
          findUnique: jest.fn().mockResolvedValue(withdrawalRow),
          update: jest.fn().mockResolvedValue({ id: withdrawalId, status: 'PROCESSING' }),
        },
        wallet: { findUnique: jest.fn().mockResolvedValue({ available: 50000n }) },
        withdrawalStatusHistory: { create: jest.fn() },
        auditLog: { create: jest.fn() },
        notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };

      const repo = {
        transaction: jest.fn(async (op: (t: typeof tx) => Promise<unknown>) => op(tx)),
      } as unknown as FinanceRepository;

      const wallets = { post: jest.fn() } as unknown as WalletService;
      const config = { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService;
      const crypto = {} as FinanceCrypto;

      const mail = {
        isConfigured: jest.fn().mockReturnValue(true),
        sendMail: jest.fn().mockResolvedValue(undefined),
      } as unknown as RegistrationMailService;

      const service = new WithdrawalService(repo, wallets, crypto, config, mail);
      await service.transition(withdrawalId, 'admin-1', {
        status: 'PROCESSING',
        reason: 'Verification in progress',
      });

      expect(mail.sendMail).not.toHaveBeenCalled();
    });
  });
});
