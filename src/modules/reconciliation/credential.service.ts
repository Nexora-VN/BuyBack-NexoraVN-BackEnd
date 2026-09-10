import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FinanceRepository, audit } from '../finance/finance.repository.js';
import type { z } from 'zod';
import type { providerInput, verificationInput } from './addlivetag.contract.js';
const select = {
  id: true,
  version: true,
  status: true,
  accountId: true,
  expectedAffiliate: true,
  verifiedAt: true,
  verificationEvidence: true,
  lastValidatedAt: true,
  updatedAt: true,
} as const;
@Injectable()
export class CredentialService {
  constructor(
    private readonly repo: FinanceRepository,
    private readonly config: ConfigService,
  ) {}
  metadata() {
    return this.repo.db.providerCredential.findUnique({ where: { id: 'ADDLIVETAG' }, select });
  }
  rotate(input: z.infer<typeof providerInput>, actor: string) {
    return this.repo.transaction(async (tx) => {
      // Preserve legacy columns, but never persist an AddLiveTag secret.
      const data = {
        ciphertext: '',
        iv: '',
        tag: '',
        accountId: input.accountId,
        expectedAffiliate: input.expectedAffiliate,
        rotatedBy: actor,
      };
      const row = await tx.providerCredential.upsert({
        where: { id: 'ADDLIVETAG' },
        create: { id: 'ADDLIVETAG', ...data },
        update: {
          ...data,
          version: { increment: 1 },
          status: 'UNVERIFIED',
          lastValidatedAt: null,
          verifiedAt: null,
          verificationEvidence: null,
        },
        select,
      });
      await audit(tx, actor, 'PROVIDER_ACCOUNT_UPDATED', 'ADDLIVETAG', {
        version: row.version,
        accountId: row.accountId,
      });
      return row;
    });
  }
  verify(input: z.infer<typeof verificationInput>, actor: string) {
    return this.repo.transaction(async (tx) => {
      const row = await tx.providerCredential.findUnique({ where: { id: 'ADDLIVETAG' } });
      if (!row || row.version !== input.version || row.status !== 'ACTIVE')
        throw new ConflictException('SYNC_ACTIVE_CREDENTIAL_BEFORE_VERIFY');
      const result = await tx.providerCredential.update({
        where: { id: row.id },
        data: { verifiedAt: new Date(), verificationEvidence: input.evidence },
        select,
      });
      await audit(tx, actor, 'PROVIDER_ACCOUNT_VND_VERIFIED', row.id, {
        accountId: row.accountId,
        version: row.version,
        evidence: input.evidence,
      });
      return result;
    });
  }
  async read() {
    const apiKey = this.config.get<string>('ADDLIVETAG_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('ADDLIVETAG_API_KEY_NOT_CONFIGURED');
    const row = await this.repo.db.providerCredential.findUnique({ where: { id: 'ADDLIVETAG' } });
    if (!row || !row.accountId || !row.expectedAffiliate)
      throw new ServiceUnavailableException('PROVIDER_ACCOUNT_REQUIRED');
    // A sync can retry after the operator replaces an expired env key and restarts BE.
    return {
      version: row.version,
      apiKey,
      accountId: row.accountId,
      expectedAffiliate: row.expectedAffiliate,
      verifiedAt: row.verifiedAt,
    };
  }
  async mark(version: number, status: 'ACTIVE' | 'EXPIRED') {
    await this.repo.db.providerCredential.updateMany({
      where: { id: 'ADDLIVETAG', version },
      data: { status, ...(status === 'ACTIVE' ? { lastValidatedAt: new Date() } : {}) },
    });
  }
  purgeSaffiData(actor: string) {
    return this.repo.transaction(async (tx) => {
      const issues = await tx.reconciliationIssue.deleteMany({
        where: { OR: [{ provider: 'SAFFI' }, { provider: { startsWith: 'SAFFI:' } }] },
      });
      const saffiCheckouts = await tx.providerCheckout.findMany({
        where: { OR: [{ provider: 'SAFFI' }, { provider: { startsWith: 'SAFFI:' } }] },
        select: { id: true },
      });
      const saffiCheckoutIds = saffiCheckouts.map((c) => c.id);
      const saffiCommissions = await tx.commission.findMany({
        where: { checkoutId: { in: saffiCheckoutIds } },
        select: { id: true },
      });
      const saffiCommissionIds = saffiCommissions.map((c) => c.id);

      const settlementItems = await tx.settlementItem.deleteMany({
        where: { commissionId: { in: saffiCommissionIds } },
      });
      const emptyBatches = await tx.settlementBatch.deleteMany({
        where: { items: { none: {} } },
      });

      const walletTx = await tx.walletTransaction.deleteMany({
        where: {
          OR: [
            { reference: { in: saffiCommissionIds } },
            { type: { in: ['CASHBACK_CREDIT', 'CASHBACK_REVERSAL'] } },
          ],
        },
      });
      const wallets = await tx.wallet.updateMany({
        data: { available: 0n, reserved: 0n },
      });

      const cashbacks = await tx.cashbackAllocation.deleteMany({
        where: { commissionId: { in: saffiCommissionIds } },
      });
      const commissions = await tx.commission.deleteMany({
        where: { checkoutId: { in: saffiCheckoutIds } },
      });

      const saffiOrders = await tx.providerOrder.findMany({
        where: {
          OR: [
            { provider: 'SAFFI' },
            { provider: { startsWith: 'SAFFI:' } },
            { checkoutId: { in: saffiCheckoutIds } },
          ],
        },
        select: { id: true },
      });
      const saffiOrderIds = saffiOrders.map((o) => o.id);
      const orderItems = await tx.providerOrderItem.deleteMany({
        where: { orderId: { in: saffiOrderIds } },
      });
      const orders = await tx.providerOrder.deleteMany({
        where: { id: { in: saffiOrderIds } },
      });

      const checkouts = await tx.providerCheckout.deleteMany({
        where: { id: { in: saffiCheckoutIds } },
      });
      await tx.reconciliationPage.deleteMany({});
      const batches = await tx.reconciliationBatch.deleteMany({
        where: { OR: [{ provider: 'SAFFI' }, { provider: { startsWith: 'SAFFI:' } }] },
      });
      const credentials = await tx.providerCredential.deleteMany({
        where: { OR: [{ id: 'SAFFI' }, { id: { startsWith: 'SAFFI' } }] },
      });

      const summary = {
        issues: issues.count,
        settlementItems: settlementItems.count,
        emptySettlementBatches: emptyBatches.count,
        walletTransactions: walletTx.count,
        walletsReset: wallets.count,
        cashbacks: cashbacks.count,
        commissions: commissions.count,
        orderItems: orderItems.count,
        orders: orders.count,
        checkouts: checkouts.count,
        batches: batches.count,
        credentials: credentials.count,
      };

      await audit(tx, actor, 'SAFFI_DATA_PURGED', 'SAFFI', summary);
      return { ok: true, summary };
    });
  }
}
