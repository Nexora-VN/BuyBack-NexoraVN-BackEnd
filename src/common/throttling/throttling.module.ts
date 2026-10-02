import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard.js';
import { RATE_LIMITS } from './rate-limits.js';

@Module({
  imports: [JwtModule.register({}), ThrottlerModule.forRoot([RATE_LIMITS.default])],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class ThrottlingModule {}
