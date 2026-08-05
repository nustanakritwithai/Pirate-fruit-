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
    SERVER_VERSION: z.string().min(1).default('0.7.3'),
    RENDER_GIT_COMMIT: z.string().min(7).optional(),
    RENDER_GIT_BRANCH: z.string().min(1).optional(),
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
    ENABLE_TRADE_SERVER: booleanFromEnvironment.default(false),
    ENABLE_REALTIME: booleanFromEnvironment.default(false),
    ENABLE_QUEST_SERVER: booleanFromEnvironment.default(false),
    ENABLE_MONSTER_SERVER: booleanFromEnvironment.default(false),
    ENABLE_PROGRESSION_SERVER: booleanFromEnvironment.default(false),
    ENABLE_MULTIPLAYER: booleanFromEnvironment.default(false),
    ENABLE_PVP: booleanFromEnvironment.default(false),
    ENABLE_SHARED_WORLD_MONSTERS: booleanFromEnvironment.default(false),
    ENABLE_BOAT_WORLD: booleanFromEnvironment.default(false),
    ENABLE_CHARACTER_SELECT: booleanFromEnvironment.default(false),
    STRICT_ORIGIN_MODE: booleanFromEnvironment.default(false),
    TRUSTED_PROXY_CIDR: z.string().min(1).default('10.0.0.0/8'),
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

    if (environment.ENABLE_REMOTE_SAVE && !environment.ENABLE_REMOTE_SESSION) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_REMOTE_SESSION'],
        message: 'ENABLE_REMOTE_SESSION must be enabled before ENABLE_REMOTE_SAVE',
      });
    }

    if (environment.ENABLE_REMOTE_SAVE && !environment.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when ENABLE_REMOTE_SAVE is enabled',
      });
    }

    if (environment.ENABLE_ECONOMY_SERVER && !environment.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when ENABLE_ECONOMY_SERVER is enabled',
      });
    }

    // Trade authority ต้องมีทั้ง identity (session) และ stock authority (economy)
    if (environment.ENABLE_TRADE_SERVER && !environment.ENABLE_REMOTE_SESSION) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_REMOTE_SESSION'],
        message: 'ENABLE_REMOTE_SESSION must be enabled before ENABLE_TRADE_SERVER',
      });
    }

    if (environment.ENABLE_TRADE_SERVER && !environment.ENABLE_ECONOMY_SERVER) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_ECONOMY_SERVER'],
        message: 'ENABLE_ECONOMY_SERVER must be enabled before ENABLE_TRADE_SERVER',
      });
    }

    // Realtime push ต้องมี identity — auth ที่จังหวะ upgrade ใช้ session cookie
    if (environment.ENABLE_REALTIME && !environment.ENABLE_REMOTE_SESSION) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_REMOTE_SESSION'],
        message: 'ENABLE_REMOTE_SESSION must be enabled before ENABLE_REALTIME',
      });
    }

    // Quest authority ผูกรางวัลกับ characters.coins — ต้องมี session identity ก่อน
    if (environment.ENABLE_QUEST_SERVER && !environment.ENABLE_REMOTE_SESSION) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_REMOTE_SESSION'],
        message: 'ENABLE_REMOTE_SESSION must be enabled before ENABLE_QUEST_SERVER',
      });
    }

    // Monster reward authority ผูกรางวัลกับ characters.coins — ต้องมี session identity ก่อน
    if (environment.ENABLE_MONSTER_SERVER && !environment.ENABLE_REMOTE_SESSION) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_REMOTE_SESSION'],
        message: 'ENABLE_REMOTE_SESSION must be enabled before ENABLE_MONSTER_SERVER',
      });
    }

    // Level authority เดินเลเวลจาก EXP ที่ Server แจกเอง — แหล่ง EXP ทุกทาง
    // (quest + monster) ต้องเป็นของ Server ก่อน
    if (
      environment.ENABLE_PROGRESSION_SERVER
      && (!environment.ENABLE_QUEST_SERVER || !environment.ENABLE_MONSTER_SERVER)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_PROGRESSION_SERVER'],
        message: 'ENABLE_QUEST_SERVER and ENABLE_MONSTER_SERVER must be enabled before ENABLE_PROGRESSION_SERVER',
      });
    }

    // Multiplayer presence เดินบนช่อง WebSocket — ต้องเปิด realtime ก่อน
    if (environment.ENABLE_MULTIPLAYER && !environment.ENABLE_REALTIME) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_REALTIME'],
        message: 'ENABLE_REALTIME must be enabled before ENABLE_MULTIPLAYER',
      });
    }

    // PvP combat authority ต้องรู้ตำแหน่งผู้เล่นจาก presence ก่อน (วัดระยะโจมตี)
    if (environment.ENABLE_PVP && !environment.ENABLE_MULTIPLAYER) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_MULTIPLAYER'],
        message: 'ENABLE_MULTIPLAYER must be enabled before ENABLE_PVP',
      });
    }

    // Shared world monsters ต้องรู้ตำแหน่งผู้เล่นจาก presence (ขับ AI + วัดระยะตี)
    if (environment.ENABLE_SHARED_WORLD_MONSTERS && !environment.ENABLE_MULTIPLAYER) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_MULTIPLAYER'],
        message: 'ENABLE_MULTIPLAYER must be enabled before ENABLE_SHARED_WORLD_MONSTERS',
      });
    }

    // S18: หน้าเลือกตัวละครต้องมีระบบ session ก่อน (บัญชี/ตัวละครอยู่บน PostgreSQL)
    if (environment.ENABLE_CHARACTER_SELECT && !environment.ENABLE_REMOTE_SESSION) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_REMOTE_SESSION'],
        message: 'ENABLE_REMOTE_SESSION must be enabled before ENABLE_CHARACTER_SELECT',
      });
    }

    // Authoritative boat entities ride on authenticated multiplayer WebSocket presence.
    if (environment.ENABLE_BOAT_WORLD && !environment.ENABLE_MULTIPLAYER) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_MULTIPLAYER'],
        message: 'ENABLE_MULTIPLAYER must be enabled before ENABLE_BOAT_WORLD',
      });
    }

    // PvP level gate reads characters.level — without progression authority that value
    // comes from client saves, so the gate is bypassable.
    if (environment.ENABLE_PVP && !environment.ENABLE_PROGRESSION_SERVER) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_PVP'],
        message:
          'ENABLE_PVP=true with ENABLE_PROGRESSION_SERVER=false means the PvP level gate trusts client-reported levels. Enable ENABLE_PROGRESSION_SERVER for authoritative level enforcement.',
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

/**
 * Origin guard for unsafe routes and session creation.
 * Missing Origin is trusted by default (server-to-server / developer tools omit it;
 * browsers always send Origin). Set STRICT_ORIGIN_MODE=true in production when
 * only browser clients should reach CSRF-protected mutations.
 */
export function isTrustedOrigin(
  origin: string | undefined,
  environment: ServerEnvironment,
): boolean {
  if (environment.STRICT_ORIGIN_MODE && !origin) return false;
  return !origin || allowedOrigins(environment).has(origin);
}
