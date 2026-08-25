import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/database/prisma/prisma.service.js';
import { bootstrap } from '../src/main.js';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

describe('Authentication and Users API (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash('password123');
    app = await bootstrap();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.authSession.deleteMany();
    await prisma.userBank.deleteMany();
    await prisma.user.deleteMany();
    await prisma.user.createMany({
      data: [
        {
          email: 'admin@example.com',
          phoneNumber: '+84901234567',
          passwordHash,
          displayName: 'Admin',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        {
          email: 'user@example.com',
          phoneNumber: '+84907654321',
          passwordHash,
          displayName: 'User',
          role: 'USER',
          status: 'ACTIVE',
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string): Promise<TokenPair> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return response.body as TokenPair;
  }

  it('keeps health public and rejects invalid credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('allows an admin to run the basic user CRUD flow', async () => {
    const { accessToken } = await login('admin@example.com');
    const authorization = `Bearer ${accessToken}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', authorization)
      .send({
        email: 'NEW@example.com',
        phoneNumber: '+84908888888',
        password: 'password123',
        displayName: 'New User',
      })
      .expect(201);

    const createdBody = created.body as {
      id: string;
      email: string;
      phoneNumber: string;
      displayName: string;
    };
    expect(createdBody).toMatchObject({
      email: 'new@example.com',
      phoneNumber: '+84908888888',
      displayName: 'New User',
    });
    expect(createdBody).not.toHaveProperty('passwordHash');

    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', authorization)
      .expect(200)
      .expect((response) => {
        const body = response.body as { data: Array<{ id: string }> };
        expect(body.data).toContainEqual(expect.objectContaining({ id: createdBody.id }));
      });
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${createdBody.id}`)
      .set('Authorization', authorization)
      .send({ displayName: 'Updated User' })
      .expect(200)
      .expect((response) => {
        expect((response.body as { displayName: string }).displayName).toBe('Updated User');
      });
    await request(app.getHttpServer())
      .delete(`/api/v1/users/${createdBody.id}`)
      .set('Authorization', authorization)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/users/${createdBody.id}`)
      .set('Authorization', authorization)
      .expect(404);
  });

  it('requires authentication and an admin role for Users CRUD', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    const { accessToken } = await login('user@example.com');
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('rotates refresh tokens and revokes the session on logout', async () => {
    const firstPair = await login('admin@example.com');
    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstPair.refreshToken })
      .expect(200);
    const nextPair = refreshed.body as TokenPair;

    expect(nextPair.refreshToken).not.toBe(firstPair.refreshToken);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstPair.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${nextPair.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ email: 'admin@example.com', role: 'ADMIN' });
      });
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${nextPair.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${nextPair.accessToken}`)
      .expect(401);
  });
});
