import { Injectable } from '@nestjs/common';
import { AffiliateRepository } from '../repositories/affiliate.repository.js';
import { FindUserStatus } from '../../users/repositories/users.repository.js';
import { UsersService } from '../../users/services/users.service.js';
import { AffiliateLinkStatus, ConvertOrigin, UserStatus } from '../../../common/domain/enums.js';
import { randomUUID } from 'node:crypto';
import { ERROR_CODE, type ErrorCode } from '../../../common/domain/error-code.js';
import { makeCleanShortLink, parseShopeeProductUrl } from '../utils/clean-short-link.js';
import { getProductByAffProductId } from '../../product/utils/get-product-by-aff-id.js';
import { mapProviderProductToCreateDto } from '../../product/mappers/product-provider.mapper.js';
import { ProductService } from '../../product/services/product.service.js';

@Injectable()
export class GenerateAffiliateService {
  constructor(
    private readonly affiliateRepository: AffiliateRepository,
    private readonly usersService: UsersService,
    private readonly productService: ProductService,
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
    return this.generateLinkBySystem(shopeeUrl, userId, 'web');
  }

  // ==== START MAIN FUNCTIONAL ====
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
     * Step 3.5: Lấy thông tin sản phẩm -> Check Exists (If yes: continue; If no: Save DB)
     * Step 4: Ghép endpoint an_redir, origin_link, affiliate_id và sub_id.
     */

    try {
      // Step 1 + 2 + 3: Lấy link đầy đủ
      const cleanLink = await makeCleanShortLink(url);
      console.log(cleanLink);

      // Step 3.5: Get Product Infor
      const { shopId, productId } = parseShopeeProductUrl(cleanLink);
      console.log('shopId - productId ', `${shopId} - ${productId}`);
      /**
       * Find EXIST First
       * Yes: Continue
       * No: Fetch Data to getProduct
       */
      const existingProduct = await this.productService.findByItemId(productId);
      let savedProductId: string;

      // NO: FETCH DATA + SAVE DB
      if (!existingProduct) {
        // FIND BY PARTY API
        const productResp = await getProductByAffProductId(productId);
        // CONVERT MAPPER
        const productInput = mapProviderProductToCreateDto(productResp.productInfo);

        // SAVE INTO DB
        const savedProduct = await this.productService.create(productInput);
        savedProductId = savedProduct.id;
      } else {
        // YES: Get data
        savedProductId = existingProduct.id;
      }

      // Step 4: Ghép endpoint
      const affiliateLinkId = randomUUID();

      // Make subIDS
      const subId1 = userId.replaceAll('-', ''); // userID
      const subId2 = `${affiliateLinkId.replaceAll('-', '')}`; // affiliateId
      const subId3 = channel; // channel
      const subId4 = `bb_${randomUUID().replaceAll('-', '')}`; // trackingId
      const subId5 = `${savedProductId.replaceAll('-', '')}`; // productId

      const subIds = [subId1, subId2, subId3, subId4, subId5].join('-');

      const params = new URLSearchParams({
        origin_link: cleanLink,
        affiliate_id: AFFILIATE_ID,
        sub_id: subIds,
      });

      // Generate + save into DB Affiliate Link
      const generatedLink = `${REDIRECT_DOMAIN}?${params.toString()}`;

      await this.affiliateRepository.create({
        id: affiliateLinkId,
        userId,
        productId: savedProductId,
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
  // ==== END MAIN FUNCTIONAL ====
}
