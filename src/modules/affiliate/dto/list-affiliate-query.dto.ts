import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AffiliateLinkStatus, ConvertOrigin } from '../../../common/domain/enums.js';

export class ListAffiliateLinksQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'General keyword search' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by Link ID' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'Filter by User ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by Product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter by fullLinkSystem' })
  @IsOptional()
  @IsString()
  fullLinkSystem?: string;

  @ApiPropertyOptional({ description: 'Filter by shortLink' })
  @IsOptional()
  @IsString()
  shortLink?: string;

  @ApiPropertyOptional({ description: 'Filter by longLink' })
  @IsOptional()
  @IsString()
  longLink?: string;

  @ApiPropertyOptional({ enum: ConvertOrigin })
  @IsOptional()
  @IsEnum(ConvertOrigin)
  convertOrigin?: ConvertOrigin;

  @ApiPropertyOptional({ enum: AffiliateLinkStatus })
  @IsOptional()
  @IsEnum(AffiliateLinkStatus)
  affiliateLinkStatus?: AffiliateLinkStatus;

  @ApiPropertyOptional({ description: 'Filter by updatedAt start date (ISO string)', type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  updatedAtFrom?: Date;

  @ApiPropertyOptional({ description: 'Filter by updatedAt end date (ISO string)', type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  updatedAtTo?: Date;

  @ApiPropertyOptional({ description: 'Filter by createdAt start date (ISO string)', type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAtFrom?: Date;

  @ApiPropertyOptional({ description: 'Filter by createdAt end date (ISO string)', type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAtTo?: Date;
}
