import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliateLinkStatus, ConvertOrigin } from '../../../common/domain/enums.js';

export class AffiliateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  subId1!: string | null;

  @ApiPropertyOptional({ nullable: true })
  subId2!: string | null;

  @ApiPropertyOptional({ nullable: true })
  subId3!: string | null;

  @ApiPropertyOptional({ nullable: true })
  subId4!: string | null;

  @ApiPropertyOptional({ nullable: true })
  subId5!: string | null;

  @ApiProperty()
  originLink!: string;

  @ApiProperty()
  cleanLink!: string;

  @ApiProperty({ enum: ConvertOrigin })
  convertOrigin!: ConvertOrigin;

  @ApiPropertyOptional({ nullable: true })
  fullLinkSystem!: string | null;

  @ApiPropertyOptional({ nullable: true })
  shortLink!: string | null;

  @ApiPropertyOptional({ nullable: true })
  longLink!: string | null;

  @ApiPropertyOptional({ nullable: true })
  failCode!: number | null;

  @ApiProperty({ enum: AffiliateLinkStatus })
  affiliateLinkStatus!: AffiliateLinkStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  productId!: string;
}

export class AffilateLinkListMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class AffiliateLinkListResponseDto {
  @ApiProperty({ type: [AffiliateResponseDto] })
  data!: AffiliateResponseDto[];

  @ApiProperty({ type: AffilateLinkListMetaDto })
  meta!: AffilateLinkListMetaDto;
}
