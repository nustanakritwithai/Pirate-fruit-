import type { ApiErrorResponse } from '@pirate-fruit/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { sessionCookieName } from '../auth/sessionCookie.js';
import type { AuthenticatedSession, SessionService } from '../auth/sessionService.js';
import { rejectUntrustedOrigin } from '../auth/originGuard.js';
import type { ServerEnvironment } from '../config/environment.js';
import { TradeRejectedError } from './tradeRepository.js';
import type { TradeService } from './tradeService.js';

interface TradeRouteDependencies {
  environment: ServerEnvironment;
  sessions?: SessionService;
  trade?: TradeService;
}

function apiError(
  request: FastifyRequest,
  code: string,
  message: string,
): ApiErrorResponse {
  return { ok: false, error: { code, message, requestId: request.id } };
}

/** สถานะ HTTP ต่อโค้ดปฏิเสธธุรกิจ — 409 = สถานะโลก/กระเป๋าไม่พอ, 503 = ระบบยังไม่พร้อม */
function rejectStatus(code: string): number {
  if (code === 'ECONOMY_NOT_READY') return 503;
  if (code === 'SESSION_REQUIRED') return 401;
  if (code === 'INVALID_TRADE_REQUEST' || code === 'MARKET_UNAVAILABLE') return 422;
  return 409;
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: TradeRouteDependencies,
): Promise<AuthenticatedSession | null> {
  const { environment } = dependencies;
  if (
    !environment.ENABLE_TRADE_SERVER
    || !environment.ENABLE_REMOTE_SESSION
    || !dependencies.sessions
    || !dependencies.trade
  ) {
    await reply
      .status(503)
      .send(apiError(request, 'FEATURE_DISABLED', 'Server trade is disabled'));
    return null;
  }
  if (await rejectUntrustedOrigin(request, reply, environment, apiError)) return null;
  const cookie = request.cookies[sessionCookieName(environment)];
  const session = await dependencies.sessions.authenticate(cookie);
  if (!session) {
    await reply
      .status(401)
      .send(apiError(request, 'SESSION_REQUIRED', 'A valid session is required'));
    return null;
  }
  if (!dependencies.sessions.validateCsrf(session, request.headers['x-csrf-token'])) {
    await reply
      .status(403)
      .send(apiError(request, 'CSRF_INVALID', 'CSRF token is missing or invalid'));
    return null;
  }
  return session;
}

export async function registerTradeRoutes(
  app: FastifyInstance,
  dependencies: TradeRouteDependencies,
): Promise<void> {
  app.post(
    '/api/trade/execute',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies);
      if (!session) return reply;
      try {
        return await dependencies.trade!.execute(session.record.characterId, request.body);
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(
            apiError(
              request,
              'INVALID_TRADE_REQUEST',
              error.issues[0]?.message ?? 'Invalid trade request',
            ),
          );
        }
        if (error instanceof TradeRejectedError) {
          return reply.status(rejectStatus(error.code)).send(apiError(request, error.code, error.message));
        }
        if (error instanceof Error && error.message === 'ECONOMY_NOT_READY') {
          return reply
            .status(503)
            .send(apiError(request, 'ECONOMY_NOT_READY', 'Economy authority is not ready'));
        }
        throw error;
      }
    },
  );
}
