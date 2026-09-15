import { Logger } from '@nestjs/common';
import type { SubIds, GenerateLinkAddLiveTag } from '../dto/generate-link-alt.type.js';

const ADD_LIVE_TAG_URL = 'https://addlivetag.com/short-link.php';
const SHOP_SLUG = 'theanh-buyback';
const logger = new Logger('AddLiveTag');

export const generateLinkByAddLiveTag = async (
  url: string,
  subIds: SubIds,
): Promise<GenerateLinkAddLiveTag | null> => {
  try {
    const apiKey = process.env.ADDLIVETAG_API_KEY;
    if (!apiKey) return null;
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
      logger.warn(`AddLiveTag HTTP error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as GenerateLinkAddLiveTag;
    // A JSON response alone is not success; malformed results must use the system fallback.
    if (data?.success !== true || typeof data.affiliateLink !== 'string') return null;
    const link = new URL(data.affiliateLink);
    if (
      link.protocol !== 'https:' ||
      link.username ||
      link.password ||
      !['shopee.vn', 's.shopee.vn', 'vn.shp.ee', 'shp.ee'].includes(link.hostname)
    )
      return null;

    return data;
  } catch {
    logger.warn('AddLiveTag unavailable or returned an invalid link; using system fallback');
    return null;
  }
};
