import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service.js';
import { PrismaProductRepository } from '../src/modules/product/repositories/prisma-product.repository.js';
import { PrismaAffiliateRepository } from '../src/modules/affiliate/repositories/prisma-affiliate.repository.js';
import { ProductService } from '../src/modules/product/services/product.service.js';
import { GenerateAffiliateService } from '../src/modules/affiliate/services/generate-affiiliate.service.js';
import type { UsersService } from '../src/modules/users/services/users.service.js';
import { getProductByUrl } from '../src/modules/product/utils/get-product-by-aff-id.js';
import { generateLinkByAddLiveTag } from '../src/modules/affiliate/utils/generate-link-by-alt.js';
import { productProviderReferenceSchema } from '../src/modules/product/contracts/product-provider.contract.js';
import { providerPayload } from './fixtures/product-provider.js';

jest.mock('../src/modules/product/utils/get-product-by-aff-id.js');
jest.mock('../src/modules/affiliate/utils/generate-link-by-alt.js');

// This suite temporarily drops an index inside a rolled-back transaction.
// Require an explicitly named disposable database, never the app's database.
const connectionString = process.env.DATABASE_URL!;
const enabled = new URL(connectionString).pathname === '/nexora_generate_test';
(enabled ? describe : describe.skip)('Generate affiliate isolated PostgreSQL', () => {
  const db = new PrismaService(new ConfigService({ DATABASE_URL: connectionString }));
  const service = new GenerateAffiliateService(
    new PrismaAffiliateRepository(db),
    { getUserStatusById: () => Promise.resolve({ status: 'ACTIVE' }) } as unknown as UsersService,
    new ProductService(new PrismaProductRepository(db)),
    new ConfigService({ SHOPEE_AFFILIATE_ID: 'test-affiliate' }),
  );
  const userId = randomUUID();
  const itemId = BigInt(providerPayload.productInfo.itemId);
  const shopId = BigInt(providerPayload.productInfo.shopId);

  beforeAll(async () => {
    await db.$connect();
    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        phoneNumber: userId.slice(0, 20),
        passwordHash: 'test-only',
      },
    });
    jest.mocked(generateLinkByAddLiveTag).mockResolvedValue(null);
  });
  beforeEach(() => {
    jest
      .mocked(getProductByUrl)
      .mockResolvedValue(productProviderReferenceSchema.parse(providerPayload));
  });
  afterAll(async () => {
    await db.affiliateLink.deleteMany({ where: { userId } });
    await db.product.deleteMany({ where: { itemId, shopId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('concurrent generates save one product and two independent tracked links', async () => {
    const results = await Promise.all(
      [1, 2].map(() => service.generateAffiliateLinkBySystem('https://s.shopee.vn/test', userId)),
    );
    expect(results.map((r) => r.code)).toEqual([null, null]);
    expect(results[0]!.product!.id).toBe(results[1]!.product!.id);
    expect(await db.product.count({ where: { itemId, shopId } })).toBe(1);
    const links = await db.affiliateLink.findMany({ where: { userId } });
    expect(links).toHaveLength(2);
    expect(new Set(links.map((link) => link.subId2)).size).toBe(2);
    expect(new Set(links.map((link) => link.subId4)).size).toBe(2);
    for (const link of links) {
      expect(link.productId).toBe(results[0]!.product!.id);
      expect(link.subId5).toBe(link.productId.replaceAll('-', ''));
      expect(new URL(link.fullLinkSystem!).searchParams.get('sub_id')).toBe(
        [link.subId1, link.subId2, link.subId3, link.subId4, link.subId5].join('-'),
      );
    }
  });

  it('updates values and scaled rates without changing product identity', async () => {
    const previous = await db.product.findUniqueOrThrow({
      where: { shopId_itemId: { shopId, itemId } },
    });
    const response = productProviderReferenceSchema.parse(providerPayload);
    Object.assign(response.productInfo, {
      price: 142800,
      commission: 17136,
      sellerRate: 0.08,
      shopeeRate: 0.04,
      sellerRatePercent: 8,
      shopeeRatePercent: 4,
      totalRatePercent: 12,
    });
    jest.mocked(getProductByUrl).mockResolvedValue(response);
    const result = await service.generateAffiliateLinkBySystem('https://s.shopee.vn/test', userId);
    expect(result.product).toMatchObject({
      id: previous.id,
      price: '142800',
      commission: '17136',
      sellerRate: 0.08,
      shopeeRate: 0.04,
      totalRatePercent: 12,
    });
    const stored = await db.product.findUniqueOrThrow({ where: { id: previous.id } });
    expect(stored).toMatchObject({
      price: 142800n,
      commission: 17136n,
      sellerRate: 800,
      shopeeRate: 400,
      totalRatePercent: 1200,
    });
    await expect(
      db.product.create({ data: { ...stored, id: randomUUID() } }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('migration rejects duplicate products without deleting products or history', async () => {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('DROP INDEX aff.product_shop_id_item_id_key');
      await client.query(
        "INSERT INTO aff.product SELECT (jsonb_populate_record(NULL::aff.product, to_jsonb(p) || jsonb_build_object('id', $1::text))).* FROM aff.product p LIMIT 1",
        [randomUUID()],
      );
      const before = await client.query('SELECT id FROM aff.product ORDER BY id');
      const history = await client.query(
        'SELECT id, product_id, sub_id_5 FROM aff.affiliate_link ORDER BY id',
      );
      await client.query('SAVEPOINT migration_attempt');
      const migration = readFileSync(
        resolve('prisma/migrations/20260922090000_product_external_ids_unique/migration.sql'),
        'utf8',
      );
      await expect(client.query(migration)).rejects.toThrow(
        'Duplicate products for (shop_id, item_id)',
      );
      await client.query('ROLLBACK TO SAVEPOINT migration_attempt');
      expect((await client.query('SELECT id FROM aff.product ORDER BY id')).rows).toEqual(
        before.rows,
      );
      expect(
        (await client.query('SELECT id, product_id, sub_id_5 FROM aff.affiliate_link ORDER BY id'))
          .rows,
      ).toEqual(history.rows);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
