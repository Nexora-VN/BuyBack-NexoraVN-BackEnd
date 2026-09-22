import { batchProviderSettlementBlockers, providerSettlementBlockers } from './settlement-eligibility.js';
import type { Tx } from './finance.repository.js';

describe('batch settlement read model', () => {
  it('matches per-row blockers with three queries independent of page size', async () => {
    const credential = { verifiedAt: new Date(), status: 'ACTIVE', accountId: 'account' };
    const db = {
      providerCredential: { findUnique: jest.fn().mockResolvedValue(credential) },
      reconciliationIssue: { findMany: jest.fn().mockResolvedValue([{ provider: 'ADDLIVETAG:a', checkoutId: '1' }]), count: jest.fn().mockResolvedValue(1) },
      commission: { findMany: jest.fn().mockResolvedValue([{ checkout: { provider: 'ADDLIVETAG:b', checkoutId: '1' } }]), findFirst: jest.fn().mockResolvedValue({ id: 'duplicate' }) },
    };
    const checkout = { provider: 'ADDLIVETAG:a', accountId: 'account', checkoutId: '1', payload: {} };
    const expected = await providerSettlementBlockers(db as unknown as Tx, checkout);
    jest.clearAllMocks();
    const batch = await batchProviderSettlementBlockers(db as unknown as Tx, Array(20).fill(checkout));
    expect(batch.get('ADDLIVETAG:a:1')).toEqual(expected);
    expect(db.providerCredential.findUnique).toHaveBeenCalledTimes(1);
    expect(db.reconciliationIssue.findMany).toHaveBeenCalledTimes(1);
    expect(db.commission.findMany).toHaveBeenCalledTimes(1);
    expect(db.commission.findFirst).not.toHaveBeenCalled();
  });
});
