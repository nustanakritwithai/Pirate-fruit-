import {
  DEFAULT_ISLAND_ID,
  DEFAULT_SPAWN_ID,
  MAX_CHARACTER_SLOTS,
  sanitizeCharacterName,
  type ApiErrorResponse,
  type CharacterDeleteResponse,
  type CharacterListResponse,
  type CharacterMutationResponse,
} from '@pirate-fruit/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { expiredSessionCookieOptions, sessionCookieName } from '../auth/sessionCookie.js';
import type { AuthenticatedSession, SessionService } from '../auth/sessionService.js';
import { rejectUntrustedOrigin } from '../auth/originGuard.js';
import type { ServerEnvironment } from '../config/environment.js';
import { toSummary, type PostgresCharacterRepository } from './characterRepository.js';

/**
 * S18 — Character Select CRUD (ปิด flag = 404/503 เหมือนไม่มีระบบนี้)
 * ทุก endpoint ต้องมี session; mutation ต้องผ่าน Origin allowlist + CSRF
 * เพดาน 3 ช่อง + ชื่อซ้ำ ตัดสินที่ Server (ห้ามเชื่อ Client)
 */

interface CharacterRouteDependencies {
  environment: ServerEnvironment;
  sessions?: SessionService;
  characters?: PostgresCharacterRepository;
  clock?: () => Date;
}

function apiError(
  request: FastifyRequest,
  code: string,
  message: string,
): ApiErrorResponse {
  return { ok: false, error: { code, message, requestId: request.id } };
}

function featureAvailable(dependencies: CharacterRouteDependencies): boolean {
  return Boolean(
    dependencies.environment.ENABLE_CHARACTER_SELECT
    && dependencies.environment.ENABLE_REMOTE_SESSION
    && dependencies.sessions
    && dependencies.characters,
  );
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: CharacterRouteDependencies,
  unsafe: boolean,
): Promise<AuthenticatedSession | null> {
  if (!featureAvailable(dependencies)) {
    await reply
      .status(503)
      .send(apiError(request, 'FEATURE_DISABLED', 'Character select is disabled'));
    return null;
  }
  if (unsafe && await rejectUntrustedOrigin(request, reply, dependencies.environment, apiError)) {
    return null;
  }
  const cookie = request.cookies[sessionCookieName(dependencies.environment)];
  const session = await dependencies.sessions!.authenticate(cookie);
  if (!session) {
    await reply
      .status(401)
      .send(apiError(request, 'SESSION_REQUIRED', 'A valid session is required'));
    return null;
  }
  if (
    unsafe
    && !dependencies.sessions!.validateCsrf(session, request.headers['x-csrf-token'])
  ) {
    await reply
      .status(403)
      .send(apiError(request, 'CSRF_INVALID', 'CSRF token is missing or invalid'));
    return null;
  }
  return session;
}

export async function registerCharacterRoutes(
  app: FastifyInstance,
  dependencies: CharacterRouteDependencies,
): Promise<void> {
  const clock = dependencies.clock ?? (() => new Date());

  app.get('/api/characters', async (request, reply) => {
    const session = await authenticate(request, reply, dependencies, false);
    if (!session) return;
    const characters = dependencies.characters!;
    const [rows, activeId] = await Promise.all([
      characters.listByUser(session.record.userId),
      characters.activeCharacterOf(session.record.sessionId),
    ]);
    // ไม่ได้เลือกไว้ → ตัวเก่าสุดคือ active โดยพฤตินัย (ตรงกับ resolution ของ session)
    const effectiveActive = activeId && rows.some((row) => row.id === activeId)
      ? activeId
      : rows[0]?.id ?? null;
    const response: CharacterListResponse = {
      ok: true,
      characters: rows.map((row) => toSummary(row, effectiveActive)),
      maxSlots: MAX_CHARACTER_SLOTS,
    };
    return response;
  });

  app.post(
    '/api/characters',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 64 } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies, true);
      if (!session) return;
      const name = sanitizeCharacterName((request.body as { name: string }).name);
      if (!name) {
        return reply
          .status(422)
          .send(apiError(request, 'INVALID_CHARACTER_NAME', 'Character name is not allowed'));
      }
      const result = await dependencies.characters!.create(
        session.record.userId,
        session.record.sessionId,
        name,
        DEFAULT_ISLAND_ID,
        DEFAULT_SPAWN_ID,
      );
      if (result.outcome === 'slots-full') {
        return reply
          .status(409)
          .send(apiError(request, 'CHARACTER_SLOTS_FULL', 'All character slots are used'));
      }
      if (result.outcome === 'name-taken') {
        return reply
          .status(409)
          .send(apiError(request, 'CHARACTER_NAME_TAKEN', 'Character name is already used'));
      }
      const response: CharacterMutationResponse = {
        ok: true,
        character: toSummary(result.character, result.character.id),
      };
      return reply.status(201).send(response);
    },
  );

  app.post(
    '/api/characters/:id/select',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: { type: 'object', maxProperties: 0, additionalProperties: false },
      },
    },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies, true);
      if (!session) return;
      const { id } = request.params as { id: string };
      const selected = await dependencies.characters!.select(
        session.record.userId,
        session.record.sessionId,
        id,
      );
      if (!selected) {
        return reply
          .status(404)
          .send(apiError(request, 'CHARACTER_NOT_FOUND', 'Character does not exist'));
      }
      return { ok: true, activeCharacterId: id };
    },
  );

  app.delete(
    '/api/characters/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies, true);
      if (!session) return;
      const { id } = request.params as { id: string };
      const result = await dependencies.characters!.delete(
        session.record.userId,
        session.record.sessionId,
        id,
        clock(),
      );
      if (result.outcome === 'not-found') {
        return reply
          .status(404)
          .send(apiError(request, 'CHARACTER_NOT_FOUND', 'Character does not exist'));
      }
      const sessionRevoked = result.remaining === 0;
      if (sessionRevoked) {
        reply.clearCookie(
          sessionCookieName(dependencies.environment),
          expiredSessionCookieOptions(dependencies.environment),
        );
      }
      const response: CharacterDeleteResponse = {
        ok: true,
        deletedId: id,
        remaining: result.remaining,
        sessionRevoked,
      };
      return response;
    },
  );
}
