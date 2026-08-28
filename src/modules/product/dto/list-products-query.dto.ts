import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

export class ListProductsQueryDto {
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

  @ApiPropertyOptional({ description: 'Search by product name, shop name, or URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  search?: string;

  @ApiPropertyOptional({ type: String, example: '26771994719' })
  @IsOptional()
  @IsString()
  @Matches(UNSIGNED_INTEGER_PATTERN)
  @MaxLength(30)
  itemId?: string;

  @ApiPropertyOptional({ type: String, example: '46182105' })
  @IsOptional()
  @IsString()
  @Matches(UNSIGNED_INTEGER_PATTERN)
  @MaxLength(30)
  shopId?: string;
}
