import { providerSettlementBlockers, commissionSettlementBlockers } from './settlement-eligibility.js';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { FinanceRepository, audit, type Tx } from './finance.repository.js';
import { WalletService } from './wallet.service.js';
import { allocateNet, splitCashback } from './domain/money.js';
import { settlementInput } from './finance.contract.js';

@Injectable()
export class SettlementService {
  constructor(
    private readonly repo: FinanceRepository,
    private readonly wallets: WalletService,
    private readonly config: ConfigService,
  ) {}
  create(input: z.infer<typeof settlementInput>, actor: string) {
    const gross = BigInt(input.grossVnd),
      deduction = BigInt(input.deductionVnd),
      net = BigInt(input.netVnd);
    if (gross - deduction !== net || gross <= 0n)
      throw new ConflictException('SETTLEMENT_TOTALS_MISMATCH');
    return this.repo.transaction(async (tx) => {
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
    });
  }
  confirm(id: string, actor: string) {
    if (!this.config.get<boolean>('SETTLEMENT_ENABLED'))
      throw new ServiceUnavailableException('SETTLEMENT_DISABLED');
    return this.repo.transaction(async (tx) => {
      const batch = await tx.settlementBatch.findUnique({
        where: { id },
        include: {
          items: {
            include: { commission: { include: { cashback: true, checkout: true } } },
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
        if (c.state !== 'VALIDATED' || !c.userId || !c.cashback || c.rawAmount !== item.rawSnapshot)
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
      }
      await tx.settlementBatch.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedBy: actor, confirmedAt: new Date() },
      });
      await audit(tx, actor, 'SETTLEMENT_CONFIRMED', id, { netVnd: batch.netVnd });
      return { id, status: 'CONFIRMED' };
    });
  }
  private async checkProvider(
    tx: Tx,
    checkout: { provider: string; accountId: string; checkoutId: string; payload?: unknown },
  ) {
    const blockers = await providerSettlementBlockers(tx, checkout);
    if (blockers.length) throw new ConflictException(blockers[0]);
  }
  cancel(id: string, actor: string, reason: string) {
    return this.repo.transaction(async (tx) => {
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
    });
  }
}
