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

  create(data: CreateProductData): Promise<ProductRecord> {
    return this.prisma.product.create({ data });
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
        orderBy: [{ shopId: 'desc' }, { itemId: 'desc' }],
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string): Promise<ProductRecord | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }

  findByExternalIds(itemId: bigint, shopId: bigint): Promise<ProductRecord | null> {
    return this.prisma.product.findFirst({ where: { itemId, shopId } });
  }

  update(id: string, data: UpdateProductData): Promise<ProductRecord> {
    return this.prisma.product.update({ where: { id }, data });
  }

  countAffiliateLinks(productId: string): Promise<number> {
    return this.prisma.affiliateLink.count({ where: { productId } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
  }

  findByItemId(itemId: number): Promise<ProductRecord | null> {
    return this.prisma.product.findFirst({ where: { itemId } });
  }
}
