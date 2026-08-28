import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../../common/domain/enums.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { CreateProductDto } from '../dto/create-product.dto.js';
import { ListProductsQueryDto } from '../dto/list-products-query.dto.js';
import { ProductListResponseDto, ProductResponseDto } from '../dto/product-response.dto.js';
import { UpdateProductDto } from '../dto/update-product.dto.js';
import { ProductService } from '../services/product.service.js';

@ApiTags('products')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'ADMIN or SUPER_ADMIN role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiConflictResponse({ description: 'Shopee product already exists' })
  create(@Body() input: CreateProductDto): Promise<ProductResponseDto> {
    return this.productService.create(input);
  }

  @Get()
  @ApiOperation({ summary: 'List products' })
  @ApiOkResponse({ type: ProductListResponseDto })
  findMany(@Query() query: ListProductsQueryDto): Promise<ProductListResponseDto> {
    return this.productService.findMany(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProductResponseDto> {
    return this.productService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'Shopee product already exists' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiNoContentResponse({ description: 'Product deleted' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'Product is referenced by affiliate links' })
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.productService.delete(id);
  }
}
