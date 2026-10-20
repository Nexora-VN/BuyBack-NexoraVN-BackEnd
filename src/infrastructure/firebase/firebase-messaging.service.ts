import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'node:fs';
import { initializeApp, cert, getApps, type ServiceAccount, type App } from 'firebase-admin/app';
import { getMessaging, type MulticastMessage, type SendResponse } from 'firebase-admin/messaging';
import { PrismaService } from '../database/prisma/prisma.service.js';
import { registerPushDispatcher } from '../../modules/notifications/notification-events.js';
import { event, safeError } from '../../common/observability/observability.js';

export interface PushNotificationPayload {
  title: string;
  body: string;
  href?: string;
  data?: Record<string, string>;
}

@Injectable()
export class FirebaseMessagingService implements OnModuleInit {
  private isConfigured = false;
  private firebaseApp: App | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.initFirebase();
    registerPushDispatcher(async (evt) => {
      await this.sendToUsers(evt.userIds, {
        title: evt.title,
        body: evt.body,
        href: evt.href,
        data: { type: evt.type },
      });
    });
  }

  private initFirebase(): void {
    try {
      const existingApps = getApps();
      if (existingApps.length > 0 && existingApps[0]) {
        this.firebaseApp = existingApps[0];
        this.isConfigured = true;
        return;
      }

      const serviceAccountKey = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_KEY');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID') || 'piggyback-7b0d9';

      let credential = null;

      if (serviceAccountKey) {
        let parsed: ServiceAccount;
        if (serviceAccountKey.trim().startsWith('{')) {
          parsed = JSON.parse(serviceAccountKey) as ServiceAccount;
        } else if (fs.existsSync(serviceAccountKey)) {
          parsed = JSON.parse(fs.readFileSync(serviceAccountKey, 'utf8')) as ServiceAccount;
        } else {
          parsed = JSON.parse(serviceAccountKey) as ServiceAccount;
        }
        credential = cert(parsed);
      } else if (clientEmail && privateKey) {
        credential = cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        });
      }

      if (credential) {
        this.firebaseApp = initializeApp({
          credential,
          projectId,
        });
        this.isConfigured = true;
        event('log', 'firebase.initialized', { projectId });
      } else {
        this.isConfigured = false;
        event('log', 'firebase.disabled', {
          reason:
            'No credentials configured (FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_CLIENT_EMAIL/PRIVATE_KEY)',
        });
      }
    } catch (error) {
      this.isConfigured = false;
      event('warn', 'firebase.init_failed', { err: safeError(error) });
    }
  }

  get isEnabled(): boolean {
    return this.isConfigured;
  }

  async sendToTokens(
    tokens: string[],
    payload: PushNotificationPayload,
  ): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
    if (!this.isConfigured || !this.firebaseApp || tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const uniqueTokens = Array.from(
      new Set(tokens.filter((t) => typeof t === 'string' && t.trim().length > 0)),
    );
    if (uniqueTokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];
    const messaging = getMessaging(this.firebaseApp);

    // Multicast allows max 500 tokens per call
    const chunkSize = 500;
    for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
      const slice = uniqueTokens.slice(i, i + chunkSize);
      try {
        const message: MulticastMessage = {
          tokens: slice,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            title: payload.title,
            body: payload.body,
            href: payload.href ?? '/app/notifications',
            ...(payload.data ?? {}),
          },
          webpush: {
            fcmOptions: {
              link: payload.href ?? '/app/notifications',
            },
            notification: {
              title: payload.title,
              body: payload.body,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
            },
          },
        };

        const response = await messaging.sendEachForMulticast(message);
        successCount += response.successCount;
        failureCount += response.failureCount;

        response.responses.forEach((resp: SendResponse, idx: number) => {
          if (!resp.success && resp.error) {
            const code = resp.error.code;
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              const badToken = slice[idx];
              if (badToken) invalidTokens.push(badToken);
            }
          }
        });
      } catch (err) {
        event('error', 'firebase.send_multicast_failed', { err: safeError(err) });
        failureCount += slice.length;
      }
    }

    return { successCount, failureCount, invalidTokens };
  }

  async sendToUsers(userIds: string[], payload: PushNotificationPayload): Promise<void> {
    if (!this.isConfigured || userIds.length === 0) return;

    try {
      const records = await this.prisma.userDeviceToken.findMany({
        where: { userId: { in: userIds } },
        select: { token: true },
      });

      if (records.length === 0) return;

      const tokens = records.map((r) => r.token);
      const { invalidTokens, successCount, failureCount } = await this.sendToTokens(
        tokens,
        payload,
      );

      event('debug', 'firebase.send_to_users_completed', {
        userCount: userIds.length,
        tokenCount: tokens.length,
        successCount,
        failureCount,
      });

      if (invalidTokens.length > 0) {
        await this.prisma.userDeviceToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
      }
    } catch (err) {
      event('warn', 'firebase.send_to_users_error', { err: safeError(err) });
    }
  }

  async sendToAllUsers(payload: PushNotificationPayload): Promise<{ recipientCount: number }> {
    if (!this.isConfigured) return { recipientCount: 0 };

    try {
      const records = await this.prisma.userDeviceToken.findMany({
        select: { token: true },
      });

      if (records.length === 0) return { recipientCount: 0 };

      const tokens = records.map((r) => r.token);
      const { invalidTokens, successCount } = await this.sendToTokens(tokens, payload);

      if (invalidTokens.length > 0) {
        await this.prisma.userDeviceToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
      }

      return { recipientCount: successCount };
    } catch (err) {
      event('warn', 'firebase.send_all_error', { err: safeError(err) });
      return { recipientCount: 0 };
    }
  }
}
