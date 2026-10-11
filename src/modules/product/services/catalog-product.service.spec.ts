import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import { providerPayload } from '../../../../test/fixtures/product-provider.js';
import { productProviderReferenceSchema } from '../contracts/product-provider.contract.js';
import type { ProductRepository } from '../repositories/product.repository.js';
import { getProductByItemId, ProductProviderError } from '../utils/get-product-by-aff-id.js';
import { CatalogProductService } from './catalog-product.service.js';

jest.mock('../utils/get-product-by-aff-id.js', () => ({
  ...jest.requireActual('../utils/get-product-by-aff-id.js'),
  getProductByItemId: jest.fn(),
}));

describe('CatalogProductService', () => {
  const itemId = '26771994719';
  const repository = { findMany: jest.fn() };
  const db = { affiliatePolicy: { findUnique: jest.fn() } };
  const service = new CatalogProductService(
    repository as unknown as ProductRepository,
    db as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(getProductByItemId)
      .mockResolvedValue(productProviderReferenceSchema.parse(providerPayload));
    repository.findMany.mockResolvedValue({ items: [], total: 0 });
    db.affiliatePolicy.findUnique.mockResolvedValue(null);
  });

  it.each(['0', '-1', '1.2', 'abc', '9223372036854775808', '12345678901234567890'])(
    'rejects invalid identifier %s before calling the provider',
    async (id) => {
      await expect(service.findByItemId(id)).rejects.toThrow(BadRequestException);
      expect(getProductByItemId).not.toHaveBeenCalled();
      expect(repository.findMany).not.toHaveBeenCalled();
    },
  );

  it('returns public product data and only the customer share of commission', async () => {
    const result = await service.findByItemId(itemId);
    expect(getProductByItemId).toHaveBeenCalledWith(itemId);
    expect(result).toMatchObject({
      itemId,
      productName: 'Test Product',
      price: '134300',
      productUrl: 'https://shopee.vn/product/46182105/26771994719',
      estimatedUserCashbackVnd: '11986',
      dataStatus: 'current',
      lastUpdate: '2026-08-27T01:20:53.000Z',
      priceStats: { avgPrice: '136055', priceChange30d: '600' },
    });
    expect(result).not.toHaveProperty('commission');
    expect(result).not.toHaveProperty('affiliateId');
    expect(result).not.toHaveProperty('affLink');
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(repository.findMany).not.toHaveBeenCalled();
  });

  it('uses the configured cashback share and keeps signed price changes', async () => {
    db.affiliatePolicy.findUnique.mockResolvedValue({ userBps: 7000 });
    const reference = productProviderReferenceSchema.parse(providerPayload);
    reference.productInfo.priceStats.priceChange7d = -300;
    jest.mocked(getProductByItemId).mockResolvedValue(reference);
    expect(await service.findByItemId(itemId)).toMatchObject({
      estimatedUserCashbackVnd: '9871',
      priceStats: { priceChange7d: '-300' },
    });
  });

  it('does not display another product returned by the provider', async () => {
    await expect(service.findByItemId('24093715534')).rejects.toThrow(ProductProviderError);
    expect(db.affiliatePolicy.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to saved data without presenting old cashback as a current estimate', async () => {
    jest.mocked(getProductByItemId).mockRejectedValue(new ProductProviderError('Unavailable'));
    repository.findMany.mockResolvedValue({
      total: 1,
      items: [
        {
          itemId: BigInt(itemId),
          shopId: 46182105n,
          productName: 'Saved product',
          shopName: 'Shop',
          price: 120000n,
          imageUrl: 'https://cf.shopee.vn/file/example',
          rating: '4.90',
          sales: 100,
          isExtra: true,
          lastUpdate: new Date('2026-08-01T00:00:00Z'),
          commission: 99999n,
        },
      ],
    });
    expect(await service.findByItemId(itemId)).toMatchObject({
      itemId,
      productName: 'Saved product',
      price: '120000',
      dataStatus: 'saved',
      estimatedUserCashbackVnd: null,
      priceStats: null,
    });
    expect(repository.findMany).toHaveBeenCalledWith({ skip: 0, take: 1, itemId: BigInt(itemId) });
    expect(db.affiliatePolicy.findUnique).not.toHaveBeenCalled();
  });

  it('propagates provider failure when no saved product exists', async () => {
    const error = new ProductProviderError('Unavailable');
    jest.mocked(getProductByItemId).mockRejectedValue(error);
    await expect(service.findByItemId(itemId)).rejects.toBe(error);
  });
});
