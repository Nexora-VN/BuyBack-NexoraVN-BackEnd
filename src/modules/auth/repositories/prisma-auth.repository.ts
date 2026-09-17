import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole, UserStatus } from '../../../common/domain/enums.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type {
  AuthSessionRecord,
  AuthUserRecord,
  CreateAuthSessionData,
  CreateOAuthUserData,
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

  async createOAuthUser(data: CreateOAuthUserData): Promise<AuthUserRecord> {
    const passwordHash = await argon2.hash(randomUUID());
    for (let attempt = 0; attempt < 5; attempt++) {
      const randomSuffix = Math.floor(10000000 + Math.random() * 90000000).toString();
      const phoneNumber = `09${randomSuffix}`;
      try {
        return await this.prisma.user.create({
          data: {
            email: data.email,
            phoneNumber,
            passwordHash,
            displayName: data.displayName || data.email.split('@')[0],
            fullName: data.fullName || null,
            role: UserRole.USER,
            status: UserStatus.ACTIVE,
          },
          select: { id: true, email: true, passwordHash: true, role: true, status: true },
        });
      } catch (err: unknown) {
        const prismaError = err as { code?: string; meta?: { target?: string[] } };
        if (prismaError?.code === 'P2002' && prismaError?.meta?.target?.includes('phone_number')) {
          continue;
        }
        throw err;
      }
    }
    throw new Error('Không thể tạo số điện thoại định danh cho tài khoản OAuth');
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
