import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { event, safeError } from '../../../common/observability/observability.js';
import { PrismaClient } from '../../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const started = performance.now();
            try {
              return await query(args);
            } catch (error) {
              event('debug', 'database.failed', {
                model,
                operation,
                err: safeError(error),
                outcome: 'failure',
              });
              throw error;
            } finally {
              const durationMs = Math.round(performance.now() - started);
              if (durationMs > 500)
                event('warn', 'database.slow', { model, operation, durationMs });
              else event('debug', 'database.completed', { model, operation, durationMs });
            }
          },
        },
      },
    }) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
