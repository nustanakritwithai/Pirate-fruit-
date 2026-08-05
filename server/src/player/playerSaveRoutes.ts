import type { ApiErrorResponse } from '@pirate-fruit/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { sessionCookieName } from '../auth/sessionCookie.js';
import type { AuthenticatedSession, SessionService } from '../auth/sessionService.js';
import { isTrustedOrigin, type ServerEnvironment } from '../config/environment.js';
import {
  LocalMigrationAlreadyAppliedError,
  PlayerStateNotFoundError,
  SaveIdempotencyConflictError,
  SaveRevisionConflictError,
} from './playerSaveRepository.js';
import { PlayerSaveService } from './playerSaveService.js';
import { PlayerDocumentValidationError } from './playerState.js';

interface PlayerSaveRouteDependencies {
  environment: ServerEnvironment;
  sessions?: SessionService;
  playerSaves?: PlayerSaveService;
}

/** 5 docs × 48 KB + migrate-local cargo (6th) + JSON envelope — must exceed global bodyLimit. */
export const PLAYER_SAVE_BODY_LIMIT = 300 * 1024;

function apiError(
  request: FastifyRequest,
  code: string,
  message: string,
): ApiErrorResponse {
  return { ok: false, error: { code, message, requestId: request.id } };
}

function featureAvailable(dependencies: PlayerSaveRouteDependencies): boolean {
  return Boolean(
    dependencies.environment.ENABLE_REMOTE_SAVE
    && dependencies.environment.ENABLE_REMOTE_SESSION
    && dependencies.sessions
    && dependencies.playerSaves,
  );
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: PlayerSaveRouteDependencies,
  unsafe: boolean,
): Promise<AuthenticatedSession | null> {
  if (!featureAvailable(dependencies)) {
    await reply
      .status(503)
      .send(apiError(request, 'FEATURE_DISABLED', 'Remote player saves are disabled'));
    return null;
  }
  if (unsafe && !isTrustedOrigin(request.headers.origin, dependencies.environment)) {
    await reply
      .status(403)
      .send(apiError(request, 'UNTRUSTED_ORIGIN', 'Request origin is not allowed'));
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

async function runMutation(
  request: FastifyRequest,
  reply: FastifyReply,
  action: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.status(400).send(
        apiError(request, 'INVALID_SAVE_REQUEST', error.issues[0]?.message ?? 'Invalid request'),
      );
    }
    if (error instanceof PlayerDocumentValidationError) {
      return reply
        .status(422)
        .send(apiError(request, 'INVALID_SAVE_DOCUMENT', error.message));
    }
    if (error instanceof SaveRevisionConflictError) {
      return reply.status(409).send({
        ...apiError(request, 'STALE_SAVE_REVISION', error.message),
        currentRevision: error.currentRevision,
      });
    }
    if (error instanceof SaveIdempotencyConflictError) {
      return reply
        .status(409)
        .send(apiError(request, 'IDEMPOTENCY_KEY_REUSED', error.message));
    }
    if (error instanceof LocalMigrationAlreadyAppliedError) {
      return reply
        .status(409)
        .send(apiError(request, 'MIGRATION_ALREADY_APPLIED', error.message));
    }
    if (error instanceof PlayerStateNotFoundError) {
      return reply.status(401).send(apiError(request, 'SESSION_IDENTITY_INVALID', error.message));
    }
    throw error;
  }
}

export async function registerPlayerSaveRoutes(
  app: FastifyInstance,
  dependencies: PlayerSaveRouteDependencies,
): Promise<void> {
  app.get('/api/player/state', async (request, reply) => {
    const session = await authenticate(request, reply, dependencies, false);
    if (!session) return reply;
    return runMutation(request, reply, () =>
      dependencies.playerSaves!.load(session.record.characterId));
  });

  app.post(
    '/api/player/save',
    {
      bodyLimit: PLAYER_SAVE_BODY_LIMIT,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies, true);
      if (!session) return reply;
      return runMutation(request, reply, () =>
        dependencies.playerSaves!.savePlayer(session.record.characterId, request.body));
    },
  );

  app.put(
    '/api/player/checkpoint',
    {
      bodyLimit: PLAYER_SAVE_BODY_LIMIT,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies, true);
      if (!session) return reply;
      return runMutation(request, reply, () =>
        dependencies.playerSaves!.saveCheckpoint(session.record.characterId, request.body));
    },
  );

  app.put(
    '/api/player/cargo',
    {
      bodyLimit: PLAYER_SAVE_BODY_LIMIT,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies, true);
      if (!session) return reply;
      return runMutation(request, reply, () =>
        dependencies.playerSaves!.saveCargo(session.record.characterId, request.body));
    },
  );

  app.post(
    '/api/player/migrate-local',
    {
      bodyLimit: PLAYER_SAVE_BODY_LIMIT,
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies, true);
      if (!session) return reply;
      return runMutation(request, reply, () =>
        dependencies.playerSaves!.migrateLocal(session.record.characterId, request.body));
    },
  );

  app.post(
    '/api/player/reset-legacy-progress',
    { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const session = await authenticate(request, reply, dependencies, true);
      if (!session) return reply;
      return runMutation(request, reply, () =>
        dependencies.playerSaves!.resetLegacyProgress(session.record.characterId));
    },
  );
}
