import { paymentBlockers } from '../reconciliation/commission-status.js';
import type { Tx } from './finance.repository.js';

type Checkout = { provider: string; accountId: string; checkoutId: string; payload?: unknown };

/** Shared by the read model and transactional settlement validation. */
export async function providerSettlementBlockers(db: Tx, checkout: Checkout): Promise<string[]> {
  if (!checkout.provider.startsWith('ADDLIVETAG:')) return ['ADDLIVETAG_CHECKOUT_REQUIRED'];
  const blockers: string[] = [];
  if (paymentBlockers(checkout.payload).length) blockers.push('PROVIDER_COMMISSION_NOT_PAID');
  const credential = await db.providerCredential.findUnique({ where: { id: 'ADDLIVETAG' } });
  if (!credential?.verifiedAt || credential.status !== 'ACTIVE' || credential.accountId !== checkout.accountId) {
    blockers.push('VERIFY_ACCOUNT_AND_VND_FIRST');
  }
  if (await db.reconciliationIssue.count({ where: { provider: checkout.provider, checkoutId: checkout.checkoutId, status: 'OPEN' } })) {
    blockers.push('OPEN_RECONCILIATION_ISSUES');
  }
  if (await db.commission.findFirst({ where: { checkout: { checkoutId: checkout.checkoutId, provider: { not: checkout.provider } }, state: { not: 'REJECTED' } } })) {
    blockers.push('CROSS_PROVIDER_DUPLICATE');
  }
  return blockers;
}

export function commissionSettlementBlockers(row: { state: string; userId: string | null; settlementItem?: unknown }): string[] {
  return [
    ...(row.state !== 'VALIDATED' ? ['COMMISSION_NOT_VALIDATED'] : []),
    ...(!row.userId ? ['NO_ATTRIBUTED_USER'] : []),
    ...(row.settlementItem ? ['ALREADY_IN_SETTLEMENT'] : []),
  ];
}
