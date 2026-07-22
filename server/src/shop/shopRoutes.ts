import type { ApiErrorResponse } from '@pirate-fruit/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { sessionCookieName } from '../auth/sessionCookie.js';
import type { SessionService } from '../auth/sessionService.js';
import { allowedOrigins, type ServerEnvironment } from '../config/environment.js';
import { ShopRejectedError, type ShopService } from './shopService.js';

interface Dependencies {
  environment: ServerEnvironment;
  sessions?: SessionService;
  shop?: ShopService;
}

function apiError(request: FastifyRequest, code: string, message: string): ApiErrorResponse {
  return { ok: false, error: { code, message, requestId: request.id } };
}

export async function registerShopRoutes(app: FastifyInstance, dependencies: Dependencies): Promise<void> {
  app.post(
    '/api/shop/purchase',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { environment, sessions, shop } = dependencies;
      if (!environment.ENABLE_PROGRESSION_SERVER || !environment.ENABLE_REMOTE_SESSION || !sessions || !shop) {
        return reply.status(503).send(apiError(request, 'FEATURE_DISABLED', 'Server shop is disabled'));
      }
      const origin = request.headers.origin;
      if (origin && !allowedOrigins(environment).has(origin)) {
        return reply.status(403).send(apiError(request, 'UNTRUSTED_ORIGIN', 'Request origin is not allowed'));
      }
      const session = await sessions.authenticate(request.cookies[sessionCookieName(environment)]);
      if (!session) return reply.status(401).send(apiError(request, 'SESSION_REQUIRED', 'A valid session is required'));
      if (!sessions.validateCsrf(session, request.headers['x-csrf-token'])) {
        return reply.status(403).send(apiError(request, 'CSRF_INVALID', 'CSRF token is missing or invalid'));
      }
      try {
        return await shop.purchase(session.record.characterId, request.body);
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(apiError(request, 'INVALID_SHOP_REQUEST', error.issues[0]?.message ?? 'Invalid request'));
        }
        if (error instanceof ShopRejectedError) {
          return reply.status(409).send(apiError(request, error.code, error.message));
        }
        throw error;
      }
    },
  );
}
