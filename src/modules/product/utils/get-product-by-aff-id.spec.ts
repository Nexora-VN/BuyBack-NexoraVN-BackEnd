import { mapProviderProductToCreateDto } from '../mappers/product-provider.mapper.js';
import { getProductByItemId, ProductProviderError } from './get-product-by-aff-id.js';

const providerPayload = {
  status: 'success',
  productInfo: {
    itemId: 26771994719,
    shopId: 46182105,
    productName: 'Test Product',
    shopName: 'Test Shop',
    price: 134300,
    sales: 1306,
    imageUrl: '[https://cf.shopee.vn/file/example](https://cf.shopee.vn/file/example)',
    productLink:
      '[https://shopee.vn/product/46182105/26771994719](https://shopee.vn/product/46182105/26771994719)',
    rating: '4.90',
    commission: 14102,
    sellerComFinal: 10744,
    shopeeComFinal: 3358,
    sellerRate: 0.08,
    shopeeRate: 0.025,
    sellerRatePercent: 8,
    shopeeRatePercent: 2.5,
    totalRatePercent: 10.5,
    shopeeRateSource: 'api_or_db',
    requestedBaseRate: null,
    requestedCapRaw: null,
    isXtra: true,
    hasSellerCommission: true,
    hasShopeeCommission: true,
    isCapped: false,
    isLimitCap: false,
    cap: 40000,
    capRaw: 40000,
    capAfterRate: 40000,
    lastUpdate: '2026-08-27 08:20:53',
    dataSource: 'api',
    priceStats: {
      currentPrice: 134300,
      minPrice: 120932,
      maxPrice: 139400,
      avgPrice: 136054.55319,
      priceChange7d: 0,
      priceChange30d: 600,
      lastPriceUpdate: '2026-08-27',
      lowestPriceDate: null,
      highestPriceDate: null,
    },
    latestPriceHistory: {
      price: 134300,
      originalPrice: 134300,
      discountPercent: 0,
      currency: 'VND',
      flashSale: false,
      promotionId: null,
      stockAvailable: 0,
      recordedDate: '2026-08-27',
      recordedTime: '2026-08-27 08:20:53',
    },
    originLink:
      '[https://shopee.vn/product/46182105/26771994719](https://shopee.vn/product/46182105/26771994719)',
    affiliateId: null,
    subId: null,
    affLink: null,
  },
  ignoredProviderField: true,
};

describe('getProductByItemId', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns a validated reusable reference and normalizes IDs and URLs', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(providerPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    const reference = await getProductByItemId('26771994719');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://data.addlivetag.com/product-data/product-data.php?item_id=26771994719',
      }),
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
    expect(reference).toMatchObject({
      status: 'success',
      productInfo: {
        itemId: '26771994719',
        shopId: '46182105',
        imageUrl: 'https://cf.shopee.vn/file/example',
        cap: '40000',
      },
    });
    expect(reference).not.toHaveProperty('ignoredProviderField');
  });

  it('maps provider names and date values to the Product create contract', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(providerPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const reference = await getProductByItemId(26771994719);
    const input = mapProviderProductToCreateDto(reference.productInfo);

    expect(input).toMatchObject({
      itemId: '26771994719',
      isExtra: true,
      capRow: '40000',
      lastUpdate: '2026-08-27T01:20:53.000Z',
    });
  });

  it('rejects unsuccessful HTTP responses', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 502 }));

    await expect(getProductByItemId('26771994719')).rejects.toBeInstanceOf(ProductProviderError);
  });

  it('rejects invalid provider payloads', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'success', productInfo: {} }), { status: 200 }),
      );

    await expect(getProductByItemId('26771994719')).rejects.toThrow(
      'Payload API thông tin sản phẩm không đúng contract',
    );
  });
});
