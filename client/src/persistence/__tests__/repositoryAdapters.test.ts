import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CargoRepository,
  EconomyRepository,
  PersistedCargoState,
  PersistedEconomyState,
  PersistedPlayerState,
  PlayerRepository,
} from '@pirate-fruit/shared';
import type { GameStorage } from '../GameStorage';
import { resetGameStorageForTests } from '../GameStorage';
import { initializeRemoteSession } from '../../session/RemoteSession';
import { REMOTE_DIRTY_SAVE_KEY } from '../LocalSaveMigration';
import { initializeGamePersistence } from '../GamePersistence';
import {
  LocalCargoRepository,
  LocalEconomyRepository,
  LocalPlayerRepository,
} from '../LocalRepositories';
import { RemotePlayerRepository, RemoteSaveCoordinator, type FetchLike } from '../RemoteRepositories';
import { RepositoryBackedStorage } from '../RepositoryBackedStorage';
import { GAMEPLAY_STORAGE_KEYS } from '../storageKeys';

class MemoryStorage implements GameStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

afterEach(async () => {
  resetGameStorageForTests();
  await initializeRemoteSession({ enabled: false });
  vi.restoreAllMocks();
});

describe('S3 persistence repositories', () => {
  it('preserves the exact legacy JSON documents in local repositories', async () => {
    const storage = new MemoryStorage();
    storage.setItem(GAMEPLAY_STORAGE_KEYS.checkpoint, '{"x":10}');
    storage.setItem(GAMEPLAY_STORAGE_KEYS.progression, '{"level":7}');
    storage.setItem(GAMEPLAY_STORAGE_KEYS.cargo, '{"slots":[]}');
    const player = new LocalPlayerRepository(storage);
    const cargo = new LocalCargoRepository(storage);

    expect(await player.loadPlayer('offline')).toMatchObject({
      checkpoint: '{"x":10}',
      progression: '{"level":7}',
    });
    expect((await cargo.loadCargo('offline')).cargo).toBe('{"slots":[]}');

    await player.savePlayer('offline', {
      schemaVersion: 1,
      checkpoint: null,
      progression: '{"level":8}',
      inventory: null,
      boats: null,
      loadout: null,
    });
    expect(storage.getItem(GAMEPLAY_STORAGE_KEYS.checkpoint)).toBeNull();
    expect(storage.getItem(GAMEPLAY_STORAGE_KEYS.progression)).toBe('{"level":8}');
  });

  it('hydrates a synchronous mirror and flushes player, cargo, and economy writes', async () => {
    const storage = new MemoryStorage();
    storage.setItem(GAMEPLAY_STORAGE_KEYS.progression, 'progress-v1');
    storage.setItem(GAMEPLAY_STORAGE_KEYS.cargo, 'cargo-v1');
    storage.setItem(GAMEPLAY_STORAGE_KEYS.economy, 'world-v1');
    const mirror = await RepositoryBackedStorage.load(
      {
        player: new LocalPlayerRepository(storage),
        cargo: new LocalCargoRepository(storage),
        economy: new LocalEconomyRepository(storage),
      },
      { playerId: 'offline', worldId: 'global' },
      storage,
    );

    expect(mirror.getItem(GAMEPLAY_STORAGE_KEYS.progression)).toBe('progress-v1');
    mirror.setItem(GAMEPLAY_STORAGE_KEYS.progression, 'progress-v2');
    mirror.setItem(GAMEPLAY_STORAGE_KEYS.cargo, 'cargo-v2');
    mirror.removeItem(GAMEPLAY_STORAGE_KEYS.economy);
    await mirror.flush();

    expect(storage.getItem(GAMEPLAY_STORAGE_KEYS.progression)).toBe('progress-v2');
    expect(storage.getItem(GAMEPLAY_STORAGE_KEYS.cargo)).toBe('cargo-v2');
    expect(storage.getItem(GAMEPLAY_STORAGE_KEYS.economy)).toBeNull();
    expect(mirror.lastError).toBeNull();
  });

  it('debounces player writes into one latest snapshot', async () => {
    const saved: PersistedPlayerState[] = [];
    const player: PlayerRepository = {
      loadPlayer: async () => null,
      savePlayer: async (_id, state) => {
        saved.push(state);
      },
    };
    const cargo: CargoRepository = {
      loadCargo: async (): Promise<PersistedCargoState> => ({ schemaVersion: 1, cargo: null }),
      saveCargo: async () => undefined,
    };
    const economy: EconomyRepository = {
      loadWorld: async (): Promise<PersistedEconomyState | null> => null,
      saveWorld: async () => undefined,
    };
    const mirror = await RepositoryBackedStorage.load(
      { player, cargo, economy },
      { playerId: 'session', worldId: 'global' },
    );

    mirror.setItem(GAMEPLAY_STORAGE_KEYS.progression, 'first');
    mirror.setItem(GAMEPLAY_STORAGE_KEYS.progression, 'second');
    await Promise.resolve();
    expect(saved).toHaveLength(0);
    await mirror.flush();
    expect(saved.map((state) => state.progression)).toEqual(['second']);
  });

  it('clears a stale local cache entry when the hydrated remote value is empty', async () => {
    const cache = new MemoryStorage();
    cache.setItem(GAMEPLAY_STORAGE_KEYS.progression, 'stale-local-value');
    const mirror = await RepositoryBackedStorage.load(
      {
        player: { loadPlayer: async () => null, savePlayer: async () => undefined },
        cargo: {
          loadCargo: async () => ({ schemaVersion: 1, cargo: null }),
          saveCargo: async () => undefined,
        },
        economy: { loadWorld: async () => null, saveWorld: async () => undefined },
      },
      { playerId: 'session', worldId: 'global' },
      cache,
    );

    expect(mirror.getItem(GAMEPLAY_STORAGE_KEYS.progression)).toBeNull();
    expect(cache.getItem(GAMEPLAY_STORAGE_KEYS.progression)).toBeNull();
    mirror.removeItem(GAMEPLAY_STORAGE_KEYS.progression);
    expect(cache.getItem(GAMEPLAY_STORAGE_KEYS.progression)).toBeNull();
  });

  it('sends remote requests with credentials and JSON payloads', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const state: PersistedPlayerState = {
      schemaVersion: 1,
      checkpoint: null,
      progression: 'remote-progress',
      inventory: null,
      boats: null,
      loadout: null,
    };
    const fetcher: FetchLike = async (input, init) => {
      calls.push({ url: String(input), init });
      return init?.method === 'POST'
        ? new Response(JSON.stringify({
          ok: true,
          revision: 1,
          idempotentReplay: false,
          migrated: false,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({
          ok: true,
          schemaVersion: 1,
          revision: 0,
          migrated: false,
          state,
          cargo: { schemaVersion: 1, cargo: null },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
    };
    const repository = new RemotePlayerRepository('https://server.example/', fetcher);

    expect(await repository.loadPlayer('ignored')).toEqual(state);
    await repository.savePlayer('ignored', state);
    expect(calls.map((call) => call.url)).toEqual([
      'https://server.example/api/player/state',
      'https://server.example/api/player/save',
    ]);
    expect(calls.every((call) => call.init?.credentials === 'include')).toBe(true);
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
      schemaVersion: 1,
      expectedRevision: 0,
      documents: state,
    });
  });

  it('supports the idempotent legacy progress repair endpoint', async () => {
    const calls: string[] = [];
    const fetcher: FetchLike = async (input, init) => {
      calls.push(`${String(input)}:${init?.method ?? 'GET'}`);
      return init?.method === 'POST'
        ? Response.json({ ok: true, revision: 2, idempotentReplay: false, migrated: true })
        : Response.json({
          ok: true,
          schemaVersion: 1,
          revision: 1,
          migrated: true,
          state: null,
          cargo: { schemaVersion: 1, cargo: null },
        });
    };
    const coordinator = new RemoteSaveCoordinator('https://server.example', { fetcher });
    await coordinator.load();
    await expect(coordinator.resetLegacyProgress()).resolves.toMatchObject({ revision: 2 });
    expect(calls).toEqual([
      'https://server.example/api/player/state:GET',
      'https://server.example/api/player/reset-legacy-progress:POST',
    ]);
  });

  it('falls back to the local save when remote endpoints are unavailable', async () => {
    const storage = new MemoryStorage();
    storage.setItem(GAMEPLAY_STORAGE_KEYS.progression, 'local-progress');
    const warn = vi.fn();
    const fetcher: FetchLike = async () => new Response('unavailable', { status: 503 });

    const persistence = await initializeGamePersistence({
      useRemoteServer: true,
      apiUrl: 'https://server.example',
      fetcher,
      localStorage: storage,
      warn,
    });

    expect(persistence.requestedMode).toBe('remote');
    expect(persistence.activeMode).toBe('local');
    expect(persistence.storage.getItem(GAMEPLAY_STORAGE_KEYS.progression)).toBe('local-progress');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('keeps a Local copy and switches mode when an online write exhausts retries', async () => {
    const storage = new MemoryStorage();
    const remoteState: PersistedPlayerState = {
      schemaVersion: 1,
      checkpoint: null,
      progression: 'remote-progress',
      inventory: null,
      boats: null,
      loadout: null,
    };
    const sessionPayload = {
      ok: true,
      created: false,
      csrfToken: 'a'.repeat(43),
      session: {
        userId: '10000000-0000-4000-8000-000000000001',
        characterId: '20000000-0000-4000-8000-000000000001',
        characterName: 'Guest Pirate',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    };
    const fetcher: FetchLike = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/session/me')) return Response.json(sessionPayload);
      if (url.endsWith('/api/player/state')) return Response.json({
        ok: true,
        schemaVersion: 1,
        revision: 1,
        migrated: true,
        state: remoteState,
        cargo: { schemaVersion: 1, cargo: null },
      });
      if (url.endsWith('/api/player/save') && init?.method === 'POST') {
        return new Response('{}', { status: 503 });
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    await initializeRemoteSession({
      enabled: true,
      apiUrl: 'https://server.example',
      fetcher,
    });
    const persistence = await initializeGamePersistence({
      useRemoteServer: true,
      apiUrl: 'https://server.example',
      fetcher,
      localStorage: storage,
      warn: vi.fn(),
    });
    expect(persistence.activeMode).toBe('remote');
    persistence.storage.setItem(GAMEPLAY_STORAGE_KEYS.progression, 'offline-change');
    await persistence.flush();
    expect(persistence.activeMode).toBe('local');
    expect(storage.getItem(GAMEPLAY_STORAGE_KEYS.progression)).toBe('offline-change');
    expect(storage.getItem(REMOTE_DIRTY_SAVE_KEY)).not.toBeNull();
  });
});
