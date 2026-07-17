import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { ApiErrorResponse } from '@pirate-fruit/shared';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { registerSystemRoutes } from './api/systemRoutes.js';
import { allowedOrigins, type ServerEnvironment } from './config/environment.js';
import { RuntimeMetrics } from './observability/runtimeMetrics.js';
import type { DatabaseProbe } from './persistence/database.js';
import { registerSessionRoutes } from './auth/sessionRoutes.js';
import type { SessionService } from './auth/sessionService.js';
import { registerPlayerSaveRoutes } from './player/playerSaveRoutes.js';
import type { PlayerSaveService } from './player/playerSaveService.js';
import { registerEconomyRoutes } from './economy/economyRoutes.js';
import type { EconomyRuntime } from './economy/economyRuntime.js';
import { registerTradeRoutes } from './trade/tradeRoutes.js';
import { registerRealtimeRoutes } from './realtime/realtimeRoutes.js';
import type { RealtimeHub } from './realtime/realtimeHub.js';
import type { TradeService } from './trade/tradeService.js';

export interface BuildServerOptions {
  environment: ServerEnvironment;
  database: DatabaseProbe;
  sessions?: SessionService;
  playerSaves?: PlayerSaveService;
  economy?: EconomyRuntime;
  trade?: TradeService;
  realtime?: RealtimeHub;
  logger?: FastifyServerOptions['logger'];
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const { environment, database } = options;
  const origins = allowedOrigins(environment);
  const metrics = new RuntimeMetrics();

  const app = Fastify({
    bodyLimit: 64 * 1024,
    logger: options.logger ?? {
      level: environment.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          "req.headers['x-csrf-token']",
          "res.headers['set-cookie']",
        ],
        censor: '[REDACTED]',
      },
    },
    requestIdHeader: 'x-request-id',
    trustProxy: environment.NODE_ENV === 'production',
  });

  await app.register(cors, {
    credentials: true,
    // ค่า default ของ @fastify/cors คือ GET,HEAD,POST — ไม่ครอบ PUT ทำให้เบราว์เซอร์
    // fail ตอน preflight ของ PUT /api/player/checkpoint และ /api/player/cargo
    // ("Failed to fetch" → client ตกโหมด Local ทั้งที่ server ปกติ)
    methods: ['GET', 'HEAD', 'POST', 'PUT'],
    origin(origin, callback) {
      if (!origin || origins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  });

  await app.register(cookie, { hook: 'onRequest' });

  await app.register(rateLimit, {
    global: true,
    max: environment.RATE_LIMIT_MAX,
    timeWindow: environment.RATE_LIMIT_WINDOW,
    allowList: (request) => request.url === '/health' || request.url === '/ready',
  });

  app.addHook('onResponse', async (_request, reply) => {
    metrics.recordResponse(reply.statusCode);
  });

  app.addHook('onClose', async () => {
    options.realtime?.closeAll();
    await options.economy?.stop();
    await database.close();
  });

  app.setNotFoundHandler(async (request, reply) => {
    const response: ApiErrorResponse = {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: request.id,
      },
    };
    return reply.status(404).send(response);
  });

  app.setErrorHandler(async (error, request, reply) => {
    const normalizedError = error instanceof Error ? error : new Error('Unknown request error');
    const requestedStatus =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const statusCode =
      typeof requestedStatus === 'number' && requestedStatus >= 400 && requestedStatus < 500
        ? requestedStatus
        : 500;
    const code = statusCode === 429 ? 'RATE_LIMITED' : statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';

    if (statusCode >= 500) request.log.error({ err: error }, 'request failed');
    else request.log.warn({ err: error }, 'request rejected');

    const response: ApiErrorResponse = {
      ok: false,
      error: {
        code,
        message: statusCode >= 500 ? 'Internal server error' : normalizedError.message,
        requestId: request.id,
      },
    };
    return reply.status(statusCode).send(response);
  });

  await registerSystemRoutes(app, {
    environment,
    database,
    metrics,
    sessions: options.sessions,
  });
  await registerSessionRoutes(app, {
    environment,
    metrics,
    sessions: options.sessions,
  });
  await registerPlayerSaveRoutes(app, {
    environment,
    sessions: options.sessions,
    playerSaves: options.playerSaves,
  });
  await registerEconomyRoutes(app, {
    environment,
    economy: options.economy,
  });
  await registerTradeRoutes(app, {
    environment,
    sessions: options.sessions,
    trade: options.trade,
  });
  await registerRealtimeRoutes(app, {
    environment,
    sessions: options.sessions,
    realtime: options.realtime,
  });
  return app;
}

export type ServerLogger = FastifyBaseLogger;
