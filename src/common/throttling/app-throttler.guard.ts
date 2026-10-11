import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { JwtClaims } from '../../modules/auth/interfaces/jwt-claims.js';
import { ERROR_CODE } from '../domain/error-code.js';

interface ThrottledRequest {
  ip?: string;
  url: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/**
 * Runs before route guards, so req.user is not set yet. The tracker therefore reads the
 * bearer token itself (verified, never trusted blindly) and falls back to the client IP.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as ThrottledRequest;
    // The web BFF proxy sends all web users from one IP, so login is keyed by email.
    if (
      request.method === 'POST' &&
      ['/auth/login', '/auth/password-reset/start', '/auth/password-reset/confirm'].some((route) =>
        request.url.split('?')[0]?.endsWith(route),
      )
    ) {
      const email = (request.body as { email?: unknown } | undefined)?.email;
      if (typeof email === 'string' && email.length > 0) {
        return `email:${email.trim().toLowerCase().slice(0, 254)}`;
      }
    }
    const header = request.headers.authorization;
    const token = typeof header === 'string' ? /^Bearer (.+)$/i.exec(header)?.[1] : undefined;
    if (token) {
      try {
        const claims = await this.jwt.verifyAsync<JwtClaims>(token, {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
          audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
        });
        if (claims.type === 'access') return `user:${claims.sub}`;
      } catch {
        // Invalid or expired token: the JWT guard rejects it later; throttle by IP meanwhile.
      }
    }
    return `ip:${request.ip ?? 'unknown'}`;
  }

  protected override throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        code: ERROR_CODE.RATE_LIMITED,
        message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
