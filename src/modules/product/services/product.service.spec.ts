import { ConflictException, NotFoundException } from '@nestjs/common';
import type { CreateProductDto } from '../dto/create-product.dto.js';
import type {
  CreateProductData,
  FindProductsOptions,
  FindProductsResult,
  ProductRecord,
  UpdateProductData,
} from '../repositories/product.repository.js';
import { ProductRepository } from '../repositories/product.repository.js';
import { ProductService } from './product.service.js';

const productInput: CreateProductDto = {
  itemId: '26771994719',
  shopId: '46182105',
  productName: '  Test Product  ',
  shopName: '  Test Shop  ',
  originLink: 'https://shopee.vn/product/46182105/26771994719',
  price: 699000,
  sales: 204,
  imageUrl: 'https://cf.shopee.vn/file/example',
  productLink: 'https://shopee.vn/product/46182105/26771994719',
  rating: '4.90',
  hasSellerCommission: true,
  hasShopeeCommission: true,
  commission: 41940,
  sellerComFinal: 20970,
  shoppeComFinal: 20970,
  sellerRate: 0.03,
  shopeeRate: 0.03,
  sellerRatePercent: 3,
  shopeeRatePercent: 3,
  totalRatePercent: 6,
  isExtra: true,
  isCapped: false,
  isLimitCap: true,
  cap: '40000',
  capRow: '40000',
  capAfterRate: '40000',
  lastUpdate: '2026-08-27T08:00:00.000Z',
};

class InMemoryProductRepository extends ProductRepository {
  private readonly products = new Map<string, ProductRecord>();
  private readonly affiliateLinkCounts = new Map<string, number>();

  create(data: CreateProductData): Promise<ProductRecord> {
    this.products.set(data.id, data);
    return Promise.resolve(data);
  }

  findMany(options: FindProductsOptions): Promise<FindProductsResult> {
    const filtered = [...this.products.values()].filter((product) => {
      if (options.itemId !== undefined && product.itemId !== options.itemId) return false;
      if (options.shopId !== undefined && product.shopId !== options.shopId) return false;
      if (!options.search) return true;
      const search = options.search.toLowerCase();
      return [product.productName, product.shopName, product.originLink, product.productLink].some(
        (value) => value.toLowerCase().includes(search),
      );
    });
    return Promise.resolve({
      items: filtered.slice(options.skip, options.skip + options.take),
      total: filtered.length,
    });
  }

  findById(id: string): Promise<ProductRecord | null> {
    return Promise.resolve(this.products.get(id) ?? null);
  }

  findByExternalIds(itemId: bigint, shopId: bigint): Promise<ProductRecord | null> {
    return Promise.resolve(
      [...this.products.values()].find(
        (product) => product.itemId === itemId && product.shopId === shopId,
      ) ?? null,
    );
  }

  findByItemId(itemId: number): Promise<ProductRecord | null> {
    return Promise.resolve(
      [...this.products.values()].find((product) => product.itemId === BigInt(itemId)) ?? null,
    );
  }

  update(id: string, data: UpdateProductData): Promise<ProductRecord> {
    const current = this.products.get(id);
    if (!current) throw new Error('Test repository invariant failed');
    const updated = { ...current, ...data };
    this.products.set(id, updated);
    return Promise.resolve(updated);
  }

  countAffiliateLinks(productId: string): Promise<number> {
    return Promise.resolve(this.affiliateLinkCounts.get(productId) ?? 0);
  }

  delete(id: string): Promise<void> {
    this.products.delete(id);
    return Promise.resolve();
  }

  setAffiliateLinkCount(productId: string, count: number): void {
    this.affiliateLinkCounts.set(productId, count);
  }
}

describe('ProductService', () => {
  let repository: InMemoryProductRepository;
  let service: ProductService;

  beforeEach(() => {
    repository = new InMemoryProductRepository();
    service = new ProductService(repository);
  });

  it('creates a product and serializes BigInt values as strings', async () => {
    const response = await service.create(productInput);
    const stored = await repository.findById(response.id);

    expect(response).toMatchObject({
      itemId: productInput.itemId,
      shopId: productInput.shopId,
      productName: 'Test Product',
      shopName: 'Test Shop',
      cap: productInput.cap,
    });
    expect(stored?.itemId).toBe(26771994719n);
    expect(stored?.cap).toBe(40000n);
  });

  it('rejects a duplicate Shopee item within the same shop', async () => {
    await service.create(productInput);
    await expect(service.create(productInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists products using external ID filters', async () => {
    await service.create(productInput);
    const result = await service.findMany({
      page: 1,
      limit: 20,
      itemId: productInput.itemId,
      shopId: productInput.shopId,
    });

    expect(result.meta).toMatchObject({ total: 1, totalPages: 1 });
    expect(result.data).toHaveLength(1);
  });

  it('updates product fields', async () => {
    const created = await service.create(productInput);
    const updated = await service.update(created.id, {
      productName: 'Updated Product',
      cap: '50000',
    });

    expect(updated.productName).toBe('Updated Product');
    expect(updated.cap).toBe('50000');
  });

  it('returns not found for an unknown product', async () => {
    await expect(service.findById('00000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('prevents deleting a product referenced by affiliate links', async () => {
    const created = await service.create(productInput);
    repository.setAffiliateLinkCount(created.id, 1);

    await expect(service.delete(created.id)).rejects.toBeInstanceOf(ConflictException);
  });
});
