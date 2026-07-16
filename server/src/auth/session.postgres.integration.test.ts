import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../app.js';
import { loadEnvironment } from '../config/environment.js';
import {
  createPostgresPool,
  type DatabaseProbe,
} from '../persistence/database.js';
import { applyDatabaseMigrations, rollbackS4Database } from '../persistence/migrations.js';
import { hashSessionToken } from './sessionCrypto.js';
import { PostgresSessionRepository } from './sessionRepository.js';
import { SessionService } from './sessionService.js';

const databaseTestUrl = process.env.DATABASE_TEST_URL;
const integration = describe.runIf(Boolean(databaseTestUrl));
let pool: Pool | undefined;
let server: FastifyInstance | undefined;

function cookieHeader(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!value) throw new Error('Expected session cookie');
  return value.split(';', 1)[0]!;
}

function rawCookieToken(cookie: string): string {
  const separator = cookie.indexOf('=');
  if (separator < 0) throw new Error('Malformed session cookie');
  return cookie.slice(separator + 1);
}

integration.sequential('PostgreSQL guest sessions', () => {
  beforeAll(async () => {
    pool = createPostgresPool(databaseTestUrl!, {
      application_name: 'pirate-fruit-session-integration-tests',
      max: 2,
      statement_timeout: 30_000,
    });
    const database = await pool.query<{ name: string }>('select current_database() as name');
    if (!database.rows[0]?.name.endsWith('_test')) {
      await pool.end();
      pool = undefined;
      throw new Error('Refusing session integration reset outside a *_test database');
    }
    await rollbackS4Database(pool);
    await applyDatabaseMigrations(pool);

    const environment = loadEnvironment({
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'https://game.example',
      DATABASE_URL: databaseTestUrl!,
      SESSION_SECRET: 's'.repeat(32),
      ENABLE_REMOTE_SESSION: 'true',
    });
    const databaseProbe: DatabaseProbe = {
      enabled: true,
      ping: vi.fn(async () => 1),
      close: vi.fn(async () => undefined),
    };
    server = await buildServer({
      environment,
      database: databaseProbe,
      sessions: new SessionService(
        new PostgresSessionRepository(pool),
        environment.SESSION_SECRET!,
        environment.SESSION_TTL_DAYS,
      ),
      logger: false,
    });
  });

  afterAll(async () => {
    await server?.close();
    server = undefined;
    if (!pool) return;
    await rollbackS4Database(pool).catch(() => undefined);
    await pool.end();
    pool = undefined;
  });

  it('persists isolated, expiring, revocable sessions without raw tokens', async () => {
    const app = server!;
    const database = pool!;
    const first = await app.inject({
      method: 'POST',
      url: '/api/session/guest',
      headers: { origin: 'https://game.example' },
      payload: {},
    });
    const firstCookie = cookieHeader(first.headers['set-cookie']);
    const firstRawToken = rawCookieToken(firstCookie);
    const firstBody = first.json();
    expect(first.statusCode).toBe(201);

    const stored = await database.query<{ token_hash: string }>(
      'select token_hash from sessions where id = $1',
      [
        (
          await database.query<{ id: string }>(
            'select id from sessions where user_id = $1',
            [firstBody.session.userId],
          )
        ).rows[0]!.id,
      ],
    );
    expect(stored.rows[0]?.token_hash).toBe(hashSessionToken(firstRawToken));
    expect(stored.rows[0]?.token_hash).not.toBe(firstRawToken);

    const second = await app.inject({
      method: 'POST',
      url: '/api/session/guest',
      headers: { origin: 'https://game.example' },
      payload: {},
    });
    const secondCookie = cookieHeader(second.headers['set-cookie']);
    expect(second.json().session.userId).not.toBe(firstBody.session.userId);

    const firstMe = await app.inject({
      method: 'GET',
      url: '/api/session/me',
      headers: { cookie: firstCookie },
    });
    expect(firstMe.statusCode).toBe(200);
    expect(firstMe.json().session).toEqual(firstBody.session);

    const firstLogout = await app.inject({
      method: 'POST',
      url: '/api/session/logout',
      headers: {
        cookie: firstCookie,
        origin: 'https://game.example',
        'x-csrf-token': firstBody.csrfToken,
      },
      payload: {},
    });
    expect(firstLogout.statusCode).toBe(200);
    expect(
      await database.query('select 1 from sessions where revoked_at is not null'),
    ).toMatchObject({ rowCount: 1 });

    const secondUserId = second.json().session.userId as string;
    await database.query(
      `update sessions
          set expires_at = now() - interval '1 minute'
        where user_id = $1`,
      [secondUserId],
    );
    const expired = await app.inject({
      method: 'GET',
      url: '/api/session/me',
      headers: { cookie: secondCookie },
    });
    expect(expired.statusCode).toBe(401);
  });
});
