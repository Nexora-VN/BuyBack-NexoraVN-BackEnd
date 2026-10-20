import { DeviceTokensController } from './device-tokens.controller.js';
import type { PrismaService } from '../../infrastructure/database/prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.js';

describe('DeviceTokensController', () => {
  let controller: DeviceTokensController;
  const userDeviceToken = {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  };
  const prismaMock = {
    userDeviceToken,
  } as unknown as PrismaService;

  const mockUser: AuthenticatedUser = {
    id: 'user-uuid-1',
    sessionId: 'session-uuid-1',
    email: 'user@example.com',
    role: 'USER',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DeviceTokensController(prismaMock);
  });

  it('registers/upserts a device token for authenticated user', async () => {
    userDeviceToken.upsert.mockResolvedValue({});

    const result = await controller.register(
      mockUser,
      { token: 'valid-fcm-token-12345', deviceType: 'web' },
      'Mozilla/5.0 Chrome/120.0',
    );

    expect(result).toEqual({ success: true });
    expect(userDeviceToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'valid-fcm-token-12345' },
        create: expect.objectContaining({
          userId: mockUser.id,
          token: 'valid-fcm-token-12345',
          deviceType: 'web',
          userAgent: 'Mozilla/5.0 Chrome/120.0',
        }),
        update: expect.objectContaining({
          userId: mockUser.id,
          deviceType: 'web',
          userAgent: 'Mozilla/5.0 Chrome/120.0',
        }),
      }),
    );
  });

  it('rejects invalid/too short token', async () => {
    await expect(
      controller.register(mockUser, { token: 'short' }),
    ).rejects.toThrow();
  });

  it('unregisters device token for user', async () => {
    userDeviceToken.deleteMany.mockResolvedValue({ count: 1 });

    const result = await controller.unregister(mockUser, {
      token: 'valid-fcm-token-12345',
    });

    expect(result).toEqual({ success: true });
    expect(userDeviceToken.deleteMany).toHaveBeenCalledWith({
      where: {
        token: 'valid-fcm-token-12345',
        userId: mockUser.id,
      },
    });
  });
});
