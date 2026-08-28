import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateProductDto } from '../dto/create-product.dto.js';
import type { ListProductsQueryDto } from '../dto/list-products-query.dto.js';
import type { ProductListResponseDto, ProductResponseDto } from '../dto/product-response.dto.js';
import type { UpdateProductDto } from '../dto/update-product.dto.js';
import type { ProductRecord, UpdateProductData } from '../repositories/product.repository.js';
import { ProductRepository } from '../repositories/product.repository.js';

@Injectable()
export class ProductService {
  constructor(private readonly productRepository: ProductRepository) {}

  async create(input: CreateProductDto): Promise<ProductResponseDto> {
    const itemId = BigInt(input.itemId);
    const shopId = BigInt(input.shopId);
    await this.ensureExternalIdsAvailable(itemId, shopId);

    const product = await this.productRepository.create({
      id: randomUUID(),
      itemId,
      shopId,
      productName: input.productName.trim(),
      shopName: input.shopName.trim(),
      originLink: input.originLink.trim(),
      price: input.price,
      sales: input.sales,
      imageUrl: input.imageUrl.trim(),
      productLink: input.productLink.trim(),
      rating: input.rating.trim(),
      hasSellerCommission: input.hasSellerCommission,
      hasShopeeCommission: input.hasShopeeCommission,
      commission: input.commission,
      sellerComFinal: input.sellerComFinal,
      shoppeComFinal: input.shoppeComFinal,
      sellerRate: input.sellerRate,
      shopeeRate: input.shopeeRate,
      sellerRatePercent: input.sellerRatePercent,
      shopeeRatePercent: input.shopeeRatePercent,
      totalRatePercent: input.totalRatePercent,
      isExtra: input.isExtra,
      isCapped: input.isCapped,
      isLimitCap: input.isLimitCap,
      cap: BigInt(input.cap),
      capRow: BigInt(input.capRow),
      capAfterRate: BigInt(input.capAfterRate),
      lastUpdate: new Date(input.lastUpdate),
    });

    return this.toResponse(product);
  }

  async findMany(query: ListProductsQueryDto): Promise<ProductListResponseDto> {
    const { items, total } = await this.productRepository.findMany({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.itemId === undefined ? {} : { itemId: BigInt(query.itemId) }),
      ...(query.shopId === undefined ? {} : { shopId: BigInt(query.shopId) }),
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

  async findById(id: string): Promise<ProductResponseDto> {
    return this.toResponse(await this.getProduct(id));
  }

  async isExistByItemId(itemId: number): Promise<boolean> {
    const product = await this.productRepository.findByItemId(itemId);
    if (product) {
      return true;
    }
    return false;
  }

  async findByItemId(itemId: number): Promise<ProductRecord | null> {
    const product = await this.productRepository.findByItemId(itemId);
    if (product) {
      return product;
    }
    return null;
  }

  async update(id: string, input: UpdateProductDto): Promise<ProductResponseDto> {
    const current = await this.getProduct(id);
    const itemId = input.itemId === undefined ? current.itemId : BigInt(input.itemId);
    const shopId = input.shopId === undefined ? current.shopId : BigInt(input.shopId);

    if (itemId !== current.itemId || shopId !== current.shopId) {
      await this.ensureExternalIdsAvailable(itemId, shopId, id);
    }

    const product = await this.productRepository.update(id, this.toUpdateData(input));
    return this.toResponse(product);
  }

  async delete(id: string): Promise<void> {
    await this.getProduct(id);
    if ((await this.productRepository.countAffiliateLinks(id)) > 0) {
      throw new ConflictException('Product is referenced by affiliate links');
    }
    await this.productRepository.delete(id);
  }

  private async getProduct(id: string): Promise<ProductRecord> {
    const product = await this.productRepository.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async ensureExternalIdsAvailable(
    itemId: bigint,
    shopId: bigint,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.productRepository.findByExternalIds(itemId, shopId);
    if (existing && existing.id !== excludedId) {
      throw new ConflictException('Shopee product already exists');
    }
  }

  private toUpdateData(input: UpdateProductDto): UpdateProductData {
    return {
      ...(input.itemId === undefined ? {} : { itemId: BigInt(input.itemId) }),
      ...(input.shopId === undefined ? {} : { shopId: BigInt(input.shopId) }),
      ...(input.productName === undefined ? {} : { productName: input.productName.trim() }),
      ...(input.shopName === undefined ? {} : { shopName: input.shopName.trim() }),
      ...(input.originLink === undefined ? {} : { originLink: input.originLink.trim() }),
      ...(input.price === undefined ? {} : { price: input.price }),
      ...(input.sales === undefined ? {} : { sales: input.sales }),
      ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl.trim() }),
      ...(input.productLink === undefined ? {} : { productLink: input.productLink.trim() }),
      ...(input.rating === undefined ? {} : { rating: input.rating.trim() }),
      ...(input.hasSellerCommission === undefined
        ? {}
        : { hasSellerCommission: input.hasSellerCommission }),
      ...(input.hasShopeeCommission === undefined
        ? {}
        : { hasShopeeCommission: input.hasShopeeCommission }),
      ...(input.commission === undefined ? {} : { commission: input.commission }),
      ...(input.sellerComFinal === undefined ? {} : { sellerComFinal: input.sellerComFinal }),
      ...(input.shoppeComFinal === undefined ? {} : { shoppeComFinal: input.shoppeComFinal }),
      ...(input.sellerRate === undefined ? {} : { sellerRate: input.sellerRate }),
      ...(input.shopeeRate === undefined ? {} : { shopeeRate: input.shopeeRate }),
      ...(input.sellerRatePercent === undefined
        ? {}
        : { sellerRatePercent: input.sellerRatePercent }),
      ...(input.shopeeRatePercent === undefined
        ? {}
        : { shopeeRatePercent: input.shopeeRatePercent }),
      ...(input.totalRatePercent === undefined ? {} : { totalRatePercent: input.totalRatePercent }),
      ...(input.isExtra === undefined ? {} : { isExtra: input.isExtra }),
      ...(input.isCapped === undefined ? {} : { isCapped: input.isCapped }),
      ...(input.isLimitCap === undefined ? {} : { isLimitCap: input.isLimitCap }),
      ...(input.cap === undefined ? {} : { cap: BigInt(input.cap) }),
      ...(input.capRow === undefined ? {} : { capRow: BigInt(input.capRow) }),
      ...(input.capAfterRate === undefined ? {} : { capAfterRate: BigInt(input.capAfterRate) }),
      ...(input.lastUpdate === undefined ? {} : { lastUpdate: new Date(input.lastUpdate) }),
    };
  }

  private toResponse(product: ProductRecord): ProductResponseDto {
    return {
      ...product,
      itemId: product.itemId.toString(),
      shopId: product.shopId.toString(),
      cap: product.cap.toString(),
      capRow: product.capRow.toString(),
      capAfterRate: product.capAfterRate.toString(),
    };
  }
}
