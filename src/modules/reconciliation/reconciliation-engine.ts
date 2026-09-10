import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CommissionState } from '../../generated/prisma/client.js';
import { FinanceRepository, audit, json } from '../finance/finance.repository.js';
import { WalletService } from '../finance/wallet.service.js';
import { parseAttribution, RAW_SCALE, splitCashback } from '../finance/domain/money.js';
import { type SaffiCheckout, conversionState } from './saffi.contract.js';

@Injectable()
export class ReconciliationEngine {
  constructor(
    private readonly repo: FinanceRepository,
    private readonly wallet: WalletService,
    private readonly config: ConfigService,
  ) {}
  ingest(batchId: string, input: SaffiCheckout) {
    return this.repo.transaction(async (tx) => {
      const issues: string[] = [];
      let userId: string | null = null,
        affiliateLinkId: string | null = null;
      if (input.affiliate_id !== this.config.get<string>('SHOPEE_AFFILIATE_ID'))
        issues.push('AFFILIATE_ID_MISMATCH');
      try {
        const attribution = parseAttribution(input.utm_content);
        const link = await tx.affiliateLink.findUnique({ where: { subId2: attribution.link } });
        if (!link) issues.push('AFFILIATE_LINK_NOT_FOUND');
        else if (
          link.userId.replaceAll('-', '') !== attribution.user ||
          link.subId1 !== attribution.user ||
          link.productId.replaceAll('-', '') !== attribution.product ||
          link.subId5 !== attribution.product ||
          link.subId4 !== attribution.tracking ||
          link.subId3 !== attribution.channel ||
          (link.affiliateIdSnapshot !== null && link.affiliateIdSnapshot !== input.affiliate_id)
        )
          issues.push('ATTRIBUTION_MISMATCH');
        else {
          userId = link.userId;
          affiliateLinkId = link.id;
        }
      } catch {
        issues.push('INVALID_ATTRIBUTION');
      }
      const raw = BigInt(input.affiliate_net_commission);
      let conversion = conversionState(input);
      const terminalPartial =
        conversion === 'PARTIALLY_VALIDATED' &&
        input.conversion_status === 2 &&
        input.orders.every(
          (o) =>
            [2, 3].includes(o.display_order_status) &&
            o.items.every((i) => [2, 3].includes(i.affiliate_item_status)),
        );
      if (conversion === 'MANUAL_REVIEW') issues.push('UNKNOWN_OR_CONFLICTING_STATUS');
      if (conversion === 'PARTIALLY_VALIDATED' && !terminalPartial)
        issues.push('PARTIAL_CHECKOUT_REVIEW');
      if (
        input.orders.some((o) =>
          o.items.some(
            (i) =>
              (i.is_fraud === 1 || i.affiliate_item_status === 3 || o.display_order_status === 3) &&
              (BigInt(i.item_commission) !== 0n || BigInt(i.capped_brand_commission) !== 0n),
          ),
        )
      )
        issues.push('REJECTED_ITEM_HAS_COMMISSION');
      const orderKeys = input.orders.map((o) => o.order_id);
      if (new Set(orderKeys).size !== orderKeys.length)
        throw new Error('DUPLICATE_ORDER_IN_CHECKOUT');
      const itemTotal = input.orders
        .flatMap((o) => o.items)
        .reduce((s, i) => s + BigInt(i.item_commission) + BigInt(i.capped_brand_commission), 0n);
      if (
        raw !== BigInt(input.estimated_total_commission) ||
        itemTotal !== BigInt(input.estimated_total_commission)
      )
        issues.push('COMMISSION_AMOUNT_MISMATCH');
      if (issues.length) conversion = 'MANUAL_REVIEW';
      const checkout = await tx.providerCheckout.upsert({
        where: { provider_checkoutId: { provider: 'SAFFI', checkoutId: input.checkout_id } },
        create: {
          checkoutId: input.checkout_id,
          affiliateId: input.affiliate_id,
          utmContent: input.utm_content,
          conversionState: conversion,
          rawStatus: input.checkout_status,
          netRaw: raw,
          payload: json(input),
          purchasedAt: new Date(input.purchase_time * 1000),
        },
        update: {
          affiliateId: input.affiliate_id,
          utmContent: input.utm_content,
          conversionState: conversion,
          rawStatus: input.checkout_status,
          netRaw: raw,
          payload: json(input),
        },
      });
      for (const order of input.orders) {
        const itemKeys = order.items.map((i) => [i.item_id, i.model_id, i.promotion_id].join(':'));
        if (new Set(itemKeys).size !== itemKeys.length) throw new Error('DUPLICATE_ITEM_IN_ORDER');
        const existing = await tx.providerOrder.findUnique({
          where: { provider_orderId: { provider: 'SAFFI', orderId: order.order_id } },
        });
        if (existing && existing.checkoutId !== checkout.id)
          throw new Error('ORDER_CHECKOUT_CONFLICT');
        const saved = await tx.providerOrder.upsert({
          where: { provider_orderId: { provider: 'SAFFI', orderId: order.order_id } },
          create: {
            orderId: order.order_id,
            checkoutId: checkout.id,
            orderSn: order.order_sn,
            affiliateTransactionId: order.affiliate_transaction_id || null,
            status: String(order.display_order_status),
            payload: json(order),
          },
          update: {
            status: String(order.display_order_status),
            payload: json(order),
            affiliateTransactionId: order.affiliate_transaction_id || null,
          },
        });
        for (const item of order.items) {
          const data = {
            status: item.display_item_status,
            itemPriceRaw: BigInt(item.item_price),
            actualAmountRaw: BigInt(item.actual_amount),
            refundedAmountRaw: BigInt(item.refunded_amount),
            commissionRaw: BigInt(item.item_commission),
            brandCommissionRaw: BigInt(item.capped_brand_commission),
            brandRate: item.brand_commission_rate,
            platformRate: item.platform_commission_rate,
            payload: json(item),
          };
          const key = {
            orderId: saved.id,
            itemId: item.item_id,
            modelId: item.model_id,
            promotionId: item.promotion_id,
          };
          await tx.providerOrderItem.upsert({
            where: { orderId_itemId_modelId_promotionId: key },
            create: { ...key, ...data },
            update: data,
          });
        }
      }
      const previous = await tx.commission.findUnique({
        where: { checkoutId: checkout.id },
        include: { cashback: true },
      });
      let state: CommissionState =
        conversion === 'VALIDATED' || (terminalPartial && !issues.length)
          ? 'VALIDATED'
          : conversion === 'REJECTED'
            ? 'REJECTED'
            : conversion === 'PENDING'
              ? 'ESTIMATED'
              : 'MANUAL_REVIEW';
      if (previous?.state === 'PAID' || previous?.state === 'REVERSED') {
        if (
          previous.state === 'PAID' &&
          conversionState(input) === 'REJECTED' &&
          input.affiliate_id === this.config.get<string>('SHOPEE_AFFILIATE_ID')
        ) {
          if (previous.userId && previous.cashback)
            await this.wallet.post(tx, {
              userId: previous.userId,
              key: 'reversal:' + previous.id,
              type: 'CASHBACK_REVERSAL',
              available: -previous.cashback.userAmount,
              reserved: 0n,
              reference: previous.id,
              reason: 'Provider rejected previously paid commission',
            });
          await tx.commission.update({ where: { id: previous.id }, data: { state: 'REVERSED' } });
          await tx.cashbackAllocation.updateMany({
            where: { commissionId: previous.id },
            data: { state: 'REVERSED' },
          });
          await audit(tx, null, 'COMMISSION_REVERSED', previous.id);
        } else if (raw !== previous.rawAmount || (conversion !== 'VALIDATED' && !terminalPartial))
          issues.push('PAID_COMMISSION_CHANGED');
      } else {
        if (previous?.userId && userId !== previous.userId) {
          issues.push('ATTRIBUTION_CHANGED');
          userId = previous.userId;
          affiliateLinkId = previous.affiliateLinkId;
          state = 'MANUAL_REVIEW';
        }
        if (previous?.state === 'VALIDATED' && state === 'ESTIMATED') {
          issues.push('STATUS_REGRESSION');
          state = 'MANUAL_REVIEW';
        }
        const commission = await tx.commission.upsert({
          where: { checkoutId: checkout.id },
          create: {
            checkoutId: checkout.id,
            userId,
            affiliateLinkId,
            state,
            rawAmount: raw,
            estimatedVnd: raw / RAW_SCALE,
          },
          update: { userId, affiliateLinkId, state, rawAmount: raw, estimatedVnd: raw / RAW_SCALE },
        });
        if (userId) {
          await tx.affiliatePolicy.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
          const split = splitCashback(raw / RAW_SCALE);
          const cashbackState =
            state === 'VALIDATED' ? 'VALIDATED' : state === 'REJECTED' ? 'REJECTED' : 'PENDING';
          await tx.cashbackAllocation.upsert({
            where: { commissionId: commission.id },
            create: {
              commissionId: commission.id,
              policyId: 1,
              userAmount: split.user,
              platformAmount: split.platform,
              state: cashbackState,
            },
            update: {
              userAmount: split.user,
              platformAmount: split.platform,
              state: cashbackState,
            },
          });
        }
      }
      for (const type of new Set(issues)) {
        const open = await tx.reconciliationIssue.findFirst({
          where: { checkoutId: input.checkout_id, type, status: 'OPEN' },
        });
        if (!open)
          await tx.reconciliationIssue.create({
            data: {
              batchId,
              checkoutId: input.checkout_id,
              type,
              payload: json({ checkoutId: checkout.id }),
            },
          });
      }
      return { id: checkout.id, issues: issues.length };
    });
  }
}
