import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service.js';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy() {
    const indicator = this.healthIndicatorService.check('database');

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch {
      return indicator.down(
        'Database health check failed',
      );
    }
  }
  async readiness() {
    try {
      const indexes = await this.prisma.$queryRaw<{ ready: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
        JOIN pg_class ix ON ix.oid=i.indexrelid
        WHERE n.nspname='aff' AND t.relname='product' AND ix.relname='product_shop_id_item_id_key'
          AND i.indisunique AND i.indisvalid
      ) AS ready`;
      if (!indexes[0]?.ready) throw new Error('DATABASE_SCHEMA_MISMATCH');
      return { status: 'ok' };
    } catch (cause) {
      throw new ServiceUnavailableException('READINESS_FAILED', { cause });
    }
  }

}
