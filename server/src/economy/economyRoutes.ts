import {
  PERSISTED_ECONOMY_SCHEMA_VERSION,
  REMOTE_ECONOMY_SCHEMA_VERSION,
  REMOTE_ECONOMY_TICK_INTERVAL_MS,
  type RemoteEconomySnapshotResponse,
  type ApiErrorResponse,
} from '@pirate-fruit/shared';
import type { FastifyInstance } from 'fastify';
import type { ServerEnvironment } from '../config/environment.js';
import type { EconomyRuntime } from './economyRuntime.js';

export interface EconomyRouteOptions {
  environment: ServerEnvironment;
  economy?: EconomyRuntime;
}

export async function registerEconomyRoutes(
  app: FastifyInstance,
  options: EconomyRouteOptions,
): Promise<void> {
  if (!options.environment.ENABLE_ECONOMY_SERVER) return;
  if (!options.economy) throw new Error('Economy runtime is required when ENABLE_ECONOMY_SERVER=true');

  app.get('/api/economy/world', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    let snapshot: Awaited<ReturnType<EconomyRuntime['getSnapshot']>>;
    try {
      snapshot = await options.economy!.getSnapshot();
    } catch (error) {
      request.log.error({ err: error }, 'economy snapshot unavailable');
      const response: ApiErrorResponse = {
        ok: false,
        error: {
          code: 'ECONOMY_UNAVAILABLE',
          message: 'Economy snapshot is temporarily unavailable',
          requestId: request.id,
        },
      };
      return reply.status(503).send(response);
    }
    const response: RemoteEconomySnapshotResponse = {
      ok: true,
      schemaVersion: REMOTE_ECONOMY_SCHEMA_VERSION,
      worldId: snapshot.worldId,
      tick: snapshot.tick,
      lastTickAt: snapshot.lastTickAt?.toISOString() ?? null,
      serverTime: new Date().toISOString(),
      tickIntervalMs: REMOTE_ECONOMY_TICK_INTERVAL_MS,
      state: {
        schemaVersion: PERSISTED_ECONOMY_SCHEMA_VERSION,
        world: JSON.stringify(snapshot.document),
      },
    };
    return reply
      .header('cache-control', 'no-store')
      .header('etag', `W/\"economy-${snapshot.tick}\"`)
      .send(response);
  });
}
