import { generateLinkByAddLiveTag } from './generate-link-by-alt.js';
const subIds = { sub1: 'user', sub2: 'link', sub3: 'web', sub4: 'tracking', sub5: 'product' };
describe('generateLinkByAddLiveTag', () => {
  const original = process.env.ADDLIVETAG_API_KEY;
  beforeEach(() => {
    process.env.ADDLIVETAG_API_KEY = 'test';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (original === undefined) delete process.env.ADDLIVETAG_API_KEY;
    else process.env.ADDLIVETAG_API_KEY = original;
  });
  it.each([
    { success: false, affiliateLink: 'https://s.shopee.vn/test' },
    { success: true },
    { success: true, affiliateLink: 'javascript:alert(1)' },
    { success: true, affiliateLink: 'https://example.com' },
    null,
  ])('rejects malformed provider payload %j', async (payload) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)));
    expect(await generateLinkByAddLiveTag('https://shopee.vn/product/1/2', subIds)).toBeNull();
  });
  it('returns successful links and preserves sub-IDs', async () => {
    const payload = { success: true, affiliateLink: 'https://s.shopee.vn/test' };
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(payload)));
    expect(await generateLinkByAddLiveTag('https://shopee.vn/product/1/2', subIds)).toEqual(
      payload,
    );
    const request = fetch.mock.calls[0]![0];
    if (typeof request !== 'string') throw new Error('Expected string URL');
    const url = new URL(request);
    expect(url.searchParams.get('subid4')).toBe('tracking');
  });
  it('does not request a short link without an API key', async () => {
    delete process.env.ADDLIVETAG_API_KEY;
    const fetch = jest.spyOn(global, 'fetch');
    expect(await generateLinkByAddLiveTag('https://shopee.vn/product/1/2', subIds)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('falls back when the short-link request times out', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    expect(await generateLinkByAddLiveTag('https://shopee.vn/product/1/2', subIds)).toBeNull();
  });
  it('falls back on network failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await generateLinkByAddLiveTag('https://shopee.vn/product/1/2', subIds)).toBeNull();
  });
});
