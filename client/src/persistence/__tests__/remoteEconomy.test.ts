import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RemoteEconomySnapshotResponse } from '@pirate-fruit/shared';
import { initializeRemoteSession } from '../../session/RemoteSession';
import { LivingTradeSimulator } from '../../trade/living/LivingTradeSimulator';
import type { GameStorage } from '../GameStorage';
import { resetGameStorageForTests } from '../GameStorage';
import { initializeGamePersistence } from '../GamePersistence';
import { REMOTE_DIRTY_SAVE_KEY } from '../LocalSaveMigration';
import { RemoteEconomyRepository, type FetchLike } from '../RemoteRepositories';
import { GAMEPLAY_STORAGE_KEYS } from '../storageKeys';

class MemoryStorage implements GameStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function economyPayload(tick = 42): RemoteEconomySnapshotResponse {
  return {
    ok: true,
    schemaVersion: 1,
    worldId: 'main',
    tick,
    lastTickAt: '2026-01-01T00:00:00.000Z',
    serverTime: '2026-01-01T00:00:01.000Z',
    tickIntervalMs: 5_000,
    state: {
      schemaVersion: 1,
      world: JSON.stringify({
        version: 8,
        world: { tick, cells: [{ id: 'leaf-island' }] },
      }),
    },
  };
}

afterEach(async () => {
  resetGameStorageForTests();
  await initializeRemoteSession({ enabled: false });
  vi.restoreAllMocks();
});

