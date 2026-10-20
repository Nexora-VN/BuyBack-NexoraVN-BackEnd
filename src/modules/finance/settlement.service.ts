import { step } from '../../common/observability/observability.js';
import {
  providerSettlementBlockers,
  commissionSettlementBlockers,
} from './settlement-eligibility.js';
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
import { FinanceRepository, audit, type Tx } from './finance.repository.js';
import { WalletService } from './wallet.service.js';
import { allocateNet, splitCashback } from './domain/money.js';
import { settlementInput } from './finance.contract.js';
import { notify } from '../notifications/notification-events.js';
import { RegistrationMailService } from '../auth/services/registration-mail.service.js';
import { renderCashbackCreditedEmail } from './templates/cashback-credited-email.template.js';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly repo: FinanceRepository,
    private readonly wallets: WalletService,
    private readonly config: ConfigService,
    @Optional() private readonly mail?: RegistrationMailService,
  ) {}
  create(input: z.infer<typeof settlementInput>, actor: string) {
    const gross = BigInt(input.grossVnd),
      deduction = BigInt(input.deductionVnd),
      net = BigInt(input.netVnd);
    if (gross - deduction !== net || gross <= 0n)
      throw new ConflictException('SETTLEMENT_TOTALS_MISMATCH');
    return step('settlement.transaction', () =>
      this.repo.transaction(async (tx) => {
        const rows = await tx.commission.findMany({
          where: { id: { in: input.commissionIds } },
          orderBy: { id: 'asc' },
          include: { settlementItem: true, checkout: true },
        });
        if (
          rows.length !== input.commissionIds.length ||
          rows.some((r) => commissionSettlementBlockers(r).length > 0)
        )
          throw new ConflictException('COMMISSIONS_NOT_ELIGIBLE');
        for (const row of rows) await this.checkProvider(tx, row.checkout);
        const expected = rows.reduce((sum, row) => sum + row.estimatedVnd, 0n);
        if (gross !== expected)
          throw new ConflictException('GROSS_DIFFERS_FROM_VALIDATED_COMMISSION');
        const amounts = allocateNet(
          net,
          rows.map((r) => r.estimatedVnd),
        );
        const settlement = await tx.settlementBatch.create({
          data: {
            reference: input.reference,
            grossVnd: gross,
            deductionVnd: deduction,
            netVnd: net,
            createdBy: actor,
            items: {
              create: rows.map((r, i) => ({
                commissionId: r.id,
                rawSnapshot: r.rawAmount,
                revisionSnapshot: r.checkout.revision,
                netVnd: amounts[i]!,
              })),
            },
          },
          include: { items: true },
        });
        await audit(tx, actor, 'SETTLEMENT_CREATED', settlement.id);
        return settlement;
      }),
    );
  }
  async confirm(id: string, actor: string) {
    if (!this.config.get<boolean>('SETTLEMENT_ENABLED'))
      throw new ServiceUnavailableException('SETTLEMENT_DISABLED');
    const userCredits = new Map<
      string,
      { email: string; name?: string | null; totalAmount: bigint; count: number }
    >();
    const result = await step('settlement.transaction', () =>
      this.repo.transaction(async (tx) => {
        const batch = await tx.settlementBatch.findUnique({
          where: { id },
          include: {
            items: {
              include: {
                commission: {
                  include: {
                    cashback: true,
                    checkout: true,
                    user: { select: { email: true, displayName: true, fullName: true } },
                  },
                },
              },
              orderBy: { commissionId: 'asc' },
            },
          },
        });
        if (!batch) throw new NotFoundException('SETTLEMENT_NOT_FOUND');
        if (batch.status === 'CONFIRMED') return { id, status: 'CONFIRMED' };
        if (batch.status !== 'DRAFT') throw new ConflictException('SETTLEMENT_NOT_DRAFT');
        if (batch.items.reduce((s, i) => s + i.netVnd, 0n) !== batch.netVnd)
          throw new ConflictException('SETTLEMENT_UNBALANCED');
        for (const item of batch.items) {
          const c = item.commission;
          await this.checkProvider(tx, c.checkout);
          if (c.checkout.revision !== item.revisionSnapshot)
            throw new ConflictException('COMMISSION_REVISION_CHANGED');
          if (
            c.state !== 'VALIDATED' ||
            !c.userId ||
            !c.cashback ||
            c.rawAmount !== item.rawSnapshot
          )
            throw new ConflictException('COMMISSION_CHANGED_RESYNC_REQUIRED');
          const split = splitCashback(item.netVnd, BigInt(c.cashback.userBps));
          await tx.commission.update({
            where: { id: c.id },
            data: { state: 'PAID', settledVnd: item.netVnd },
          });
          await tx.cashbackAllocation.update({
            where: { commissionId: c.id },
            data: { state: 'AVAILABLE', userAmount: split.user, platformAmount: split.platform },
          });
          await this.wallets.post(tx, {
            userId: c.userId,
            key: 'settlement:' + c.id,
            type: 'CASHBACK_CREDIT',
            available: split.user,
            reserved: 0n,
            reference: c.id,
            actorId: actor,
          });
          await notify(tx, {
            userId: c.userId,
            eventKey: `commission:${c.id}:paid`,
            type: 'CASHBACK_CREDITED',
            title: 'Hoàn tiền đã vào ví',
            body: 'Hoa hồng của đơn hàng đã được xác nhận và cộng vào số dư khả dụng.',
            href: '/app/wallet',
          });
          if (c.user?.email && split.user > 0n) {
            const existing = userCredits.get(c.userId);
            if (existing) {
              existing.totalAmount += split.user;
              existing.count += 1;
            } else {
              userCredits.set(c.userId, {
                email: c.user.email,
                name: c.user.displayName || c.user.fullName,
                totalAmount: split.user,
                count: 1,
              });
            }
          }
        }
        await tx.settlementBatch.update({
          where: { id },
          data: { status: 'CONFIRMED', confirmedBy: actor, confirmedAt: new Date() },
        });
        await audit(tx, actor, 'SETTLEMENT_CONFIRMED', id, { netVnd: batch.netVnd });
        return { id, status: 'CONFIRMED' };
      }),
    );

    if (this.mail?.isConfigured()) {
      for (const credit of userCredits.values()) {
        this.mail
          .sendMail(
            credit.email,
            renderCashbackCreditedEmail({
              userName: credit.name,
              amount: credit.totalAmount,
              orderCount: credit.count,
              creditedAt: new Date(),
            }),
          )
          .catch((err: unknown) => {
            this.logger.warn(
              `Failed to send cashback email to ${credit.email}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }
    }

    return result;
  }
  private async checkProvider(
    tx: Tx,
    checkout: { provider: string; accountId: string; checkoutId: string; payload?: unknown },
  ) {
    const blockers = await providerSettlementBlockers(tx, checkout);
    if (blockers.length) throw new ConflictException(blockers[0]);
  }
  cancel(id: string, actor: string, reason: string) {
    return step('settlement.transaction', () =>
      this.repo.transaction(async (tx) => {
        const batch = await tx.settlementBatch.findUnique({ where: { id } });
        if (!batch) throw new NotFoundException('SETTLEMENT_NOT_FOUND');
        if (batch.status === 'CANCELLED') return { id, status: 'CANCELLED' };
        if (batch.status !== 'DRAFT')
          throw new ConflictException('CONFIRMED_SETTLEMENT_IS_IMMUTABLE');
        const items = await tx.settlementItem.findMany({ where: { settlementId: id } });
        await audit(tx, actor, 'SETTLEMENT_DRAFT_CANCELLED', id, { reason, items });
        await tx.settlementItem.deleteMany({ where: { settlementId: id } });
        await tx.settlementBatch.update({ where: { id }, data: { status: 'CANCELLED' } });
        return { id, status: 'CANCELLED' };
      }),
    );
  }
}
