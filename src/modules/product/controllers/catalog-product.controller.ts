import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../../../common/throttling/rate-limits.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CatalogProductService } from '../services/catalog-product.service.js';

@ApiTags('catalog')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('catalog/products')
export class CatalogProductController {
  constructor(private readonly products: CatalogProductService) {}

  @Get(':itemId')
  @Throttle({ default: RATE_LIMITS.productLookup })
  @ApiOperation({ summary: 'Look up a Shopee product for the customer product page' })
  @ApiOkResponse({
    description: 'Product information, price statistics and estimated customer cashback',
  })
  findByItemId(@Param('itemId') itemId: string) {
    return this.products.findByItemId(itemId);
  }
}
