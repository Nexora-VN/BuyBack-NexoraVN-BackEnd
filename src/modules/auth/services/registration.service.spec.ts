import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { UserRole, UserStatus } from '../../../common/domain/enums.js';
import type { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type { RegistrationMailService } from './registration-mail.service.js';
import { RegistrationService } from './registration.service.js';

describe('email registration', () => {
  const mail = { isConfigured: jest.fn(() => true), sendCode: jest.fn() };
  const config = {
    get: jest.fn(() => 'a-dedicated-registration-secret-with-32-characters'),
    getOrThrow: jest.fn(() => 'a-dedicated-registration-secret-with-32-characters'),
  };
  const user = { findUnique: jest.fn(), create: jest.fn() };
  const registrationChallenge = {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const prisma = {
    user,
    registrationChallenge,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ user, registrationChallenge }),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    user.findUnique.mockResolvedValue(null);
    registrationChallenge.findUnique.mockResolvedValue(null);
    registrationChallenge.deleteMany.mockResolvedValue({ count: 0 });
    registrationChallenge.updateMany.mockResolvedValue({ count: 1 });
    mail.sendCode.mockResolvedValue(undefined);
  });

  it('creates an active USER only after the emailed code is verified', async () => {
    const service = new RegistrationService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      mail as unknown as RegistrationMailService,
    );
    await service.start({
      email: ' Person@Example.com ',
      name: 'Test Person',
      password: 'safe-password-123',
    });
    expect(user.create).not.toHaveBeenCalled();
    expect(mail.sendCode).toHaveBeenCalledWith(
      'person@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
    const pending = registrationChallenge.upsert.mock.calls[0][0].create;
    expect(pending.passwordHash).not.toContain('safe-password-123');
    expect(await argon2.verify(pending.passwordHash, 'safe-password-123')).toBe(true);
    registrationChallenge.findUnique.mockResolvedValue({ ...pending, consumedAt: null });
    await service.verify('PERSON@example.com', mail.sendCode.mock.calls[0][1]);
    expect(user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'person@example.com',
        phoneNumber: null,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      }),
    });
    expect(registrationChallenge.delete).toHaveBeenCalledWith({
      where: { email: 'person@example.com' },
    });
  });

  it('rejects an incorrect code without creating the user', async () => {
    const service = new RegistrationService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      mail as unknown as RegistrationMailService,
    );
    await service.start({
      email: 'person@example.com',
      name: 'Test Person',
      password: 'safe-password-123',
    });
    const pending = registrationChallenge.upsert.mock.calls[0][0].create;
    registrationChallenge.findUnique.mockResolvedValue({ ...pending, consumedAt: null });
    const correctCode = mail.sendCode.mock.calls[0][1] as string;
    const wrongCode = correctCode === '000000' ? '000001' : '000000';
    await expect(service.verify('person@example.com', wrongCode)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(registrationChallenge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { attempts: { increment: 1 } },
      }),
    );
    expect(user.create).not.toHaveBeenCalled();
  });
});
