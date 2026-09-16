import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { bootstrap } from '../src/main.js';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service.js';
import { AddLiveTagEngine } from '../src/modules/reconciliation/addlivetag-engine.js';
import { ReconciliationService } from '../src/modules/reconciliation/reconciliation.service.js';
import type { ConversionItem } from '../src/modules/reconciliation/addlivetag.contract.js';
import { AddLiveTagClient } from '../src/modules/reconciliation/addlivetag.client.js';
import { ConfigService } from '@nestjs/config';

describe('Affiliate finance end-to-end', () => {
  let app: NestFastifyApplication, db: PrismaService, engine: AddLiveTagEngine;
  let userId: string,
    otherId: string,
    adminId: string,
    productId: string,
    linkId: string,
    bankId: string,
    batchId: string;
  let userToken: string, adminToken: string, superToken: string;
  let withdrawalId: string, settlementId: string, commissionId: string;
  const prefix = 'finance-test-' + randomUUID();
  const mockIds: string[] = [];
  const ids: string[] = [];
  function api(token: string) {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    return {
      get: (path: string) =>
        request(server)
          .get('/api/v1/' + path)
          .auth(token, { type: 'bearer' }),
      post: (path: string, body: object = {}) =>
        request(server)
          .post('/api/v1/' + path)
          .auth(token, { type: 'bearer' })
          .send(body),
      patch: (path: string, body: object) =>
        request(server)
          .patch('/api/v1/' + path)
          .auth(token, { type: 'bearer' })
          .send(body),
      put: (path: string, body: object) =>
        request(server)
          .put('/api/v1/' + path)
          .auth(token, { type: 'bearer' })
          .send(body),
    };
  }
  function report(status: 2 | 3, overrides: Partial<ConversionItem> = {}): ConversionItem {
    const cancelled = status === 3;
    return {
      checkout_id: prefix,
      order_sn: prefix,
      affiliate: 'affiliate-test',
      utm: [
        userId.replaceAll('-', ''),
        linkId.replaceAll('-', ''),
        'web',
        'bb_' + 'a'.repeat(32),
        productId.replaceAll('-', ''),
      ].join('-'),
      sub_id1: userId.replaceAll('-', ''),
      purchase_time: 1787285585,
      click_time: 1787285500,
      status: cancelled ? 'Cancelled' : 'Completed',
      status_code: cancelled ? 'cancelled' : 'completed',
      commission_status: 'TEST_VERIFIED_PAID',
      item_name: 'Test product',
      image: '',
      item_url: 'https://shopee.vn/product?item_id=26771994719',
      price: '1000000',
      qty: 1,
      order_value: cancelled ? '0' : '1000000',
      commission: cancelled ? '0' : '100000',
      mcn_fee: '0',
      ...overrides,
    };
  }
  async function publish(row: ConversionItem) {
    const credential = await db.providerCredential.findUniqueOrThrow({
      where: { id: 'ADDLIVETAG' },
    });
    await db.$transaction((tx) =>
      engine.publish(
        tx,
        {
          id: batchId,
          accountId: '420',
          expectedAffiliate: 'affiliate-test',
          credentialVersion: credential.version,
        },
        new Map([[row.checkout_id, [row]]]),
      ),
    );
  }
  const originalPaidLabels = process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES;
  beforeAll(async () => {
    // Synthetic payout label for settlement tests; not a claimed AddLiveTag status.
    process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES = 'TEST_VERIFIED_PAID';
    process.env.SHOPEE_AFFILIATE_ID = '17303170528';
    process.env.FINANCE_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.SETTLEMENT_ENABLED = 'true';
    process.env.WITHDRAWALS_ENABLED = 'true';
    process.env.RECONCILIATION_ENABLED = 'false';
    process.env.ADDLIVETAG_API_KEY =
      process.env.ADDLIVETAG_API_KEY || 'test-addlivetag-api-key-placeholder';
    app = await bootstrap();
    app.get(ConfigService).set('SETTLEMENT_ENABLED', true);
    app.get(ConfigService).set('WITHDRAWALS_ENABLED', true);
    app.get(ConfigService).set('ADDLIVETAG_API_KEY', process.env.ADDLIVETAG_API_KEY);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(PrismaService);
    engine = app.get(AddLiveTagEngine);
    const hash = await argon2.hash('finance-test-password');
    const roles = ['USER', 'USER', 'ADMIN', 'SUPER_ADMIN'] as const;
    for (const [index, role] of roles.entries()) {
      const id = randomUUID();
      ids.push(id);
      await db.user.create({
        data: {
          id,
          email: prefix + index + '@example.test',
          phoneNumber: 't' + id.replaceAll('-', '').slice(0, 18),
          passwordHash: hash,
          role,
        },
      });
    }
    [userId, otherId, adminId] = ids as [string, string, string, string];
    const login = async (index: number) => {
      const r = await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/auth/login')
        .send({ email: prefix + index + '@example.test', password: 'finance-test-password' })
        .expect(200);
      return (r.body as { accessToken: string }).accessToken;
    };
    [userToken, adminToken, superToken] = await Promise.all([login(0), login(2), login(3)]);
    productId = randomUUID();
    linkId = randomUUID();
    await db.product.create({
      data: {
        id: productId,
        itemId: 26771994719n,
        shopId: 46182105n,
        productName: 'Finance test',
        shopName: 'Test shop',
        originLink: 'https://shopee.vn/product/46182105/26771994719',
        price: 1000000n,
        sales: 1,
        imageUrl: 'https://cf.shopee.vn/file/test',
        productLink: 'https://shopee.vn/product/46182105/26771994719',
        rating: '5',
        hasSellerCommission: false,
        hasShopeeCommission: true,
        commission: 100000n,
        sellerComFinal: 0n,
        shoppeComFinal: 100000n,
        sellerRate: 0,
        shopeeRate: 1000,
        sellerRatePercent: 0,
        shopeeRatePercent: 1000,
        totalRatePercent: 1000,
        isExtra: false,
        isCapped: false,
        isLimitCap: false,
        cap: 0n,
        capRow: 0n,
        capAfterRate: 0n,
        lastUpdate: new Date(),
      },
    });
    await db.affiliateLink.create({
      data: {
        id: linkId,
        userId,
        productId,
        originLink: 'test',
        cleanLink: 'test',
        subId1: userId.replaceAll('-', ''),
        subId2: linkId.replaceAll('-', ''),
        subId3: 'web',
        subId4: 'bb_' + 'a'.repeat(32),
        subId5: productId.replaceAll('-', ''),
        affiliateIdSnapshot: '17303170528',
      },
    });
    batchId = (
      await db.reconciliationBatch.create({
        data: {
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          source: 'TEST',
          provider: 'ADDLIVETAG',
          accountId: '420',
          status: 'COMPLETED',
        },
      })
    ).id;
    mockIds.push(batchId);
  }, 30000);
  afterAll(async () => {
    if (originalPaidLabels === undefined) delete process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES;
    else process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES = originalPaidLabels;
    jest.restoreAllMocks();
    if (db) {
      const checkouts = await db.providerCheckout.findMany({
        where: { checkoutId: { startsWith: prefix } },
        select: { id: true },
      });
      const checkoutIds = checkouts.map((c) => c.id);
      await db.walletTransaction.deleteMany({ where: { wallet: { userId: { in: ids } } } });
      await db.wallet.deleteMany({ where: { userId: { in: ids } } });
      await db.withdrawalStatusHistory.deleteMany({
        where: { withdrawal: { userId: { in: ids } } },
      });
      await db.withdrawal.deleteMany({ where: { userId: { in: ids } } });
      await db.settlementItem.deleteMany({
        where: { commission: { checkoutId: { in: checkoutIds } } },
      });
      await db.settlementBatch.deleteMany({ where: { createdBy: { in: ids } } });
      await db.cashbackAllocation.deleteMany({
        where: { commission: { checkoutId: { in: checkoutIds } } },
      });
      await db.commission.deleteMany({ where: { checkoutId: { in: checkoutIds } } });
      await db.providerOrderItem.deleteMany({
        where: { order: { checkoutId: { in: checkoutIds } } },
      });
      await db.providerOrder.deleteMany({ where: { checkoutId: { in: checkoutIds } } });
      await db.providerCheckout.deleteMany({ where: { id: { in: checkoutIds } } });
      await db.reconciliationIssue.deleteMany({ where: { batchId: { in: mockIds } } });
      await db.reconciliationPage.deleteMany({ where: { batchId: { in: mockIds } } });
      await db.reconciliationBatch.deleteMany({ where: { id: { in: mockIds } } });
      await db.affiliateLink.deleteMany({ where: { userId: { in: ids } } });
      if (productId) await db.product.deleteMany({ where: { id: productId } });
      await db.userBank.deleteMany({ where: { userId: { in: ids } } });
      await db.authSession.deleteMany({ where: { userId: { in: ids } } });
      await db.providerCredential.deleteMany({
        where: { OR: [{ rotatedBy: { in: ids } }, { id: 'ADDLIVETAG' }] },
      });
      await db.auditLog.deleteMany({
        where: { OR: [{ actorId: { in: ids } }, { reference: commissionId ?? 'none' }] },
      });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  }, 30000);
  it('rejects USER financial administration and ADMIN settlement/credential writes', async () => {
    await api(userToken).get('admin/commissions').expect(403);
    await api(adminToken)
      .put('admin/provider-credential', { accountId: '420', expectedAffiliate: 'affiliate-test' })
      .expect(403);
    await api(adminToken).post('admin/settlements', {}).expect(403);
    await api(userToken)
      .get('me/orders/' + randomUUID())
      .expect(404);
  });
  it('rotates provider credential and does not return secret', async () => {
    const response = await api(superToken)
      .put('admin/provider-credential', { accountId: '420', expectedAffiliate: 'affiliate-test' })
      .expect(200);
    expect(JSON.stringify(response.body)).not.toContain('apiKey');
    const stored = await db.providerCredential.findUniqueOrThrow({ where: { id: 'ADDLIVETAG' } });
    expect(stored.accountId).toBe('420');
    expect(stored.expectedAffiliate).toBe('affiliate-test');
  });
  it('ingests a batch through the worker and is idempotent without wallet credit', async () => {
    const parsed = report(2);
    const spy = jest.spyOn(app.get(AddLiveTagClient), 'report').mockResolvedValue({
      ok: true,
      meta: { type: 'items', page: 1, page_size: 50, total: 0 },
      summary: { estimated_total_commission: '0' },
      data: [],
    });
    const worker = app.get(ReconciliationService);
    const queued = await worker.enqueue('2026-08-21', '2026-08-21', 'TEST', adminId);
    mockIds.push(queued.id);
    await worker.work();
    spy.mockRestore();
    expect(
      (await db.reconciliationBatch.findUniqueOrThrow({ where: { id: queued.id } })).status,
    ).toBe('COMPLETED');
    const credential = await db.providerCredential.findUniqueOrThrow({
      where: { id: 'ADDLIVETAG' },
    });
    await api(superToken)
      .post('admin/provider-credential/verify', {
        version: credential.version,
        evidence: 'Test account and integer VND verified',
      })
      .expect(201);
    await publish(parsed);
    await publish(parsed);
    const c = await db.commission.findFirstOrThrow({ where: { checkout: { checkoutId: prefix } } });
    commissionId = c.id;
    expect(c.state).toBe('VALIDATED');
    expect(await db.commission.count({ where: { checkout: { checkoutId: prefix } } })).toBe(1);
    expect((await api(userToken).get('me/wallet').expect(200)).body).toMatchObject({
      available: '0',
    });
  });
  it('blocks unattributed conversions from settlement', async () => {
    await publish(
      report(2, {
        checkout_id: prefix + 'unattributed',
        order_sn: prefix + 'u',
        utm: '----',
      }),
    );
    const c = await db.commission.findFirstOrThrow({
      where: { checkout: { checkoutId: prefix + 'unattributed' } },
    });
    expect(c.state).toBe('MANUAL_REVIEW');
    expect(c.userId).toBeNull();
    await api(superToken)
      .post('admin/settlements', {
        reference: prefix + 'invalid',
        commissionIds: [c.id],
        grossVnd: '100000',
        deductionVnd: '0',
        netVnd: '100000',
      })
      .expect(409);
  });
  it('confirms settlement exactly once under concurrent requests and balances 85/15', async () => {
    const created = await api(superToken)
      .post('admin/settlements', {
        reference: prefix,
        commissionIds: [commissionId],
        grossVnd: '100000',
        deductionVnd: '1000',
        netVnd: '99000',
      })
      .expect(201);
    settlementId = (created.body as { id: string }).id;
    await Promise.all([
      api(superToken)
        .post('admin/settlements/' + settlementId + '/confirm')
        .expect(201),
      api(superToken)
        .post('admin/settlements/' + settlementId + '/confirm')
        .expect(201),
    ]);
    const cashback = await db.cashbackAllocation.findUniqueOrThrow({ where: { commissionId } });
    expect(cashback.userAmount).toBe(84150n);
    expect(cashback.platformAmount).toBe(14850n);
    expect(
      await db.walletTransaction.count({
        where: { reference: commissionId, type: 'CASHBACK_CREDIT' },
      }),
    ).toBe(1);
    expect((await api(userToken).get('me/wallet')).body).toMatchObject({ available: '84150' });
  });
  it('versions approved banks and requires review before withdrawal', async () => {
    const body = {
      bankCode: 'VCB',
      bankName: 'Vietcombank',
      accountHolder: 'Finance Test',
      accountNumber: '012345678901',
    };
    const bank = await api(userToken).post('me/bank-accounts', body).expect(201);
    bankId = (bank.body as { id: string }).id;
    expect(JSON.stringify(bank.body)).not.toContain(body.accountNumber);
    await api(userToken)
      .post('me/withdrawals', { bankId, amount: '50000', idempotencyKey: randomUUID() })
      .expect(409);
    await api(adminToken)
      .post('admin/bank-accounts/' + bankId + '/approve', { reason: 'Verified account details' })
      .expect(201);
    const newBank = await api(userToken)
      .patch('me/bank-accounts/' + bankId, body)
      .expect(200);
    expect(newBank.body).toMatchObject({ status: 'PENDING' });
    expect((newBank.body as { id: string }).id).not.toBe(bankId);
    bankId = (newBank.body as { id: string }).id;
    await api(adminToken)
      .post('admin/bank-accounts/' + bankId + '/approve', { reason: 'Verified new version' })
      .expect(201);
  });
  it('reserves atomically and prevents two concurrent requests overdrawing the same wallet', async () => {
    const replies = await Promise.all(
      [1, 2].map(() =>
        api(userToken).post('me/withdrawals', {
          bankId,
          amount: '50000',
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
    withdrawalId = (replies.find((r) => r.status === 201)!.body as { id: string }).id;
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available).toBe(34150n);
    expect(wallet.reserved).toBe(50000n);
    const other = await db.user.findUniqueOrThrow({ where: { id: otherId } });
    const login = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/v1/auth/login')
      .send({ email: other.email, password: 'finance-test-password' })
      .expect(200);
    const result = await api((login.body as { accessToken: string }).accessToken).get('me/orders');
    expect(result.body).toMatchObject({ meta: { total: 0 } });
  });
  it('releases a rejected reservation exactly once', async () => {
    const rejection = { status: 'REJECTED', reason: 'Test reservation release' };
    await api(adminToken)
      .patch('admin/withdrawals/' + withdrawalId + '/status', rejection)
      .expect(200);
    await api(adminToken)
      .patch('admin/withdrawals/' + withdrawalId + '/status', rejection)
      .expect(200);
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available).toBe(84150n);
    expect(wallet.reserved).toBe(0n);
    const replacement = await api(userToken)
      .post('me/withdrawals', { bankId, amount: '50000', idempotencyKey: randomUUID() })
      .expect(201);
    withdrawalId = (replacement.body as { id: string }).id;
  });
  it('completes manual transfer and reverses a later rejection without duplicating debits', async () => {
    await api(adminToken)
      .patch('admin/withdrawals/' + withdrawalId + '/status', {
        status: 'PROCESSING',
        reason: 'Begin bank transfer',
      })
      .expect(200);
    const details = await api(adminToken)
      .post('admin/withdrawals/' + withdrawalId + '/payment-details')
      .expect(201);
    expect(details.body).toMatchObject({ accountNumber: '012345678901' });
    await api(adminToken)
      .patch('admin/withdrawals/' + withdrawalId + '/status', {
        status: 'COMPLETED',
        reason: 'Bank transfer confirmed',
        transferReference: prefix + 'bank',
      })
      .expect(200);
    await publish(report(3));
    await publish(report(3));
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId } });
    expect(wallet.available).toBe(-50000n);
    expect(wallet.reserved).toBe(0n);
    expect(
      await db.walletTransaction.count({
        where: { reference: commissionId, type: 'CASHBACK_REVERSAL' },
      }),
    ).toBe(1);
    await api(userToken)
      .post('me/withdrawals', { bankId, amount: '50000', idempotencyKey: randomUUID() })
      .expect(409);
    const ledger = await db.walletTransaction.aggregate({
      where: { walletId: wallet.id },
      _sum: { availableDelta: true, reservedDelta: true },
    });
    expect(ledger._sum.availableDelta).toBe(wallet.available);
    expect(ledger._sum.reservedDelta).toBe(wallet.reserved);
    expect((await api(adminToken).get('admin/provider-health')).body).toMatchObject({
      ledgerBalanced: true,
    });
  });
  it('enforces ingest-only rollout flags', async () => {
    app.get(ConfigService).set('WITHDRAWALS_ENABLED', false);
    await api(userToken)
      .post('me/withdrawals', { bankId, amount: '50000', idempotencyKey: randomUUID() })
      .expect(503);
  });
});
