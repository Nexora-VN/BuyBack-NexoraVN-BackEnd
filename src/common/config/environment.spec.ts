import { validateEnvironment } from './environment.js';

const validEnvironment = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://buyback:buyback@localhost:5432/buyback',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters',
  CORS_ORIGINS: 'http://localhost:3001',
  SWAGGER_ENABLED: 'false',
  LOG_LEVEL: 'silent',
};

describe('validateEnvironment', () => {
  it('parses a valid environment', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3000,
      SWAGGER_ENABLED: false,
    });
  });

  it('fails fast when DATABASE_URL is missing', () => {
    const invalidEnvironment: Record<string, unknown> = { ...validEnvironment };
    delete invalidEnvironment.DATABASE_URL;
    expect(() => validateEnvironment(invalidEnvironment)).toThrow(
      'Invalid environment configuration',
    );
  });

  it('rejects using the same secret for access and refresh tokens', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_REFRESH_SECRET: validEnvironment.JWT_ACCESS_SECRET,
      }),
    ).toThrow('JWT refresh secret must differ');
  });
});
