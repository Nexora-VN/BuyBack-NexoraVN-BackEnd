import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module.js';
import {
  NotificationsController,
  AdminNotificationSendsController,
} from './notifications.controller.js';
import { DeviceTokensController } from './device-tokens.controller.js';
import { NotificationsService } from './notifications.service.js';
import { FirebaseMessagingService } from '../../infrastructure/firebase/firebase-messaging.service.js';

@Module({
  imports: [FinanceModule],
  controllers: [
    NotificationsController,
    AdminNotificationSendsController,
    DeviceTokensController,
  ],
  providers: [NotificationsService, FirebaseMessagingService],
  exports: [NotificationsService, FirebaseMessagingService],
})
export class NotificationsModule {}
