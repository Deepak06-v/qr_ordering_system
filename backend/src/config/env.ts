import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/** Strips a single trailing slash so we can safely concatenate `${baseUrl}/${hash}`. */
const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const booleanish = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    PORT: z.coerce.number().int().min(1).max(65535).default(5000),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    MONGODB_URI_TEST: z.string().min(1).optional(),

    APP_BASE_URL: z
      .string()
      .url('APP_BASE_URL must be a valid absolute URL, e.g. https://app.example.com')
      .transform(stripTrailingSlash),

    CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

    QR_HASH_BYTES: z.coerce
      .number()
      .int()
      .min(16, 'QR_HASH_BYTES must be >= 16 bytes (128 bits of entropy)')
      .max(64, 'QR_HASH_BYTES must be <= 64 bytes')
      .default(16),

    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(500).default(20),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    MONGODB_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),

    JSON_BODY_LIMIT: z.string().min(1).default('100kb'),
    BULK_SEAT_MAX: z.coerce.number().int().min(1).max(5_000).default(500),

    /**
     * Payment provider selection. Only `mock` ships in Phase 2: it simulates a
     * successful charge and moves no money. `razorpay` will be added to this
     * enum together with a real `RazorpayPaymentService` - the enum is
     * deliberately narrow so an unimplemented provider can never be selected
     * and silently fall back to the mock at runtime.
     */
    PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),

    /**
     * Artificial latency for the mock provider, so the demo can show a
     * "Processing..." state without feeling broken. Set to 0 in tests.
     */
    MOCK_PAYMENT_DELAY_MS: z.coerce.number().int().min(0).max(5_000).default(500),

    /** Prefix for the human-facing order number shown on the KDS, e.g. `FM-1042`. */
    ORDER_NUMBER_PREFIX: z
      .string()
      .trim()
      .regex(/^[A-Z]{1,8}$/, 'ORDER_NUMBER_PREFIX must be 1-8 A-Z characters')
      .default('FM'),

    LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
    LOG_PRETTY: booleanish,
  })
  .superRefine((value, ctx) => {
    if (value.CORS_ORIGIN !== '*') {
      const origins = value.CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

      if (origins.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGIN'],
          message: 'CORS_ORIGIN must be "*" or a comma separated list of origins',
        });
        return;
      }

      for (const origin of origins) {
        const parsed = z.string().url().safeParse(origin);
        if (!parsed.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['CORS_ORIGIN'],
            message: `Invalid origin "${origin}". Use "*" or a comma separated list of absolute origins.`,
          });
        }
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  // Fail loudly and early: never boot with a half-valid configuration.
  throw new Error(
    `Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill in the required values.`,
  );
}

const raw = parsed.data;

export const isProduction = raw.NODE_ENV === 'production';
export const isTest = raw.NODE_ENV === 'test';
export const isDevelopment = raw.NODE_ENV === 'development';

const corsOrigins = raw.CORS_ORIGIN.trim();

export const env = {
  ...raw,
  /** `*` or an explicit allow-list. Never falls back to reflecting the origin. */
  corsOrigins: (corsOrigins === '*' ? ['*'] : corsOrigins.split(',').map((o) => o.trim())).filter(
    Boolean,
  ),
  /** Test runs fall back to the development URI with a `-test` database suffix. */
  mongodbUri:
    isTest && raw.MONGODB_URI_TEST
      ? raw.MONGODB_URI_TEST
      : isTest
        ? raw.MONGODB_URI.replace(/\/([^/?]+)(\?|$)/, '/$1-test$2')
        : raw.MONGODB_URI,
} as const;

export type Env = typeof env;
