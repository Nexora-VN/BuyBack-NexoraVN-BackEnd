import { ConfigService } from '@nestjs/config';
import { ReconciliationEngine } from './reconciliation-engine.js';
import type { SaffiCheckout } from './saffi.contract.js';
import type { FinanceRepository, Tx } from '../finance/finance.repository.js';
import type { WalletService } from '../finance/wallet.service.js';

describe('ReconciliationEngine', () => {
  let engine: ReconciliationEngine;
  let mockRepo: jest.Mocked<FinanceRepository>;
  let mockWallet: jest.Mocked<WalletService>;
  let mockConfig: jest.Mocked<ConfigService>;
  let mockTx: Record<string, any>;

  const defaultAffiliateId = '17303170528';
  const userId = '11111111222233334444555566667777';
  const linkId = '22222222333344445555666677778888';
  const trackingId = 'bb_' + '3'.repeat(20);
  const productId = '44444444555566667777888899990000';
  const validUtm = [userId, linkId, 'web', trackingId, productId].join('-');

  function makeCheckout(overrides: Partial<SaffiCheckout> = {}): SaffiCheckout {
    const defaultItem = {
      item_id: '48152898284',
      shop_id: '325226376',
      model_id: '1',
      promotion_id: '',
      item_name: 'Test item',
      display_item_status: 'Completed',
      affiliate_item_status: 2,
      is_fraud: 0,
      fraud_status: 2,
      item_price: '5900000000',
      actual_amount: '3451500000',
      refunded_amount: '0',
      item_commission: '86287500',
      capped_brand_commission: '69030000',
      brand_commission_rate: 2000,
      platform_commission_rate: 2500,
    };
    const defaultOrder = {
      order_id: 'order-1',
      order_sn: 'sn-1',
      affiliate_transaction_id: 'tx-1',
      order_status: 'PAID',
      display_order_status: 2,
      items: [defaultItem],
    };
    return {
      checkout_id: 'checkout-1',
      affiliate_id: defaultAffiliateId,
      utm_content: validUtm,
      purchase_time: 1787285585,
      checkout_status: 'Waiting for payment',
      conversion_status: 2,
      affiliate_net_commission: '155317500',
      estimated_total_commission: '155317500',
      gross_commission: '155317500',
      capped_commission: '155317500',
      total_brand_commission: '69030000',
      orders: [defaultOrder],
      ...overrides,
    };
  }

  beforeEach(() => {
    mockTx = {
      affiliateLink: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'link-uuid',
          userId: '11111111-2222-3333-4444-555566667777',
          productId: '44444444-5555-6666-7777-888899990000',
          subId1: userId,
          subId2: linkId,
          subId3: 'web',
          subId4: trackingId,
          subId5: productId,
          affiliateIdSnapshot: defaultAffiliateId,
        }),
      },
      providerCheckout: {
        upsert: jest.fn().mockResolvedValue({ id: 'checkout-uuid' }),
      },
      providerOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'order-uuid' }),
      },
      providerOrderItem: {
        upsert: jest.fn().mockResolvedValue({ id: 'item-uuid' }),
      },
      commission: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'commission-uuid' }),
        update: jest.fn().mockResolvedValue({ id: 'commission-uuid' }),
      },
      affiliatePolicy: {
        upsert: jest.fn().mockResolvedValue({ id: 1, userBps: 8500 }),
      },
      cashbackAllocation: {
        upsert: jest.fn().mockResolvedValue({ id: 'cashback-uuid' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reconciliationIssue: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'issue-uuid' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-uuid' }),
      },
    };

    mockRepo = {
      transaction: jest.fn().mockImplementation((fn: (tx: Tx) => Promise<unknown>) => fn(mockTx as unknown as Tx)),
    } as unknown as jest.Mocked<FinanceRepository>;

    mockWallet = {
      post: jest.fn().mockResolvedValue({ id: 'wallet-tx-uuid' } as any),
    } as unknown as jest.Mocked<WalletService>;

    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SHOPEE_AFFILIATE_ID') return defaultAffiliateId;
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    engine = new ReconciliationEngine(mockRepo, mockWallet, mockConfig);
  });

  it('validates a correct conversion without crediting wallet', async () => {
    const input = makeCheckout();
    const result = await engine.ingest('batch-1', input);

    expect(result.issues).toBe(0);
    expect(mockTx.commission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          state: 'VALIDATED',
          userId: '11111111-2222-3333-4444-555566667777',
        }),
      }),
    );
    expect(mockTx.cashbackAllocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          state: 'VALIDATED',
          userAmount: 1320n, // floor(1553 * 8500 / 10000)
        }),
      }),
    );
    expect(mockWallet.post).not.toHaveBeenCalled();
  });

  it('flags missing attribution like "----" as MANUAL_REVIEW', async () => {
    const input = makeCheckout({ utm_content: '----' });
    const result = await engine.ingest('batch-1', input);

    expect(result.issues).toBeGreaterThan(0);
    expect(mockTx.commission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          state: 'MANUAL_REVIEW',
          userId: null,
        }),
      }),
    );
    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'INVALID_ATTRIBUTION',
        }),
      }),
    );
  });

  it('flags invalid UUID/hex formatting in attribution as MANUAL_REVIEW', async () => {
    const invalidUtm = ['not-32-hex', linkId, 'web', trackingId, productId].join('-');
    const input = makeCheckout({ utm_content: invalidUtm });
    const result = await engine.ingest('batch-1', input);

    expect(result.issues).toBeGreaterThan(0);
    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'INVALID_ATTRIBUTION',
        }),
      }),
    );
  });

  it('flags unknown affiliate link as AFFILIATE_LINK_NOT_FOUND', async () => {
    mockTx.affiliateLink.findUnique.mockResolvedValue(null);
    const input = makeCheckout();
    const result = await engine.ingest('batch-1', input);

    expect(result.issues).toBeGreaterThan(0);
    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'AFFILIATE_LINK_NOT_FOUND',
        }),
      }),
    );
  });

  it('flags attribution mismatch when user does not match the link record', async () => {
    mockTx.affiliateLink.findUnique.mockResolvedValue({
      id: 'link-uuid',
      userId: '99999999-9999-9999-9999-999999999999',
      productId: '44444444-5555-6666-7777-888899990000',
      subId1: '99999999999999999999999999999999',
      subId2: linkId,
      subId3: 'web',
      subId4: trackingId,
      subId5: productId,
      affiliateIdSnapshot: defaultAffiliateId,
    });
    const input = makeCheckout();
    const result = await engine.ingest('batch-1', input);

    expect(result.issues).toBeGreaterThan(0);
    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ATTRIBUTION_MISMATCH',
        }),
      }),
    );
  });

  it('flags affiliate ID mismatch when checkout affiliate ID differs from platform config', async () => {
    const input = makeCheckout({ affiliate_id: '99999999999' });
    const result = await engine.ingest('batch-1', input);

    expect(result.issues).toBeGreaterThan(0);
    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'AFFILIATE_ID_MISMATCH',
        }),
      }),
    );
  });

  it('reverses a previously PAID commission when provider reports REJECTED/Cancelled', async () => {
    mockTx.commission.findUnique.mockResolvedValue({
      id: 'commission-uuid',
      state: 'PAID',
      userId: '11111111-2222-3333-4444-555566667777',
      rawAmount: 155317500n,
      cashback: { userAmount: 1320n },
    });

    const rejectedItem = {
      ...makeCheckout().orders[0]!.items[0]!,
      display_item_status: 'Cancelled',
      affiliate_item_status: 3,
      actual_amount: '0',
      refunded_amount: '3451500000',
      item_commission: '0',
      capped_brand_commission: '0',
    };
    const input = makeCheckout({
      checkout_status: 'Invalid',
      conversion_status: 3,
      affiliate_net_commission: '0',
      estimated_total_commission: '0',
      gross_commission: '0',
      capped_commission: '0',
      total_brand_commission: '0',
      orders: [
        {
          ...makeCheckout().orders[0]!,
          order_status: 'CANCEL',
          display_order_status: 3,
          items: [rejectedItem],
        },
      ],
    });

    await engine.ingest('batch-1', input);

    expect(mockWallet.post).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        userId: '11111111-2222-3333-4444-555566667777',
        type: 'CASHBACK_REVERSAL',
        available: -1320n,
        reserved: 0n,
        key: 'reversal:commission-uuid',
      }),
    );
    expect(mockTx.commission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'commission-uuid' },
        data: { state: 'REVERSED' },
      }),
    );
    expect(mockTx.cashbackAllocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { commissionId: 'commission-uuid' },
        data: { state: 'REVERSED' },
      }),
    );
  });
});
