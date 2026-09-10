import { z } from 'zod';

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z.url(),
    SHOPEE_AFFILIATE_ID: z.string().regex(/^\d+$/).optional(),
    ADDLIVETAG_API_KEY: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().trim().min(10).max(2048).optional(),
    ),
    FINANCE_ENCRYPTION_KEY: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .regex(/^[a-fA-F0-9]{64}$/)
        .optional(),
    ),
    RECONCILIATION_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SETTLEMENT_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    WITHDRAWALS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
    JWT_ISSUER: z.string().min(1).default('buyback-api'),
    JWT_AUDIENCE: z.string().min(1).default('buyback-client'),
    CORS_ORIGINS: z.string().default('http://localhost:3001'),
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((environment, context) => {
    if (environment.RECONCILIATION_ENABLED && !environment.ADDLIVETAG_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['ADDLIVETAG_API_KEY'],
        message: 'Scheduled reconciliation requires ADDLIVETAG_API_KEY',
      });
    }
    if (
      (environment.RECONCILIATION_ENABLED ||
        environment.SETTLEMENT_ENABLED ||
        environment.WITHDRAWALS_ENABLED) &&
      (!environment.SHOPEE_AFFILIATE_ID || !environment.FINANCE_ENCRYPTION_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['FINANCE_ENCRYPTION_KEY'],
        message: 'Finance requires SHOPEE_AFFILIATE_ID and a 32-byte hex FINANCE_ENCRYPTION_KEY',
      });
    }
    if (environment.JWT_ACCESS_SECRET === environment.JWT_REFRESH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT refresh secret must differ from the access secret',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
  }

  return result.data;
}
