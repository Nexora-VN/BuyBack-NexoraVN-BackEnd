import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AffiliateLinkStatus, ConvertOrigin } from '../../../common/domain/enums.js';

export class CreateAffiliateLinkDto {
  @ApiProperty({ description: 'User ID (UUID)' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'Product ID (UUID)' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'https://vn.shp.ee/example' })
  @IsString()
  originLink!: string;

  @ApiProperty({ example: 'https://shopee.vn/product/123/456' })
  @IsString()
  cleanLink!: string;

  @ApiPropertyOptional({ example: 'user-sub-key' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subId1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subId2?: string;

  @ApiPropertyOptional({ example: 'web' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subId3?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subId4?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subId5?: string;

  @ApiPropertyOptional({ enum: ConvertOrigin, default: ConvertOrigin.SYSTEM })
  @IsOptional()
  @IsEnum(ConvertOrigin)
  convertOrigin?: ConvertOrigin;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullLinkSystem?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  longLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  failCode?: number;

  @ApiPropertyOptional({ enum: AffiliateLinkStatus, default: AffiliateLinkStatus.WORKING })
  @IsOptional()
  @IsEnum(AffiliateLinkStatus)
  affiliateLinkStatus?: AffiliateLinkStatus;
}
