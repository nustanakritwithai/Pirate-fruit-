import type { ApiErrorResponse } from '@pirate-fruit/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { sessionCookieName } from '../auth/sessionCookie.js';
import type { AuthenticatedSession, SessionService } from '../auth/sessionService.js';
import { rejectUntrustedOrigin } from '../auth/originGuard.js';
import type { ServerEnvironment } from '../config/environment.js';
import { MonsterRejectedError } from './monsterRepository.js';
import type { MonsterService } from './monsterService.js';

interface MonsterRouteDependencies {
  environment: ServerEnvironment;
  sessions?: SessionService;
  monsters?: MonsterService;
}

function apiError(
  request: FastifyRequest,
  code: string,
  message: string,
): ApiErrorResponse {
  return { ok: false, error: { code, message, requestId: request.id } };
}

function rejectStatus(code: string): number {
  if (code === 'SESSION_REQUIRED') return 401;
  if (code === 'UNKNOWN_MONSTER' || code === 'INVALID_MONSTER_REQUEST') return 422;
  return 409;
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: MonsterRouteDependencies,
): Promise<AuthenticatedSession | null> {
  const { environment } = dependencies;
  if (
    !environment.ENABLE_MONSTER_SERVER
    || !environment.ENABLE_REMOTE_SESSION
    || !dependencies.sessions
    || !dependencies.monsters
  ) {
    await reply
      .status(503)
      .send(apiError(request, 'FEATURE_DISABLED', 'Server monster rewards are disabled'));
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

export async function registerMonsterRoutes(
  app: FastifyInstance,
  dependencies: MonsterRouteDependencies,
): Promise<void> {
  app.post(
    '/api/monster/kills',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies);
      if (!session) return reply;
      try {
        return await dependencies.monsters!.grantKills(session.record.characterId, request.body);
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.status(400).send(
            apiError(
              request,
              'INVALID_MONSTER_REQUEST',
              error.issues[0]?.message ?? 'Invalid kill report',
            ),
          );
        }
        if (error instanceof MonsterRejectedError) {
          return reply
            .status(rejectStatus(error.code))
            .send(apiError(request, error.code, error.message));
        }
        throw error;
      }
    },
  );
}
