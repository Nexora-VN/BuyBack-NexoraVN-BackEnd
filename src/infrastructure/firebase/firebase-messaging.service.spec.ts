import { FirebaseMessagingService } from './firebase-messaging.service.js';
import type { PrismaService } from '../database/prisma/prisma.service.js';
import type { ConfigService } from '@nestjs/config';

describe('FirebaseMessagingService', () => {
  let service: FirebaseMessagingService;
  const userDeviceToken = {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  const prismaMock = {
    userDeviceToken,
  } as unknown as PrismaService;

  const configMock = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FirebaseMessagingService(prismaMock, configMock);
  });

  it('initializes in disabled mode when no credentials are provided', () => {
    service.onModuleInit();
    expect(service.isEnabled).toBe(false);
  });

  it('no-ops safely when sending to tokens while disabled', async () => {
    service.onModuleInit();
    const result = await service.sendToTokens(['token-1'], {
      title: 'Test',
      body: 'Body',
    });
    expect(result).toEqual({ successCount: 0, failureCount: 0, invalidTokens: [] });
  });

  it('no-ops safely when sending to users while disabled', async () => {
    service.onModuleInit();
    await expect(
      service.sendToUsers(['user-1'], {
        title: 'Test',
        body: 'Body',
      }),
    ).resolves.toBeUndefined();
    expect(userDeviceToken.findMany).not.toHaveBeenCalled();
  });
});
