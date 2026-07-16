import { describe, expect, it } from 'vitest';
import type { GameStorage } from '../GameStorage';
import {
  migrateLocalSaveIfNeeded,
  recoverDirtyLocalSave,
  REMOTE_DIRTY_SAVE_KEY,
  REMOTE_MIGRATION_MARKER_KEY,
  REMOTE_SAVE_BACKUP_KEY,
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

    await migrateLocalSaveIfNeeded(coordinator, storage);
    await migrateLocalSaveIfNeeded(coordinator, storage);

    expect(postBodies).toHaveLength(2);
    expect(postBodies[0]).toBe(postBodies[1]);
    expect(storage.getItem(REMOTE_SAVE_BACKUP_KEY)).not.toBeNull();
    expect(JSON.parse(storage.getItem(REMOTE_MIGRATION_MARKER_KEY)!)).toMatchObject({
      status: 'confirmed',
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
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ expectedRevision: 4 });
    expect(bodies[0]).not.toHaveProperty('documents.cargo');
    expect(bodies[1]).toMatchObject({ expectedRevision: 5 });
    expect(storage.getItem(REMOTE_DIRTY_SAVE_KEY)).toBeNull();
  });
});
