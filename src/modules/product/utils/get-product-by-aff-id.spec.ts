import { mapProviderProductToCreateDto } from '../mappers/product-provider.mapper.js';
import {
  getProductByItemId,
  getProductByUrl,
  ProductProviderError,
} from './get-product-by-aff-id.js';

import { providerPayload } from '../../../../test/fixtures/product-provider.js';

describe('getProductByItemId', () => {
  const originalFetch = global.fetch;
  const originalAddLiveTagKey = process.env.ADDLIVETAG_API_KEY;

  beforeEach(() => {
    delete process.env.ADDLIVETAG_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    if (originalAddLiveTagKey === undefined) delete process.env.ADDLIVETAG_API_KEY;
    else process.env.ADDLIVETAG_API_KEY = originalAddLiveTagKey;
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

  it('encodes the full input URL and makes only one product request', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(providerPayload)));
    const input = 'https://s.shopee.vn/5q8MjSk534?foo=a&bar=b';
    const result = await getProductByUrl(input);
    const request = fetchMock.mock.calls[0]![0] as URL;
    expect(request.searchParams.get('url')).toBe(input);
    expect(request.searchParams.has('item_id')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.productInfo.originLink).toBe('https://shopee.vn/product/46182105/26771994719');
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('accepts the SOCUS response with category fields and no affiliate link', async () => {
    const payload = structuredClone(providerPayload);
    Object.assign(payload.productInfo, {
      itemId: 51011334892,
      shopId: 1675140528,
      catId: 100869,
      catIds: [100630, 100659, 100869],
      catName: 'Dầu gội',
      catPath: ['Sắc Đẹp', 'Chăm sóc tóc', 'Dầu gội'],
      productName: 'Dầu gội thảo dược SOCUS 500g',
      shopName: 'SOCUS SEA VN',
      price: 142800,
      commission: 17136,
      sellerComFinal: 11424,
      shopeeComFinal: 5712,
      sellerRate: 0.08,
      shopeeRate: 0.04,
      sellerRatePercent: 8,
      shopeeRatePercent: 4,
      totalRatePercent: 12,
      productLink: 'https://shopee.vn/product/1675140528/51011334892',
      originLink: 'https://shopee.vn/product/1675140528/51011334892',
      lastUpdate: '2026-09-22 04:27:42',
      affiliateId: null,
      subId: null,
      affLink: null,
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)));
    const reference = await getProductByUrl('https://s.shopee.vn/5q8MjSk534');
    expect(mapProviderProductToCreateDto(reference.productInfo)).toMatchObject({
      itemId: '51011334892',
      shopId: '1675140528',
      price: 142800,
      commission: 17136,
      originLink: 'https://shopee.vn/product/1675140528/51011334892',
      lastUpdate: '2026-09-21T21:27:42.000Z',
    });
    expect(reference.productInfo.affLink).toBeNull();
  });

  it('wraps request timeouts', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(getProductByUrl('https://s.shopee.vn/example')).rejects.toBeInstanceOf(
      ProductProviderError,
    );
  });

  it('rejects invalid JSON', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('not JSON'));
    await expect(getProductByUrl('https://s.shopee.vn/example')).rejects.toThrow(
      'JSON không hợp lệ',
    );
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

  it('attaches api_key to search params and headers for getProductByItemId when ADDLIVETAG_API_KEY is configured', async () => {
    process.env.ADDLIVETAG_API_KEY = 'test-addlivetag-key-12345';
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(providerPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await getProductByItemId('26771994719');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]![0] as URL;
    expect(calledUrl.searchParams.get('item_id')).toBe('26771994719');
    expect(calledUrl.searchParams.get('api_key')).toBe('test-addlivetag-key-12345');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      headers: {
        accept: 'application/json',
        api_key: 'test-addlivetag-key-12345',
        'x-api-key': 'test-addlivetag-key-12345',
      },
    });
  });

  it('attaches api_key to search params and headers for getProductByUrl when ADDLIVETAG_API_KEY is configured', async () => {
    process.env.ADDLIVETAG_API_KEY = 'test-addlivetag-key-12345';
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(providerPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await getProductByUrl('https://s.shopee.vn/5q8MjSk534');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]![0] as URL;
    expect(calledUrl.searchParams.get('url')).toBe('https://s.shopee.vn/5q8MjSk534');
    expect(calledUrl.searchParams.get('api_key')).toBe('test-addlivetag-key-12345');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      headers: {
        accept: 'application/json',
        api_key: 'test-addlivetag-key-12345',
        'x-api-key': 'test-addlivetag-key-12345',
      },
    });
  });
});
