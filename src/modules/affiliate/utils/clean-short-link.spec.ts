import { makeCleanShortLink, parseShopeeProductUrl } from './clean-short-link.js';
describe('Shopee URL boundary', () => {
  afterEach(() => jest.restoreAllMocks());
  it('accepts canonical and slug URLs without fetching', async () => {
    const fetcher = jest.spyOn(globalThis,'fetch');
    expect(await makeCleanShortLink('https://shopee.vn/product/123/456?x=y')).toBe('https://shopee.vn/product/123/456');
    expect(parseShopeeProductUrl('https://shopee.vn/Phone-i.123.456')).toEqual({shopId:123,productId:456});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects arbitrary hosts before network access and checks redirects', async () => {
    const fetcher = jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}));
    await expect(makeCleanShortLink('http://127.0.0.1')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(makeCleanShortLink('https://vn.shp.ee/test')).rejects.toThrow('INVALID_SHOPEE_URL');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
