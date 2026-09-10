import { readFileSync } from 'node:fs';
import {
  decodeAddLiveTag,
  splitDateRange,
  syncRangeInput,
  providerScope,
} from './addlivetag.contract.js';
import { AddLiveTagEngine } from './addlivetag-engine.js';
import { AddLiveTagClient } from './addlivetag.client.js';
import type { ConfigService } from '@nestjs/config';
import type { ConversionItem } from './addlivetag.contract.js';
import { SettlementService } from '../finance/settlement.service.js';
import { CredentialService } from './credential.service.js';
import type { FinanceRepository, Tx } from '../finance/finance.repository.js';
import type { WalletService } from '../finance/wallet.service.js';

describe('AddLiveTag Contract & Demo Fixture', () => {
  it('parses the real 5-row demo fixture with lossless numbers and no precision loss', () => {
    const rawJson = readFileSync('test/fixtures/addlivetag-demo.json', 'utf8');
    const envelope = decodeAddLiveTag(rawJson);

    expect(envelope.ok).toBe(true);
    expect(envelope.meta.type).toBe('items');
    expect(envelope.meta.page).toBe(1);
    expect(envelope.meta.total).toBe(5);
    expect(envelope.summary.estimated_total_commission).toBe('4913');
    expect(envelope.data).toHaveLength(5);

    // 2 completed, 3 cancelled
    const completed = envelope.data.filter((r) => r.status_code === 'completed');
    const cancelled = envelope.data.filter((r) => r.status_code === 'cancelled');
    expect(completed).toHaveLength(2);
    expect(cancelled).toHaveLength(3);

    // Sum of commissions matches summary
    const sum = envelope.data.reduce((s, r) => s + BigInt(r.commission), 0n);
    expect(sum).toBe(4913n);

    // All rows have "----" utm and "" sub_id1 in demo
    expect(envelope.data.every((r) => r.utm === '----')).toBe(true);
    expect(envelope.data.every((r) => r.sub_id1 === '')).toBe(true);

    // Completed orders still retain "Chờ trả hoa hồng" label
    expect(completed.every((r) => r.commission_status === 'Chờ trả hoa hồng')).toBe(true);
  });

  it('preserves 64-bit integer values without floating point corruption', () => {
    const json = JSON.stringify({
      ok: true,
      meta: { type: 'items', page: '1', page_size: '50', total: '1' },
      summary: { estimated_total_commission: '9007199254740993' },
      data: [
        {
          purchase_time: '1787285585',
          click_time: '1787285000',
          checkout_id: 'chk-1',
          order_sn: 'sn-1',
          status: 'Hoàn thành',
          status_code: 'completed',
          commission_status: 'Chờ trả',
          affiliate: 'AFF_1',
          item_name: 'Item',
          image: 'https://img',
          item_url: 'https://shopee.vn/p?item_id=123',
          price: '9007199254740993',
          qty: '1',
          order_value: '9007199254740993',
          commission: '9007199254740993',
          mcn_fee: '0',
          utm: '----',
          sub_id1: '',
        },
      ],
    });
    const parsed = decodeAddLiveTag(json);
    expect(parsed.data[0]?.commission).toBe('9007199254740993');
  });

  it('rejects unexpected non-numeric amounts or decimals in contract', () => {
    const invalidJson = JSON.stringify({
      ok: true,
      meta: { type: 'items', page: 1, page_size: 50, total: 1 },
      summary: { estimated_total_commission: '12.50' }, // Decimal is forbidden in integer amount
      data: [],
    });
    expect(() => decodeAddLiveTag(invalidJson)).toThrow();
  });

  it('rejects ok: false envelopes', () => {
    const falseEnvelope = JSON.stringify({
      ok: false,
      meta: { type: 'items', page: 1, page_size: 50, total: 0 },
      summary: { estimated_total_commission: '0' },
      data: [],
    });
    expect(() => decodeAddLiveTag(falseEnvelope)).toThrow();
  });
});

