import { z } from 'zod';

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
  return value;
}, z.boolean());

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(10_000),
    DATABASE_URL: z.string().min(1).optional(),
    CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
    SERVER_VERSION: z.string().min(1).default('0.4.0'),
    SESSION_SECRET: z.string().min(32).optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    ADMIN_DEBUG_SECRET: z.string().min(32).optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),
    ENABLE_REMOTE_SESSION: booleanFromEnvironment.default(false),
    ENABLE_ECONOMY_SERVER: booleanFromEnvironment.default(false),
    ENABLE_REMOTE_SAVE: booleanFromEnvironment.default(false),
  })
  .superRefine((environment, context) => {
    const origins = environment.CLIENT_ORIGIN.split(',').map((origin) => origin.trim());
    for (const origin of origins) {
      try {
        const url = new URL(origin);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['CLIENT_ORIGIN'],
          message: `Invalid HTTP(S) origin: ${origin}`,
        });
      }
    }

    if (environment.ENABLE_REMOTE_SESSION && !environment.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when ENABLE_REMOTE_SESSION is enabled',
      });
    }

    if (environment.ENABLE_REMOTE_SESSION && !environment.SESSION_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET is required when ENABLE_REMOTE_SESSION is enabled',
      });
    }

    if (environment.NODE_ENV !== 'production') return;

    if (!environment.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production',
      });
    }

    if (!environment.SESSION_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET (32+ characters) is required in production',
      });
    }
  });

export type ServerEnvironment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  source: Record<string, string | undefined> = process.env,
): ServerEnvironment {
  const result = environmentSchema.safeParse(source);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid server environment: ${details}`);
}

export function allowedOrigins(environment: ServerEnvironment): ReadonlySet<string> {
  return new Set(
    environment.CLIENT_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}
