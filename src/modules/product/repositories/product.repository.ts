export interface ProductRecord {
  id: string;
  itemId: bigint;
  shopId: bigint;
  productName: string;
  shopName: string;
  originLink: string;
  price: number;
  sales: number;
  imageUrl: string;
  productLink: string;
  rating: string;
  hasSellerCommission: boolean;
  hasShopeeCommission: boolean;
  commission: number;
  sellerComFinal: number;
  shoppeComFinal: number;
  sellerRate: number;
  shopeeRate: number;
  sellerRatePercent: number;
  shopeeRatePercent: number;
  totalRatePercent: number;
  isExtra: boolean;
  isCapped: boolean;
  isLimitCap: boolean;
  cap: bigint;
  capRow: bigint;
  capAfterRate: bigint;
  lastUpdate: Date;
}

export type CreateProductData = ProductRecord;

export type UpdateProductData = Partial<Omit<ProductRecord, 'id'>>;

export interface FindProductsOptions {
  skip: number;
  take: number;
  search?: string;
  itemId?: bigint;
  shopId?: bigint;
}

export interface FindProductsResult {
  items: ProductRecord[];
  total: number;
}

export abstract class ProductRepository {
  abstract create(data: CreateProductData): Promise<ProductRecord>;
  abstract findMany(options: FindProductsOptions): Promise<FindProductsResult>;
  abstract findById(id: string): Promise<ProductRecord | null>;
  abstract findByExternalIds(itemId: bigint, shopId: bigint): Promise<ProductRecord | null>;
  abstract update(id: string, data: UpdateProductData): Promise<ProductRecord>;
  abstract countAffiliateLinks(productId: string): Promise<number>;
  abstract delete(id: string): Promise<void>;
  abstract findByItemId(id: number): Promise<ProductRecord | null>;
}
