import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.js';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service.js';

const registerDeviceTokenSchema = z.object({
  token: z.string().trim().min(10).max(512),
  deviceType: z.enum(['web', 'android', 'ios']).default('web').optional(),
});

const unregisterDeviceTokenSchema = z.object({
  token: z.string().trim().min(10).max(512),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@ApiTags('device-tokens')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('me/device-tokens')
export class DeviceTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers('user-agent') userAgent?: string,
  ) {
    const data = parse(registerDeviceTokenSchema, body);
    const safeUserAgent = userAgent ? userAgent.slice(0, 512) : null;

    await this.prisma.userDeviceToken.upsert({
      where: { token: data.token },
      update: {
        userId: user.id,
        deviceType: data.deviceType ?? 'web',
        userAgent: safeUserAgent,
        updatedAt: new Date(),
      },
      create: {
        id: randomUUID(),
        userId: user.id,
        token: data.token,
        deviceType: data.deviceType ?? 'web',
        userAgent: safeUserAgent,
      },
    });

    return { success: true };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async unregister(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const data = parse(unregisterDeviceTokenSchema, body);

    await this.prisma.userDeviceToken.deleteMany({
      where: {
        token: data.token,
        userId: user.id,
      },
    });

    return { success: true };
  }
}
