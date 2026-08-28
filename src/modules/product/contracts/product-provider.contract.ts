import { z } from 'zod';

const UNSIGNED_INTEGER_PATTERN = /^\d+$/;
const MARKDOWN_LINK_PATTERN = /^\[(https?:\/\/[^\]]+)]\((https?:\/\/[^)]+)\)$/;

const unsignedIntegerStringSchema = z
  .union([
    z.string().regex(UNSIGNED_INTEGER_PATTERN),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform((value) => String(value));

const nullableIdentifierSchema = z
  .union([z.string(), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)])
  .transform((value) => String(value))
  .nullable();

const httpsUrlSchema = z
  .string()
  .transform((value) => MARKDOWN_LINK_PATTERN.exec(value)?.[2] ?? value)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Expected a valid HTTPS URL');

export const productProviderPriceStatsSchema = z.object({
  currentPrice: z.number().finite().nonnegative(),
  minPrice: z.number().finite().nonnegative(),
  maxPrice: z.number().finite().nonnegative(),
  avgPrice: z.number().finite().nonnegative(),
  priceChange7d: z.number().finite(),
  priceChange30d: z.number().finite(),
  lastPriceUpdate: z.string().min(1),
  lowestPriceDate: z.string().min(1).nullable(),
  highestPriceDate: z.string().min(1).nullable(),
});

export const productProviderLatestPriceHistorySchema = z.object({
  price: z.number().finite().nonnegative(),
  originalPrice: z.number().finite().nonnegative(),
  discountPercent: z.number().finite().nonnegative(),
  currency: z.string().min(1).max(10),
  flashSale: z.boolean(),
  promotionId: nullableIdentifierSchema,
  stockAvailable: z.number().int().nonnegative(),
  recordedDate: z.string().min(1),
  recordedTime: z.string().min(1),
});

export const productProviderInfoSchema = z.object({
  itemId: unsignedIntegerStringSchema,
  shopId: unsignedIntegerStringSchema,
  productName: z.string().min(1),
  shopName: z.string().min(1),
  price: z.number().finite().nonnegative(),
  sales: z.number().finite().nonnegative(),
  imageUrl: httpsUrlSchema,
  productLink: httpsUrlSchema,
  rating: z.string().min(1).max(10),
  commission: z.number().finite().nonnegative(),
  sellerComFinal: z.number().finite().nonnegative(),
  shopeeComFinal: z.number().finite().nonnegative(),
  sellerRate: z.number().finite().nonnegative(),
  shopeeRate: z.number().finite().nonnegative(),
  sellerRatePercent: z.number().finite().nonnegative(),
  shopeeRatePercent: z.number().finite().nonnegative(),
  totalRatePercent: z.number().finite().nonnegative(),
  shopeeRateSource: z.string().min(1),
  requestedBaseRate: z.number().finite().nullable(),
  requestedCapRaw: unsignedIntegerStringSchema.nullable(),
  isXtra: z.boolean(),
  hasSellerCommission: z.boolean(),
  hasShopeeCommission: z.boolean(),
  isCapped: z.boolean(),
  isLimitCap: z.boolean(),
  cap: unsignedIntegerStringSchema,
  capRaw: unsignedIntegerStringSchema,
  capAfterRate: unsignedIntegerStringSchema,
  lastUpdate: z.string().min(1),
  dataSource: z.string().min(1),
  priceStats: productProviderPriceStatsSchema,
  latestPriceHistory: productProviderLatestPriceHistorySchema,
  originLink: httpsUrlSchema,
  affiliateId: nullableIdentifierSchema,
  subId: z.string().nullable(),
  affLink: httpsUrlSchema.nullable(),
});

export const productProviderReferenceSchema = z.object({
  status: z.literal('success'),
  productInfo: productProviderInfoSchema,
});

export type ProductProviderPriceStats = z.infer<typeof productProviderPriceStatsSchema>;
export type ProductProviderLatestPriceHistory = z.infer<
  typeof productProviderLatestPriceHistorySchema
>;
export type ProductProviderInfo = z.infer<typeof productProviderInfoSchema>;
export type ProductProviderReference = z.infer<typeof productProviderReferenceSchema>;
