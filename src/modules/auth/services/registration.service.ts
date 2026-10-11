import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { UserRole, UserStatus } from '../../../common/domain/enums.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type { RegisterStartDto } from '../dto/register-start.dto.js';
import { RegistrationMailService } from './registration-mail.service.js';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_DELAY_MS = 60_000;
const MAX_SENDS = 4;
const MAX_ATTEMPTS = 5;

@Injectable()
export class RegistrationService {
  private lastCleanup = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: RegistrationMailService,
  ) {}

  async start(
    input: RegisterStartDto,
  ): Promise<{ expiresInSeconds: number; resendAfterSeconds: number }> {
    this.ensureConfigured();
    const email = this.normalizeEmail(input.email);
    const name = input.name.trim();
    if (name.length < 2) throw new BadRequestException('INVALID_NAME');
    await this.cleanupExpired();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException('EMAIL_ALREADY_EXISTS');
    }

    const now = new Date();
    const previous = await this.prisma.registrationChallenge.findUnique({ where: { email } });
    const active = previous && previous.expiresAt > now && !previous.consumedAt;
    if (active && (previous.resendAfter > now || previous.sendCount >= MAX_SENDS)) {
      throw new HttpException('REGISTRATION_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = this.newCode();
    const passwordHash = await argon2.hash(input.password);
    const data = {
      name,
      passwordHash,
      codeHash: this.hashCode(email, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      resendAfter: new Date(now.getTime() + RESEND_DELAY_MS),
      attempts: 0,
      sendCount: active ? previous.sendCount + 1 : 1,
      consumedAt: null,
    };
    await this.mail.sendCode(email, code);
    await this.prisma.registrationChallenge.upsert({
      where: { email },
      create: { email, ...data },
      update: data,
    });
    return { expiresInSeconds: 600, resendAfterSeconds: 60 };
  }

  async resend(
    rawEmail: string,
  ): Promise<{ expiresInSeconds: number; resendAfterSeconds: number }> {
    this.ensureConfigured();
    const email = this.normalizeEmail(rawEmail);
    const previous = await this.prisma.registrationChallenge.findUnique({ where: { email } });
    if (!previous || previous.consumedAt) throw new BadRequestException('REGISTRATION_NOT_STARTED');
    const now = new Date();
    if (previous.expiresAt <= now) throw new BadRequestException('OTP_EXPIRED');
    if (previous.resendAfter > now || previous.sendCount >= MAX_SENDS) {
      throw new HttpException('REGISTRATION_RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = this.newCode();
    const next = {
      codeHash: this.hashCode(email, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      resendAfter: new Date(now.getTime() + RESEND_DELAY_MS),
      attempts: 0,
      sendCount: previous.sendCount + 1,
    };
    await this.mail.sendCode(email, code);
    const updated = await this.prisma.registrationChallenge.updateMany({
      where: { email, codeHash: previous.codeHash, consumedAt: null },
      data: next,
    });
    if (!updated.count) throw new BadRequestException('OTP_EXPIRED');
    return { expiresInSeconds: 600, resendAfterSeconds: 60 };
  }

  async verify(rawEmail: string, code: string): Promise<void> {
    this.ensureConfigured();
    const email = this.normalizeEmail(rawEmail);
    const challenge = await this.prisma.registrationChallenge.findUnique({ where: { email } });
    const now = new Date();
    if (!challenge || challenge.expiresAt <= now || challenge.consumedAt) {
      throw new BadRequestException('OTP_EXPIRED');
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new HttpException('OTP_ATTEMPTS_EXCEEDED', HttpStatus.TOO_MANY_REQUESTS);
    }
    const supplied = Buffer.from(this.hashCode(email, code), 'hex');
    const expected = Buffer.from(challenge.codeHash, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      await this.prisma.registrationChallenge.updateMany({
        where: {
          email,
          codeHash: challenge.codeHash,
          consumedAt: null,
          attempts: { lt: MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('OTP_INVALID');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.registrationChallenge.updateMany({
          where: {
            email,
            codeHash: challenge.codeHash,
            consumedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: MAX_ATTEMPTS },
          },
          data: { consumedAt: now },
        });
        if (!claimed.count) throw new BadRequestException('OTP_EXPIRED');
        await tx.user.create({
          data: {
            email,
            phoneNumber: null,
            passwordHash: challenge.passwordHash,
            displayName: challenge.name,
            fullName: challenge.name.slice(0, 50),
            role: UserRole.USER,
            status: UserStatus.ACTIVE,
          },
        });
        await tx.registrationChallenge.delete({ where: { email } });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('EMAIL_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  private ensureConfigured(): void {
    if (!this.mail.isConfigured() || !this.config.get<string>('REGISTRATION_OTP_SECRET')) {
      throw new ServiceUnavailableException('REGISTRATION_MAIL_NOT_CONFIGURED');
    }
  }

  private hashCode(email: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('REGISTRATION_OTP_SECRET'))
      .update(`${email}:${code}`)
      .digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private newCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async cleanupExpired(): Promise<void> {
    if (Date.now() - this.lastCleanup < 60 * 60_000) return;
    this.lastCleanup = Date.now();
    await this.prisma.registrationChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
    });
  }
}
