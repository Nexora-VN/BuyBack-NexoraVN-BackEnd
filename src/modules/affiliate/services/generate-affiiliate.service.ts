import { Injectable } from '@nestjs/common';
import { AffiliateRepository } from '../repositories/affiliate.repository.js';
import { FindUserStatus } from '../../users/repositories/users.repository.js';
import { UsersService } from '../../users/services/users.service.js';
import { AffiliateLinkStatus, ConvertOrigin, UserStatus } from '../../../common/domain/enums.js';
// import { generateLinkBySystem } from '../utils/generate-link.js';
import { randomUUID } from 'node:crypto';
import { ERROR_CODE, type ErrorCode } from '../../../common/domain/error-code.js';

@Injectable()
export class GenerateAffiliateService {
  constructor(
    private readonly affiliateRepository: AffiliateRepository,
    private readonly usersService: UsersService,
  ) {}

  async generateAffiliateLinkBySystem(
    shopeeUrl: string,
    userId: string,
  ): Promise<{ link: string | null; code: ErrorCode | null }> {
    // Check User
    const user: FindUserStatus = await this.usersService.getUserStatusById(userId);
    if (user.status !== UserStatus.ACTIVE) {
      return {
        link: null,
        code: user.code,
      };
    }

    // Generate link
    const resp = await this.generateLinkBySystem(shopeeUrl, userId, 'web');
    console.log('🚀 ~ GenerateAffiliateService ~ generateAffiliateLinkBySystem ~ resp:', resp);
    return {
      link: resp.link,
      code: null,
    };
  }

  // ==== START UNTILS FUNCTIONAL ====
  generateLinkBySystem = async (
    url: string,
    userId: string,
    channel?: 'web' | 'ios' | 'android',
  ): Promise<{ link: string | null; code: ErrorCode | null }> => {
    const REDIRECT_DOMAIN = 'https://s.shopee.vn/an_redir';
    const AFFILIATE_ID = '17303170528';
    /**
     * GENERATE URL BY SYSTEM FLOW
     * CÔNG THỨC CHUNG:
     * AFF_LINK = REDIRECT_DOMAIN
     *          + ?origin_link=' + ENCODE(CLEAN_PRODUCT_URL)
     *          + &affiliate_id=' + AFFILIATE_ID
     *          + ['&sub_id=' + SUB_ID]
     * Step 1: Mở rộng link để lấy link đầy đủ
     * Step 2: Loại bỏ các tiền tố, chỉ giữ https://{domain}/{shop_id}/{product_id}
     * Step 3: Encode Url sạch
     * Step 4: Ghép endpoint an_redir, origin_link, affiliate_id và sub_id.
     */

    try {
      // Step 1 + 2 + 3: Lấy link đầy đủ
      const cleanLink = await this.makeCleanShortLink(url);
      console.log(cleanLink);

      // Step 4: Ghép endpoint
      const affiliateLinkId = randomUUID();

      const subId1 = userId.replaceAll('-', '');
      const subId2 = `${affiliateLinkId.replaceAll('-', '')}`;
      const subId3 = channel;
      const subId4 = `bb_${randomUUID().replaceAll('-', '')}`;
      const subId5 = '';

      const subIds = [subId1, subId2, subId3, subId4, subId5].join('-');

      const params = new URLSearchParams({
        origin_link: cleanLink,
        affiliate_id: AFFILIATE_ID,
        sub_id: subIds,
      });

      const generatedLink = `${REDIRECT_DOMAIN}?${params.toString()}`;

      await this.affiliateRepository.create({
        id: affiliateLinkId,
        userId,
        productId: '',
        originLink: url,
        cleanLink,
        subId1,
        subId2,
        subId3,
        subId4,
        subId5,
        convertOrigin: ConvertOrigin.SYSTEM,
        fullLinkSystem: generatedLink,
        affiliateLinkStatus: AffiliateLinkStatus.WORKING,
        createdBy: userId,
        updatedBy: userId,
      });

      return {
        link: generatedLink,
        code: null,
      };
    } catch (error) {
      console.log(error);
      return {
        link: null,
        code: ERROR_CODE.AFFILIATE_CONVERT_FAILED,
      };
    }
  };

  makeCleanShortLink = async (url: string): Promise<string> => {
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
  // ==== END UNTILS FUNCTIONAL ====
}
