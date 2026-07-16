import type {
  ApiErrorResponse,
  SessionLogoutResponse,
  SessionResponse,
} from '@pirate-fruit/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { allowedOrigins, type ServerEnvironment } from '../config/environment.js';
import type { RuntimeMetrics } from '../observability/runtimeMetrics.js';
import {
  expiredSessionCookieOptions,
  sessionCookieName,
  sessionCookieOptions,
} from './sessionCookie.js';
import type { AuthenticatedSession, SessionService } from './sessionService.js';

interface SessionRouteDependencies {
  environment: ServerEnvironment;
  sessions?: SessionService;
  metrics: RuntimeMetrics;
}

function apiError(
  request: FastifyRequest,
  code: string,
  message: string,
): ApiErrorResponse {
  return { ok: false, error: { code, message, requestId: request.id } };
}

function sessionResponse(
  session: AuthenticatedSession,
  created: boolean,
): SessionResponse {
  return {
    ok: true,
    created,
    session: session.identity,
    csrfToken: session.csrfToken,
  };
}

function hasTrustedOrigin(
  request: FastifyRequest,
  environment: ServerEnvironment,
): boolean {
  const origin = request.headers.origin;
  return !origin || allowedOrigins(environment).has(origin);
}

export async function registerSessionRoutes(
  app: FastifyInstance,
  dependencies: SessionRouteDependencies,
): Promise<void> {
  const { environment, metrics } = dependencies;
  const cookieName = sessionCookieName(environment);

  app.post(
    '/api/session/guest',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: { type: 'object', maxProperties: 0, additionalProperties: false },
      },
    },
    async (request, reply) => {
      const sessions = dependencies.sessions;
      if (!environment.ENABLE_REMOTE_SESSION || !sessions) {
        return reply
          .status(503)
          .send(apiError(request, 'FEATURE_DISABLED', 'Remote sessions are disabled'));
      }
      if (!hasTrustedOrigin(request, environment)) {
        metrics.recordSessionRejected();
        return reply
          .status(403)
          .send(apiError(request, 'UNTRUSTED_ORIGIN', 'Request origin is not allowed'));
      }

      const existing = await sessions.authenticate(request.cookies[cookieName]);
      if (existing) {
        metrics.recordSessionResumed();
        reply.setCookie(
          cookieName,
          request.cookies[cookieName]!,
          sessionCookieOptions(environment, existing.record.expiresAt),
        );
        return sessionResponse(existing, false);
      }

      const created = await sessions.createGuest();
      metrics.recordSessionCreated();
      reply.setCookie(
        cookieName,
        created.rawToken,
        sessionCookieOptions(environment, created.record.expiresAt),
      );
      return reply.status(201).send(sessionResponse(created, true));
    },
  );

  app.get('/api/session/me', async (request, reply) => {
    const sessions = dependencies.sessions;
    if (!environment.ENABLE_REMOTE_SESSION || !sessions) {
      return reply
        .status(503)
        .send(apiError(request, 'FEATURE_DISABLED', 'Remote sessions are disabled'));
    }

    const authenticated = await sessions.authenticate(request.cookies[cookieName]);
    if (!authenticated) {
      metrics.recordSessionRejected();
      reply.clearCookie(cookieName, expiredSessionCookieOptions(environment));
      return reply
        .status(401)
        .send(apiError(request, 'SESSION_REQUIRED', 'A valid session is required'));
    }

    metrics.recordSessionResumed();
    return sessionResponse(authenticated, false);
  });

  app.post(
    '/api/session/logout',
    {
      schema: {
        body: { type: 'object', maxProperties: 0, additionalProperties: false },
      },
    },
    async (request, reply) => {
      const sessions = dependencies.sessions;
      if (!environment.ENABLE_REMOTE_SESSION || !sessions) {
        return reply
          .status(503)
          .send(apiError(request, 'FEATURE_DISABLED', 'Remote sessions are disabled'));
      }
      if (!hasTrustedOrigin(request, environment)) {
        metrics.recordSessionRejected();
        return reply
          .status(403)
          .send(apiError(request, 'UNTRUSTED_ORIGIN', 'Request origin is not allowed'));
      }

      const authenticated = await sessions.authenticate(request.cookies[cookieName]);
      if (!authenticated) {
        metrics.recordSessionRejected();
        reply.clearCookie(cookieName, expiredSessionCookieOptions(environment));
        return reply
          .status(401)
          .send(apiError(request, 'SESSION_REQUIRED', 'A valid session is required'));
      }

      if (!sessions.validateCsrf(authenticated, request.headers['x-csrf-token'])) {
        metrics.recordSessionRejected();
        return reply
          .status(403)
          .send(apiError(request, 'CSRF_INVALID', 'CSRF token is missing or invalid'));
      }

      await sessions.revoke(authenticated);
      metrics.recordSessionRevoked();
      reply.clearCookie(cookieName, expiredSessionCookieOptions(environment));
      const response: SessionLogoutResponse = { ok: true };
      return response;
    },
  );
}
