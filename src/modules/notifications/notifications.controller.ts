import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.js';
import { UserRole } from '../../common/domain/enums.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.notifications.list(user.id, query);
  }
  @Get('unread-count') count(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user.id);
  }
  @Patch('read-all') readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.readAll(user.id);
  }
  @Patch(':id/read') read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.read(user.id, id);
  }
}

@ApiTags('notifications-admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/notifications/sends')
export class AdminNotificationSendsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@Query() query: unknown) {
    return this.notifications.sends(query);
  }
  @Post() send(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.notifications.send(user.id, body);
  }
}
