import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AffiliateController } from './controllers/affiliate.controller.js';
import { PrismaAffiliateRepository } from './repositories/prisma-affiliate.repository.js';
import { AffiliateRepository } from './repositories/affiliate.repository.js';
import { AffiliateService } from './services/affiliate.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AffiliateController],
  providers: [
    AffiliateService,
    PrismaAffiliateRepository,
    {
      provide: AffiliateRepository,
      useExisting: PrismaAffiliateRepository,
    },
  ],
  exports: [AffiliateService],
})
export class AffiliateModule {}
