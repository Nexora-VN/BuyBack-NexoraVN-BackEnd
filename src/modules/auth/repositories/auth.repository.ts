import type { UserRole, UserStatus } from '../../../common/domain/enums.js';

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateAuthSessionData {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export abstract class AuthRepository {
  abstract findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  abstract findUserById(id: string): Promise<AuthUserRecord | null>;
  abstract createSession(data: CreateAuthSessionData): Promise<void>;
  abstract findSession(id: string): Promise<AuthSessionRecord | null>;
  abstract rotateSession(
    id: string,
    currentRefreshTokenHash: string,
    nextRefreshTokenHash: string,
    expiresAt: Date,
  ): Promise<boolean>;
  abstract revokeSession(id: string): Promise<void>;
}