describe('Date Range Splitting', () => {
  it('returns single chunk for ranges <= 90 days', () => {
    const chunks = splitDateRange('2026-01-01', '2026-01-30', 90);
    expect(chunks).toEqual([{ startDate: '2026-01-01', endDate: '2026-01-30' }]);
  });

  it('splits ranges > 90 days into contiguous, non-overlapping batches of at most 90 days', () => {
    const chunks = splitDateRange('2026-01-01', '2026-05-01', 90); // 121 days
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.startDate).toBe('2026-01-01');
    expect(chunks[0]?.endDate).toBe('2026-03-31'); // 90 days
    expect(chunks[1]?.startDate).toBe('2026-04-01');
    expect(chunks[1]?.endDate).toBe('2026-05-01'); // 31 days
  });

  it('validates start and end dates via syncRangeInput schema', () => {
    expect(
      syncRangeInput.safeParse({ startDate: '2026-05-01', endDate: '2026-01-01' }).success,
    ).toBe(false);
    expect(
      syncRangeInput.safeParse({ startDate: '2026-01-01', endDate: '2026-06-01' }).success,
    ).toBe(true);
  });
});

describe('AddLiveTagClient', () => {
  let client: AddLiveTagClient;
  beforeEach(() => {
    client = new AddLiveTagClient();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not retry 401/403 auth errors and throws PROVIDER_AUTH_EXPIRED', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Forbidden', { status: 403 }));
    await expect(
      client.report('secret-api-key', '420', '2026-09-01', '2026-09-07', 1),
    ).rejects.toThrow('PROVIDER_AUTH_EXPIRED');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry 400 bad request errors', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Bad Request', { status: 400 }));
    await expect(
      client.report('secret-api-key', '420', '2026-09-01', '2026-09-07', 1),
    ).rejects.toThrow('PROVIDER_BAD_REQUEST');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries transient 429 and 500 errors with backoff', async () => {
    const okPayload = JSON.stringify({
      ok: true,
      meta: { type: 'items', page: '1', page_size: '50', total: '0' },
      summary: { estimated_total_commission: '0' },
      data: [],
    });
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Rate limit', { status: 429 }))
      .mockResolvedValueOnce(new Response('Server error', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(okPayload, { status: 200, headers: { 'content-type': 'application/json' } }),
      );

    const res = await client.report('secret-key', '420', '2026-09-01', '2026-09-07', 1);
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('scrubs secret API key from errors', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network error connecting to https://addlivetag.com'));
    try {
      await client.report('SUPER_SECRET_KEY_123', '420', '2026-09-01', '2026-09-07', 1);
      fail('Expected client to throw');
    } catch (e) {
      expect((e as Error).message).not.toContain('SUPER_SECRET_KEY_123');
      expect((e as Error).message).toBe('PROVIDER_UNAVAILABLE');
    }
  });

  it('enforces page number matching requested page', async () => {
    const wrongPagePayload = JSON.stringify({
      ok: true,
      meta: { type: 'items', page: '2', page_size: '50', total: '5' },
      summary: { estimated_total_commission: '0' },
      data: [],
    });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(wrongPagePayload, { status: 200 }));
    await expect(client.report('key', '420', '2026-09-01', '2026-09-07', 1)).rejects.toThrow(
      'PROVIDER_WRONG_PAGE',
    );
  });
});

