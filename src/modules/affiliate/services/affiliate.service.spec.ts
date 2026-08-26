import { NotFoundException } from '@nestjs/common';
import { AffiliateLinkStatus, ConvertOrigin } from '../../../common/domain/enums.js';
import type {
  AffiliateLinkRecord,
  CreateAffiliateLinkData,
  FindAffiliateLinksOptions,
  FindAffiliateLinksResult,
  UpdateAffiliateLinkData,
} from '../repositories/affiliate.repository.js';
import { AffiliateRepository } from '../repositories/affiliate.repository.js';
import { AffiliateService } from './affiliate.service.js';

const now = new Date('2026-08-25T00:00:00.000Z');
const actorId = '00000000-0000-4000-8000-000000000001';

class InMemoryAffiliateRepository extends AffiliateRepository {
  private readonly links = new Map<string, AffiliateLinkRecord>();

  create(data: CreateAffiliateLinkData): Promise<AffiliateLinkRecord> {
    const record: AffiliateLinkRecord = {
      id: crypto.randomUUID(),
      subId1: data.subId1 ?? null,
      subId2: data.subId2 ?? null,
      subId3: data.subId3 ?? null,
      subId4: data.subId4 ?? null,
      subId5: data.subId5 ?? null,
      originLink: data.originLink,
      cleanLink: data.cleanLink,
      convertOrigin: data.convertOrigin ?? ConvertOrigin.SYSTEM,
      fullLinkSystem: data.fullLinkSystem ?? null,
      shortLink: data.shortLink ?? null,
      longLink: data.longLink ?? null,
      failCode: data.failCode ?? null,
      affiliateLinkStatus: data.affiliateLinkStatus ?? AffiliateLinkStatus.WORKING,
      deleteAt: null,
      deleteBy: null,
      createdAt: now,
      createdBy: data.createdBy ?? null,
      updatedAt: now,
      updatedBy: data.updatedBy ?? null,
      userId: data.userId,
      productId: data.productId,
    };
    this.links.set(record.id, record);
    return Promise.resolve(record);
  }

  findMany(options: FindAffiliateLinksOptions): Promise<FindAffiliateLinksResult> {
    let items = [...this.links.values()];

    items = items.filter((link) => {
      if (!options.affiliateLinkStatus) {
        if (link.affiliateLinkStatus === AffiliateLinkStatus.DELETED) return false;
      } else if (link.affiliateLinkStatus !== options.affiliateLinkStatus) {
        return false;
      }

      if (options.id && link.id !== options.id) return false;
      if (options.userId && link.userId !== options.userId) return false;
      if (options.productId && link.productId !== options.productId) return false;

      if (
        options.fullLinkSystem &&
        (!link.fullLinkSystem ||
          !link.fullLinkSystem.toLowerCase().includes(options.fullLinkSystem.toLowerCase()))
      ) {
        return false;
      }

      if (
        options.shortLink &&
        (!link.shortLink || !link.shortLink.toLowerCase().includes(options.shortLink.toLowerCase()))
      ) {
        return false;
      }

      if (
        options.longLink &&
        (!link.longLink || !link.longLink.toLowerCase().includes(options.longLink.toLowerCase()))
      ) {
        return false;
      }

      if (options.createdAtFrom && link.createdAt < options.createdAtFrom) return false;
      if (options.createdAtTo && link.createdAt > options.createdAtTo) return false;
      if (options.updatedAtFrom && link.updatedAt < options.updatedAtFrom) return false;
      if (options.updatedAtTo && link.updatedAt > options.updatedAtTo) return false;

      if (options.search) {
        const s = options.search.toLowerCase();
        const match =
          link.id.toLowerCase().includes(s) ||
          link.userId.toLowerCase().includes(s) ||
          link.productId.toLowerCase().includes(s) ||
          (link.fullLinkSystem && link.fullLinkSystem.toLowerCase().includes(s)) ||
          (link.shortLink && link.shortLink.toLowerCase().includes(s)) ||
          (link.longLink && link.longLink.toLowerCase().includes(s)) ||
          link.originLink.toLowerCase().includes(s) ||
          link.cleanLink.toLowerCase().includes(s);
        if (!match) return false;
      }

      return true;
    });

    const total = items.length;
    const paginated = items.slice(options.skip, options.skip + options.take);
    return Promise.resolve({ items: paginated, total });
  }

  findById(id: string): Promise<AffiliateLinkRecord | null> {
    const link = this.links.get(id);
    if (!link || link.affiliateLinkStatus === AffiliateLinkStatus.DELETED) {
      return Promise.resolve(null);
    }
    return Promise.resolve(link);
  }

  update(id: string, data: UpdateAffiliateLinkData): Promise<AffiliateLinkRecord> {
    const current = this.links.get(id);
    if (!current) throw new Error('Test repository invariant failed');
    const updated = { ...current, ...data, updatedAt: now };
    this.links.set(id, updated);
    return Promise.resolve(updated);
  }

