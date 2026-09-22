import { Injectable } from '@nestjs/common';
import type { ProductWhereInput } from '../../../generated/prisma/models/Product.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type {
  CreateProductData,
  FindProductsOptions,
  FindProductsResult,
  ProductRecord,
  UpdateProductData,
} from './product.repository.js';
import { ProductRepository } from './product.repository.js';

@Injectable()
export class PrismaProductRepository extends ProductRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsert(data: CreateProductData): Promise<ProductRecord> {
    const { id, ...update } = { ...data, ...this.toStorageRates(data) };
    return this.fromStorage(
      await this.prisma.product.upsert({
        where: { shopId_itemId: { shopId: data.shopId, itemId: data.itemId } },
        create: { id, ...update },
        update,
      }),
    );
  }

  async create(data: CreateProductData): Promise<ProductRecord> {
    return this.fromStorage(
      await this.prisma.product.create({ data: { ...data, ...this.toStorageRates(data) } }),
    );
  }

  async findMany(options: FindProductsOptions): Promise<FindProductsResult> {
    const where: ProductWhereInput = {
      ...(options.itemId === undefined ? {} : { itemId: options.itemId }),
      ...(options.shopId === undefined ? {} : { shopId: options.shopId }),
      ...(options.search
        ? {
            OR: [
              { productName: { contains: options.search, mode: 'insensitive' } },
              { shopName: { contains: options.search, mode: 'insensitive' } },
              { originLink: { contains: options.search, mode: 'insensitive' } },
              { productLink: { contains: options.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: [
          { shopId: options.sort ?? 'desc' },
          { itemId: options.sort ?? 'desc' },
          { id: options.sort ?? 'desc' },
        ],
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items: items.map((i) => this.fromStorage(i)), total };
  }

  async findById(id: string): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? this.fromStorage(row) : null;
  }

  async findByExternalIds(itemId: bigint, shopId: bigint): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findFirst({ where: { itemId, shopId } });
    return row ? this.fromStorage(row) : null;
  }

  async update(id: string, data: UpdateProductData): Promise<ProductRecord> {
    return this.fromStorage(
      await this.prisma.product.update({
        where: { id },
        data: { ...data, ...this.toStorageRates(data) },
      }),
    );
  }

  countAffiliateLinks(productId: string): Promise<number> {
    return this.prisma.affiliateLink.count({ where: { productId } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
  }

  async findByItemId(itemId: number): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findFirst({ where: { itemId } });
    return row ? this.fromStorage(row) : null;
  }
  private toStorageRates(data: UpdateProductData) {
    const output: Partial<
      Record<
        | 'sellerRate'
        | 'shopeeRate'
        | 'sellerRatePercent'
        | 'shopeeRatePercent'
        | 'totalRatePercent',
        number
      >
    > = {};
    for (const field of [
      'sellerRate',
      'shopeeRate',
      'sellerRatePercent',
      'shopeeRatePercent',
      'totalRatePercent',
    ] as const) {
      const value = data[field];
      if (value !== undefined)
        output[field] = Math.round(value * (field.endsWith('Percent') ? 100 : 10000));
    }
    return output;
  }
  private fromStorage(row: ProductRecord): ProductRecord {
    return {
      ...row,
      sellerRate: row.sellerRate / 10000,
      shopeeRate: row.shopeeRate / 10000,
      sellerRatePercent: row.sellerRatePercent / 100,
      shopeeRatePercent: row.shopeeRatePercent / 100,
      totalRatePercent: row.totalRatePercent / 100,
    };
  }
}
