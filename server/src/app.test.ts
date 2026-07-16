import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from './app.js';
import { loadEnvironment } from './config/environment.js';
import type { DatabaseProbe } from './persistence/database.js';

function databaseProbe(overrides: Partial<DatabaseProbe> = {}): DatabaseProbe {
  return {
    enabled: true,
    ping: vi.fn(async () => 2.5),
    close: vi.fn(async () => undefined),
    ...overrides,
  };
}

const openServers: Array<Awaited<ReturnType<typeof buildServer>>> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => server.close()));
});

async function testServer(database = databaseProbe(), environmentOverrides = {}) {
  const environment = loadEnvironment({
    NODE_ENV: 'test',
    CLIENT_ORIGIN: 'https://game.example',
    SERVER_VERSION: 'test-version',
    ...environmentOverrides,
  });
  const server = await buildServer({ environment, database, logger: false });
  openServers.push(server);
  return { server, database };
}

describe('server foundation', () => {
  it('reports liveness without touching the database', async () => {
    const { server, database } = await testServer();
    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: 'pirate-fruit-server',
      version: 'test-version',
      protocolVersion: 1,
    });
    expect(database.ping).not.toHaveBeenCalled();
  });

  it('reports readiness and database timing', async () => {
    const { server, database } = await testServer();
    const response = await server.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['server-timing']).toBe('db;dur=2.5');
    expect(response.json()).toMatchObject({ ok: true, database: 'ready' });
    expect(database.ping).toHaveBeenCalledOnce();
  });

  it('returns 503 without leaking database errors', async () => {
    const { server } = await testServer(
      databaseProbe({ ping: vi.fn(async () => Promise.reject(new Error('secret host'))) }),
    );
    const response = await server.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret host');
    expect(response.json()).toMatchObject({ ok: false, database: 'unavailable' });
  });

  it('returns versioned API errors with a request id', async () => {
    const { server } = await testServer();
    const response = await server.inject({ method: 'GET', url: '/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
    expect(response.json().error.requestId).toBeTypeOf('string');
  });

  it('only emits CORS credentials for configured origins', async () => {
    const { server } = await testServer();
    const allowed = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://game.example' },
    });
    const rejected = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://attacker.example' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('https://game.example');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows browser preflight for PUT save endpoints with the CSRF header', async () => {
    // regression: ค่า default ของ @fastify/cors ไม่มี PUT ทำให้ checkpoint/cargo
    // fail ตั้งแต่ preflight ("Failed to fetch") และ client ตกโหมด Local ทั้งที่ server ปกติ
    const { server } = await testServer();
    const preflight = await server.inject({
      method: 'OPTIONS',
      url: '/api/player/cargo',
      headers: {
        origin: 'https://game.example',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type,x-csrf-token',
      },
    });

    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-methods']).toContain('PUT');
    expect(String(preflight.headers['access-control-allow-headers']).toLowerCase())
      .toContain('x-csrf-token');
  });

  it('protects internal status in production', async () => {
    const { server } = await testServer(databaseProbe(), {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:password@database.internal:5432/pirate_fruit',
      SESSION_SECRET: 's'.repeat(32),
      ADMIN_DEBUG_SECRET: 'd'.repeat(32),
    });

    const hidden = await server.inject({ method: 'GET', url: '/internal/status' });
    const allowed = await server.inject({
      method: 'GET',
      url: '/internal/status',
      headers: { 'x-admin-secret': 'd'.repeat(32) },
    });

    expect(hidden.statusCode).toBe(404);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({ ok: true, service: 'pirate-fruit-server' });
  });
});
