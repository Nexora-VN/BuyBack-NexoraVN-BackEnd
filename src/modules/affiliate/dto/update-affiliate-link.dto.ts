import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AffiliateLinkStatus, ConvertOrigin } from '../../../common/domain/enums.js';

export class UpdateAffiliateLinkDto {
  @ApiPropertyOptional({ description: 'User ID (UUID)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Product ID (UUID)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cleanLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subId1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subId2?: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ enum: ConvertOrigin })
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

  @ApiPropertyOptional({ enum: AffiliateLinkStatus })
  @IsOptional()
  @IsEnum(AffiliateLinkStatus)
  affiliateLinkStatus?: AffiliateLinkStatus;
}
