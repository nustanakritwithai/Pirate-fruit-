import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../app.js';
import { loadEnvironment } from '../config/environment.js';
import type { DatabaseProbe } from '../persistence/database.js';
import type {
  NewGuestSessionRecord,
  SessionRepository,
  StoredSessionRecord,
} from './sessionRepository.js';
import { SessionService } from './sessionService.js';
import { sessionCookieName, sessionCookieOptions } from './sessionCookie.js';

class MemorySessionRepository implements SessionRepository {
  readonly records = new Map<string, StoredSessionRecord>();
  readonly revoked = new Set<string>();
  readonly touched = new Set<string>();
  lastCreated?: NewGuestSessionRecord;

  async createGuest(input: NewGuestSessionRecord): Promise<StoredSessionRecord> {
    this.lastCreated = input;
    const record: StoredSessionRecord = {
      sessionId: input.sessionId,
      userId: input.userId,
      characterId: input.characterId,
      characterName: input.characterName,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    };
    this.records.set(input.tokenHash, record);
    return record;
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<StoredSessionRecord | null> {
    const record = this.records.get(tokenHash);
    return record && !this.revoked.has(record.sessionId) && record.expiresAt > now
      ? record
      : null;
  }

  async touch(sessionId: string): Promise<void> {
    this.touched.add(sessionId);
  }

  async revoke(sessionId: string): Promise<boolean> {
    if (this.revoked.has(sessionId)) return false;
    this.revoked.add(sessionId);
    return true;
  }

  async countActive(now: Date): Promise<number> {
    return [...this.records.values()].filter(
      (record) => !this.revoked.has(record.sessionId) && record.expiresAt > now,
    ).length;
  }
}

function databaseProbe(): DatabaseProbe {
  return {
    enabled: true,
    ping: vi.fn(async () => 1),
    close: vi.fn(async () => undefined),
  };
}

function sessionEnvironment(enabled = true) {
  return loadEnvironment({
    NODE_ENV: 'test',
    CLIENT_ORIGIN: 'https://game.example',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/pirate_fruit_test',
    SESSION_SECRET: 's'.repeat(32),
    ENABLE_REMOTE_SESSION: String(enabled),
  });
}

function cookieHeader(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!value) throw new Error('Expected session cookie');
  return value.split(';', 1)[0]!;
}

const openServers: Array<Awaited<ReturnType<typeof buildServer>>> = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => server.close()));
});

