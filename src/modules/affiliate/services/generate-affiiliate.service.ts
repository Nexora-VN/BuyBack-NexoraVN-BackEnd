import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AffiliateRepository } from '../repositories/affiliate.repository.js';
import { UsersService } from '../../users/services/users.service.js';
import { AffiliateLinkStatus, ConvertOrigin, UserStatus } from '../../../common/domain/enums.js';
import { randomUUID } from 'node:crypto';
import { type ErrorCode } from '../../../common/domain/error-code.js';
import { checkedUrl, parseShopeeProductUrl } from '../utils/clean-short-link.js';
import { getProductByUrl } from '../../product/utils/get-product-by-aff-id.js';
import { mapProviderProductToCreateDto } from '../../product/mappers/product-provider.mapper.js';
import { ProductService } from '../../product/services/product.service.js';
import type { GenerateLinkAddLiveTag, SubIds } from '../dto/generate-link-alt.type.js';
import { generateLinkByAddLiveTag } from '../utils/generate-link-by-alt.js';

import { AppError, databaseError } from '../../../common/observability/app-error.js';
import { event, step } from '../../../common/observability/observability.js';
import type { ProductResponseDto } from '../../product/dto/product-response.dto.js';

export interface GenerateAffiliateResponse {
  link: string | null;
  code: ErrorCode | null;
  product: ProductResponseDto | null;
  addLiveTagLink?: GenerateLinkAddLiveTag | null;
}

@Injectable()
export class GenerateAffiliateService {
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
      throw new AppError(
        user.code ?? 'FORBIDDEN',
        403,
        'Tài khoản không thể tạo link.',
        'validate_user',
      );
    }
    // Generate link
    return this.generateLinkBySystem(shopeeUrl, userId, 'web');
  }

  async generateLinkBySystem(
    url: string,
    userId: string,
    channel?: 'web' | 'ios' | 'android',
  ): Promise<GenerateAffiliateResponse> {
    const started = performance.now();
    let stage = 'validate_input';
    let savedProductId: string | undefined;
    try {
      await step(stage, () => {
        try {
          checkedUrl(url);
        } catch (cause) {
          throw new AppError('SHOPEE_LINK_INVALID', 400, 'Link Shopee không hợp lệ.', stage, cause);
        }
      });
      const affiliateId = this.configService.getOrThrow<string>('SHOPEE_AFFILIATE_ID');
      stage = 'fetch_product';
      const { productInfo } = await step(stage, () => getProductByUrl(url));
      stage = 'validate_product';
      const cleanLink = await step(stage, () => {
        try {
          const { shopId, productId } = parseShopeeProductUrl(productInfo.originLink);
          if (
            BigInt(shopId) !== BigInt(productInfo.shopId) ||
            BigInt(productId) !== BigInt(productInfo.itemId)
          )
            throw new Error('PROVIDER_PRODUCT_ID_MISMATCH');
          return `https://shopee.vn/product/${shopId}/${productId}`;
        } catch (cause) {
          throw new AppError(
            'PROVIDER_PRODUCT_INVALID',
            502,
            'Thông tin sản phẩm chưa hợp lệ. Vui lòng thử lại.',
            stage,
            cause,
          );
        }
      });
      stage = 'upsert_product';
      const product = await step(stage, () =>
        this.productService.upsertFromProvider(
          mapProviderProductToCreateDto({ ...productInfo, originLink: cleanLink }),
        ),
      );
      savedProductId = product.id;

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
      stage = 'generate_short_link';
      const addLiveTagResponse: GenerateLinkAddLiveTag | null = await step(stage, () =>
        generateLinkByAddLiveTag(cleanLink, subIdsObjects),
      );
      if (addLiveTagResponse) {
        // The provider helper accepts only successful responses with a valid affiliate URL.
        generatedLink = addLiveTagResponse.affiliateLink;
      } else {
        stage = 'fallback_link';
        event('debug', 'generate.fallback', { stage, outcome: 'fallback' });
        // AFF_LINK = an_redir + encoded clean origin_link + affiliate_id + ordered sub_id.
        const params = new URLSearchParams({
          origin_link: cleanLink,
          affiliate_id: affiliateId,
          sub_id: subIds,
        });

        generatedLink = `https://s.shopee.vn/an_redir?${params.toString()}`;
      }

      stage = 'save_history';
      await step(stage, () =>
        this.affiliateRepository.create({
          id: affiliateLinkId,
          affiliateIdSnapshot: affiliateId,
          userId,
          productId: product.id,
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
        }),
      );
      event('log', 'generate.completed', {
        durationMs: Math.round(performance.now() - started),
        outcome: 'success',
        productId: savedProductId,
        affiliateLinkId,
        linkType: addLiveTagResponse ? 'short' : 'fallback',
      });

      return {
        addLiveTagLink: addLiveTagResponse,
        link: generatedLink,
        code: null,
        // Provider commission is an estimate, not the user cashback allocation.
        product,
      };
    } catch (cause) {
      const error = cause instanceof AppError ? cause : databaseError(cause, stage);
      event('debug', 'generate.failed', {
        stage,
        errorCode: error.code,
        durationMs: Math.round(performance.now() - started),
        productSaved: !!savedProductId,
      });
      if (!error.stage)
        throw new AppError(
          error.code,
          error.getStatus(),
          String((error.getResponse() as { message: string }).message),
          stage,
          cause,
        );
      throw error;
    }
  }
}
