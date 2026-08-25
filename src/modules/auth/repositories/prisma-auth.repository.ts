import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type {
  AuthSessionRecord,
  AuthUserRecord,
  CreateAuthSessionData,
} from './auth.repository.js';
import { AuthRepository } from './auth.repository.js';

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, role: true, status: true },
    });
  }

  findUserById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, passwordHash: true, role: true, status: true },
    });
  }

  async createSession(data: CreateAuthSessionData): Promise<void> {
    await this.prisma.authSession.create({ data });
  }

  findSession(id: string): Promise<AuthSessionRecord | null> {
    return this.prisma.authSession.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async rotateSession(
    id: string,
    currentRefreshTokenHash: string,
    nextRefreshTokenHash: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const result = await this.prisma.authSession.updateMany({
      where: {
        id,
        refreshTokenHash: currentRefreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { refreshTokenHash: nextRefreshTokenHash, expiresAt },
    });
    return result.count === 1;
  }

  async revokeSession(id: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