describe('guest session service', () => {
  it('issues opaque tokens while repositories receive only their hash', async () => {
    const repository = new MemorySessionRepository();
    const now = new Date('2026-07-16T00:00:00.000Z');
    const service = new SessionService(repository, 'x'.repeat(32), 30, () => now);

    const issued = await service.createGuest();
    expect(issued.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(repository.lastCreated?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.lastCreated?.tokenHash).not.toBe(issued.rawToken);
    expect(repository.lastCreated).toMatchObject({
      currentIslandId: 'starter-island',
      spawnId: 'starter-village',
    });

    const resumed = await service.authenticate(issued.rawToken);
    expect(resumed?.identity).toEqual(issued.identity);
    expect(resumed?.csrfToken).toBe(issued.csrfToken);
    expect(service.validateCsrf(issued, issued.csrfToken)).toBe(true);
    expect(service.validateCsrf(issued, 'wrong')).toBe(false);
    expect(repository.touched).toContain(issued.record.sessionId);
  });

  it('uses a host-only secure partitioned cookie in production', () => {
    const environment = loadEnvironment({
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://game.example',
      DATABASE_URL: 'postgresql://user:password@database.internal:5432/pirate_fruit',
      SESSION_SECRET: 's'.repeat(32),
      ENABLE_REMOTE_SESSION: 'true',
    });
    const options = sessionCookieOptions(
      environment,
      new Date(Date.now() + 60_000),
    );

    expect(sessionCookieName(environment)).toBe('__Host-pf_session');
    expect(options).toMatchObject({
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
    });
    expect(options).not.toHaveProperty('domain');
  });

  it('rejects malformed, expired, and revoked tokens', async () => {
    const repository = new MemorySessionRepository();
    let now = new Date('2026-07-16T00:00:00.000Z');
    const service = new SessionService(repository, 'x'.repeat(32), 1, () => now);
    const issued = await service.createGuest();

    expect(await service.authenticate('not-a-token')).toBeNull();
    now = new Date('2026-07-18T00:00:00.000Z');
    expect(await service.authenticate(issued.rawToken)).toBeNull();
    now = new Date('2026-07-16T01:00:00.000Z');
    expect(await service.authenticate(issued.rawToken)).not.toBeNull();
    await service.revoke(issued);
    expect(await service.authenticate(issued.rawToken)).toBeNull();
  });
});

describe('guest session API', () => {
  it('creates, resumes, protects, and revokes a browser session', async () => {
    const repository = new MemorySessionRepository();
    const service = new SessionService(repository, 's'.repeat(32), 30);
    const server = await buildServer({
      environment: sessionEnvironment(),
      database: databaseProbe(),
      sessions: service,
      logger: false,
    });
    openServers.push(server);

    const created = await server.inject({
      method: 'POST',
      url: '/api/session/guest',
      headers: { origin: 'https://game.example' },
      payload: {},
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ ok: true, created: true });
    expect(created.body).not.toContain('rawToken');
    const cookie = cookieHeader(created.headers['set-cookie']);
    expect(created.headers['set-cookie']).toContain('HttpOnly');
    const csrfToken = created.json().csrfToken as string;

    const resumed = await server.inject({
      method: 'GET',
      url: '/api/session/me',
      headers: { cookie },
    });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().session).toEqual(created.json().session);

    const reused = await server.inject({
      method: 'POST',
      url: '/api/session/guest',
      headers: { cookie, origin: 'https://game.example' },
      payload: {},
    });
    expect(reused.statusCode).toBe(200);
    expect(reused.json()).toMatchObject({ created: false, session: created.json().session });
    expect(repository.records).toHaveLength(1);

    const status = await server.inject({ method: 'GET', url: '/internal/status' });
    expect(status.json()).toMatchObject({
      activeSessions: 1,
      metrics: { sessionsCreatedTotal: 1, sessionsResumedTotal: 2 },
      features: { remoteSession: true },
    });

    const badLogout = await server.inject({
      method: 'POST',
      url: '/api/session/logout',
      headers: { cookie, origin: 'https://game.example', 'x-csrf-token': 'wrong' },
      payload: {},
    });
    expect(badLogout.statusCode).toBe(403);

    const logout = await server.inject({
      method: 'POST',
      url: '/api/session/logout',
      headers: { cookie, origin: 'https://game.example', 'x-csrf-token': csrfToken },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ ok: true });

    const expired = await server.inject({
      method: 'GET',
      url: '/api/session/me',
      headers: { cookie },
    });
    expect(expired.statusCode).toBe(401);
  });

  it('rejects untrusted origins and exposes a safe disabled state', async () => {
    const service = new SessionService(new MemorySessionRepository(), 's'.repeat(32), 30);
    const enabled = await buildServer({
      environment: sessionEnvironment(),
      database: databaseProbe(),
      sessions: service,
      logger: false,
    });
    const disabled = await buildServer({
      environment: sessionEnvironment(false),
      database: databaseProbe(),
      logger: false,
    });
    openServers.push(enabled, disabled);

    const rejected = await enabled.inject({
      method: 'POST',
      url: '/api/session/guest',
      headers: { origin: 'https://attacker.example' },
      payload: {},
    });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toMatchObject({ error: { code: 'UNTRUSTED_ORIGIN' } });

    const suppliedIdentity = await enabled.inject({
      method: 'POST',
      url: '/api/session/guest',
      headers: { origin: 'https://game.example' },
      payload: { userId: 'client-chosen-user' },
    });
    expect(suppliedIdentity.statusCode).toBe(400);

    const unavailable = await disabled.inject({ method: 'GET', url: '/api/session/me' });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ error: { code: 'FEATURE_DISABLED' } });
  });
});
