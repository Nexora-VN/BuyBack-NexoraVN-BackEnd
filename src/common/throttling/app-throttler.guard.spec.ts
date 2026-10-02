import { Controller, Get, Module, Post, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter.js';
import { ThrottlingModule } from './throttling.module.js';

const env = {
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters',
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
};

@Controller('t')
class TestController {
  @Get('limited')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  limited() {
    return { ok: true };
  }

  @Post('auth/login')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  login() {
    return { ok: true };
  }

  @Get('health')
  @SkipThrottle()
  health() {
    return { ok: true };
  }
}

const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() };

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
    ThrottlingModule,
  ],
  controllers: [TestController],
  providers: [
    { provide: PinoLogger, useValue: logger },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
class TestModule {}

describe('AppThrottlerGuard', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  const token = (sub: string, type = 'access') =>
    jwt.signAsync(
      { sub, type },
      { secret: env.JWT_ACCESS_SECRET, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
    );
  const server = () => (app as INestApplication).getHttpServer() as never;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwt = new JwtService({});
  });
  afterAll(() => app.close());

  it('returns 429 with RATE_LIMITED and Retry-After after the limit', async () => {
    const auth = `Bearer ${await token('user-a')}`;
    await request(server()).get('/t/limited').set('Authorization', auth).expect(200);
    await request(server()).get('/t/limited').set('Authorization', auth).expect(200);
    const res = await request(server()).get('/t/limited').set('Authorization', auth).expect(429);
    expect((res.body as { code: string }).code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('keys authenticated requests per user, not per IP', async () => {
    const auth = `Bearer ${await token('user-b')}`;
    await request(server()).get('/t/limited').set('Authorization', auth).expect(200);
    // user-a is exhausted above; user-b from the same IP still has budget
    await request(server()).get('/t/limited').set('Authorization', auth).expect(200);
  });

  it('ignores forged tokens and falls back to IP', async () => {
    const forged = await jwt.signAsync(
      { sub: 'user-c', type: 'access' },
      { secret: 'x'.repeat(40) },
    );
    const results: number[] = [];
    for (let i = 0; i < 3; i++) {
      results.push(
        (await request(server()).get('/t/limited').set('Authorization', `Bearer ${forged}`)).status,
      );
    }
    expect(results).toEqual([200, 200, 429]);
  });

  it('keys login by email so different emails do not share a bucket', async () => {
    const post = (email: string) => request(server()).post('/t/auth/login').send({ email });
    await post('A@x.com').expect(201);
    await post('a@x.com').expect(201);
    await post(' a@X.com ').expect(429);
    await post('b@x.com').expect(201);
  });

  it('does not throttle routes marked SkipThrottle', async () => {
    for (let i = 0; i < 10; i++) await request(server()).get('/t/health').expect(200);
  });
});
