import type { ApiErrorResponse } from '@pirate-fruit/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sessionCookieName } from '../auth/sessionCookie.js';
import type { SessionService } from '../auth/sessionService.js';
import { allowedOrigins, type ServerEnvironment } from '../config/environment.js';
import type { ProgressionService } from './progressionService.js';

interface ProgressionRouteDependencies {
  environment: ServerEnvironment;
  sessions?: SessionService;
  progression?: ProgressionService;
}

function apiError(
  request: FastifyRequest,
  code: string,
  message: string,
): ApiErrorResponse {
  return { ok: false, error: { code, message, requestId: request.id } };
}

/**
 * S12 — สถานะ progression ทางการ (level เดินจาก EXP ที่ Server แจกเอง)
 * อ่านอย่างเดียว: client ใช้ reconcile ตอนบูต — ไม่มี endpoint เขียนใด ๆ
 */
export async function registerProgressionRoutes(
  app: FastifyInstance,
  dependencies: ProgressionRouteDependencies,
): Promise<void> {
  app.get('/api/progression/state', async (request, reply) => {
    const { environment } = dependencies;
    if (
      !environment.ENABLE_PROGRESSION_SERVER
      || !environment.ENABLE_REMOTE_SESSION
      || !dependencies.sessions
      || !dependencies.progression
    ) {
      return reply
        .status(503)
        .send(apiError(request, 'FEATURE_DISABLED', 'Server progression is disabled'));
    }
    const origin = request.headers.origin;
    if (origin && !allowedOrigins(environment).has(origin)) {
      return reply
        .status(403)
        .send(apiError(request, 'UNTRUSTED_ORIGIN', 'Request origin is not allowed'));
    }
    const cookie = request.cookies[sessionCookieName(environment)];
    const session = await dependencies.sessions.authenticate(cookie);
    if (!session) {
      return reply
        .status(401)
        .send(apiError(request, 'SESSION_REQUIRED', 'A valid session is required'));
    }
    const state = await dependencies.progression.state(session.record.characterId);
    if (!state) {
      return reply
        .status(401)
        .send(apiError(request, 'SESSION_REQUIRED', 'Character identity was not found'));
    }
    return state;
  });
}