describe('S7 remote economy client', () => {
  it('hydrates two independent browsers from the same read-only Server snapshot', async () => {
    const payload = economyPayload();
    const calls: Array<{ url: string; method: string }> = [];
    const fetcher: FetchLike = async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return Response.json(payload);
    };
    const firstStorage = new MemoryStorage();
    const secondStorage = new MemoryStorage();

    const [first, second] = await Promise.all([
      initializeGamePersistence({
        useRemoteServer: false,
        useRemoteEconomy: true,
        apiUrl: 'https://server.example',
        fetcher,
        localStorage: firstStorage,
      }),
      initializeGamePersistence({
        useRemoteServer: false,
        useRemoteEconomy: true,
        apiUrl: 'https://server.example',
        fetcher,
        localStorage: secondStorage,
      }),
    ]);

    expect(first.activeEconomyMode).toBe('remote');
    expect(second.activeEconomyMode).toBe('remote');
    expect(first.storage.getItem(GAMEPLAY_STORAGE_KEYS.economy)).toBe(payload.state.world);
    expect(second.storage.getItem(GAMEPLAY_STORAGE_KEYS.economy)).toBe(payload.state.world);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('rejects malformed snapshots and visibly falls back without destroying Local state', async () => {
    const storage = new MemoryStorage();
    storage.setItem(GAMEPLAY_STORAGE_KEYS.economy, 'local-economy-backup');
    const statuses: string[] = [];
    const persistence = await initializeGamePersistence({
      useRemoteServer: false,
      useRemoteEconomy: true,
      apiUrl: 'https://server.example',
      fetcher: async () => Response.json({ ok: true, tick: 99 }),
      localStorage: storage,
      warn: vi.fn(),
    });
    persistence.subscribeStatus((event) => statuses.push(event.message));

    expect(persistence.activeEconomyMode).toBe('local');
    expect(persistence.storage.getItem(GAMEPLAY_STORAGE_KEYS.economy)).toBe('local-economy-backup');
    expect(statuses).toEqual([
      'Remote economy unavailable — switched to Local economy safely.',
    ]);
  });

  it('recovers from offline Local mode by replacing only the economy mirror', async () => {
    const storage = new MemoryStorage();
    storage.setItem(GAMEPLAY_STORAGE_KEYS.economy, 'offline-world');
    let online = false;
    const persistence = await initializeGamePersistence({
      useRemoteServer: false,
      useRemoteEconomy: true,
      apiUrl: 'https://server.example',
      fetcher: async () => online
        ? Response.json(economyPayload(50))
        : Response.json({ ok: false }),
      localStorage: storage,
      warn: vi.fn(),
    });
    const modes: string[] = [];
    persistence.subscribeStatus((event) => {
      if (event.scope === 'economy') modes.push(event.mode);
    });
    expect(persistence.activeEconomyMode).toBe('local');
    expect(persistence.storage.getItem(GAMEPLAY_STORAGE_KEYS.economy)).toBe('offline-world');

    online = true;
    const recovered = await persistence.refreshEconomy();
    expect(persistence.activeEconomyMode).toBe('remote');
    expect(recovered).toEqual(economyPayload(50).state);
    expect(persistence.storage.getItem(GAMEPLAY_STORAGE_KEYS.economy)).toBe(
      economyPayload(50).state.world,
    );
    expect(modes).toEqual(['local', 'remote']);
  });

  it('never sends a browser PUT for the canonical economy world', async () => {
    const calls: string[] = [];
    const repository = new RemoteEconomyRepository('https://server.example', async (_input, init) => {
      calls.push(init?.method ?? 'GET');
      return Response.json(economyPayload());
    });
    await repository.loadWorld('ignored');
    await expect(repository.saveWorld('ignored', economyPayload().state)).rejects.toThrow('read-only');
    expect(calls).toEqual(['GET']);
  });

  it('hard-stops browser ticks and stock mutations while the Server read model is active', () => {
    const simulator = new LivingTradeSimulator(true);
    const tickBefore = simulator.state.tick;
    const stockBefore = simulator.getStock('starter-island', 'fresh-fish');
    simulator.setServerReadOnly(true);
    simulator.tick();
    simulator.applyPlayerBuy('starter-island', 'fresh-fish', 2, 10);
    expect(simulator.state.tick).toBe(tickBefore);
    expect(simulator.getStock('starter-island', 'fresh-fish')).toBe(stockBefore);

    simulator.setServerReadOnly(false);
    simulator.tick();
    expect(simulator.state.tick).toBe(tickBefore + 1);
  });

  it('sets the S6 dirty marker at enqueue and clears it only after Server acknowledgement', async () => {
    const storage = new MemoryStorage();
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
    let resolveSave: ((response: Response) => void) | undefined;
    const fetcher: FetchLike = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/session/me')) return Response.json(sessionPayload);
      if (url.endsWith('/api/player/state')) return Response.json({
        ok: true,
        schemaVersion: 1,
        revision: 1,
        migrated: true,
        state: null,
        cargo: { schemaVersion: 1, cargo: null },
      });
      if (url.endsWith('/api/player/save') && init?.method === 'POST') {
        return new Promise<Response>((resolve) => { resolveSave = resolve; });
      }
      throw new Error(`Unexpected URL ${url}`);
    };
    await initializeRemoteSession({ enabled: true, apiUrl: 'https://server.example', fetcher });
    const persistence = await initializeGamePersistence({
      useRemoteServer: true,
      useRemoteEconomy: false,
      apiUrl: 'https://server.example',
      fetcher,
      localStorage: storage,
    });

    persistence.storage.setItem(GAMEPLAY_STORAGE_KEYS.progression, '{"coins":5}');
    expect(storage.getItem(REMOTE_DIRTY_SAVE_KEY)).not.toBeNull();
    const flush = persistence.flush();
    await vi.waitFor(() => expect(resolveSave).toBeTypeOf('function'));
    expect(storage.getItem(REMOTE_DIRTY_SAVE_KEY)).not.toBeNull();
    resolveSave!(Response.json({
      ok: true,
      revision: 2,
      idempotentReplay: false,
      migrated: true,
    }));
    await flush;
    expect(storage.getItem(REMOTE_DIRTY_SAVE_KEY)).toBeNull();
  });
});
