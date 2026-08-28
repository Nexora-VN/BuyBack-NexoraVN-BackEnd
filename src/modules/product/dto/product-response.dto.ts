import { ApiProperty } from '@nestjs/swagger';

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, example: '26771994719' })
  itemId!: string;

  @ApiProperty({ type: String, example: '46182105' })
  shopId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  shopName!: string;

  @ApiProperty()
  originLink!: string;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  sales!: number;

  @ApiProperty()
  imageUrl!: string;

  @ApiProperty()
  productLink!: string;

  @ApiProperty()
  rating!: string;

  @ApiProperty()
  hasSellerCommission!: boolean;

  @ApiProperty()
  hasShopeeCommission!: boolean;

  @ApiProperty()
  commission!: number;

  @ApiProperty()
  sellerComFinal!: number;

  @ApiProperty()
  shoppeComFinal!: number;

  @ApiProperty()
  sellerRate!: number;

  @ApiProperty()
  shopeeRate!: number;

  @ApiProperty()
  sellerRatePercent!: number;

  @ApiProperty()
  shopeeRatePercent!: number;

  @ApiProperty()
  totalRatePercent!: number;

  @ApiProperty()
  isExtra!: boolean;

  @ApiProperty()
  isCapped!: boolean;

  @ApiProperty()
  isLimitCap!: boolean;

  @ApiProperty({ type: String })
  cap!: string;

  @ApiProperty({ type: String })
  capRow!: string;

  @ApiProperty({ type: String })
  capAfterRate!: string;

  @ApiProperty()
  lastUpdate!: Date;
}

export class ProductListMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  data!: ProductResponseDto[];

  @ApiProperty({ type: ProductListMetaDto })
  meta!: ProductListMetaDto;
}
