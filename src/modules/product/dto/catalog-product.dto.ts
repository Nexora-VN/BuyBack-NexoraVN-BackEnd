export interface CatalogProductDto {
  itemId: string;
  shopId: string;
  productName: string;
  shopName: string;
  price: string;
  imageUrl: string;
  productUrl: string;
  rating: string;
  sales: number;
  isExtra: boolean;
  lastUpdate: string;
  dataStatus: 'current' | 'saved';
  estimatedUserCashbackVnd: string | null;
  priceStats: {
    minPrice: string;
    maxPrice: string;
    avgPrice: string;
    priceChange7d: string;
    priceChange30d: string;
    lastPriceUpdate: string;
  } | null;
}
