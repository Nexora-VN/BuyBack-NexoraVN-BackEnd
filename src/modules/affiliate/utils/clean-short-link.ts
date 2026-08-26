export const makeCleanShortLink = async (url: string): Promise<string> => {
  // Lấy full link
  const response = await fetch(url, {
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
};
