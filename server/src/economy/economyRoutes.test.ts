import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../app.js';
import { loadEnvironment } from '../config/environment.js';
import type { DatabaseProbe } from '../persistence/database.js';
import type { EconomyRuntime } from './economyRuntime.js';

const servers: Array<Awaited<ReturnType<typeof buildServer>>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('S7 economy API', () => {
  it('returns the shared snapshot and exposes no browser write endpoint', async () => {
    const economy = {
      getSnapshot: vi.fn(async () => ({
        worldId: 'main',
        tick: 42,
        document: { version: 8, world: { tick: 42, cells: [{ id: 'leaf-island' }] } },
        lastTickAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
      stop: vi.fn(async () => undefined),
    } as unknown as EconomyRuntime;
    const database: DatabaseProbe = {
      enabled: true,
      ping: vi.fn(async () => 1),
      close: vi.fn(async () => undefined),
    };
    const environment = loadEnvironment({
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'https://game.example',
      DATABASE_URL: 'postgresql://database.example/pirate_fruit_test',
      ENABLE_ECONOMY_SERVER: 'true',
    });
    const server = await buildServer({ environment, database, economy, logger: false });
    servers.push(server);

    const response = await server.inject({ method: 'GET', url: '/api/economy/world' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      ok: true,
      schemaVersion: 1,
      worldId: 'main',
      tick: 42,
      tickIntervalMs: 5_000,
      state: { schemaVersion: 1 },
    });
    expect(JSON.parse(response.json().state.world)).toMatchObject({ world: { tick: 42 } });

    const mutation = await server.inject({
      method: 'PUT',
      url: '/api/economy/world',
      payload: { state: {} },
    });
    expect(mutation.statusCode).toBe(404);
  });

  it('keeps the endpoint absent while the production-default flag is off', async () => {
    const database: DatabaseProbe = {
      enabled: false,
      ping: vi.fn(async () => 0),
      close: vi.fn(async () => undefined),
    };
    const server = await buildServer({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      database,
      logger: false,
    });
    servers.push(server);
    expect((await server.inject({ method: 'GET', url: '/api/economy/world' })).statusCode).toBe(404);
  });

  it('returns a redacted 503 when no durable snapshot can be read', async () => {
    const database: DatabaseProbe = {
      enabled: true,
      ping: vi.fn(async () => 1),
      close: vi.fn(async () => undefined),
    };
    const economy = {
      getSnapshot: vi.fn(async () => Promise.reject(new Error('postgresql://secret-host'))),
      stop: vi.fn(async () => undefined),
    } as unknown as EconomyRuntime;
    const server = await buildServer({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://database.example/pirate_fruit_test',
        ENABLE_ECONOMY_SERVER: 'true',
      }),
      database,
      economy,
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({ method: 'GET', url: '/api/economy/world' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      ok: false,
      error: { code: 'ECONOMY_UNAVAILABLE' },
    });
    expect(response.body).not.toContain('secret-host');
  });
});
