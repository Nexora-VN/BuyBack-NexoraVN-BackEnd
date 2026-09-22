import { paymentBlockers } from '../reconciliation/commission-status.js';
import type { Tx } from './finance.repository.js';

type Checkout = { provider: string; accountId: string; checkoutId: string; payload?: unknown };

/** Shared by the read model and transactional settlement validation. */
export async function providerSettlementBlockers(db: Tx, checkout: Checkout): Promise<string[]> {
  if (!checkout.provider.startsWith('ADDLIVETAG:')) return ['ADDLIVETAG_CHECKOUT_REQUIRED'];
  const blockers: string[] = [];
  if (paymentBlockers(checkout.payload).length) blockers.push('PROVIDER_COMMISSION_NOT_PAID');
  const credential = await db.providerCredential.findUnique({ where: { id: 'ADDLIVETAG' } });
  if (
    !credential?.verifiedAt ||
    credential.status !== 'ACTIVE' ||
    credential.accountId !== checkout.accountId
  ) {
    blockers.push('VERIFY_ACCOUNT_AND_VND_FIRST');
  }
  if (
    await db.reconciliationIssue.count({
      where: { provider: checkout.provider, checkoutId: checkout.checkoutId, status: 'OPEN' },
    })
  ) {
    blockers.push('OPEN_RECONCILIATION_ISSUES');
  }
  if (
    await db.commission.findFirst({
      where: {
        checkout: { checkoutId: checkout.checkoutId, provider: { not: checkout.provider } },
        state: { not: 'REJECTED' },
      },
    })
  ) {
    blockers.push('CROSS_PROVIDER_DUPLICATE');
  }
  return blockers;
}

export function commissionSettlementBlockers(row: {
  state: string;
  userId: string | null;
  settlementItem?: unknown;
}): string[] {
  return [
    ...(row.state !== 'VALIDATED' ? ['COMMISSION_NOT_VALIDATED'] : []),
    ...(!row.userId ? ['NO_ATTRIBUTED_USER'] : []),
    ...(row.settlementItem ? ['ALREADY_IN_SETTLEMENT'] : []),
  ];
}

/** Batch only the read model. Settlement still validates inside its transaction. */
export async function batchProviderSettlementBlockers(db: Tx, checkouts: Checkout[]): Promise<Map<string, string[]>> {
  const supported = checkouts.filter((c) => c.provider.startsWith('ADDLIVETAG:'));
  const output = new Map<string, string[]>();
  const key = (c: Checkout) => `${c.provider}:${c.checkoutId}`;
  if (!supported.length) {
    for (const c of checkouts) output.set(key(c), ['ADDLIVETAG_CHECKOUT_REQUIRED']);
    return output;
  }
  const ids = [...new Set(supported.map((c) => c.checkoutId))];
  const [credential, issues, commissions] = await Promise.all([
    db.providerCredential.findUnique({ where: { id: 'ADDLIVETAG' } }),
    db.reconciliationIssue.findMany({ where: { checkoutId: { in: ids }, status: 'OPEN' }, select: { provider: true, checkoutId: true } }),
    db.commission.findMany({ where: { checkout: { checkoutId: { in: ids } }, state: { not: 'REJECTED' } }, select: { checkout: { select: { provider: true, checkoutId: true } } } }),
  ]);
  const open = new Set(issues.map((issue) => `${issue.provider}:${issue.checkoutId}`));
  const providers = new Map<string, Set<string>>();
  for (const { checkout } of commissions) {
    const set = providers.get(checkout.checkoutId) ?? new Set<string>();
    set.add(checkout.provider);
    providers.set(checkout.checkoutId, set);
  }
  for (const c of checkouts) {
    if (!c.provider.startsWith('ADDLIVETAG:')) { output.set(key(c), ['ADDLIVETAG_CHECKOUT_REQUIRED']); continue; }
    const blockers: string[] = [];
    if (paymentBlockers(c.payload).length) blockers.push('PROVIDER_COMMISSION_NOT_PAID');
    if (!credential?.verifiedAt || credential.status !== 'ACTIVE' || credential.accountId !== c.accountId) blockers.push('VERIFY_ACCOUNT_AND_VND_FIRST');
    if (open.has(key(c))) blockers.push('OPEN_RECONCILIATION_ISSUES');
    if ([...(providers.get(c.checkoutId) ?? [])].some((p) => p !== c.provider)) blockers.push('CROSS_PROVIDER_DUPLICATE');
    output.set(key(c), blockers);
  }
  return output;
}
