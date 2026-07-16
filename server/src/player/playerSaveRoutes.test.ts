import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../app.js';
import { SessionService } from '../auth/sessionService.js';
import { sessionCookieName } from '../auth/sessionCookie.js';
import type {
  NewGuestSessionRecord,
  SessionRepository,
  StoredSessionRecord,
} from '../auth/sessionRepository.js';
import { loadEnvironment } from '../config/environment.js';
import type { DatabaseProbe } from '../persistence/database.js';
import type {
  PlayerSaveMutationIdentity,
  PlayerSaveRepository,
  StoredRemotePlayerState,
} from './playerSaveRepository.js';
import { PlayerSaveService } from './playerSaveService.js';

class MemorySessions implements SessionRepository {
  readonly records = new Map<string, StoredSessionRecord>();
  async createGuest(input: NewGuestSessionRecord): Promise<StoredSessionRecord> {
    const record = { ...input };
    this.records.set(input.tokenHash, record);
    return record;
  }
  async findActiveByTokenHash(hash: string, now: Date): Promise<StoredSessionRecord | null> {
    const record = this.records.get(hash);
    return record && record.expiresAt > now ? record : null;
  }
  async touch(): Promise<void> {}
  async revoke(): Promise<boolean> { return true; }
  async countActive(): Promise<number> { return this.records.size; }
}

class RecordingPlayerSaves implements PlayerSaveRepository {
  readonly loads: string[] = [];
  readonly saves: PlayerSaveMutationIdentity[] = [];
  async load(characterId: string): Promise<StoredRemotePlayerState> {
    this.loads.push(characterId);
    return { revision: 0, migrated: false, state: null };
  }
  async save(identity: PlayerSaveMutationIdentity) {
    this.saves.push(identity);
    return { revision: 1, idempotentReplay: false, migrated: false };
  }
  async saveCheckpoint(identity: PlayerSaveMutationIdentity) {
    this.saves.push(identity);
    return { revision: 1, idempotentReplay: false, migrated: false };
  }
  async saveCargo(identity: PlayerSaveMutationIdentity) {
    this.saves.push(identity);
    return { revision: 1, idempotentReplay: false, migrated: false };
  }
  async migrate(identity: PlayerSaveMutationIdentity) {
    this.saves.push(identity);
    return { revision: 1, idempotentReplay: false, migrated: true };
  }
}

function database(): DatabaseProbe {
  return { enabled: true, ping: async () => 1, close: async () => undefined };
}

const openServers: Array<Awaited<ReturnType<typeof buildServer>>> = [];
afterEach(async () => Promise.all(openServers.splice(0).map((server) => server.close())));

describe('S6 player save API', () => {
  it('isolates browser identities and rejects Client-supplied identity', async () => {
    const environment = loadEnvironment({
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'https://game.example',
      DATABASE_URL: 'postgresql://localhost/pirate_fruit_test',
      SESSION_SECRET: 's'.repeat(32),
      ENABLE_REMOTE_SESSION: 'true',
      ENABLE_REMOTE_SAVE: 'true',
    });
    const sessions = new SessionService(new MemorySessions(), 's'.repeat(32), 30);
    const first = await sessions.createGuest();
    const second = await sessions.createGuest();
    const saves = new RecordingPlayerSaves();
    const server = await buildServer({
      environment,
      database: database(),
      sessions,
      playerSaves: new PlayerSaveService(saves),
      logger: false,
    });
    openServers.push(server);
    const cookieName = sessionCookieName(environment);

    for (const session of [first, second]) {
      const response = await server.inject({
        method: 'GET',
        url: '/api/player/state',
        headers: { cookie: `${cookieName}=${session.rawToken}` },
      });
      expect(response.statusCode).toBe(200);
    }
    expect(saves.loads).toEqual([first.record.characterId, second.record.characterId]);

    const suppliedIdentity = await server.inject({
      method: 'POST',
      url: '/api/player/save',
      headers: {
        cookie: `${cookieName}=${first.rawToken}`,
        origin: 'https://game.example',
        'x-csrf-token': first.csrfToken,
      },
      payload: {
        schemaVersion: 1,
        expectedRevision: 0,
        idempotencyKey: 'save:identity-rejection',
        characterId: second.record.characterId,
        documents: {
          schemaVersion: 1,
          checkpoint: null,
          progression: null,
          inventory: null,
          boats: null,
          loadout: null,
        },
      },
    });
    expect(suppliedIdentity.statusCode).toBe(400);
    expect(saves.saves).toHaveLength(0);
  });

  it('rejects expired sessions and abnormal checkpoints', async () => {
    let now = new Date('2026-07-16T00:00:00.000Z');
    const environment = loadEnvironment({
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'https://game.example',
      DATABASE_URL: 'postgresql://localhost/pirate_fruit_test',
      SESSION_SECRET: 's'.repeat(32),
      ENABLE_REMOTE_SESSION: 'true',
      ENABLE_REMOTE_SAVE: 'true',
    });
    const sessions = new SessionService(new MemorySessions(), 's'.repeat(32), 1, () => now);
    const issued = await sessions.createGuest();
    const saves = new RecordingPlayerSaves();
    const server = await buildServer({
      environment,
      database: database(),
      sessions,
      playerSaves: new PlayerSaveService(saves),
      logger: false,
    });
    openServers.push(server);
    const headers = {
      cookie: `${sessionCookieName(environment)}=${issued.rawToken}`,
      origin: 'https://game.example',
      'x-csrf-token': issued.csrfToken,
    };
    const invalid = await server.inject({
      method: 'PUT',
      url: '/api/player/checkpoint',
      headers,
      payload: {
        schemaVersion: 1,
        expectedRevision: 0,
        idempotencyKey: 'checkpoint:invalid-test',
        checkpoint: JSON.stringify({
          saveVersion: 4,
          islandId: 'starter-island',
          spawnId: 'desert-port',
          x: 99_999,
          y: 0,
          z: 0,
        }),
      },
    });
    expect(invalid.statusCode).toBe(422);

    now = new Date('2026-07-18T00:00:00.000Z');
    const expired = await server.inject({
      method: 'PUT',
      url: '/api/player/checkpoint',
      headers,
      payload: {
        schemaVersion: 1,
        expectedRevision: 0,
        idempotencyKey: 'checkpoint:expired-test',
        checkpoint: null,
      },
    });
    expect(expired.statusCode).toBe(401);
    expect(saves.saves).toHaveLength(0);
  });
});
