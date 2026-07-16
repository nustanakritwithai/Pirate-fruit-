import {
  PROTOCOL_VERSION,
  SERVER_SERVICE_NAME,
  SHARED_PACKAGE_VERSION,
  type HealthResponse,
  type ReadyResponse,
  type VersionResponse,
} from '@pirate-fruit/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ServerEnvironment } from '../config/environment.js';
import type { RuntimeMetrics } from '../observability/runtimeMetrics.js';
import type { DatabaseProbe } from '../persistence/database.js';

interface SystemRouteDependencies {
  environment: ServerEnvironment;
  database: DatabaseProbe;
  metrics: RuntimeMetrics;
}

function hasDebugAccess(request: FastifyRequest, environment: ServerEnvironment): boolean {
  if (environment.NODE_ENV !== 'production' && !environment.ADMIN_DEBUG_SECRET) return true;
  if (!environment.ADMIN_DEBUG_SECRET) return false;
  return request.headers['x-admin-secret'] === environment.ADMIN_DEBUG_SECRET;
}

export async function registerSystemRoutes(
  app: FastifyInstance,
  dependencies: SystemRouteDependencies,
): Promise<void> {
  const { environment, database, metrics } = dependencies;

  app.get('/health', { config: { rateLimit: false } }, async (): Promise<HealthResponse> => ({
    ok: true,
    service: SERVER_SERVICE_NAME,
    version: environment.SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
  }));

  app.get('/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const response: ReadyResponse = {
      ok: true,
      service: SERVER_SERVICE_NAME,
      version: environment.SERVER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      database: database.enabled ? 'ready' : 'disabled',
      checkedAt: new Date().toISOString(),
    };

    if (!database.enabled) return response;

    try {
      const latencyMs = await database.ping();
      reply.header('server-timing', `db;dur=${latencyMs.toFixed(1)}`);
      return response;
    } catch (error) {
      app.log.warn({ err: error }, 'database readiness probe failed');
      response.ok = false;
      response.database = 'unavailable';
      return reply.status(503).send(response);
    }
  });

  app.get('/version', { config: { rateLimit: false } }, async (): Promise<VersionResponse> => ({
    service: SERVER_SERVICE_NAME,
    version: environment.SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    sharedVersion: SHARED_PACKAGE_VERSION,
  }));

  app.get('/internal/status', async (request, reply) => {
    if (!hasDebugAccess(request, environment)) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: request.id,
        },
      });
    }

    return {
      ok: true,
      service: SERVER_SERVICE_NAME,
      version: environment.SERVER_VERSION,
      metrics: metrics.snapshot(),
      features: {
        economyServer: environment.ENABLE_ECONOMY_SERVER,
        remoteSave: environment.ENABLE_REMOTE_SAVE,
      },
    };
  });
}
