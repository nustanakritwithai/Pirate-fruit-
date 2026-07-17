import type { ApiErrorResponse } from '@pirate-fruit/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { sessionCookieName } from '../auth/sessionCookie.js';
import type { AuthenticatedSession, SessionService } from '../auth/sessionService.js';
import { allowedOrigins, type ServerEnvironment } from '../config/environment.js';
import { QuestRejectedError } from './questRepository.js';
import type { QuestService } from './questService.js';

interface QuestRouteDependencies {
  environment: ServerEnvironment;
  sessions?: SessionService;
  quests?: QuestService;
}

function apiError(
  request: FastifyRequest,
  code: string,
  message: string,
): ApiErrorResponse {
  return { ok: false, error: { code, message, requestId: request.id } };
}

/** 409 = สถานะเควสต์/คีย์ขัดแย้ง, 422 = คำขอไม่รู้จัก, 401 = ไม่มีตัวตน */
function rejectStatus(code: string): number {
  if (code === 'SESSION_REQUIRED') return 401;
  if (code === 'QUEST_NOT_FOUND' || code === 'INVALID_QUEST_REQUEST') return 422;
  return 409;
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: QuestRouteDependencies,
  requireCsrf: boolean,
): Promise<AuthenticatedSession | null> {
  const { environment } = dependencies;
  if (
    !environment.ENABLE_QUEST_SERVER
    || !environment.ENABLE_REMOTE_SESSION
    || !dependencies.sessions
    || !dependencies.quests
  ) {
    await reply
      .status(503)
      .send(apiError(request, 'FEATURE_DISABLED', 'Server quests are disabled'));
    return null;
  }
  const origin = request.headers.origin;
  if (origin && !allowedOrigins(environment).has(origin)) {
    await reply
      .status(403)
      .send(apiError(request, 'UNTRUSTED_ORIGIN', 'Request origin is not allowed'));
    return null;
  }
  const cookie = request.cookies[sessionCookieName(environment)];
  const session = await dependencies.sessions.authenticate(cookie);
  if (!session) {
    await reply
      .status(401)
      .send(apiError(request, 'SESSION_REQUIRED', 'A valid session is required'));
    return null;
  }
  if (requireCsrf && !dependencies.sessions.validateCsrf(session, request.headers['x-csrf-token'])) {
    await reply
      .status(403)
      .send(apiError(request, 'CSRF_INVALID', 'CSRF token is missing or invalid'));
    return null;
  }
  return session;
}

type QuestHandler = (characterId: string, body: unknown) => Promise<unknown>;

export async function registerQuestRoutes(
  app: FastifyInstance,
  dependencies: QuestRouteDependencies,
): Promise<void> {
  app.get('/api/quest/state', async (request, reply) => {
    const session = await authenticate(request, reply, dependencies, false);
    if (!session) return reply;
    return dependencies.quests!.state(session.record.characterId);
  });

  const mutation = (path: string, maxPerMinute: number, handler: QuestHandler): void => {
    app.post(
      path,
      { config: { rateLimit: { max: maxPerMinute, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const session = await authenticate(request, reply, dependencies, true);
        if (!session) return reply;
        try {
          return await handler(session.record.characterId, request.body);
        } catch (error) {
          if (error instanceof ZodError) {
            return reply.status(400).send(
              apiError(
                request,
                'INVALID_QUEST_REQUEST',
                error.issues[0]?.message ?? 'Invalid quest request',
              ),
            );
          }
          if (error instanceof QuestRejectedError) {
            return reply
              .status(rejectStatus(error.code))
              .send(apiError(request, error.code, error.message));
          }
          throw error;
        }
      },
    );
  };

  mutation('/api/quest/accept', 30, (characterId, body) =>
    dependencies.quests!.accept(characterId, body));
  mutation('/api/quest/abandon', 30, (characterId) =>
    dependencies.quests!.abandon(characterId));
  mutation('/api/quest/progress', 60, (characterId, body) =>
    dependencies.quests!.progress(characterId, body));
  mutation('/api/quest/claim', 30, (characterId, body) =>
    dependencies.quests!.claim(characterId, body));
}
