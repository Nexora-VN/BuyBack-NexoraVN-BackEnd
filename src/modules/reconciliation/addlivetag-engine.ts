import { commissionPaymentState, paymentBlockers } from './commission-status.js';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { FinanceRepository, audit, json, type Tx } from '../finance/finance.repository.js';
import { WalletService } from '../finance/wallet.service.js';
import { parseAttribution, splitCashback } from '../finance/domain/money.js';
import { providerScope, type ConversionItem, type reviewInput } from './addlivetag.contract.js';

export function checkoutDigest(rows: ConversionItem[]) {
  return (
    createHash('sha256')
      // Version the interpretation so unchanged snapshots are reprocessed after this fix.
      .update('commission-payment-v2:')
      .update(process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES ?? '')
      .update(JSON.stringify(rows.map((r) => JSON.stringify(r)).sort()))
      .digest('hex')
  );
}
export function inspectCheckout(rows: ConversionItem[]) {
  const issues = new Set<string>(),
    states = new Set(rows.map((r) => r.status_code));
  const conversion =
    states.size > 1
      ? 'PARTIALLY_VALIDATED'
      : states.has('completed')
        ? 'VALIDATED'
        : states.has('cancelled')
          ? 'REJECTED'
          : 'MANUAL_REVIEW';
  if (
    rows.some(
      (r) =>
        r.status_code === 'completed' && commissionPaymentState(r.commission_status) === 'UNKNOWN',
    )
  )
    issues.add('UNKNOWN_COMMISSION_STATUS');
  if (conversion === 'PARTIALLY_VALIDATED') issues.add('PARTIAL_CHECKOUT_REVIEW');
  if (rows.some((r) => !['completed', 'cancelled'].includes(r.status_code)))
    issues.add('UNKNOWN_PROVIDER_STATUS');
  if (rows.some((r) => BigInt(r.mcn_fee) !== 0n)) issues.add('MCN_FEE_REVIEW');
  if (rows.some((r) => r.status_code === 'cancelled' && BigInt(r.commission) !== 0n))
    issues.add('CANCELLED_WITH_COMMISSION');
  const seen = new Set<string>();
  for (const row of rows) {
    let itemId: string | null = null;
    try {
      const parsedUrl = new URL(row.item_url);
      itemId = parsedUrl.searchParams.get('item_id') ?? parsedUrl.searchParams.get('itemId');
    } catch {
      /* Review invalid references. */
    }
    if (!itemId || !/^\d+$/.test(itemId)) issues.add('INVALID_ITEM_REFERENCE');
    const key = JSON.stringify([row.order_sn, itemId]);
    if (seen.has(key)) issues.add('AMBIGUOUS_ITEM_IDENTITY');
    seen.add(key);
  }
  return { conversion, issues, amount: rows.reduce((s, r) => s + BigInt(r.commission), 0n) };
}
@Injectable()
export class AddLiveTagEngine {
  constructor(
    private readonly repo: FinanceRepository,
    private readonly wallet: WalletService,
  ) {}
  async publish(
    tx: Tx,
    batch: { id: string; accountId: string; expectedAffiliate: string; credentialVersion: number },
    groups: Map<string, ConversionItem[]>,
  ) {
    const credential = await tx.providerCredential.findUniqueOrThrow({
      where: { id: 'ADDLIVETAG' },
    });
    if (credential.version !== batch.credentialVersion || credential.accountId !== batch.accountId)
      throw new ConflictException('CREDENTIAL_CHANGED');
    for (const [externalId, rows] of groups) {
      const { conversion, issues, amount } = inspectCheckout(rows);
      const provider = providerScope(batch.accountId),
        sourceHash = checkoutDigest(rows);
      if (!credential.verifiedAt) issues.add('ACCOUNT_UNIT_UNVERIFIED');
      if (rows.some((r) => r.affiliate !== batch.expectedAffiliate))
        issues.add('AFFILIATE_ACCOUNT_MISMATCH');
      if (
        await tx.providerCheckout.findFirst({
          where: { checkoutId: externalId, provider: { not: provider } },
        })
      )
        issues.add('CROSS_PROVIDER_DUPLICATE');
      let userId: string | null = null,
        affiliateLinkId: string | null = null;
      try {
        if (new Set(rows.map((r) => r.utm)).size !== 1) throw new Error();
        const a = parseAttribution(rows[0]!.utm);
        const link = await tx.affiliateLink.findUnique({ where: { subId2: a.link } });
        if (
          !link ||
          link.deleteAt ||
          link.userId.replaceAll('-', '') !== a.user ||
          link.subId1 !== a.user ||
          link.productId.replaceAll('-', '') !== a.product ||
          link.subId5 !== a.product ||
          link.subId3 !== a.channel ||
          link.subId4 !== a.tracking ||
          rows.some((r) => r.sub_id1 && r.sub_id1 !== a.user)
        )
          throw new Error();
        userId = link.userId;
        affiliateLinkId = link.id;
      } catch {
        issues.add('INVALID_ATTRIBUTION');
      }
      const existing = await tx.providerCheckout.findUnique({
        where: { provider_checkoutId: { provider, checkoutId: externalId } },
        include: { commission: { include: { cashback: true } } },
      });
      if (existing?.sourceHash === sourceHash) continue;
      // Old issues refer to an obsolete revision; regenerate issues from the new snapshot.
      // Otherwise a corrected import can remain blocked by an issue that cannot be reviewed.
      await tx.reconciliationIssue.updateMany({
        where: {
          provider,
          checkoutId: externalId,
          status: 'OPEN',
          sourceHash: { not: sourceHash },
        },
        data: {
          status: 'RESOLVED',
          resolution: 'Superseded by a newer reconciliation snapshot',
          resolvedAt: new Date(),
        },
      });
      const previous = existing?.commission;
      if (previous?.userId && userId !== previous.userId) {
        issues.add('ATTRIBUTION_CHANGED');
        userId = previous.userId;
        affiliateLinkId = previous.affiliateLinkId;
      }
      const paid = previous?.state === 'PAID' || previous?.state === 'REVERSED';
      if (paid) issues.add('PAID_COMMISSION_CHANGED');
      const checkout = await tx.providerCheckout.upsert({
        where: { provider_checkoutId: { provider, checkoutId: externalId } },
        create: {
          provider,
          accountId: batch.accountId,
          checkoutId: externalId,
          affiliateId: '',
          utmContent: rows[0]!.utm,
          conversionState: issues.size ? 'MANUAL_REVIEW' : conversion,
          rawStatus: conversion,
          netRaw: amount,
          scale: 1,
          payload: json(rows),
          sourceHash,
          purchasedAt: new Date(rows[0]!.purchase_time * 1000),
        },
        update: {
          utmContent: rows[0]!.utm,
          purchasedAt: new Date(rows[0]!.purchase_time * 1000),
          conversionState: issues.size ? 'MANUAL_REVIEW' : conversion,
          rawStatus: conversion,
          netRaw: amount,
          payload: json(rows),
          sourceHash,
          revision: { increment: 1 },
        },
      });
      // Explicit internal order key; this is not an order_id returned by AddLiveTag.
      for (const orderSn of new Set(rows.map((r) => r.order_sn))) {
        const orderRows = rows.filter((r) => r.order_sn === orderSn),
          orderId = JSON.stringify([externalId, orderSn]);
        await tx.providerOrder.upsert({
          where: { provider_orderId: { provider, orderId } },
          create: {
            provider,
            orderId,
            orderSn,
            checkoutId: checkout.id,
            status: inspectCheckout(orderRows).conversion,
            payload: json(orderRows),
          },
          update: { status: inspectCheckout(orderRows).conversion, payload: json(orderRows) },
        });
      }
      if (!paid) {
        const state = issues.size
          ? 'MANUAL_REVIEW'
          : conversion === 'REJECTED'
            ? 'REJECTED'
            : rows.every((r) => commissionPaymentState(r.commission_status) === 'REJECTED')
              ? 'REJECTED'
              : paymentBlockers(rows).length
                ? 'ESTIMATED'
                : 'VALIDATED';
        const c = await tx.commission.upsert({
          where: { checkoutId: checkout.id },
          create: {
            checkoutId: checkout.id,
            userId,
            affiliateLinkId,
            state,
            rawAmount: amount,
            scale: 1,
            estimatedVnd: amount,
          },
          update: {
            userId,
            affiliateLinkId,
            state,
            rawAmount: amount,
            scale: 1,
            estimatedVnd: amount,
          },
        });
        if (userId)
          await this.cashback(
            tx,
            c.id,
            amount,
            state === 'VALIDATED' ? 'VALIDATED' : state === 'REJECTED' ? 'REJECTED' : 'PENDING',
          );
      } else if (
        previous.state === 'PAID' &&
        conversion === 'REJECTED' &&
        [...issues].every((issue) => issue === 'PAID_COMMISSION_CHANGED')
      ) {
        if (previous.userId && previous.cashback)
          await this.wallet.post(tx, {
            userId: previous.userId,
            key: 'reversal:' + previous.id,
            type: 'CASHBACK_REVERSAL',
            available: -previous.cashback.userAmount,
            reserved: 0n,
            reference: previous.id,
            reason: 'AddLiveTag full cancellation',
          });
        await tx.commission.update({ where: { id: previous.id }, data: { state: 'REVERSED' } });
        await tx.cashbackAllocation.updateMany({
          where: { commissionId: previous.id },
          data: { state: 'REVERSED' },
        });
        await audit(tx, null, 'COMMISSION_REVERSED', previous.id);
      }
      for (const type of issues) {
        const open = await tx.reconciliationIssue.findFirst({
          where: { provider, checkoutId: externalId, type, sourceHash, status: 'OPEN' },
        });
        if (!open)
          await tx.reconciliationIssue.create({
            data: {
              batchId: batch.id,
              provider,
              accountId: batch.accountId,
              checkoutId: externalId,
              type,
              sourceHash,
              payload: json({ checkoutId: checkout.id, revision: checkout.revision }),
            },
          });
      }
    }
  }
  private async cashback(
    tx: Tx,
    commissionId: string,
    amount: bigint,
    state: 'PENDING' | 'VALIDATED' | 'REJECTED',
  ) {
    await tx.affiliatePolicy.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const existing = await tx.cashbackAllocation.findUnique({ where: { commissionId } });
    const split = splitCashback(amount, BigInt(existing?.userBps ?? 8500));
    await tx.cashbackAllocation.upsert({
      where: { commissionId },
      create: {
        commissionId,
        policyId: 1,
        userAmount: split.user,
        platformAmount: split.platform,
        state,
      },
      update: { userAmount: split.user, platformAmount: split.platform, state },
    });
  }
  review(issueId: string, input: z.infer<typeof reviewInput>, actor: string) {
    return this.repo.transaction(async (tx) => {
      const issue = await tx.reconciliationIssue.findUnique({ where: { id: issueId } });
      if (!issue?.checkoutId || !issue.provider.startsWith('ADDLIVETAG:'))
        throw new NotFoundException('ADDLIVETAG_ISSUE_NOT_FOUND');
      const checkout = await tx.providerCheckout.findUniqueOrThrow({
        where: { provider_checkoutId: { provider: issue.provider, checkoutId: issue.checkoutId } },
        include: { commission: true },
      });
      if (checkout.revision !== input.revision || checkout.sourceHash !== issue.sourceHash)
        throw new ConflictException('SOURCE_CHANGED_RESYNC_REQUIRED');
      if (issue.status === 'RESOLVED') throw new ConflictException('ISSUE_ALREADY_RESOLVED');
      const c = checkout.commission;
      if (!c || ['PAID', 'REVERSED'].includes(c.state))
        throw new ConflictException('USE_AUDITED_WALLET_ADJUSTMENT');
      if (input.action === 'EXCLUDE') {
        await tx.commission.update({ where: { id: c.id }, data: { state: 'REJECTED' } });
        await tx.cashbackAllocation.updateMany({
          where: { commissionId: c.id },
          data: { state: 'REJECTED' },
        });
      } else {
        const credential = await tx.providerCredential.findUniqueOrThrow({
          where: { id: 'ADDLIVETAG' },
        });
        if (
          !credential.verifiedAt ||
          credential.status !== 'ACTIVE' ||
          credential.accountId !== checkout.accountId
        )
          throw new ConflictException('VERIFY_ACCOUNT_AND_VND_FIRST');
        if (!['VALIDATED', 'PARTIALLY_VALIDATED'].includes(checkout.rawStatus))
          throw new ConflictException('PROVIDER_STATUS_NOT_ELIGIBLE');
        const rows = checkout.payload as unknown as ConversionItem[];
        if (
          rows.some(
            (r) =>
              r.affiliate !== credential.expectedAffiliate ||
              !['completed', 'cancelled'].includes(r.status_code),
          )
        )
          throw new ConflictException('PROVIDER_IDENTITY_OR_STATUS_MISMATCH');
        if (
          await tx.commission.findFirst({
            where: {
              checkout: { checkoutId: checkout.checkoutId, provider: { not: checkout.provider } },
              state: { not: 'REJECTED' },
            },
          })
        )
          throw new ConflictException('DUPLICATE_COMMISSION_MUST_BE_EXCLUDED_FIRST');
        if (!input.affiliateLinkId || input.acceptedAmountVnd === undefined)
          throw new ConflictException('ATTRIBUTION_AND_AMOUNT_REQUIRED');
        const link = await tx.affiliateLink.findUniqueOrThrow({
          where: { id: input.affiliateLinkId },
        });
        if (link.deleteAt || (c.userId && c.userId !== link.userId))
          throw new ConflictException('ATTRIBUTION_CONFLICT');
        // A manual attribution review must not turn pending provider money into payable money.
        const blockers = paymentBlockers(rows);
        const state = blockers.length ? 'ESTIMATED' : 'VALIDATED';
        if (
          rows.some(
            (r) =>
              r.status_code === 'completed' &&
              commissionPaymentState(r.commission_status) === 'REJECTED',
          )
        )
          throw new ConflictException('PROVIDER_COMMISSION_REJECTED');
        if (blockers.some((blocker) => blocker !== 'PROVIDER_COMMISSION_PENDING'))
          throw new ConflictException('PROVIDER_COMMISSION_NOT_VERIFIED');
        const amount = BigInt(input.acceptedAmountVnd);
        if (amount > checkout.netRaw)
          throw new ConflictException('ACCEPTED_AMOUNT_EXCEEDS_REPORTED');
        await tx.commission.update({
          where: { id: c.id },
          data: {
            state,
            userId: link.userId,
            affiliateLinkId: link.id,
            estimatedVnd: amount,
          },
        });
        await this.cashback(tx, c.id, amount, state === 'VALIDATED' ? 'VALIDATED' : 'PENDING');
      }
      await tx.reconciliationIssue.updateMany({
        where: { provider: checkout.provider, checkoutId: checkout.checkoutId, status: 'OPEN' },
        data: {
          status: 'RESOLVED',
          resolution: input.evidence,
          resolvedBy: actor,
          resolvedAt: new Date(),
        },
      });
      await tx.providerCheckout.update({
        where: { id: checkout.id },
        data: {
          revision: { increment: 1 },
          conversionState: input.action === 'APPROVE' ? 'VALIDATED' : 'REJECTED',
        },
      });
      await audit(tx, actor, 'ADDLIVETAG_CHECKOUT_REVIEWED', checkout.id, input);
      return { id: checkout.id, status: input.action };
    });
  }
}
