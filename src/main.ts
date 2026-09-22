import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { correlation, event, requestId, safeError, safePath } from './common/observability/observability.js';
import { AppModule } from './app.module.js';

export async function bootstrap(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().addHook('onRequest', (request: { id: string; headers: Record<string, unknown>; url: string }, reply: { header: (name: string, value: string) => void }, done: () => void) => {
    request.id = requestId(request.headers['x-request-id']);
    request.headers['x-request-id'] = request.id;
    reply.header('X-Request-Id', request.id);
    correlation.run({ requestId: request.id }, () => {
      if (!request.url.includes('/health')) event('debug', 'http.started', { path: safePath(request.url) });
      done();
    });
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Thông tin không hợp lệ.', details: errors.flatMap((error) => Object.keys(error.constraints ?? {}).map((code) => ({ field: error.property, code, message: 'Giá trị không hợp lệ.' }))) }),
    }),
  );

  const origins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({ origin: origins, credentials: true, exposedHeaders: ['X-Request-Id'] });
  await app.register(helmet);

  if (config.get<boolean>('SWAGGER_ENABLED', true)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Piggy Buy Back API')
      .setDescription('Piggy Buy Back affiliate cashback backend API')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste the access token returned by POST /api/v1/auth/login',
        },
        'access-token',
      )
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  return app;
}

async function start(): Promise<void> {
  const app = await bootstrap();
  const config = app.get(ConfigService);
  await app.listen(config.get<number>('PORT', 8080), '0.0.0.0');
}

if (process.env.NODE_ENV !== 'test') {
  void start().catch((error: unknown) => {
    event('error', 'process.bootstrap.failed', { err: safeError(error) });
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    event('error', 'process.fatal', { err: safeError(error) });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    event('error', 'process.fatal', { err: safeError(reason) });
    process.exit(1);
  });
}
