import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { FinanceRepository, audit, json } from './finance.repository.js';
import { WalletService } from './wallet.service.js';
import { FinanceCrypto } from './crypto.service.js';
import { adjustmentInput, withdrawalInput, withdrawalStatusInput } from './finance.contract.js';
import { notify, notifyAdmins } from '../notifications/notification-events.js';
import { RegistrationMailService } from '../auth/services/registration-mail.service.js';
import { renderWithdrawalCompletedEmail } from './templates/withdrawal-completed-email.template.js';
import { renderCashbackCreditedEmail } from './templates/cashback-credited-email.template.js';

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);

  constructor(
    private readonly repo: FinanceRepository,
    private readonly wallets: WalletService,
    private readonly crypto: FinanceCrypto,
    private readonly config: ConfigService,
    @Optional() private readonly mail?: RegistrationMailService,
  ) {}
  create(userId: string, input: z.infer<typeof withdrawalInput>) {
    if (!this.config.get<boolean>('WITHDRAWALS_ENABLED'))
      throw new ServiceUnavailableException('WITHDRAWALS_DISABLED');
    return this.repo.transaction(async (tx) => {
      const amount = BigInt(input.amount);
      const key = 'withdrawal:' + userId + ':' + input.idempotencyKey;
      const old = await tx.withdrawal.findUnique({ where: { idempotencyKey: key } });
      if (old) {
        if (old.amount !== amount || old.bankId !== input.bankId)
          throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return { id: old.id, status: old.status, amount: old.amount };
      }
      const policy = await tx.affiliatePolicy.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
      });
      if (amount < policy.minWithdrawal)
        throw new ConflictException({
          message: 'MINIMUM_WITHDRAWAL_NOT_MET',
          minWithdrawal: policy.minWithdrawal.toString(),
        });
      const bank = await tx.userBank.findFirst({
        where: { id: input.bankId, userId, deleteAt: null, status: 'APPROVED' },
      });
      if (!bank?.accountCiphertext) throw new ConflictException('APPROVED_BANK_REQUIRED');
      const withdrawal = await tx.withdrawal.create({
        data: {
          idempotencyKey: key,
          userId,
          bankId: bank.id,
          amount,
          bankSnapshot: json({
            bankCode: bank.bankCode,
            bankName: bank.bankName,
            accountHolder: bank.accountHolder,
            lastFour: bank.lastFour,
            ciphertext: bank.accountCiphertext,
            iv: bank.accountIv,
            tag: bank.accountTag,
          }),
        },
      });
      await this.wallets.post(tx, {
        userId,
        key: 'reserve:' + withdrawal.id,
        type: 'WITHDRAWAL_RESERVE',
        available: -amount,
        reserved: amount,
        reference: withdrawal.id,
        requireFunds: amount,
      });
      await tx.withdrawalStatusHistory.create({
        data: {
          withdrawalId: withdrawal.id,
          status: 'PENDING',
          actorId: userId,
          reason: 'User requested withdrawal',
        },
      });
      await audit(tx, userId, 'WITHDRAWAL_CREATED', withdrawal.id, { amount });
      await notifyAdmins(tx, {
        eventKey: `withdrawal:${withdrawal.id}:created`,
        type: 'WITHDRAWAL_CREATED',
        title: 'Yêu cầu rút tiền mới',
        body: 'Có yêu cầu rút tiền đang chờ xử lý.',
        href: '/admin/withdrawals',
      });
      return { id: withdrawal.id, status: withdrawal.status, amount };
    });
  }
  async transition(id: string, actor: string, input: z.infer<typeof withdrawalStatusInput>) {
    const result = await this.repo.transaction(async (tx) => {
      const row = await tx.withdrawal.findUnique({
        where: { id },
        include: { user: { select: { email: true, displayName: true, fullName: true } } },
      });
      if (!row) throw new NotFoundException('WITHDRAWAL_NOT_FOUND');
      if (row.status === input.status) return { id, status: row.status, emailPayload: null };
      const allowed =
        row.status === 'PENDING'
          ? ['PROCESSING', 'REJECTED']
          : row.status === 'PROCESSING'
            ? ['COMPLETED', 'FAILED']
            : [];
      if (!allowed.includes(input.status))
        throw new ConflictException('INVALID_WITHDRAWAL_TRANSITION');
      if (input.status === 'PROCESSING') {
        const wallet = await tx.wallet.findUnique({ where: { userId: row.userId } });
        if (!wallet || wallet.available < 0n)
          throw new ConflictException('WALLET_HAS_CLAWBACK_DEBT');
      }
      if (input.status !== 'PROCESSING') {
        const completed = input.status === 'COMPLETED';
        await this.wallets.post(tx, {
          userId: row.userId,
          key: 'finalize:' + id,
          type: completed ? 'WITHDRAWAL_COMPLETE' : 'WITHDRAWAL_RELEASE',
          available: completed ? 0n : row.amount,
          reserved: -row.amount,
          reference: id,
          actorId: actor,
          reason: input.reason,
        });
      }
      await tx.withdrawal.update({
        where: { id },
        data: { status: input.status, transferReference: input.transferReference },
      });
      await tx.withdrawalStatusHistory.create({
        data: { withdrawalId: id, status: input.status, actorId: actor, reason: input.reason },
      });
      await audit(tx, actor, 'WITHDRAWAL_' + input.status, id, {
        reason: input.reason,
        transferReference: input.transferReference ?? null,
      });
      const statusCopy = {
        PROCESSING: ['Yêu cầu đang được xử lý', 'Yêu cầu rút tiền của bạn đang được chuyển khoản.'],
        COMPLETED: ['Đã chuyển tiền', 'Yêu cầu rút tiền của bạn đã hoàn tất.'],
        REJECTED: [
          'Yêu cầu rút tiền chưa được chấp nhận',
          'Vui lòng kiểm tra thông tin và thử lại.',
        ],
        FAILED: ['Chuyển tiền chưa thành công', 'Số tiền đã được hoàn lại vào số dư khả dụng.'],
      }[input.status];
      await notify(tx, {
        userId: row.userId,
        eventKey: `withdrawal:${id}:${input.status}`,
        type: `WITHDRAWAL_${input.status}`,
        title: statusCopy[0]!,
        body: statusCopy[1]!,
        href: `/app/withdrawals/${id}`,
      });

      let emailPayload: {
        email: string;
        userName?: string | null;
        amount: bigint;
        bankName: string;
        accountHolder: string;
        lastFour?: string;
        transferReference?: string | null;
      } | null = null;

      if (input.status === 'COMPLETED' && row.user?.email) {
        const s = row.bankSnapshot as {
          bankCode?: string;
          bankName?: string;
          accountHolder?: string;
          lastFour?: string;
        } | null;
        emailPayload = {
          email: row.user.email,
          userName: row.user.displayName || row.user.fullName,
          amount: row.amount,
          bankName: s?.bankName || s?.bankCode || 'Ngân hàng',
          accountHolder: s?.accountHolder || row.user.displayName || 'Khách hàng',
          lastFour: s?.lastFour,
          transferReference: input.transferReference ?? row.transferReference,
        };
      }

      return { id, status: input.status, emailPayload };
    });

    if (result.emailPayload && this.mail?.isConfigured()) {
      const p = result.emailPayload;
      this.mail
        .sendMail(
          p.email,
          renderWithdrawalCompletedEmail({
            userName: p.userName,
            amount: p.amount,
            bankName: p.bankName,
            accountHolder: p.accountHolder,
            accountNumberMasked: p.lastFour ? `•••• ${p.lastFour}` : undefined,
            transferReference: p.transferReference,
            completedAt: new Date(),
          }),
        )
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to send withdrawal completed email to ${p.email}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    return { id: result.id, status: result.status };
  }
  async paymentDetails(id: string, actor: string) {
    return this.repo.transaction(async (tx) => {
      const row = await tx.withdrawal.findUnique({ where: { id } });
      if (!row || row.status !== 'PROCESSING')
        throw new ConflictException('WITHDRAWAL_NOT_PROCESSING');
      const s = row.bankSnapshot as {
        bankCode: string;
        ciphertext: string;
        iv: string;
        tag: string;
        bankName: string;
        accountHolder: string;
      };
      const accountNumber = this.crypto.decrypt(s, 'bank:' + row.bankId);
      await audit(tx, actor, 'WITHDRAWAL_BANK_REVEALED', id);
      return {
        bankCode: s.bankCode,
        bankName: s.bankName,
        accountHolder: s.accountHolder,
        accountNumber,
      };
    });
  }
  async adjust(actor: string, input: z.infer<typeof adjustmentInput>) {
    const result = await this.repo.transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { email: true, displayName: true, fullName: true },
      });
      const res = await this.wallets.post(tx, {
        userId: input.userId,
        key: 'adjustment:' + input.idempotencyKey,
        type: 'MANUAL_ADJUSTMENT',
        available: BigInt(input.amount),
        reserved: 0n,
        reference: input.idempotencyKey,
        actorId: actor,
        reason: input.reason,
      });
      await audit(tx, actor, 'WALLET_ADJUSTED', res.id, { reason: input.reason });
      await notify(tx, {
        userId: input.userId,
        eventKey: `wallet:adjustment:${res.id}`,
        type: 'WALLET_ADJUSTED',
        title: 'Số dư ví đã được điều chỉnh',
        body:
          BigInt(input.amount) > 0n
            ? 'Số dư khả dụng của bạn đã được cộng thêm.'
            : 'Số dư khả dụng của bạn đã được điều chỉnh.',
        href: '/app/wallet',
      });
      const emailPayload =
        user?.email && BigInt(input.amount) > 0n
          ? {
              email: user.email,
              userName: user.displayName || user.fullName,
              amount: BigInt(input.amount),
              note: input.reason,
            }
          : null;
      return { res, emailPayload };
    });

    if (result.emailPayload && this.mail?.isConfigured()) {
      const p = result.emailPayload;
      this.mail
        .sendMail(
          p.email,
          renderCashbackCreditedEmail({
            userName: p.userName,
            amount: p.amount,
            note: p.note,
            creditedAt: new Date(),
          }),
        )
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to send adjustment email to ${p.email}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    return result.res;
  }
}
