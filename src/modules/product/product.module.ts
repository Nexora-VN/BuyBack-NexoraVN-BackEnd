import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductController } from './controllers/product.controller.js';
import { PrismaProductRepository } from './repositories/prisma-product.repository.js';
import { ProductRepository } from './repositories/product.repository.js';
import { ProductService } from './services/product.service.js';
import { CatalogProductController } from './controllers/catalog-product.controller.js';
import { CatalogProductService } from './services/catalog-product.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProductController, CatalogProductController],
  providers: [
    ProductService,
    CatalogProductService,
    PrismaProductRepository,
    {
      provide: ProductRepository,
      useExisting: PrismaProductRepository,
    },
  ],
  exports: [ProductService],
})
export class ProductModule {}
