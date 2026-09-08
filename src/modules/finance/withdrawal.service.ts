import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { FinanceRepository, audit, json } from './finance.repository.js';
import { WalletService } from './wallet.service.js';
import { FinanceCrypto } from './crypto.service.js';
import { adjustmentInput, withdrawalInput, withdrawalStatusInput } from './finance.contract.js';

@Injectable()
export class WithdrawalService {
  constructor(private readonly repo: FinanceRepository, private readonly wallets: WalletService,
    private readonly crypto: FinanceCrypto, private readonly config: ConfigService) {}
  create(userId: string, input: z.infer<typeof withdrawalInput>) {
    if (!this.config.get<boolean>('WITHDRAWALS_ENABLED')) throw new ServiceUnavailableException('WITHDRAWALS_DISABLED');
    return this.repo.transaction(async tx => {
      const amount = BigInt(input.amount);
      const key = 'withdrawal:' + userId + ':' + input.idempotencyKey;
      const old = await tx.withdrawal.findUnique({ where: { idempotencyKey: key } });
      if (old) {
        if (old.amount !== amount || old.bankId !== input.bankId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return { id: old.id, status: old.status, amount: old.amount };
      }
      const policy = await tx.affiliatePolicy.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
      if (amount < policy.minWithdrawal) throw new ConflictException('MINIMUM_WITHDRAWAL_50000');
      const bank = await tx.userBank.findFirst({ where: { id: input.bankId, userId, deleteAt: null, status: 'APPROVED' } });
      if (!bank?.accountCiphertext) throw new ConflictException('APPROVED_BANK_REQUIRED');
      const withdrawal = await tx.withdrawal.create({ data: {
        idempotencyKey: key, userId, bankId: bank.id, amount,
        bankSnapshot: json({ bankCode: bank.bankCode, bankName: bank.bankName, accountHolder: bank.accountHolder,
          lastFour: bank.lastFour, ciphertext: bank.accountCiphertext, iv: bank.accountIv, tag: bank.accountTag }),
      } });
      await this.wallets.post(tx, { userId, key: 'reserve:' + withdrawal.id, type: 'WITHDRAWAL_RESERVE',
        available: -amount, reserved: amount, reference: withdrawal.id, requireFunds: amount });
      await tx.withdrawalStatusHistory.create({ data: { withdrawalId: withdrawal.id, status: 'PENDING', actorId: userId, reason: 'User requested withdrawal' } });
      await audit(tx, userId, 'WITHDRAWAL_CREATED', withdrawal.id, { amount });
      return { id: withdrawal.id, status: withdrawal.status, amount };
    });
  }
  transition(id: string, actor: string, input: z.infer<typeof withdrawalStatusInput>) {
    return this.repo.transaction(async tx => {
      const row = await tx.withdrawal.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('WITHDRAWAL_NOT_FOUND');
      if (row.status === input.status) return { id, status: row.status };
      const allowed = row.status === 'PENDING' ? ['PROCESSING', 'REJECTED'] : row.status === 'PROCESSING' ? ['COMPLETED', 'FAILED'] : [];
      if (!allowed.includes(input.status)) throw new ConflictException('INVALID_WITHDRAWAL_TRANSITION');
      if (input.status === 'PROCESSING') {
        const wallet = await tx.wallet.findUnique({ where: { userId: row.userId } });
        if (!wallet || wallet.available < 0n) throw new ConflictException('WALLET_HAS_CLAWBACK_DEBT');
      }
      if (input.status !== 'PROCESSING') {
        const completed = input.status === 'COMPLETED';
        await this.wallets.post(tx, { userId: row.userId, key: 'finalize:' + id,
          type: completed ? 'WITHDRAWAL_COMPLETE' : 'WITHDRAWAL_RELEASE',
          available: completed ? 0n : row.amount, reserved: -row.amount, reference: id, actorId: actor, reason: input.reason });
      }
      await tx.withdrawal.update({ where: { id }, data: { status: input.status, transferReference: input.transferReference } });
      await tx.withdrawalStatusHistory.create({ data: { withdrawalId: id, status: input.status, actorId: actor, reason: input.reason } });
      await audit(tx, actor, 'WITHDRAWAL_' + input.status, id, { reason: input.reason, transferReference: input.transferReference ?? null });
      return { id, status: input.status };
    });
  }
  async paymentDetails(id: string, actor: string) {
    return this.repo.transaction(async tx => {
      const row = await tx.withdrawal.findUnique({ where: { id } });
      if (!row || row.status !== 'PROCESSING') throw new ConflictException('WITHDRAWAL_NOT_PROCESSING');
      const s = row.bankSnapshot as { ciphertext: string; iv: string; tag: string; bankName: string; accountHolder: string };
      const accountNumber = this.crypto.decrypt(s, 'bank:' + row.bankId);
      await audit(tx, actor, 'WITHDRAWAL_BANK_REVEALED', id);
      return { bankName: s.bankName, accountHolder: s.accountHolder, accountNumber };
    });
  }
  adjust(actor: string, input: z.infer<typeof adjustmentInput>) {
    return this.repo.transaction(async tx => {
      const result = await this.wallets.post(tx, { userId: input.userId, key: 'adjustment:' + input.idempotencyKey,
        type: 'MANUAL_ADJUSTMENT', available: BigInt(input.amount), reserved: 0n,
        reference: input.idempotencyKey, actorId: actor, reason: input.reason });
      await audit(tx, actor, 'WALLET_ADJUSTED', result.id, { reason: input.reason });
      return result;
    });
  }
}
