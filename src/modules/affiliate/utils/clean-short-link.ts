const SHORT_HOSTS = new Set(['vn.shp.ee', 'shp.ee', 's.shopee.vn', 'shope.ee']);

function checkedUrl(input: string, base?: string): URL {
  const url = new URL(input, base);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !(
      url.hostname === 'shopee.vn' ||
      url.hostname === 'www.shopee.vn' ||
      SHORT_HOSTS.has(url.hostname)
    )
  )
    throw new Error('INVALID_SHOPEE_URL');
  return url;
}

export function parseShopeeProductUrl(input: string): { shopId: number; productId: number } {
  const url = checkedUrl(input);
  if (!['shopee.vn', 'www.shopee.vn'].includes(url.hostname))
    throw new Error('INVALID_PRODUCT_HOST');
  const match =
    url.pathname.match(/^\/product\/(\d+)\/(\d+)\/?$/) ??
    url.pathname.match(/-i\.(\d+)\.(\d+)\/?$/);
  if (!match) throw new Error('INVALID_SHOPEE_PRODUCT');
  const shopId = Number(match[1]),
    productId = Number(match[2]);
  if (
    !Number.isSafeInteger(shopId) ||
    !Number.isSafeInteger(productId) ||
    shopId <= 0 ||
    productId <= 0
  )
    throw new Error('UNSAFE_PRODUCT_ID');
  return { shopId, productId };
}

export async function makeCleanShortLink(input: string): Promise<string> {
  let url = checkedUrl(input);
  const seen = new Set<string>();

  for (let hop = 0; hop < 5; hop++) {
    if (seen.has(url.href)) {
      throw new Error('REDIRECT_LOOP');
    }

    seen.add(url.href);

    if (['shopee.vn', 'www.shopee.vn'].includes(url.hostname)) {
      const { shopId, productId } = parseShopeeProductUrl(url.href);

      return `https://shopee.vn/product/${shopId}/${productId}`;
    }

    try {
      const response = await fetch(url.href, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });

      const location = response.headers.get('location');

      await response.body?.cancel();

      if (!location || ![301, 302, 303, 307, 308].includes(response.status)) {
        throw new Error('SHORT_LINK_NOT_REDIRECTED');
      }

      url = checkedUrl(location, url.href);
    } catch (error) {
      console.error('[makeCleanShortLink] fetch error:', {
        url: url.href,
        error,
      });

      throw error;
    }
  }

  throw new Error('TOO_MANY_REDIRECTS');
}
