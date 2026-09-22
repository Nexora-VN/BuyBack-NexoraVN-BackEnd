import { event } from '../../../common/observability/observability.js';
import type { SubIds, GenerateLinkAddLiveTag } from '../dto/generate-link-alt.type.js';

const ADD_LIVE_TAG_URL = 'https://addlivetag.com/short-link.php';
const SHOP_SLUG = 'theanh-buyback';


export const generateLinkByAddLiveTag = async (
  url: string,
  subIds: SubIds,
): Promise<GenerateLinkAddLiveTag | null> => {
  const started = performance.now();
  const fallback = (errorCode: string, statusCode?: number) => {
    event('warn', 'provider.short_link.fallback', { provider: 'AddLiveTag', stage: 'generate_short_link', errorCode, statusCode, durationMs: Math.round(performance.now() - started), outcome: 'fallback' });
    return null;
  };
  try {
    const apiKey = process.env.ADDLIVETAG_API_KEY;
    if (!apiKey) return fallback('PROVIDER_NOT_CONFIGURED');
    const params = new URLSearchParams({
      url,
      slug: SHOP_SLUG,
      subid1: subIds.sub1,
      subid2: subIds.sub2,
      subid3: subIds.sub3,
      subid4: subIds.sub4,
      subid5: subIds.sub5,
    });

    const response = await fetch(`${ADD_LIVE_TAG_URL}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
      headers: {
        api_key: apiKey,
      },
    });

    if (!response.ok) {
      await response.body?.cancel();
      return fallback('PROVIDER_HTTP_ERROR', response.status);
    }

    const data = (await response.json()) as GenerateLinkAddLiveTag;
    // A JSON response alone is not success; malformed results must use the system fallback.
    if (data?.success !== true || typeof data.affiliateLink !== 'string') return fallback('PROVIDER_INVALID_RESPONSE');
    const link = new URL(data.affiliateLink);
    if (
      link.protocol !== 'https:' ||
      link.username ||
      link.password ||
      !['shopee.vn', 's.shopee.vn', 'vn.shp.ee', 'shp.ee'].includes(link.hostname)
    )
      return fallback('PROVIDER_INVALID_LINK');

    event('debug', 'provider.short_link.completed', { provider: 'AddLiveTag', durationMs: Math.round(performance.now() - started), outcome: 'success' });
    return data;
  } catch (error) {
    return fallback(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'PROVIDER_TIMEOUT' : 'PROVIDER_INVALID_OR_UNAVAILABLE');
  }
};
