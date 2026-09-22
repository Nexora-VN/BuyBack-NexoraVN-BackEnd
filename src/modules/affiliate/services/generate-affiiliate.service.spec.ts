import type { ConfigService } from '@nestjs/config';
import { GenerateAffiliateService } from './generate-affiiliate.service.js';
import type { AffiliateRepository } from '../repositories/affiliate.repository.js';
import type { UsersService } from '../../users/services/users.service.js';
import type { ProductService } from '../../product/services/product.service.js';
import { generateLinkByAddLiveTag } from '../utils/generate-link-by-alt.js';
import { getProductByUrl } from '../../product/utils/get-product-by-aff-id.js';
import { productProviderReferenceSchema } from '../../product/contracts/product-provider.contract.js';
import { providerPayload } from '../../../../test/fixtures/product-provider.js';
import { UserStatus } from '../../../common/domain/enums.js';

jest.mock('../utils/generate-link-by-alt.js');
jest.mock('../../product/utils/get-product-by-aff-id.js');

describe('GenerateAffiliateService', () => {
  const input = 'https://s.shopee.vn/5q8MjSk534';
  const cleanLink = 'https://shopee.vn/product/46182105/26771994719';
  const product = { id: 'product-id', price: '134300', commission: '14102' };
  const repository = { create: jest.fn() };
  const users = { getUserStatusById: jest.fn() };
  const products = { upsertFromProvider: jest.fn() };
  const service = new GenerateAffiliateService(
    repository as unknown as AffiliateRepository,
    users as unknown as UsersService,
    products as unknown as ProductService,
    { getOrThrow: () => 'affiliate-id' } as unknown as ConfigService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    users.getUserStatusById.mockResolvedValue({ status: UserStatus.ACTIVE });
    products.upsertFromProvider.mockResolvedValue(product);
    jest
      .mocked(getProductByUrl)
      .mockResolvedValue(productProviderReferenceSchema.parse(providerPayload));
    jest.mocked(generateLinkByAddLiveTag).mockResolvedValue(null);
  });

  it('uses provider origin and preserves product and all fallback tracking fields', async () => {
    const result = await service.generateAffiliateLinkBySystem(input, 'user-id');
    expect(result.product).toEqual(product);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(getProductByUrl).toHaveBeenCalledWith(input);
    expect(products.upsertFromProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: '26771994719',
        shopId: '46182105',
        originLink: cleanLink,
        price: 134300,
      }),
    );
    const saved = repository.create.mock.calls[0]![0];
    const url = new URL(result.link!);
    expect(url.searchParams.get('sub_id')).toBe(
      [saved.subId1, saved.subId2, saved.subId3, saved.subId4, saved.subId5].join('-'),
    );
    expect(url.searchParams.get('affiliate_id')).toBe('affiliate-id');
    expect(url.searchParams.get('origin_link')).toBe(cleanLink);
    expect(saved).toMatchObject({
      originLink: input,
      cleanLink,
      productId: product.id,
      subId1: 'userid',
      subId3: 'web',
      subId5: 'productid',
      fullLinkSystem: result.link,
    });
    expect(generateLinkByAddLiveTag).toHaveBeenCalledWith(cleanLink, {
      sub1: saved.subId1,
      sub2: saved.subId2,
      sub3: saved.subId3,
      sub4: saved.subId4,
      sub5: saved.subId5,
    });
  });

  it('prefers the provider short link and saves its links', async () => {
    const response = {
      success: true,
      affiliateLink: 'https://s.shopee.vn/result',
      altLink: 'https://shopee.vn/long',
    };
    jest.mocked(generateLinkByAddLiveTag).mockResolvedValue(response as never);
    const result = await service.generateAffiliateLinkBySystem(input, 'user-id');
    expect(result).toMatchObject({
      product,
      link: response.affiliateLink,
      addLiveTagLink: response,
      code: null,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ shortLink: response.affiliateLink, longLink: response.altLink }),
    );
  });

  it('rejects inactive users before requesting product data', async () => {
    users.getUserStatusById.mockResolvedValue({ status: 'INACTIVE', code: 'inactive' });
    await expect(service.generateAffiliateLinkBySystem(input, 'user-id')).rejects.toMatchObject({
      stage: 'validate_user',
    });
    expect(getProductByUrl).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.com/product/1/2',
    'http://shopee.vn/product/1/2',
    'https://user@shopee.vn/product/1/2',
  ])('rejects invalid input %s before calling provider', async (url) => {
    await expect(service.generateAffiliateLinkBySystem(url, 'user-id')).rejects.toMatchObject({
      code: 'SHOPEE_LINK_INVALID',
      stage: 'validate_input',
    });
    expect(getProductByUrl).not.toHaveBeenCalled();
    expect(products.upsertFromProvider).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.com/product/46182105/26771994719',
    'https://shopee.vn/not-a-product',
    'https://shopee.vn/product/1/26771994719',
    'https://shopee.vn/product/46182105/2',
  ])('rejects invalid or mismatched provider origin %s without writing', async (originLink) => {
    const reference = productProviderReferenceSchema.parse(providerPayload);
    reference.productInfo.originLink = originLink;
    jest.mocked(getProductByUrl).mockResolvedValue(reference);
    await expect(service.generateAffiliateLinkBySystem(input, 'user-id')).rejects.toMatchObject({
      code: 'PROVIDER_PRODUCT_INVALID',
      stage: 'validate_product',
    });
    expect(products.upsertFromProvider).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each(['provider', 'product', 'history'])(
    'does not report success on %s failure',
    async (stage) => {
      if (stage === 'provider')
        jest.mocked(getProductByUrl).mockRejectedValue(new Error('provider failure'));
      if (stage === 'product')
        products.upsertFromProvider.mockRejectedValue(new Error('database failure'));
      if (stage === 'history') repository.create.mockRejectedValue(new Error('database failure'));
      await expect(service.generateAffiliateLinkBySystem(input, 'user-id')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        stage:
          stage === 'provider'
            ? 'fetch_product'
            : stage === 'product'
              ? 'upsert_product'
              : 'save_history',
      });
      if (stage !== 'history') expect(repository.create).not.toHaveBeenCalled();
      if (stage === 'provider') expect(products.upsertFromProvider).not.toHaveBeenCalled();
    },
  );
});
