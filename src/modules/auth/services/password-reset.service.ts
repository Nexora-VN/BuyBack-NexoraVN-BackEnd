import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { UserStatus } from '../../../common/domain/enums.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type { PasswordResetConfirmDto } from '../dto/password-reset-confirm.dto.js';
import { RegistrationMailService } from './registration-mail.service.js';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_DELAY_MS = 60_000;
const MAX_SENDS = 4;
const MAX_ATTEMPTS = 5;
const START_RESPONSE = { expiresInSeconds: 600, resendAfterSeconds: 60 };

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private lastCleanup = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: RegistrationMailService,
  ) {}

  async start(rawEmail: string): Promise<typeof START_RESPONSE> {
    this.ensureConfigured();
    const email = rawEmail.trim().toLowerCase();
    await this.cleanupExpired();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return START_RESPONSE;

    const now = new Date();
    const previous = await this.prisma.passwordResetChallenge.findUnique({ where: { email } });
    const active = previous && previous.expiresAt > now && !previous.consumedAt;
    if (active && (previous.resendAfter > now || previous.sendCount >= MAX_SENDS)) {
      return START_RESPONSE;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const data = {
      userId: user.id,
      codeHash: this.hashCode(email, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      resendAfter: new Date(now.getTime() + RESEND_DELAY_MS),
      attempts: 0,
      sendCount: active ? previous.sendCount + 1 : 1,
      consumedAt: null,
    };
    try {
      await this.mail.sendPasswordResetCode(email, code);
    } catch {
      this.logger.error('Failed to send password reset email');
      return START_RESPONSE;
    }
    await this.prisma.passwordResetChallenge.upsert({
      where: { email },
      create: { email, ...data },
      update: data,
    });
    return START_RESPONSE;
  }

  async confirm(input: PasswordResetConfirmDto): Promise<void> {
    this.ensureConfigured();
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('PASSWORDS_DO_NOT_MATCH');
    }
    const email = input.email.trim().toLowerCase();
    const challenge = await this.prisma.passwordResetChallenge.findUnique({ where: { email } });
    const now = new Date();
    if (!challenge || challenge.expiresAt <= now || challenge.consumedAt) {
      throw new BadRequestException('OTP_INVALID_OR_EXPIRED');
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('OTP_INVALID_OR_EXPIRED');
    }
    const supplied = Buffer.from(this.hashCode(email, input.code), 'hex');
    const expected = Buffer.from(challenge.codeHash, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      await this.prisma.passwordResetChallenge.updateMany({
        where: {
          email,
          codeHash: challenge.codeHash,
          consumedAt: null,
          attempts: { lt: MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('OTP_INVALID_OR_EXPIRED');
    }

    const passwordHash = await argon2.hash(input.password);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetChallenge.updateMany({
        where: {
          email,
          codeHash: challenge.codeHash,
          consumedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: MAX_ATTEMPTS },
        },
        data: { consumedAt: now },
      });
      if (!claimed.count) throw new BadRequestException('OTP_INVALID_OR_EXPIRED');
      const updated = await tx.user.updateMany({
        where: { id: challenge.userId, email, status: UserStatus.ACTIVE },
        data: { passwordHash },
      });
      if (!updated.count) throw new BadRequestException('OTP_INVALID_OR_EXPIRED');
      await tx.authSession.updateMany({
        where: { userId: challenge.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordResetChallenge.delete({ where: { email } });
    });
  }

  private ensureConfigured(): void {
    if (!this.mail.isConfigured() || !this.config.get<string>('REGISTRATION_OTP_SECRET')) {
      throw new ServiceUnavailableException('PASSWORD_RESET_MAIL_NOT_CONFIGURED');
    }
  }

  private hashCode(email: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('REGISTRATION_OTP_SECRET'))
      .update(`password-reset:${email}:${code}`)
      .digest('hex');
  }

  private async cleanupExpired(): Promise<void> {
    if (Date.now() - this.lastCleanup < 60 * 60_000) return;
    this.lastCleanup = Date.now();
    await this.prisma.passwordResetChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
    });
  }
}
