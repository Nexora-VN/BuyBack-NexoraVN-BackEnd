import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AffiliateRepository } from '../repositories/affiliate.repository.js';
import { UsersService } from '../../users/services/users.service.js';
import { AffiliateLinkStatus, ConvertOrigin, UserStatus } from '../../../common/domain/enums.js';
import { randomUUID } from 'node:crypto';
import { ERROR_CODE, type ErrorCode } from '../../../common/domain/error-code.js';
import { makeCleanShortLink, parseShopeeProductUrl } from '../utils/clean-short-link.js';
import { getProductByAffProductId } from '../../product/utils/get-product-by-aff-id.js';
import { mapProviderProductToCreateDto } from '../../product/mappers/product-provider.mapper.js';
import { ProductService } from '../../product/services/product.service.js';
import type { GenerateLinkAddLiveTag, SubIds } from '../dto/generate-link-alt.type.js';
import { generateLinkByAddLiveTag } from '../utils/generate-link-by-alt.js';

import type { ProductResponseDto } from '../../product/dto/product-response.dto.js';

export interface GenerateAffiliateResponse {
  link: string | null;
  code: ErrorCode | null;
  product: ProductResponseDto | null;
  addLiveTagLink?: GenerateLinkAddLiveTag | null;
}

@Injectable()
export class GenerateAffiliateService {
  private readonly logger = new Logger(GenerateAffiliateService.name);
  constructor(
    private readonly affiliateRepository: AffiliateRepository,
    private readonly usersService: UsersService,
    private readonly productService: ProductService,
    private readonly configService: ConfigService,
  ) {}

  async generateAffiliateLinkBySystem(
    shopeeUrl: string,
    userId: string,
  ): Promise<GenerateAffiliateResponse> {
    // Check User
    const user = await this.usersService.getUserStatusById(userId);
    if (user.status !== UserStatus.ACTIVE) {
      return {
        link: null,
        code: user.code,
        product: null,
      };
    }
    // Generate link
    return this.generateLinkBySystem(shopeeUrl, userId, 'web');
  }

  async generateLinkBySystem(
    url: string,
    userId: string,
    channel?: 'web' | 'ios' | 'android',
  ): Promise<GenerateAffiliateResponse> {
    try {
      const affiliateId = this.configService.getOrThrow<string>('SHOPEE_AFFILIATE_ID');
      // Expand and validate Shopee URLs before resolving the product or creating tracking.
      const cleanLink = await makeCleanShortLink(url);
      const product = await this.resolveProduct(cleanLink);
      const savedProductId = product.id;

      const affiliateLinkId = randomUUID();
      // Keep sub-ID order stable for reconciliation: user, link, channel, tracking, product.
      const subId1 = userId.replaceAll('-', ''); // userID
      const subId2 = affiliateLinkId.replaceAll('-', ''); // affiliateId
      const subId3 = channel; // channel
      const subId4 = `bb_${randomUUID().replaceAll('-', '')}`; // trackingId
      const subId5 = savedProductId.replaceAll('-', ''); // productId

      const subIds = [subId1, subId2, subId3, subId4, subId5].join('-');
      const subIdsObjects: SubIds = {
        sub1: subId1,
        sub2: subId2,
        sub3: subId3 || '',
        sub4: subId4,
        sub5: subId5,
      };

      let generatedLink: string;
      // Prefer the provider short link; invalid/failed responses fall back to an_redir.
      const addLiveTagResponse: GenerateLinkAddLiveTag | null = await generateLinkByAddLiveTag(
        url,
        subIdsObjects,
      );
      if (addLiveTagResponse) {
        // The provider helper accepts only successful responses with a valid affiliate URL.
        generatedLink = addLiveTagResponse.affiliateLink;
      } else {
        // AFF_LINK = an_redir + encoded clean origin_link + affiliate_id + ordered sub_id.
        const params = new URLSearchParams({
          origin_link: cleanLink,
          affiliate_id: affiliateId,
          sub_id: subIds,
        });

        generatedLink = `https://s.shopee.vn/an_redir?${params.toString()}`;
      }

      await this.affiliateRepository.create({
        id: affiliateLinkId,
        affiliateIdSnapshot: affiliateId,
        userId,
        productId: savedProductId,
        originLink: url,
        shortLink: addLiveTagResponse?.affiliateLink,
        longLink: addLiveTagResponse?.altLink,
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
        addLiveTagLink: addLiveTagResponse,
        link: generatedLink,
        code: null,
        // Provider commission is an estimate, not the user cashback allocation.
        product,
      };
    } catch {
      this.logger.error('Affiliate link generation failed');

      return {
        addLiveTagLink: null,
        link: null,
        code: ERROR_CODE.AFFILIATE_CONVERT_FAILED,
        product: null,
      };
    }
  }

  private async resolveProduct(cleanLink: string): Promise<ProductResponseDto> {
    const { productId } = parseShopeeProductUrl(cleanLink);
    const existing = await this.productService.findByItemId(productId);
    // Reuse ProductService serialization so BigInt amounts are JSON-safe in both branches.
    if (existing) return this.productService.toResponse(existing);
    const response = await getProductByAffProductId(productId);
    return this.productService.create(mapProviderProductToCreateDto(response.productInfo));
  }
}
