import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import { integer, splitCashback } from '../../finance/domain/money.js';
import type { CatalogProductDto } from '../dto/catalog-product.dto.js';
import type { ProductProviderReference } from '../contracts/product-provider.contract.js';
import { mapProviderProductToCreateDto } from '../mappers/product-provider.mapper.js';
import { ProductRepository } from '../repositories/product.repository.js';
import { getProductByItemId, ProductProviderError } from '../utils/get-product-by-aff-id.js';

@Injectable()
export class CatalogProductService {
  constructor(
    private readonly products: ProductRepository,
    private readonly db: PrismaService,
  ) {}

  async findByItemId(itemId: string): Promise<CatalogProductDto> {
    if (!/^[1-9]\d{0,18}$/.test(itemId) || BigInt(itemId) > 9223372036854775807n) {
      throw new BadRequestException('Mã sản phẩm không hợp lệ');
    }

    let reference: ProductProviderReference;
    try {
      reference = await getProductByItemId(itemId);
      if (reference.productInfo.itemId !== itemId) {
        throw new ProductProviderError('Thông tin sản phẩm không khớp mã yêu cầu');
      }
    } catch (error) {
      // Keep previously saved product information available during a provider outage.
      const { items } = await this.products.findMany({ skip: 0, take: 1, itemId: BigInt(itemId) });
      const saved = items[0];
      if (!saved) throw error;
      return {
        itemId: saved.itemId.toString(),
        shopId: saved.shopId.toString(),
        productName: saved.productName,
        shopName: saved.shopName,
        price: saved.price.toString(),
        imageUrl: saved.imageUrl,
        productUrl: `https://shopee.vn/product/${saved.shopId}/${saved.itemId}`,
        rating: saved.rating,
        sales: saved.sales,
        isExtra: saved.isExtra,
        lastUpdate: saved.lastUpdate.toISOString(),
        dataStatus: 'saved',
        estimatedUserCashbackVnd: null,
        priceStats: null,
      };
    }

    const product = reference.productInfo;
    const policy = await this.db.affiliatePolicy.findUnique({ where: { id: 1 } });
    const cashback = splitCashback(
      integer(Math.floor(product.commission)),
      BigInt(policy?.userBps ?? 8500),
    );
    const money = (value: number) => integer(Math.round(value)).toString();
    return {
      itemId: product.itemId,
      shopId: product.shopId,
      productName: product.productName,
      shopName: product.shopName,
      price: money(product.price),
      imageUrl: product.imageUrl,
      productUrl: `https://shopee.vn/product/${product.shopId}/${product.itemId}`,
      rating: product.rating,
      sales: product.sales,
      isExtra: product.isXtra,
      lastUpdate: mapProviderProductToCreateDto(product).lastUpdate,
      dataStatus: 'current',
      estimatedUserCashbackVnd: cashback.user.toString(),
      priceStats: {
        minPrice: money(product.priceStats.minPrice),
        maxPrice: money(product.priceStats.maxPrice),
        avgPrice: money(product.priceStats.avgPrice),
        priceChange7d: money(product.priceStats.priceChange7d),
        priceChange30d: money(product.priceStats.priceChange30d),
        lastPriceUpdate: product.priceStats.lastPriceUpdate,
      },
    };
  }
}
