import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UserStatus } from '../../../common/domain/enums.js';
import type { AuthTokensResponseDto } from '../dto/auth-response.dto.js';
import type { LoginDto } from '../dto/login.dto.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.js';
import type { JwtClaims, JwtTokenType } from '../interfaces/jwt-claims.js';
import type { AuthUserRecord } from '../repositories/auth.repository.js';
import { AuthRepository } from '../repositories/auth.repository.js';

export interface AuthRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(input: LoginDto, metadata: AuthRequestMetadata): Promise<AuthTokensResponseDto> {
    const user = await this.authRepository.findUserByEmail(input.email.trim().toLowerCase());
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !(await this.verifyPassword(user, input.password))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionId = randomUUID();
    const tokens = await this.issueTokens(user, sessionId);
    await this.authRepository.createSession({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: await argon2.hash(tokens.refreshToken),
      expiresAt: this.refreshTokenExpiresAt(),
      ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
      ...(metadata.userAgent ? { userAgent: metadata.userAgent } : {}),
    });

    return tokens;
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponseDto> {
    const claims = await this.verifyRefreshToken(refreshToken);
    const session = await this.authRepository.findSession(claims.sid);
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !(await this.verifyHash(session.refreshTokenHash, refreshToken))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.authRepository.findUserById(claims.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.issueTokens(user, session.id);
    const rotated = await this.authRepository.rotateSession(
      session.id,
      session.refreshTokenHash,
      await argon2.hash(tokens.refreshToken),
      this.refreshTokenExpiresAt(),
    );
    if (!rotated) throw new UnauthorizedException('Refresh token has already been used');

    return tokens;
  }

  async logout(sessionId: string): Promise<void> {
    await this.authRepository.revokeSession(sessionId);
  }

  async validateAccessClaims(claims: JwtClaims): Promise<AuthenticatedUser> {
    if (claims.type !== 'access' || !claims.sub || !claims.sid) {
      throw new UnauthorizedException();
    }

    const [user, session] = await Promise.all([
      this.authRepository.findUserById(claims.sub),
      this.authRepository.findSession(claims.sid),
    ]);
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException();
    }

    return { id: user.id, sessionId: session.id, email: user.email, role: user.role };
  }

  private async issueTokens(
    user: AuthUserRecord,
    sessionId: string,
  ): Promise<AuthTokensResponseDto> {
    const accessTtl = this.configService.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const refreshTtl = this.configService.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS');
    const issuer = this.configService.getOrThrow<string>('JWT_ISSUER');
    const audience = this.configService.getOrThrow<string>('JWT_AUDIENCE');
    const baseClaims = { sub: user.id, sid: sessionId, email: user.email, role: user.role };

    const [accessToken, refreshToken] = await Promise.all([
      this.signToken(
        { ...baseClaims, type: 'access', jti: randomUUID() },
        'JWT_ACCESS_SECRET',
        accessTtl,
        issuer,
        audience,
      ),
      this.signToken(
        { ...baseClaims, type: 'refresh', jti: randomUUID() },
        'JWT_REFRESH_SECRET',
        refreshTtl,
        issuer,
        audience,
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtl,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  private signToken(
    claims: Omit<JwtClaims, 'iat' | 'exp' | 'iss' | 'aud'> & { type: JwtTokenType },
    secretKey: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET',
    expiresIn: number,
    issuer: string,
    audience: string,
  ): Promise<string> {
    return this.jwtService.signAsync(claims, {
      secret: this.configService.getOrThrow<string>(secretKey),
      expiresIn,
      issuer,
      audience,
    });
  }

  private async verifyRefreshToken(token: string): Promise<JwtClaims> {
    try {
      const claims = await this.jwtService.verifyAsync<JwtClaims>(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
        audience: this.configService.getOrThrow<string>('JWT_AUDIENCE'),
      });
      if (claims.type !== 'refresh') throw new Error('Unexpected token type');
      return claims;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private refreshTokenExpiresAt(): Date {
    return new Date(
      Date.now() + this.configService.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS') * 1000,
    );
  }

  private async verifyPassword(user: AuthUserRecord, password: string): Promise<boolean> {
    return this.verifyHash(user.passwordHash, password);
  }

  private async verifyHash(hash: string, value: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, value);
    } catch {
      return false;
    }
  }
}
