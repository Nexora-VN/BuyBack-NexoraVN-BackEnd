import type { ConfigService } from '@nestjs/config';
import { GenerateAffiliateService } from './generate-affiiliate.service.js';
import type { AffiliateRepository } from '../repositories/affiliate.repository.js';
import type { UsersService } from '../../users/services/users.service.js';
import { ProductService } from '../../product/services/product.service.js';
import { makeCleanShortLink } from '../utils/clean-short-link.js';
import { generateLinkByAddLiveTag } from '../utils/generate-link-by-alt.js';
import { getProductByAffProductId } from '../../product/utils/get-product-by-aff-id.js';
import { mapProviderProductToCreateDto } from '../../product/mappers/product-provider.mapper.js';
import { UserStatus } from '../../../common/domain/enums.js';
jest.mock('../utils/clean-short-link.js', () => ({
  makeCleanShortLink: jest.fn(),
  parseShopeeProductUrl: () => ({ productId: 2 }),
}));
jest.mock('../utils/generate-link-by-alt.js');
jest.mock('../../product/utils/get-product-by-aff-id.js');
jest.mock('../../product/mappers/product-provider.mapper.js');
describe('GenerateAffiliateService', () => {
  const record = {
    id: 'product-id',
    price: 100000n,
    commission: 0n,
    itemId: 2n,
    shopId: 1n,
    sellerComFinal: 0n,
    shoppeComFinal: 0n,
    cap: 0n,
    capRow: 0n,
    capAfterRate: 0n,
  };
  const repository = { create: jest.fn() };
  const users = { getUserStatusById: jest.fn() };
  const products = {
    findByItemId: jest.fn(),
    create: jest.fn(),
    toResponse: ProductService.prototype.toResponse,
  };
  const service = new GenerateAffiliateService(
    repository as unknown as AffiliateRepository,
    users as unknown as UsersService,
    products as unknown as ProductService,
    { getOrThrow: () => 'affiliate-id' } as unknown as ConfigService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    users.getUserStatusById.mockResolvedValue({ status: UserStatus.ACTIVE });
    products.findByItemId.mockResolvedValue(record);
    jest.mocked(makeCleanShortLink).mockResolvedValue('https://shopee.vn/product/1/2');
    jest.mocked(generateLinkByAddLiveTag).mockResolvedValue(null);
  });
  it('serializes existing products and preserves all fallback tracking fields', async () => {
    const result = await service.generateAffiliateLinkBySystem(
      'https://s.shopee.vn/input',
      'user-id',
    );
    expect(result.product).toMatchObject({ commission: '0', price: '100000' });
    expect(() => JSON.stringify(result)).not.toThrow();
    const saved = repository.create.mock.calls[0]![0];
    const url = new URL(result.link!);
    expect(url.searchParams.get('sub_id')).toBe(
      [saved.subId1, saved.subId2, saved.subId3, saved.subId4, saved.subId5].join('-'),
    );
    expect(saved.subId1).toBe('userid');
    expect(saved.subId3).toBe('web');
    expect(saved.subId5).toBe('productid');
    expect(url.searchParams.get('origin_link')).toBe('https://shopee.vn/product/1/2');
  });
  it('returns newly created product and provider link', async () => {
    products.findByItemId.mockResolvedValue(null);
    const product = { id: 'new-product', commission: '25', price: '100' };
    products.create.mockResolvedValue(product);
    jest.mocked(getProductByAffProductId).mockResolvedValue({ productInfo: {} } as never);
    jest.mocked(mapProviderProductToCreateDto).mockReturnValue({} as never);
    jest
      .mocked(generateLinkByAddLiveTag)
      .mockResolvedValue({ success: true, affiliateLink: 'https://s.shopee.vn/result' } as never);
    const result = await service.generateAffiliateLinkBySystem('input', 'user-id');
    expect(result.product).toEqual(product);
    expect(result.link).toBe('https://s.shopee.vn/result');
    expect(products.create).toHaveBeenCalled();
  });
  it('rejects inactive users before generating', async () => {
    users.getUserStatusById.mockResolvedValue({ status: 'INACTIVE', code: 'inactive' });
    expect(await service.generateAffiliateLinkBySystem('input', 'user-id')).toMatchObject({
      link: null,
      product: null,
    });
    expect(makeCleanShortLink).not.toHaveBeenCalled();
  });
  it('returns no product or link when URL resolution fails', async () => {
    jest.mocked(makeCleanShortLink).mockRejectedValue(new Error('invalid'));
    expect(await service.generateAffiliateLinkBySystem('input', 'user-id')).toMatchObject({
      link: null,
      product: null,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });
});
