export const makeCleanShortLink = async (url: string): Promise<string> => {
  try {
    // Lấy full link
    const response: Response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
    });

    const location = response.headers.get('location');

    if (!location) {
      throw new Error('Short link không trả redirect URL');
    }

    const resolvedUrl = new URL(location);

    const allowed =
      resolvedUrl.hostname === 'shopee.vn' || resolvedUrl.hostname.endsWith('.shopee.vn');

    if (!allowed) {
      throw new Error('Redirect ra ngoài domain Shopee');
    }

    const cleanUrl = `${resolvedUrl.protocol}//${resolvedUrl.hostname}${resolvedUrl.pathname}`;

    return cleanUrl;
  } catch (error) {
    console.log(error);
    return 'Có lỗi khi phân tích link';
  }
};

export const parseShopeeProductUrl = (url: string): { shopId: number; productId: number } => {
  const { pathname } = new URL(url);

  const match = pathname.match(/^\/product\/(\d+)\/(\d+)/);

  if (!match) {
    throw new Error('Invalid Shopee product URL');
  }

  const shopId = match[1];
  const productId = match[2];

  return {
    shopId: Number(shopId),
    productId: Number(productId),
  };
};
