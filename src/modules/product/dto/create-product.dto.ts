import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

export class CreateProductDto {
  @ApiProperty({ type: String, example: '26771994719', description: 'Shopee item ID' })
  @IsString()
  @Matches(UNSIGNED_INTEGER_PATTERN)
  @MaxLength(30)
  itemId!: string;

  @ApiProperty({ type: String, example: '46182105', description: 'Shopee shop ID' })
  @IsString()
  @Matches(UNSIGNED_INTEGER_PATTERN)
  @MaxLength(30)
  shopId!: string;

  @ApiProperty({ example: 'Shopee product name' })
  @IsString()
  @MaxLength(500)
  productName!: string;

  @ApiProperty({ example: 'Shopee Shop' })
  @IsString()
  @MaxLength(255)
  shopName!: string;

  @ApiProperty({ example: 'https://shopee.vn/product/46182105/26771994719' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  originLink!: string;

  @ApiProperty({ example: 699000 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  price!: number;

  @ApiProperty({ example: 204 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  sales!: number;

  @ApiProperty({ example: 'https://cf.shopee.vn/file/example' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl!: string;

  @ApiProperty({ example: 'https://shopee.vn/product/46182105/26771994719' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  productLink!: string;

  @ApiProperty({ example: '4.90' })
  @IsString()
  @MaxLength(10)
  rating!: string;

  @ApiProperty()
  @IsBoolean()
  hasSellerCommission!: boolean;

  @ApiProperty()
  @IsBoolean()
  hasShopeeCommission!: boolean;

  @ApiProperty({ example: 41940 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  commission!: number;

  @ApiProperty({ example: 20970 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  sellerComFinal!: number;

  @ApiProperty({ example: 20970 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  shoppeComFinal!: number;

  @ApiProperty({ example: 0.03 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  sellerRate!: number;

  @ApiProperty({ example: 0.03 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  shopeeRate!: number;

  @ApiProperty({ example: 3 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  sellerRatePercent!: number;

  @ApiProperty({ example: 3 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  shopeeRatePercent!: number;

  @ApiProperty({ example: 6 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  totalRatePercent!: number;

  @ApiProperty()
  @IsBoolean()
  isExtra!: boolean;

  @ApiProperty()
  @IsBoolean()
  isCapped!: boolean;

  @ApiProperty()
  @IsBoolean()
  isLimitCap!: boolean;

  @ApiProperty({ type: String, example: '40000' })
  @IsString()
  @Matches(UNSIGNED_INTEGER_PATTERN)
  @MaxLength(30)
  cap!: string;

  @ApiProperty({ type: String, example: '40000' })
  @IsString()
  @Matches(UNSIGNED_INTEGER_PATTERN)
  @MaxLength(30)
  capRow!: string;

  @ApiProperty({ type: String, example: '40000' })
  @IsString()
  @Matches(UNSIGNED_INTEGER_PATTERN)
  @MaxLength(30)
  capAfterRate!: string;

  @ApiProperty({ example: '2026-08-27T08:00:00.000Z' })
  @IsDateString()
  lastUpdate!: string;
}
