import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { bootstrap } from '../src/main.js';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service.js';
import { ReconciliationEngine } from '../src/modules/reconciliation/reconciliation-engine.js';
import { ReconciliationService } from '../src/modules/reconciliation/reconciliation.service.js';
import { SaffiClient } from '../src/modules/reconciliation/saffi.client.js';
import { checkoutSchema, decodeProvider } from '../src/modules/reconciliation/saffi.contract.js';
import { ConfigService } from '@nestjs/config';

describe('Affiliate finance end-to-end', () => {
  let app: NestFastifyApplication, db: PrismaService, engine: ReconciliationEngine;
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
  function report(status: 1 | 2 | 3, overrides: Record<string, unknown> = {}) {
    const zero = status === 3;
    return checkoutSchema.parse(
      decodeProvider(
        JSON.stringify({
          checkout_id: prefix,
          affiliate_id: '17303170528',
          utm_content: [
            userId.replaceAll('-', ''),
            linkId.replaceAll('-', ''),
            'web',
            'bb_' + 'a'.repeat(32),
            productId.replaceAll('-', ''),
          ].join('-'),
          purchase_time: '1787285585',
          checkout_status:
            status === 2 ? 'Waiting for payment' : status === 3 ? 'Invalid' : 'Pending',
          conversion_status: String(status),
          affiliate_net_commission: zero ? '0' : '10000000000',
          estimated_total_commission: zero ? '0' : '10000000000',
          gross_commission: zero ? '0' : '10000000000',
          capped_commission: zero ? '0' : '10000000000',
          total_brand_commission: '0',
          orders: [
            {
              order_id: prefix,
              order_sn: prefix,
              affiliate_transaction_id: prefix,
              order_status: status === 2 ? 'COMPLETED' : status === 3 ? 'CANCEL' : 'PAID',
              display_order_status: String(status),
              items: [
                {
                  item_id: '26771994719',
                  shop_id: '46182105',
                  model_id: '1',
                  promotion_id: '',
                  item_name: 'Test product',
                  display_item_status:
                    status === 2 ? 'Completed' : status === 3 ? 'Cancelled' : 'Pending',
                  affiliate_item_status: String(status),
                  is_fraud: '0',
                  fraud_status: '2',
                  item_price: '100000000000',
                  actual_amount: zero ? '0' : '100000000000',
                  refunded_amount: zero ? '100000000000' : '0',
                  item_commission: zero ? '0' : '10000000000',
                  capped_brand_commission: '0',
                  brand_commission_rate: '0',
                  platform_commission_rate: '10000',
                },
              ],
            },
          ],
          ...overrides,
        }),
      ),
    );
  }
  beforeAll(async () => {
    process.env.SHOPEE_AFFILIATE_ID = '17303170528';
    process.env.FINANCE_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.SETTLEMENT_ENABLED = 'true';
    process.env.WITHDRAWALS_ENABLED = 'true';
    process.env.RECONCILIATION_ENABLED = 'false';
    app = await bootstrap();
    app.get(ConfigService).set('SETTLEMENT_ENABLED', true);
    app.get(ConfigService).set('WITHDRAWALS_ENABLED', true);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(PrismaService);
    engine = app.get(ReconciliationEngine);
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
          status: 'COMPLETED',
        },
      })
    ).id;
    mockIds.push(batchId);
  }, 30000);
  afterAll(async () => {
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
      await db.providerCredential.deleteMany({ where: { rotatedBy: { in: ids } } });
      await db.auditLog.deleteMany({
        where: { OR: [{ actorId: { in: ids } }, { reference: commissionId ?? 'none' }] },
      });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  }, 30000);
  it('generates an actual an_redir link and persists tracking', async () => {
    const generated = await api(userToken)
      .post('generate-affiliate', {
        url: 'https://shopee.vn/product/46182105/26771994719?utm=test',
      })
      .expect(201);
    const url = new URL((generated.body as { link: string }).link);
    expect(url.searchParams.get('affiliate_id')).toBe('17303170528');
    expect(url.searchParams.get('sub_id')?.split('-')).toHaveLength(5);
  });
  it('rejects USER financial administration and ADMIN settlement/credential writes', async () => {
    await api(userToken).get('admin/commissions').expect(403);
    await api(adminToken)
      .put('admin/provider-credential', { cookie: 'never-logged-test-cookie' })
      .expect(403);
    await api(adminToken).post('admin/settlements', {}).expect(403);
    await api(userToken)
      .get('me/orders/' + randomUUID())
      .expect(404);
  });
  it('encrypts cookie and does not return it from metadata', async () => {
    const response = await api(superToken)
      .put('admin/provider-credential', { cookie: 'never-logged-test-cookie' })
      .expect(200);
    expect(JSON.stringify(response.body)).not.toContain('cookie');
    const stored = await db.providerCredential.findUniqueOrThrow({ where: { id: 'SAFFI' } });
    expect(stored.ciphertext).not.toContain('never-logged-test-cookie');
  });
  it('ingests a Saffi batch through the worker and is idempotent without wallet credit', async () => {
    const parsed = report(2);
    const spy = jest.spyOn(app.get(SaffiClient), 'report').mockResolvedValue({
      report: {
        page_num: 1,
        page_size: 100,
        total_count: 1,
        list: [decodeProvider(JSON.stringify(parsed))],
      },
      raw: { code: 0, data: { list: [parsed] } },
    });
    const worker = app.get(ReconciliationService);
    const queued = await worker.enqueue('2026-08-21', '2026-08-21', 'TEST', adminId);
    mockIds.push(queued.id);
    await worker.work();
    spy.mockRestore();
    expect(
      (await db.reconciliationBatch.findUniqueOrThrow({ where: { id: queued.id } })).status,
    ).toBe('COMPLETED');
    await engine.ingest(batchId, parsed);
    await engine.ingest(batchId, parsed);
    const c = await db.commission.findFirstOrThrow({ where: { checkout: { checkoutId: prefix } } });
    commissionId = c.id;
    expect(c.state).toBe('VALIDATED');
    expect(await db.commission.count({ where: { checkout: { checkoutId: prefix } } })).toBe(1);
    expect((await api(userToken).get('me/wallet').expect(200)).body).toMatchObject({
      available: '0',
    });
  });
  it('blocks unattributed and affiliate-mismatched conversions from settlement', async () => {
    await engine.ingest(
      batchId,
      report(2, {
        checkout_id: prefix + 'unattributed',
        utm_content: '----',
        orders: [
          {
            ...report(2).orders[0],
            order_id: prefix + 'u',
            order_sn: prefix + 'u',
            affiliate_transaction_id: prefix + 'u',
          },
        ],
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
    await engine.ingest(batchId, report(3));
    await engine.ingest(batchId, report(3));
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