describe('AddLiveTagEngine & Reconciliation Business Logic', () => {
  let engine: AddLiveTagEngine;
  let mockRepo: jest.Mocked<FinanceRepository>;
  let mockWallet: jest.Mocked<WalletService>;
  let mockTx: Record<string, any>;

  const accountId = '420';
  const expectedAffiliate = 'AFF_DEMO_ACCOUNT';
  const provider = providerScope(accountId);
  const userId = '11111111222233334444555566667777';
  const linkId = '22222222333344445555666677778888';
  const trackingId = 'bb_' + '3'.repeat(20);
  const productId = '44444444555566667777888899990000';
  const validUtm = [userId, linkId, 'web', trackingId, productId].join('-');

  function makeRow(overrides: Partial<ConversionItem> = {}): ConversionItem {
    return {
      purchase_time: 1787285585,
      click_time: 1787285000,
      checkout_id: 'chk-test-1',
      order_sn: 'sn-test-1',
      status: 'Hoàn thành',
      status_code: 'completed',
      commission_status: 'Chờ trả hoa hồng',
      affiliate: expectedAffiliate,
      item_name: 'Test Item',
      image: 'https://img',
      item_url: 'https://shopee.vn/product/123/456?item_id=456',
      price: '100000',
      qty: 1,
      order_value: '100000',
      commission: '2500',
      mcn_fee: '0',
      utm: validUtm,
      sub_id1: userId,
      ...overrides,
    };
  }

  beforeEach(() => {
    mockTx = {
      providerCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ADDLIVETAG',
          version: 1,
          accountId,
          expectedAffiliate,
          status: 'ACTIVE',
          verifiedAt: new Date('2026-09-01'),
          verificationEvidence: 'Đối chiếu chứng từ thực tế',
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ADDLIVETAG',
          version: 1,
          accountId,
          expectedAffiliate,
          status: 'ACTIVE',
          verifiedAt: new Date('2026-09-01'),
          verificationEvidence: 'Đối chiếu chứng từ thực tế',
        }),
      },
      affiliateLink: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'link-uuid-1',
          userId: '11111111-2222-3333-4444-555566667777',
          productId: '44444444-5555-6666-7777-888899990000',
          subId1: userId,
          subId2: linkId,
          subId3: 'web',
          subId4: trackingId,
          subId5: productId,
          deleteAt: null,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'link-uuid-1',
          userId: '11111111-2222-3333-4444-555566667777',
          productId: '44444444-5555-6666-7777-888899990000',
          subId1: userId,
          subId2: linkId,
          subId3: 'web',
          subId4: trackingId,
          subId5: productId,
          deleteAt: null,
        }),
      },
      providerCheckout: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'checkout-uuid-1', revision: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'checkout-uuid-1', revision: 2 }),
      },
      providerOrder: {
        upsert: jest.fn().mockResolvedValue({ id: 'order-uuid-1' }),
      },
      commission: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'comm-uuid-1' }),
        update: jest.fn().mockResolvedValue({ id: 'comm-uuid-1' }),
      },
      affiliatePolicy: {
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
      },
      cashbackAllocation: {
        upsert: jest.fn().mockResolvedValue({ id: 'cashback-uuid-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reconciliationIssue: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'issue-uuid-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-uuid-1' }),
      },
      walletTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'tx-uuid-1' }),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue({ available: 100000n, reserved: 0n }),
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'wallet-uuid-1', available: 100000n, reserved: 0n }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'wallet-uuid-1', available: 100000n, reserved: 0n }),
      },
    };

    mockRepo = {
      transaction: jest
        .fn()
        .mockImplementation((fn: (tx: Tx) => Promise<unknown>) => fn(mockTx as unknown as Tx)),
    } as unknown as jest.Mocked<FinanceRepository>;

    mockWallet = {
      post: jest.fn().mockResolvedValue({ id: 'wallet-tx-1' }),
    };

    engine = new AddLiveTagEngine(mockRepo, mockWallet);
  });

  it('validates a correct conversion without crediting wallet (commission VALIDATED, wallet untouched)', async () => {
    const row = makeRow();
    const groups = new Map([['chk-test-1', [row]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

    // Commission created with VALIDATED and integer VND amount 2500
    expect(mockTx.commission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          state: 'VALIDATED',
          rawAmount: 2500n,
          scale: 1,
          estimatedVnd: 2500n,
          userId: '11111111-2222-3333-4444-555566667777',
        }),
      }),
    );

    // Cashback allocated with 85% = floor(2500 * 8500 / 10000) = 2125
    expect(mockTx.cashbackAllocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userAmount: 2125n,
          platformAmount: 375n,
          state: 'VALIDATED',
        }),
      }),
    );

    // Wallet is NOT credited on ingest! (Only credited upon settlement confirm)
    expect(mockWallet.post).not.toHaveBeenCalled();
    expect(mockTx.reconciliationIssue.create).not.toHaveBeenCalled();
  });

  it('flags demo rows with utm="----" as INVALID_ATTRIBUTION and MANUAL_REVIEW without crediting wallet', async () => {
    const row = makeRow({ utm: '----', sub_id1: '' });
    const groups = new Map([['chk-demo-1', [row]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

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
          checkoutId: 'chk-demo-1',
        }),
      }),
    );
    expect(mockWallet.post).not.toHaveBeenCalled();
  });

  it('marks cancelled rows as REJECTED even when commission_status is "Chờ trả hoa hồng"', async () => {
    const row = makeRow({
      status_code: 'cancelled',
      commission_status: 'Chờ trả hoa hồng',
      commission: '0',
    });
    const groups = new Map([['chk-cancel-1', [row]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

    expect(mockTx.commission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          state: 'REJECTED',
        }),
      }),
    );
  });

  it('flags checkout with mixed completed and cancelled rows as PARTIALLY_VALIDATED', async () => {
    const row1 = makeRow({ status_code: 'completed', commission: '2500' });
    const row2 = makeRow({
      status_code: 'cancelled',
      commission: '0',
      item_url: 'https://shopee.vn/p?item_id=789',
    });
    const groups = new Map([['chk-mixed-1', [row1, row2]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PARTIAL_CHECKOUT_REVIEW',
        }),
      }),
    );
  });

  it('flags unknown status code as UNKNOWN_PROVIDER_STATUS', async () => {
    const row = makeRow({ status_code: 'pending_buyer_review' });
    const groups = new Map([['chk-unknown-1', [row]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'UNKNOWN_PROVIDER_STATUS',
        }),
      }),
    );
  });

  it('flags non-zero MCN fee as MCN_FEE_REVIEW', async () => {
    const row = makeRow({ mcn_fee: '500' });
    const groups = new Map([['chk-mcn-1', [row]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'MCN_FEE_REVIEW',
        }),
      }),
    );
  });

  it('flags ambiguous item identity when order_sn contains duplicate item_id without variation', async () => {
    const row1 = makeRow({ item_url: 'https://shopee.vn/p?item_id=456' });
    const row2 = makeRow({ item_url: 'https://shopee.vn/p?item_id=456' });
    const groups = new Map([['chk-dup-1', [row1, row2]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'AMBIGUOUS_ITEM_IDENTITY',
        }),
      }),
    );
  });

  it('flags unverified account/unit with ACCOUNT_UNIT_UNVERIFIED when credential.verifiedAt is null', async () => {
    mockTx.providerCredential.findUniqueOrThrow.mockResolvedValue({
      id: 'ADDLIVETAG',
      version: 1,
      accountId,
      expectedAffiliate,
      status: 'ACTIVE',
      verifiedAt: null, // Not verified
    });
    const row = makeRow();
    const groups = new Map([['chk-unver-1', [row]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ACCOUNT_UNIT_UNVERIFIED',
        }),
      }),
    );
  });

  it('performs idempotent reversal when previously PAID commission is reported fully cancelled', async () => {
    mockTx.providerCheckout.findUnique.mockResolvedValue({
      id: 'checkout-uuid-paid',
      sourceHash: 'old-hash',
      commission: {
        id: 'comm-uuid-paid',
        state: 'PAID',
        userId: '11111111-2222-3333-4444-555566667777',
        cashback: { userAmount: 2125n },
      },
    });

    const row = makeRow({ status_code: 'cancelled', commission: '0' });
    const groups = new Map([['chk-test-1', [row]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

    expect(mockWallet.post).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        userId: '11111111-2222-3333-4444-555566667777',
        type: 'CASHBACK_REVERSAL',
        available: -2125n,
        key: 'reversal:comm-uuid-paid',
      }),
    );
    expect(mockTx.commission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comm-uuid-paid' },
        data: { state: 'REVERSED' },
      }),
    );
  });

  it('flags PAID_COMMISSION_CHANGED issue without auto-reversing when amount changes after credit', async () => {
    mockTx.providerCheckout.findUnique.mockResolvedValue({
      id: 'checkout-uuid-paid',
      sourceHash: 'old-hash',
      commission: {
        id: 'comm-uuid-paid',
        state: 'PAID',
        userId: '11111111-2222-3333-4444-555566667777',
        cashback: { userAmount: 2125n },
      },
    });

    const row = makeRow({ commission: '1800' }); // Amount changed from 2500 to 1800
    const groups = new Map([['chk-test-1', [row]]]);

    await engine.publish(
      mockTx as unknown as Tx,
      { id: 'batch-1', accountId, expectedAffiliate, credentialVersion: 1 },
      groups,
    );

    expect(mockWallet.post).not.toHaveBeenCalled(); // Must NOT auto-reverse
    expect(mockTx.reconciliationIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PAID_COMMISSION_CHANGED',
        }),
      }),
    );
  });

  it('supports structured review APPROVE with evidence, updating commission to VALIDATED with accepted amount', async () => {
    mockTx.reconciliationIssue.findUnique.mockResolvedValue({
      id: 'issue-1',
      provider,
      checkoutId: 'chk-test-1',
      sourceHash: 'hash-1',
    });
    mockTx.providerCheckout.findUniqueOrThrow.mockResolvedValue({
      id: 'checkout-uuid-1',
      provider,
      accountId,
      checkoutId: 'chk-test-1',
      revision: 1,
      sourceHash: 'hash-1',
      rawStatus: 'VALIDATED',
      netRaw: 2500n,
      payload: [makeRow()],
      commission: { id: 'comm-1', state: 'MANUAL_REVIEW', userId: null },
    });

    const res = await engine.review(
      'issue-1',
      {
        action: 'APPROVE',
        affiliateLinkId: '11111111-2222-3333-4444-555566667777',
        acceptedAmountVnd: '2500',
        revision: 1,
        evidence: 'Đã xác minh đối soát có bằng chứng Shopee',
      },
      'super-admin-id',
    );

    expect(res).toEqual({ id: 'checkout-uuid-1', status: 'APPROVE' });
    expect(mockTx.commission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comm-1' },
        data: expect.objectContaining({
          state: 'VALIDATED',
          estimatedVnd: 2500n,
        }),
      }),
    );
    expect(mockTx.reconciliationIssue.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ checkoutId: 'chk-test-1', status: 'OPEN' }),
        data: expect.objectContaining({
          status: 'RESOLVED',
          resolution: 'Đã xác minh đối soát có bằng chứng Shopee',
        }),
      }),
    );
  });

  it('rejects APPROVE if accepted amount exceeds reported raw commission', async () => {
    mockTx.reconciliationIssue.findUnique.mockResolvedValue({
      id: 'issue-1',
      provider,
      checkoutId: 'chk-test-1',
      sourceHash: 'hash-1',
    });
    mockTx.providerCheckout.findUniqueOrThrow.mockResolvedValue({
      id: 'checkout-uuid-1',
      provider,
      accountId,
      checkoutId: 'chk-test-1',
      revision: 1,
      sourceHash: 'hash-1',
      rawStatus: 'VALIDATED',
      netRaw: 2500n,
      payload: [makeRow()],
      commission: { id: 'comm-1', state: 'MANUAL_REVIEW', userId: null },
    });

    await expect(
      engine.review(
        'issue-1',
        {
          action: 'APPROVE',
          affiliateLinkId: '11111111-2222-3333-4444-555566667777',
          acceptedAmountVnd: '5000', // Exceeds 2500n
          revision: 1,
          evidence: 'Invalid evidence',
        },
        'admin',
      ),
    ).rejects.toThrow('ACCEPTED_AMOUNT_EXCEEDS_REPORTED');
  });

  it('rejects APPROVE if revision changed (stale review)', async () => {
    mockTx.reconciliationIssue.findUnique.mockResolvedValue({
      id: 'issue-1',
      provider,
      checkoutId: 'chk-test-1',
      sourceHash: 'hash-1',
    });
    mockTx.providerCheckout.findUniqueOrThrow.mockResolvedValue({
      id: 'checkout-uuid-1',
      provider,
      accountId,
      checkoutId: 'chk-test-1',
      revision: 2, // Checkout has revision 2
      sourceHash: 'hash-1',
    });

    await expect(
      engine.review(
        'issue-1',
        {
          action: 'APPROVE',
          affiliateLinkId: '11111111-2222-3333-4444-555566667777',
          acceptedAmountVnd: '2500',
          revision: 1, // Stale revision 1
          evidence: 'Evidence',
        },
        'admin',
      ),
    ).rejects.toThrow('SOURCE_CHANGED_RESYNC_REQUIRED');
  });

  it('rejects APPROVE if legacy Saffi commission duplicate exists without being excluded first', async () => {
    mockTx.reconciliationIssue.findUnique.mockResolvedValue({
      id: 'issue-1',
      provider,
      checkoutId: 'chk-test-1',
      sourceHash: 'hash-1',
    });
    mockTx.providerCheckout.findUniqueOrThrow.mockResolvedValue({
      id: 'checkout-uuid-1',
      provider,
      accountId,
      checkoutId: 'chk-test-1',
      revision: 1,
      sourceHash: 'hash-1',
      rawStatus: 'VALIDATED',
      netRaw: 2500n,
      payload: [makeRow()],
      commission: { id: 'comm-1', state: 'MANUAL_REVIEW', userId: null },
    });
    // Legacy duplicate found
    mockTx.commission.findFirst.mockResolvedValue({ id: 'legacy-comm-1', state: 'VALIDATED' });

    await expect(
      engine.review(
        'issue-1',
        {
          action: 'APPROVE',
          affiliateLinkId: '11111111-2222-3333-4444-555566667777',
          acceptedAmountVnd: '2500',
          revision: 1,
          evidence: 'Evidence',
        },
        'admin',
      ),
    ).rejects.toThrow('LEGACY_COMMISSION_MUST_BE_EXCLUDED_FIRST');
  });

  it('supports EXCLUDE action, setting commission to REJECTED', async () => {
    mockTx.reconciliationIssue.findUnique.mockResolvedValue({
      id: 'issue-1',
      provider,
      checkoutId: 'chk-test-1',
      sourceHash: 'hash-1',
    });
    mockTx.providerCheckout.findUniqueOrThrow.mockResolvedValue({
      id: 'checkout-uuid-1',
      provider,
      accountId,
      checkoutId: 'chk-test-1',
      revision: 1,
      sourceHash: 'hash-1',
      commission: { id: 'comm-1', state: 'MANUAL_REVIEW' },
    });

    const res = await engine.review(
      'issue-1',
      {
        action: 'EXCLUDE',
        revision: 1,
        evidence: 'Loại bỏ đơn lỗi không xử lý',
      },
      'admin',
    );

    expect(res).toEqual({ id: 'checkout-uuid-1', status: 'EXCLUDE' });
    expect(mockTx.commission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comm-1' },
        data: { state: 'REJECTED' },
      }),
    );
  });
});

