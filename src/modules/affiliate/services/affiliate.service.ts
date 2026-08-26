import { Injectable, NotFoundException } from '@nestjs/common';
import { AffiliateLinkStatus, ConvertOrigin } from '../../../common/domain/enums.js';
import type { CreateAffiliateLinkDto } from '../dto/create-affiliate-link.dto.js';
import type { ListAffiliateLinksQueryDto } from '../dto/list-affiliate-query.dto.js';
import type { UpdateAffiliateLinkDto } from '../dto/update-affiliate-link.dto.js';
import type {
  AffiliateLinkListResponseDto,
  AffiliateResponseDto,
} from '../dto/affiliate-response.dto.js';
import type { AffiliateLinkRecord } from '../repositories/affiliate.repository.js';
import { AffiliateRepository } from '../repositories/affiliate.repository.js';

@Injectable()
export class AffiliateService {
  constructor(private readonly affiliateRepository: AffiliateRepository) {}

  async create(input: CreateAffiliateLinkDto, actorId: string): Promise<AffiliateResponseDto> {
    const link = await this.affiliateRepository.create({
      userId: input.userId,
      productId: input.productId,
      originLink: input.originLink.trim(),
      cleanLink: input.cleanLink.trim(),
      ...(input.subId1 !== undefined ? { subId1: input.subId1.trim() } : {}),
      ...(input.subId2 !== undefined ? { subId2: input.subId2.trim() } : {}),
      ...(input.subId3 !== undefined ? { subId3: input.subId3.trim() } : {}),
      ...(input.subId4 !== undefined ? { subId4: input.subId4.trim() } : {}),
      ...(input.subId5 !== undefined ? { subId5: input.subId5.trim() } : {}),
      convertOrigin: input.convertOrigin ?? ConvertOrigin.SYSTEM,
      ...(input.fullLinkSystem !== undefined
        ? { fullLinkSystem: input.fullLinkSystem.trim() }
        : {}),
      ...(input.shortLink !== undefined ? { shortLink: input.shortLink.trim() } : {}),
      ...(input.longLink !== undefined ? { longLink: input.longLink.trim() } : {}),
      ...(input.failCode !== undefined ? { failCode: input.failCode } : {}),
      affiliateLinkStatus: input.affiliateLinkStatus ?? AffiliateLinkStatus.WORKING,
      createdBy: actorId,
      updatedBy: actorId,
    });

    return this.toResponse(link);
  }

  async findMany(query: ListAffiliateLinksQueryDto): Promise<AffiliateLinkListResponseDto> {
    const { items, total } = await this.affiliateRepository.findMany({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.id?.trim() ? { id: query.id.trim() } : {}),
      ...(query.userId?.trim() ? { userId: query.userId.trim() } : {}),
      ...(query.productId?.trim() ? { productId: query.productId.trim() } : {}),
      ...(query.fullLinkSystem?.trim() ? { fullLinkSystem: query.fullLinkSystem.trim() } : {}),
      ...(query.shortLink?.trim() ? { shortLink: query.shortLink.trim() } : {}),
      ...(query.longLink?.trim() ? { longLink: query.longLink.trim() } : {}),
      ...(query.convertOrigin ? { convertOrigin: query.convertOrigin } : {}),
      ...(query.affiliateLinkStatus ? { affiliateLinkStatus: query.affiliateLinkStatus } : {}),
      ...(query.createdAtFrom ? { createdAtFrom: query.createdAtFrom } : {}),
      ...(query.createdAtTo ? { createdAtTo: query.createdAtTo } : {}),
      ...(query.updatedAtFrom ? { updatedAtFrom: query.updatedAtFrom } : {}),
      ...(query.updatedAtTo ? { updatedAtTo: query.updatedAtTo } : {}),
    });

    return {
      data: items.map((item) => this.toResponse(item)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findById(id: string): Promise<AffiliateResponseDto> {
    return this.toResponse(await this.getAffiliateLink(id));
  }

  async update(
    id: string,
    input: UpdateAffiliateLinkDto,
    actorId: string,
  ): Promise<AffiliateResponseDto> {
    await this.getAffiliateLink(id);

    const link = await this.affiliateRepository.update(id, {
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.productId !== undefined ? { productId: input.productId } : {}),
      ...(input.originLink !== undefined ? { originLink: input.originLink.trim() } : {}),
      ...(input.cleanLink !== undefined ? { cleanLink: input.cleanLink.trim() } : {}),
      ...(input.subId1 !== undefined ? { subId1: input.subId1 ? input.subId1.trim() : null } : {}),
      ...(input.subId2 !== undefined ? { subId2: input.subId2 ? input.subId2.trim() : null } : {}),
      ...(input.subId3 !== undefined ? { subId3: input.subId3 ? input.subId3.trim() : null } : {}),
      ...(input.subId4 !== undefined ? { subId4: input.subId4 ? input.subId4.trim() : null } : {}),
      ...(input.subId5 !== undefined ? { subId5: input.subId5 ? input.subId5.trim() : null } : {}),
      ...(input.convertOrigin !== undefined ? { convertOrigin: input.convertOrigin } : {}),
      ...(input.fullLinkSystem !== undefined
        ? { fullLinkSystem: input.fullLinkSystem ? input.fullLinkSystem.trim() : null }
        : {}),
      ...(input.shortLink !== undefined
        ? { shortLink: input.shortLink ? input.shortLink.trim() : null }
        : {}),
      ...(input.longLink !== undefined
        ? { longLink: input.longLink ? input.longLink.trim() : null }
        : {}),
      ...(input.failCode !== undefined ? { failCode: input.failCode } : {}),
      ...(input.affiliateLinkStatus !== undefined
        ? { affiliateLinkStatus: input.affiliateLinkStatus }
        : {}),
      updatedBy: actorId,
    });

    return this.toResponse(link);
  }

  async delete(id: string, actorId: string): Promise<void> {
    await this.getAffiliateLink(id);
    await this.affiliateRepository.softDelete(id, actorId);
  }

  private async getAffiliateLink(id: string): Promise<AffiliateLinkRecord> {
    const link = await this.affiliateRepository.findById(id);

    if (!link) {
      throw new NotFoundException('Affiliate link not found');
    }

    return link;
  }

  private toResponse(link: AffiliateLinkRecord): AffiliateResponseDto {
    return {
      id: link.id,
      subId1: link.subId1,
      subId2: link.subId2,
      subId3: link.subId3,
      subId4: link.subId4,
      subId5: link.subId5,
      originLink: link.originLink,
      cleanLink: link.cleanLink,
      convertOrigin: link.convertOrigin,
      fullLinkSystem: link.fullLinkSystem,
      shortLink: link.shortLink,
      longLink: link.longLink,
      failCode: link.failCode,
      affiliateLinkStatus: link.affiliateLinkStatus ?? AffiliateLinkStatus.WORKING,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      userId: link.userId,
      productId: link.productId,
    };
  }
}
