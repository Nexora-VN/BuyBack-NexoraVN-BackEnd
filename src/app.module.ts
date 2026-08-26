import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { validateEnvironment } from './common/config/environment.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { BigIntSerializationInterceptor } from './common/interceptors/bigint-serialization.interceptor.js';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module.js';
import { BackofficeModule } from './modules/backoffice/backoffice.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AffiliateModule } from './modules/affiliate/affiliate.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.get<string>('LOG_LEVEL', 'info'),
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie'],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    BackofficeModule,
    AffiliateModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: BigIntSerializationInterceptor,
    },
  ],
})
export class AppModule {}
