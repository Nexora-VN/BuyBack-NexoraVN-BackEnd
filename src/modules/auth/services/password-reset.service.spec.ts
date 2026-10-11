import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { UserStatus } from '../../../common/domain/enums.js';
import type { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type { RegistrationMailService } from './registration-mail.service.js';
import { PasswordResetService } from './password-reset.service.js';

describe('password reset', () => {
  const mail = { isConfigured: jest.fn(() => true), sendPasswordResetCode: jest.fn() };
  const config = {
    get: jest.fn(() => 'a-dedicated-registration-secret-with-32-characters'),
    getOrThrow: jest.fn(() => 'a-dedicated-registration-secret-with-32-characters'),
  };
  const user = { findUnique: jest.fn(), updateMany: jest.fn() };
  const passwordResetChallenge = {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const authSession = { updateMany: jest.fn() };
  const prisma = {
    user,
    passwordResetChallenge,
    authSession,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ user, passwordResetChallenge, authSession }),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    user.findUnique.mockResolvedValue({ id: 'user-id', status: UserStatus.ACTIVE });
    user.updateMany.mockResolvedValue({ count: 1 });
    passwordResetChallenge.findUnique.mockResolvedValue(null);
    passwordResetChallenge.updateMany.mockResolvedValue({ count: 1 });
    passwordResetChallenge.deleteMany.mockResolvedValue({ count: 0 });
    mail.sendPasswordResetCode.mockResolvedValue(undefined);
  });

  function service(): PasswordResetService {
    return new PasswordResetService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      mail as unknown as RegistrationMailService,
    );
  }

  it('gives the same public response for an unknown email without sending mail', async () => {
    const reset = service();
    const knownResponse = await reset.start('person@example.com');
    user.findUnique.mockResolvedValue(null);
    const unknownResponse = await reset.start('missing@example.com');
    expect(unknownResponse).toEqual(knownResponse);
    expect(mail.sendPasswordResetCode).toHaveBeenCalledTimes(1);
  });

  it('sets a hashed new password only with the emailed code and revokes sessions', async () => {
    const reset = service();
    await reset.start(' PERSON@example.com ');
    const code = mail.sendPasswordResetCode.mock.calls[0][1] as string;
    expect(code).toMatch(/^\d{6}$/);
    const pending = passwordResetChallenge.upsert.mock.calls[0][0].create;
    expect(pending.email).toBe('person@example.com');
    passwordResetChallenge.findUnique.mockResolvedValue({ ...pending, consumedAt: null });
    const input = {
      email: 'person@example.com',
      code,
      password: 'new-safe-password-123',
      confirmPassword: 'new-safe-password-123',
    };
    await reset.confirm(input);
    const hashed = user.updateMany.mock.calls[0][0].data.passwordHash as string;
    expect(await argon2.verify(hashed, input.password)).toBe(true);
    expect(authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(passwordResetChallenge.delete).toHaveBeenCalledWith({
      where: { email: 'person@example.com' },
    });
  });

  it('rejects an incorrect code and mismatched passwords', async () => {
    const reset = service();
    await reset.start('person@example.com');
    const pending = passwordResetChallenge.upsert.mock.calls[0][0].create;
    passwordResetChallenge.findUnique.mockResolvedValue({ ...pending, consumedAt: null });
    const correctCode = mail.sendPasswordResetCode.mock.calls[0][1] as string;
    const wrongCode = correctCode === '000000' ? '000001' : '000000';
    await expect(
      reset.confirm({
        email: 'person@example.com',
        code: wrongCode,
        password: 'new-safe-password-123',
        confirmPassword: 'new-safe-password-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(user.updateMany).not.toHaveBeenCalled();
    await expect(
      reset.confirm({
        email: 'person@example.com',
        code: correctCode,
        password: 'new-safe-password-123',
        confirmPassword: 'different-password',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(user.updateMany).not.toHaveBeenCalled();
  });
});