  softDelete(id: string, actor: string): Promise<void> {
    const current = this.links.get(id);
    if (!current) throw new Error('Test repository invariant failed');
    this.links.set(id, {
      ...current,
      affiliateLinkStatus: AffiliateLinkStatus.DELETED,
      deleteAt: now,
      deleteBy: actor,
      updatedBy: actor,
    });
    return Promise.resolve();
  }
}

describe('AffiliateService', () => {
  let repository: InMemoryAffiliateRepository;
  let service: AffiliateService;

  const sampleUserId = '11111111-1111-4111-8111-111111111111';
  const sampleProductId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    repository = new InMemoryAffiliateRepository();
    service = new AffiliateService(repository);
  });

  it('creates an affiliate link', async () => {
    const response = await service.create(
      {
        userId: sampleUserId,
        productId: sampleProductId,
        originLink: 'https://vn.shp.ee/abc',
        cleanLink: 'https://shopee.vn/product/1/2',
        fullLinkSystem: 'https://nexora.app/link/sys1',
        shortLink: 'https://nexora.app/s/1',
        longLink: 'https://nexora.app/l/1',
      },
      actorId,
    );

    expect(response).toMatchObject({
      userId: sampleUserId,
      productId: sampleProductId,
      originLink: 'https://vn.shp.ee/abc',
      cleanLink: 'https://shopee.vn/product/1/2',
      fullLinkSystem: 'https://nexora.app/link/sys1',
      shortLink: 'https://nexora.app/s/1',
      longLink: 'https://nexora.app/l/1',
      convertOrigin: ConvertOrigin.SYSTEM,
      affiliateLinkStatus: AffiliateLinkStatus.WORKING,
    });
  });

  it('finds affiliate links by ID, userId, productId, fullLinkSystem, shortLink, longLink, updatedAt', async () => {
    const created = await service.create(
      {
        userId: sampleUserId,
        productId: sampleProductId,
        originLink: 'https://vn.shp.ee/abc',
        cleanLink: 'https://shopee.vn/product/1/2',
        fullLinkSystem: 'https://nexora.app/link/sys123',
        shortLink: 'https://nexora.app/s/short123',
        longLink: 'https://nexora.app/l/long123',
      },
      actorId,
    );

    // Search by ID
    const byId = await service.findMany({ page: 1, limit: 10, id: created.id });
    expect(byId.meta.total).toBe(1);
    expect(byId.data[0]?.id).toBe(created.id);

    // Search by userId
    const byUserId = await service.findMany({ page: 1, limit: 10, userId: sampleUserId });
    expect(byUserId.meta.total).toBe(1);

    // Search by productId
    const byProductId = await service.findMany({ page: 1, limit: 10, productId: sampleProductId });
    expect(byProductId.meta.total).toBe(1);

    // Search by fullLinkSystem
    const byFullLink = await service.findMany({ page: 1, limit: 10, fullLinkSystem: 'sys123' });
    expect(byFullLink.meta.total).toBe(1);

    // Search by shortLink
    const byShortLink = await service.findMany({ page: 1, limit: 10, shortLink: 'short123' });
    expect(byShortLink.meta.total).toBe(1);

    // Search by longLink
    const byLongLink = await service.findMany({ page: 1, limit: 10, longLink: 'long123' });
    expect(byLongLink.meta.total).toBe(1);

    // Search by updatedAt range
    const byUpdatedAt = await service.findMany({
      page: 1,
      limit: 10,
      updatedAtFrom: new Date('2026-08-24T00:00:00Z'),
      updatedAtTo: new Date('2026-08-26T00:00:00Z'),
    });
    expect(byUpdatedAt.meta.total).toBe(1);
  });

  it('updates an affiliate link', async () => {
    const created = await service.create(
      {
        userId: sampleUserId,
        productId: sampleProductId,
        originLink: 'https://vn.shp.ee/abc',
        cleanLink: 'https://shopee.vn/product/1/2',
      },
      actorId,
    );

    const updated = await service.update(
      created.id,
      {
        shortLink: 'https://nexora.app/s/new',
        affiliateLinkStatus: AffiliateLinkStatus.EXPIRED,
      },
      actorId,
    );

    expect(updated.shortLink).toBe('https://nexora.app/s/new');
    expect(updated.affiliateLinkStatus).toBe(AffiliateLinkStatus.EXPIRED);
  });

  it('deletes (soft deletes) an affiliate link', async () => {
    const created = await service.create(
      {
        userId: sampleUserId,
        productId: sampleProductId,
        originLink: 'https://vn.shp.ee/abc',
        cleanLink: 'https://shopee.vn/product/1/2',
      },
      actorId,
    );

    await service.delete(created.id, actorId);

    await expect(service.findById(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