describe('SettlementService & AddLiveTag Integration', () => {
  let settlements: SettlementService;
  let mockRepo: jest.Mocked<FinanceRepository>;
  let mockWallet: jest.Mocked<WalletService>;
  let mockConfig: jest.Mocked<ConfigService>;
  let mockTx: Record<string, any>;

  const accountId = '420';
  const provider = `ADDLIVETAG:${accountId}`;
  const commissionId = '11111111-2222-3333-4444-555566667777';
  const userId = 'user-uuid-1';

  beforeEach(() => {
    mockTx = {
      providerCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ADDLIVETAG',
          accountId,
          status: 'ACTIVE',
          verifiedAt: new Date('2026-09-01'),
        }),
      },
      commission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: commissionId,
            state: 'VALIDATED',
            userId,
            rawAmount: 2500n,
            estimatedVnd: 2500n,
            checkout: { provider, accountId, checkoutId: 'chk-1', revision: 1 },
            settlementItem: null,
            cashback: { userBps: 8500 },
          },
        ]),
        findFirst: jest.fn().mockResolvedValue(null), // No legacy duplicates
        update: jest.fn().mockResolvedValue({ id: commissionId }),
      },
      reconciliationIssue: {
        count: jest.fn().mockResolvedValue(0), // No open issues
      },
      settlementBatch: {
        create: jest.fn().mockResolvedValue({ id: 'settlement-uuid-1', status: 'DRAFT' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'settlement-uuid-1',
          status: 'DRAFT',
          grossVnd: 2500n,
          deductionVnd: 0n,
          netVnd: 2500n,
          items: [
            {
              id: 'item-1',
              commissionId,
              netVnd: 2500n,
              rawSnapshot: 2500n,
              revisionSnapshot: 1,
              commission: {
                id: commissionId,
                state: 'VALIDATED',
                userId,
                rawAmount: 2500n,
                estimatedVnd: 2500n,
                cashback: { userBps: 8500 },
                checkout: { provider, accountId, checkoutId: 'chk-1', revision: 1 },
              },
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'settlement-uuid-1', status: 'CONFIRMED' }),
      },
      cashbackAllocation: {
        update: jest.fn().mockResolvedValue({ id: 'cashback-uuid-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-uuid-1' }),
      },
    };

    mockRepo = {
      transaction: jest
        .fn()
        .mockImplementation((fn: (tx: Tx) => Promise<unknown>) => fn(mockTx as unknown as Tx)),
    } as unknown as jest.Mocked<FinanceRepository>;

    mockWallet = {
      post: jest.fn().mockResolvedValue({ id: 'wallet-tx-1' }),
    };

    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SETTLEMENT_ENABLED') return true;
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    settlements = new SettlementService(mockRepo, mockWallet, mockConfig);
  });

  it('creates settlement draft matching exact estimatedVnd without 100000 division and snapshots revision', async () => {
    await settlements.create(
      {
        reference: 'SETTLE-2026-09-01',
        commissionIds: [commissionId],
        grossVnd: '2500',
        deductionVnd: '0',
        netVnd: '2500',
      },
      'admin-id',
    );

    expect(mockTx.settlementBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grossVnd: 2500n,
          netVnd: 2500n,
          items: {
            create: [
              expect.objectContaining({
                commissionId,
                rawSnapshot: 2500n,
                revisionSnapshot: 1,
                netVnd: 2500n,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('blocks settlement create if gross differs from validated estimatedVnd', async () => {
    await expect(
      settlements.create(
        {
          reference: 'SETTLE-2026-09-01',
          commissionIds: [commissionId],
          grossVnd: '3000', // Mismatch from 2500
          deductionVnd: '0',
          netVnd: '3000',
        },
        'admin-id',
      ),
    ).rejects.toThrow('GROSS_DIFFERS_FROM_VALIDATED_COMMISSION');
  });

  it('blocks settlement create if AddLiveTag account/VND unit is not verified', async () => {
    mockTx.providerCredential.findUnique.mockResolvedValue({
      id: 'ADDLIVETAG',
      accountId,
      status: 'ACTIVE',
      verifiedAt: null, // Unverified
    });

    await expect(
      settlements.create(
        {
          reference: 'SETTLE-2026-09-01',
          commissionIds: [commissionId],
          grossVnd: '2500',
          deductionVnd: '0',
          netVnd: '2500',
        },
        'admin-id',
      ),
    ).rejects.toThrow('VERIFY_ACCOUNT_AND_VND_FIRST');
  });

  it('blocks settlement create if checkout has open reconciliation issues', async () => {
    mockTx.reconciliationIssue.count.mockResolvedValue(1); // 1 open issue

    await expect(
      settlements.create(
        {
          reference: 'SETTLE-2026-09-01',
          commissionIds: [commissionId],
          grossVnd: '2500',
          deductionVnd: '0',
          netVnd: '2500',
        },
        'admin-id',
      ),
    ).rejects.toThrow('OPEN_RECONCILIATION_ISSUES');
  });

  it('blocks settlement create if duplicate unexcluded legacy Saffi commission exists', async () => {
    mockTx.commission.findFirst.mockResolvedValue({ id: 'legacy-comm-1' });

    await expect(
      settlements.create(
        {
          reference: 'SETTLE-2026-09-01',
          commissionIds: [commissionId],
          grossVnd: '2500',
          deductionVnd: '0',
          netVnd: '2500',
        },
        'admin-id',
      ),
    ).rejects.toThrow('CROSS_PROVIDER_DUPLICATE');
  });

  it('confirms settlement draft, credits wallet with 85% cashback, and is idempotent', async () => {
    const res = await settlements.confirm('settlement-uuid-1', 'admin-id');
    expect(res).toEqual({ id: 'settlement-uuid-1', status: 'CONFIRMED' });

    expect(mockWallet.post).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        userId,
        type: 'CASHBACK_CREDIT',
        available: 2125n, // 85% of 2500n
        key: `settlement:${commissionId}`,
      }),
    );

    // Second call on already CONFIRMED settlement is idempotent and does not credit wallet again
    mockTx.settlementBatch.findUnique.mockResolvedValue({
      id: 'settlement-uuid-1',
      status: 'CONFIRMED',
    });
    mockWallet.post.mockClear();

    const secondRes = await settlements.confirm('settlement-uuid-1', 'admin-id');
    expect(secondRes).toEqual({ id: 'settlement-uuid-1', status: 'CONFIRMED' });
    expect(mockWallet.post).not.toHaveBeenCalled();
  });

  it('blocks settlement confirm if checkout revision changed after draft was created', async () => {
    mockTx.settlementBatch.findUnique.mockResolvedValue({
      id: 'settlement-uuid-1',
      status: 'DRAFT',
      grossVnd: 2500n,
      deductionVnd: 0n,
      netVnd: 2500n,
      items: [
        {
          id: 'item-1',
          commissionId,
          netVnd: 2500n,
          rawSnapshot: 2500n,
          revisionSnapshot: 1, // Snapshot was revision 1
          commission: {
            id: commissionId,
            state: 'VALIDATED',
            userId,
            rawAmount: 2500n,
            estimatedVnd: 2500n,
            cashback: { userBps: 8500 },
            checkout: { provider, accountId, checkoutId: 'chk-1', revision: 2 }, // Checkout changed to revision 2!
          },
        },
      ],
    });

    await expect(settlements.confirm('settlement-uuid-1', 'admin-id')).rejects.toThrow(
      'COMMISSION_REVISION_CHANGED',
    );
  });

  describe('Purge Saffi Data (Option A)', () => {
    it('purges all Saffi records, resets test wallets, and records audit log', async () => {
      const credTx: any = {
        reconciliationIssue: { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) },
        providerCheckout: {
          findMany: jest.fn().mockResolvedValue([{ id: 'chk-saffi-1' }]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        commission: {
          findMany: jest.fn().mockResolvedValue([{ id: 'comm-saffi-1' }]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        settlementItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        settlementBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        walletTransaction: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        wallet: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
        cashbackAllocation: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        providerOrder: {
          findMany: jest.fn().mockResolvedValue([{ id: 'order-saffi-1' }]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        providerOrderItem: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        reconciliationPage: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        reconciliationBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        providerCredential: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      };
      const testRepo = {
        transaction: jest
          .fn()
          .mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(credTx)),
      } as unknown as FinanceRepository;
      const credService = new CredentialService(testRepo, {} as any);

      const result = await credService.purgeSaffiData('super-admin-uuid');
      expect(result.ok).toBe(true);
      expect(result.summary).toEqual({
        issues: 5,
        settlementItems: 1,
        emptySettlementBatches: 1,
        walletTransactions: 2,
        walletsReset: 3,
        cashbacks: 1,
        commissions: 1,
        orderItems: 2,
        orders: 1,
        checkouts: 1,
        batches: 1,
        credentials: 1,
      });
      expect(credTx.reconciliationIssue.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ provider: 'SAFFI' }, { provider: { startsWith: 'SAFFI:' } }] },
      });
      expect(credTx.wallet.updateMany).toHaveBeenCalledWith({
        data: { available: 0n, reserved: 0n },
      });
      expect(credTx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'SAFFI_DATA_PURGED',
          actorId: 'super-admin-uuid',
        }),
      });
    });
  });
});
