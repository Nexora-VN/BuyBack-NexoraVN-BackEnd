import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProductController } from './controllers/product.controller.js';
import { PrismaProductRepository } from './repositories/prisma-product.repository.js';
import { ProductRepository } from './repositories/product.repository.js';
import { ProductService } from './services/product.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    PrismaProductRepository,
    {
      provide: ProductRepository,
      useExisting: PrismaProductRepository,
    },
  ],
  exports: [ProductService],
})
export class ProductModule {}
