import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import type { RealtimeServerMessage } from '@pirate-fruit/shared';
import { buildServer } from '../app.js';
import { loadEnvironment } from '../config/environment.js';
import { createDatabaseProbe } from '../persistence/database.js';
import { SessionService } from '../auth/sessionService.js';
import type {
  NewGuestSessionRecord,
  SessionRepository,
  StoredSessionRecord,
} from '../auth/sessionRepository.js';
import { RealtimeHub } from './realtimeHub.js';

class MemorySessionRepository implements SessionRepository {
  readonly records = new Map<string, StoredSessionRecord>();

  async createGuest(input: NewGuestSessionRecord): Promise<StoredSessionRecord> {
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

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<StoredSessionRecord | null> {
    const record = this.records.get(tokenHash);
    return record && record.expiresAt > now ? record : null;
  }

  async touch(): Promise<void> {}
  async revoke(): Promise<boolean> { return true; }
  async countActive(): Promise<number> { return this.records.size; }
}

const servers: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function realtimeServer(): Promise<{
  address: string;
  hub: RealtimeHub;
  cookieHeader: string;
}> {
  const environment = loadEnvironment({
    NODE_ENV: 'test',
    CLIENT_ORIGIN: 'https://game.example',
    ENABLE_REMOTE_SESSION: 'true',
    ENABLE_REALTIME: 'true',
    SESSION_SECRET: 's'.repeat(32),
    DATABASE_URL: 'postgresql://user:password@database.internal:5432/pirate_fruit',
  });
  const sessions = new SessionService(new MemorySessionRepository(), 's'.repeat(32), 30);
  const hub = new RealtimeHub();
  const server = await buildServer({
    environment,
    database: createDatabaseProbe(),
    sessions,
    realtime: hub,
    logger: false,
  });
  servers.push(server);
  await server.listen({ host: '127.0.0.1', port: 0 });
  const address = server.addresses()[0]!;
  const issued = await sessions.createGuest();
  return {
    address: `ws://127.0.0.1:${address.port}/ws`,
    hub,
    cookieHeader: `pf_session=${issued.rawToken}`,
  };
}

function nextMessage(socket: WebSocket): Promise<RealtimeServerMessage> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => resolve(JSON.parse(String(data)) as RealtimeServerMessage));
    socket.once('close', (code) => reject(new Error(`closed ${code}`)));
    socket.once('error', reject);
  });
}

describe('S9 realtime route (real WebSocket)', () => {
  it('authenticates via the session cookie, welcomes, and pushes economy frames', async () => {
    const { address, hub, cookieHeader } = await realtimeServer();
    const socket = new WebSocket(address, { headers: { cookie: cookieHeader } });

    const welcome = await nextMessage(socket);
    expect(welcome).toMatchObject({ type: 'welcome', seq: 1, protocolVersion: 1 });

    const economyPromise = nextMessage(socket);
    hub.broadcastEconomy(42, '{"version":8}');
    const economy = await economyPromise;
    expect(economy).toMatchObject({
      type: 'economy',
      seq: 2,
      tick: 42,
      state: { world: '{"version":8}' },
    });

    const pongPromise = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'ping', sentAt: 777 }));
    expect(await pongPromise).toMatchObject({ type: 'pong', echo: 777 });

    socket.close();
  });

  it('rejects connections without a valid session cookie', async () => {
    const { address } = await realtimeServer();
    const socket = new WebSocket(address);
    const code = await new Promise<number>((resolve) => socket.once('close', resolve));
    expect(code).toBe(4401);
  });

  it('rejects untrusted origins at upgrade', async () => {
    const { address, cookieHeader } = await realtimeServer();
    const socket = new WebSocket(address, {
      headers: { cookie: cookieHeader, origin: 'https://attacker.example' },
    });
    const code = await new Promise<number>((resolve) => socket.once('close', resolve));
    expect(code).toBe(4403);
  });

  it('is absent (404 upgrade failure) when the flag is disabled', async () => {
    const environment = loadEnvironment({
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'https://game.example',
      ENABLE_REMOTE_SESSION: 'true',
      SESSION_SECRET: 's'.repeat(32),
      DATABASE_URL: 'postgresql://user:password@database.internal:5432/pirate_fruit',
    });
    const sessions = new SessionService(new MemorySessionRepository(), 's'.repeat(32), 30);
    const server = await buildServer({
      environment,
      database: createDatabaseProbe(),
      sessions,
      realtime: new RealtimeHub(),
      logger: false,
    });
    servers.push(server);
    await server.listen({ host: '127.0.0.1', port: 0 });
    const port = server.addresses()[0]!.port;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const failed = await new Promise<boolean>((resolve) => {
      socket.once('open', () => resolve(false));
      socket.once('error', () => resolve(true));
    });
    expect(failed).toBe(true);
  });
});
