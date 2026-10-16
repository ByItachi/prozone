import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

try {
  loadEnv({ path: new URL('../../../.env', import.meta.url) });
} catch {
  // import.meta.url is unavailable in some bundled (CJS) builds; fall back to
  // dotenv's default resolution (process.cwd()) / already-injected process.env.
  loadEnv();
}

const boolFromString = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_URL: z.string().url().default('http://localhost:4000'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  APP_NAME: z.string().default('Prozone'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  JWT_ISSUER: z.string().default('Prozone'),
  JWT_AUDIENCE: z.string().default('Prozone-web'),

  ARGON2_MEMORY_COST: z.coerce.number().default(19456),
  ARGON2_TIME_COST: z.coerce.number().default(2),
  ARGON2_PARALLELISM: z.coerce.number().default(1),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().default(5),
  LOGIN_WINDOW_MINUTES: z.coerce.number().default(10),
  ACCOUNT_LOCK_MINUTES: z.coerce.number().default(15),
  VERIFICATION_TOKEN_TTL_MINUTES: z.coerce.number().default(60),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_SECURE: boolFromString,
  SMTP_FROM: z.string().default('Prozone <noreply@prozone.st>'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  S3_ENDPOINT: z.string().default(''),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default(''),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  PAYTR_MERCHANT_ID: z.string().default(''),
  PAYTR_SECRET_KEY: z.string().default(''),
  PAYTR_WEBHOOK_SECRET: z.string().default(''),
  PAYMENT_METHODS: z.string().default('wallet,mock'),

  ACCESS_MIN_DEPOSIT: z.coerce.number().default(100),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  ADMIN_EMAIL: z.string().email().default('admin@prozone.st'),
  ADMIN_PASSWORD: z.string().min(8).default('Admin1234!'),
  SEED_ON_START: boolFromString,

  NEXTAUTH_URL: z.string().optional(),
  NEXT_PUBLIC_API_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_WS_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}