import { Injectable } from '@nestjs/common';
import { AffiliateLinkStatus } from '../../../common/domain/enums.js';
import type { AffiliateLinkWhereInput } from '../../../generated/prisma/models/AffiliateLink.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type {
  AffiliateLinkRecord,
  CreateAffiliateLinkData,
  FindAffiliateLinksOptions,
  FindAffiliateLinksResult,
  UpdateAffiliateLinkData,
} from './affiliate.repository.js';
import { AffiliateRepository } from './affiliate.repository.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

@Injectable()
export class PrismaAffiliateRepository extends AffiliateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: CreateAffiliateLinkData): Promise<AffiliateLinkRecord> {
    return this.prisma.affiliateLink.create({ data });
  }

  async findMany(options: FindAffiliateLinksOptions): Promise<FindAffiliateLinksResult> {
    const whereAnd: AffiliateLinkWhereInput[] = [];

    if (!options.affiliateLinkStatus) {
      whereAnd.push({
        OR: [
          { affiliateLinkStatus: { not: AffiliateLinkStatus.DELETED } },
          { affiliateLinkStatus: null },
        ],
      });
    } else {
      whereAnd.push({ affiliateLinkStatus: options.affiliateLinkStatus });
    }

    if (options.id) {
      whereAnd.push({ id: options.id });
    }

    if (options.userId) {
      whereAnd.push({ userId: options.userId });
    }

    if (options.productId) {
      whereAnd.push({ productId: options.productId });
    }

    if (options.fullLinkSystem) {
      whereAnd.push({ fullLinkSystem: { contains: options.fullLinkSystem, mode: 'insensitive' } });
    }

    if (options.shortLink) {
      whereAnd.push({ shortLink: { contains: options.shortLink, mode: 'insensitive' } });
    }

    if (options.longLink) {
      whereAnd.push({ longLink: { contains: options.longLink, mode: 'insensitive' } });
    }

    if (options.convertOrigin) {
      whereAnd.push({ convertOrigin: options.convertOrigin });
    }

    if (options.createdAtFrom || options.createdAtTo) {
      whereAnd.push({
        createdAt: {
          ...(options.createdAtFrom ? { gte: options.createdAtFrom } : {}),
          ...(options.createdAtTo ? { lte: options.createdAtTo } : {}),
        },
      });
    }

    if (options.updatedAtFrom || options.updatedAtTo) {
      whereAnd.push({
        updatedAt: {
          ...(options.updatedAtFrom ? { gte: options.updatedAtFrom } : {}),
          ...(options.updatedAtTo ? { lte: options.updatedAtTo } : {}),
        },
      });
    }

    if (options.search) {
      const searchOr: AffiliateLinkWhereInput[] = [
        { fullLinkSystem: { contains: options.search, mode: 'insensitive' } },
        { shortLink: { contains: options.search, mode: 'insensitive' } },
        { longLink: { contains: options.search, mode: 'insensitive' } },
        { originLink: { contains: options.search, mode: 'insensitive' } },
        { cleanLink: { contains: options.search, mode: 'insensitive' } },
        { subId1: { contains: options.search, mode: 'insensitive' } },
        { subId2: { contains: options.search, mode: 'insensitive' } },
      ];

      if (UUID_REGEX.test(options.search)) {
        searchOr.push(
          { id: options.search },
          { userId: options.search },
          { productId: options.search },
        );
      }

      whereAnd.push({ OR: searchOr });
    }

    const where: AffiliateLinkWhereInput = whereAnd.length > 0 ? { AND: whereAnd } : {};

    const [items, total] = await Promise.all([
      this.prisma.affiliateLink.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.affiliateLink.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string): Promise<AffiliateLinkRecord | null> {
    return this.prisma.affiliateLink.findFirst({
      where: {
        id,
        OR: [
          { affiliateLinkStatus: { not: AffiliateLinkStatus.DELETED } },
          { affiliateLinkStatus: null },
        ],
      },
    });
  }

  async update(id: string, data: UpdateAffiliateLinkData): Promise<AffiliateLinkRecord> {
    return this.prisma.affiliateLink.update({ where: { id }, data });
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    await this.prisma.affiliateLink.update({
      where: { id },
      data: {
        affiliateLinkStatus: AffiliateLinkStatus.DELETED,
        deleteAt: new Date(),
        deleteBy: actorId,
        updatedBy: actorId,
      },
    });
  }
}
