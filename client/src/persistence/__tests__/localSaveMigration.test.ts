import { describe, expect, it, vi } from 'vitest';
import type { GameStorage } from '../GameStorage';
import {
  clearRemoteFallbackReason,
  migrateLocalSaveIfNeeded,
  readRemoteFallbackReason,
  recordRemoteFallbackReason,
  recoverDirtyLocalSave,
  REMOTE_DIRTY_SAVE_KEY,
  REMOTE_MIGRATION_MARKER_KEY,
  REMOTE_SAVE_BACKUP_KEY,
  REMOTE_STALE_DIRTY_SAVE_KEY,
} from '../LocalSaveMigration';
import { RemoteSaveCoordinator, type FetchLike } from '../RemoteRepositories';
import { GAMEPLAY_STORAGE_KEYS } from '../storageKeys';

class MemoryStorage implements GameStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('S6 local save migration', () => {
  it('backs up, retries with one idempotency key, and migrates only once', async () => {
    const storage = new MemoryStorage();
    storage.setItem(GAMEPLAY_STORAGE_KEYS.progression, JSON.stringify({
      version: 1,
      progression: { coins: 125 },
    }));
    storage.setItem(GAMEPLAY_STORAGE_KEYS.inventory, JSON.stringify({ coins: 999_999 }));
    const postBodies: string[] = [];
    let migrated = false;
    let remoteProgression: string | null = null;
    let remoteInventory: string | null = null;
    let failedOnce = false;
    const fetcher: FetchLike = async (input, init) => {
      if (String(input).endsWith('/api/player/migrate-local')) {
        postBodies.push(String(init?.body));
        if (!failedOnce) {
          failedOnce = true;
          return new Response('{}', { status: 503 });
        }
        const request = JSON.parse(String(init?.body)) as {
          documents: { progression: string | null; inventory: string | null };
        };
        remoteProgression = request.documents.progression;
        remoteInventory = request.documents.inventory;
        migrated = true;
        return Response.json({
          ok: true,
          revision: 1,
          idempotentReplay: false,
          migrated: true,
        });
      }
      return Response.json({
        ok: true,
        schemaVersion: 1,
        revision: migrated ? 1 : 0,
        migrated,
        state: migrated ? {
          schemaVersion: 1,
          checkpoint: null,
          progression: remoteProgression,
          inventory: remoteInventory,
          boats: null,
          loadout: null,
        } : null,
        cargo: { schemaVersion: 1, cargo: null },
      });
    };
    const coordinator = new RemoteSaveCoordinator('https://save.example', {
      fetcher,
      sleep: async () => undefined,
    });

    await migrateLocalSaveIfNeeded(coordinator, storage, 'character-a');
    await migrateLocalSaveIfNeeded(coordinator, storage, 'character-a');

    expect(postBodies).toHaveLength(2);
    expect(postBodies[0]).toBe(postBodies[1]);
    expect(storage.getItem(REMOTE_SAVE_BACKUP_KEY)).not.toBeNull();
    expect(JSON.parse(storage.getItem(REMOTE_MIGRATION_MARKER_KEY)!)).toMatchObject({
      status: 'confirmed',
      characterId: 'character-a',
      revision: 1,
    });
    expect(storage.getItem(GAMEPLAY_STORAGE_KEYS.progression)).not.toBeNull();

    storage.removeItem(GAMEPLAY_STORAGE_KEYS.progression);
    storage.removeItem(GAMEPLAY_STORAGE_KEYS.inventory);
    expect((await coordinator.load(true)).state?.progression).not.toBeNull();
  });

  it('recovers an offline copy only from its unchanged remote revision', async () => {
    const storage = new MemoryStorage();
    storage.setItem(GAMEPLAY_STORAGE_KEYS.progression, 'offline-progress');
    storage.setItem(GAMEPLAY_STORAGE_KEYS.cargo, 'offline-cargo');
    storage.setItem(REMOTE_DIRTY_SAVE_KEY, JSON.stringify({ revision: 4 }));
    const bodies: unknown[] = [];
    let revision = 4;
    const fetcher: FetchLike = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/player/state')) return Response.json({
        ok: true,
        schemaVersion: 1,
        revision,
        migrated: true,
        state: null,
        cargo: { schemaVersion: 1, cargo: null },
      });
      bodies.push(JSON.parse(String(init?.body)));
      revision += 1;
      return Response.json({
        ok: true,
        revision,
        idempotentReplay: false,
        migrated: true,
      });
    };
    await recoverDirtyLocalSave(
      new RemoteSaveCoordinator('https://save.example', { fetcher }),
      storage,
      'character-a',
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ expectedRevision: 4 });
    expect(bodies[0]).not.toHaveProperty('documents.cargo');
    expect(bodies[1]).toMatchObject({ expectedRevision: 5 });
    expect(storage.getItem(REMOTE_DIRTY_SAVE_KEY)).toBeNull();
  });

  it('does not let a confirmed marker from an old Server character block migration', async () => {
    const storage = new MemoryStorage();
    storage.setItem(GAMEPLAY_STORAGE_KEYS.progression, JSON.stringify({
      version: 1,
      progression: { coins: 12_757 },
    }));
    storage.setItem(REMOTE_MIGRATION_MARKER_KEY, JSON.stringify({
      idempotencyKey: 'local-migration:old-character',
      status: 'confirmed',
      characterId: 'character-old',
      revision: 8,
    }));
    let migrated = false;
    let migrationCalls = 0;
    const fetcher: FetchLike = async (input) => {
      if (String(input).endsWith('/api/player/migrate-local')) {
        migrationCalls += 1;
        migrated = true;
        return Response.json({
          ok: true,
          revision: 1,
          idempotentReplay: false,
          migrated: true,
        });
      }
      return Response.json({
        ok: true,
        schemaVersion: 1,
        revision: migrated ? 1 : 0,
        migrated,
        state: migrated ? {
          schemaVersion: 1,
          checkpoint: null,
          progression: storage.getItem(GAMEPLAY_STORAGE_KEYS.progression),
          inventory: null,
          boats: null,
          loadout: null,
        } : null,
        cargo: { schemaVersion: 1, cargo: null },
      });
    };

    await migrateLocalSaveIfNeeded(
      new RemoteSaveCoordinator('https://save.example', { fetcher }),
      storage,
      'character-new',
    );

    expect(migrationCalls).toBe(1);
    expect(JSON.parse(storage.getItem(REMOTE_MIGRATION_MARKER_KEY)!)).toMatchObject({
      status: 'confirmed',
      characterId: 'character-new',
      revision: 1,
    });
    expect(storage.getItem(GAMEPLAY_STORAGE_KEYS.progression)).not.toBeNull();
  });

  it('archives a same-character marker when the server is ahead (in-flight write landed)', async () => {
    // ปิดแท็บระหว่าง write ลอยอยู่: server ได้ revision 5 แต่ marker ค้างที่ 4 —
    // ต้องไม่ throw ถาวร ให้ server ชนะแล้วเล่นโหมด remote ต่อ
    const storage = new MemoryStorage();
    storage.setItem(GAMEPLAY_STORAGE_KEYS.progression, 'local-progress');
    storage.setItem(REMOTE_DIRTY_SAVE_KEY, JSON.stringify({
      revision: 4,
      characterId: 'character-a',
      markedAt: Date.now(),
    }));
    const calls: string[] = [];
    const fetcher: FetchLike = async (input) => {
      calls.push(String(input));
      return Response.json({
        ok: true,
        schemaVersion: 1,
        revision: 5,
        migrated: true,
        state: {
          schemaVersion: 1,
          checkpoint: null,
          progression: 'server-progress',
          inventory: null,
          boats: null,
          loadout: null,
        },
        cargo: { schemaVersion: 1, cargo: null },
      });
    };

    await recoverDirtyLocalSave(
      new RemoteSaveCoordinator('https://save.example', { fetcher }),
      storage,
      'character-a',
    );

    // อ่านสถานะอย่างเดียว — ห้ามอัปโหลดทับของ server
    expect(calls.every((url) => url.endsWith('/api/player/state'))).toBe(true);
    expect(storage.getItem(REMOTE_DIRTY_SAVE_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(REMOTE_STALE_DIRTY_SAVE_KEY)!)).toMatchObject({
      reason: 'server-ahead',
    });
    // เซฟ local ต้องไม่ถูกลบ (ยังเป็น backup)
    expect(storage.getItem(GAMEPLAY_STORAGE_KEYS.progression)).toBe('local-progress');
  });

  it('archives an unreadable dirty marker instead of blocking every boot', async () => {
    const storage = new MemoryStorage();
    storage.setItem(REMOTE_DIRTY_SAVE_KEY, 'not-json{{');
    const fetcher = vi.fn<FetchLike>();

    await recoverDirtyLocalSave(
      new RemoteSaveCoordinator('https://save.example', { fetcher }),
      storage,
      'character-a',
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.getItem(REMOTE_DIRTY_SAVE_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(REMOTE_STALE_DIRTY_SAVE_KEY)!)).toMatchObject({
      reason: 'invalid-marker',
    });
  });

  it('records, reads, and clears the remote fallback reason', () => {
    const storage = new MemoryStorage();
    expect(readRemoteFallbackReason(storage)).toBeNull();
    recordRemoteFallbackReason(storage, new Error('Remote save unavailable (503)'));
    expect(readRemoteFallbackReason(storage)?.message).toBe('Remote save unavailable (503)');
    recordRemoteFallbackReason(storage, 'plain-string-reason');
    expect(readRemoteFallbackReason(storage)?.message).toBe('plain-string-reason');
    clearRemoteFallbackReason(storage);
    expect(readRemoteFallbackReason(storage)).toBeNull();
  });

  it('archives a dirty marker from another character instead of blocking an empty remote', async () => {
    const storage = new MemoryStorage();
    storage.setItem(REMOTE_DIRTY_SAVE_KEY, JSON.stringify({
      revision: 9,
      characterId: 'character-old',
      markedAt: Date.now(),
    }));
    const fetcher = vi.fn<FetchLike>();

    await recoverDirtyLocalSave(
      new RemoteSaveCoordinator('https://save.example', { fetcher }),
      storage,
      'character-new',
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.getItem(REMOTE_DIRTY_SAVE_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(REMOTE_STALE_DIRTY_SAVE_KEY)!)).toMatchObject({
      reason: 'different-character',
    });
  });
});
