import type { CreateProductDto } from '../dto/create-product.dto.js';
import type { ProductProviderInfo } from '../contracts/product-provider.contract.js';

const PROVIDER_TIMEZONE_OFFSET = '+07:00';

export function mapProviderProductToCreateDto(product: ProductProviderInfo): CreateProductDto {
  return {
    itemId: product.itemId,
    shopId: product.shopId,
    productName: product.productName,
    shopName: product.shopName,
    originLink: product.originLink,
    price: product.price,
    sales: product.sales,
    imageUrl: product.imageUrl,
    productLink: product.productLink,
    rating: product.rating,
    hasSellerCommission: product.hasSellerCommission,
    hasShopeeCommission: product.hasShopeeCommission,
    commission: product.commission,
    sellerComFinal: product.sellerComFinal,
    shoppeComFinal: product.shopeeComFinal,
    sellerRate: product.sellerRate,
    shopeeRate: product.shopeeRate,
    sellerRatePercent: product.sellerRatePercent,
    shopeeRatePercent: product.shopeeRatePercent,
    totalRatePercent: product.totalRatePercent,
    isExtra: product.isXtra,
    isCapped: product.isCapped,
    isLimitCap: product.isLimitCap,
    cap: product.cap,
    capRow: product.capRaw,
    capAfterRate: product.capAfterRate,
    lastUpdate: toIsoDateTime(product.lastUpdate),
  };
}

function toIsoDateTime(value: string): string {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(hasTimezone ? normalized : `${normalized}${PROVIDER_TIMEZONE_OFFSET}`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid provider date time: ${value}`);
  }

  return date.toISOString();
}
