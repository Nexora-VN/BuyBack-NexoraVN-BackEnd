import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bankInput } from './finance.contract.js';
import { FinanceCrypto } from './crypto.service.js';
import { FinanceRepository, audit } from './finance.repository.js';
import { notify, notifyAdmins } from '../notifications/notification-events.js';

export const bankSelect = {
  id: true,
  userId: true,
  bankCode: true,
  bankName: true,
  bankBranch: true,
  accountHolder: true,
  lastFour: true,
  status: true,
  version: true,
  createdAt: true,
  reviewedAt: true,
  reviewReason: true,
} as const;
@Injectable()
export class BankService {
  constructor(
    private readonly repo: FinanceRepository,
    private readonly crypto: FinanceCrypto,
  ) {}
  async save(userId: string, input: z.infer<typeof bankInput>, previousId?: string) {
    return this.repo.transaction(async (tx) => {
      const previous = previousId
        ? await tx.userBank.findFirst({ where: { id: previousId, userId, deleteAt: null } })
        : null;
      if (previousId && !previous) throw new NotFoundException('BANK_NOT_FOUND');
      const id = randomUUID();
      const secret = this.crypto.encrypt(input.accountNumber, 'bank:' + id);
      const bank = await tx.userBank.create({
        data: {
          id,
          userId,
          bankCode: input.bankCode,
          bankName: input.bankName,
          bankBranch: null,
          accountHolder: input.accountHolder,
          accountCiphertext: secret.ciphertext,
          accountIv: secret.iv,
          accountTag: secret.tag,
          lastFour: input.accountNumber.slice(-4),
          version: (previous?.version ?? 0) + 1,
          previousId,
          createdBy: userId,
          updatedBy: userId,
        },
        select: bankSelect,
      });
      if (previous)
        await tx.userBank.update({
          where: { id: previous.id },
          data: { deleteAt: new Date(), deleteBy: userId },
        });
      await audit(tx, userId, 'BANK_SUBMITTED', id, { previousId: previousId ?? null });
      await notifyAdmins(tx, {
        eventKey: `bank:${id}:submitted`,
        type: 'BANK_SUBMITTED',
        title: 'Tài khoản nhận tiền cần duyệt',
        body: 'Có tài khoản nhận tiền mới cần kiểm tra.',
        href: '/admin/bank-accounts',
      });
      return bank;
    });
  }
  async remove(userId: string, id: string) {
    return this.repo.transaction(async (tx) => {
      const result = await tx.userBank.updateMany({
        where: { id, userId, deleteAt: null },
        data: { deleteAt: new Date(), deleteBy: userId },
      });
      if (!result.count) throw new NotFoundException('BANK_NOT_FOUND');
      await audit(tx, userId, 'BANK_REMOVED', id);
      return { id };
    });
  }
  async review(id: string, actor: string, approved: boolean, reason: string) {
    return this.repo.transaction(async (tx) => {
      const bank = await tx.userBank.findUnique({ where: { id } });
      if (!bank || bank.deleteAt) throw new NotFoundException('BANK_NOT_FOUND');
      if (bank.status !== 'PENDING' || !bank.accountCiphertext)
        throw new ConflictException('BANK_NOT_REVIEWABLE');
      const updated = await tx.userBank.update({
        where: { id },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          reviewedBy: actor,
          reviewedAt: new Date(),
          reviewReason: reason,
        },
        select: bankSelect,
      });
      await audit(tx, actor, approved ? 'BANK_APPROVED' : 'BANK_REJECTED', id, { reason });
      await notify(tx, {
        userId: bank.userId,
        eventKey: `bank:${id}:${approved ? 'approved' : 'rejected'}`,
        type: approved ? 'BANK_APPROVED' : 'BANK_REJECTED',
        title: approved
          ? 'Tài khoản nhận tiền đã được duyệt'
          : 'Tài khoản nhận tiền chưa được duyệt',
        body: approved
          ? 'Bạn có thể sử dụng tài khoản này để rút tiền.'
          : 'Vui lòng kiểm tra và gửi lại thông tin tài khoản nhận tiền.',
        href: '/app/account',
      });
      return updated;
    });
  }
}
