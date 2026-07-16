import {
  PERSISTED_PLAYER_SCHEMA_VERSION,
  type RemoteLocalMigrationRequest,
} from '@pirate-fruit/shared';
import type { GameStorage } from './GameStorage';
import { RemoteSaveCoordinator } from './RemoteRepositories';
import { GAMEPLAY_STORAGE_KEYS } from './storageKeys';

export const REMOTE_SAVE_BACKUP_KEY = 'pirate-fruit:remote-save-backup-v1';
export const REMOTE_MIGRATION_MARKER_KEY = 'pirate-fruit:remote-migration-v1';
export const REMOTE_DIRTY_SAVE_KEY = 'pirate-fruit:remote-dirty-save-v1';

interface MigrationMarker {
  idempotencyKey: string;
  status: 'pending' | 'confirmed';
  revision?: number;
}

function idempotencyKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `local-migration:${suffix}`;
}

function readMarker(storage: GameStorage): MigrationMarker | null {
  try {
    const value = storage.getItem(REMOTE_MIGRATION_MARKER_KEY);
    if (!value) return null;
    const marker = JSON.parse(value) as Partial<MigrationMarker>;
    if (
      typeof marker.idempotencyKey !== 'string'
      || (marker.status !== 'pending' && marker.status !== 'confirmed')
    ) return null;
    return marker as MigrationMarker;
  } catch {
    return null;
  }
}

function writeMarker(storage: GameStorage, marker: MigrationMarker): void {
  storage.setItem(REMOTE_MIGRATION_MARKER_KEY, JSON.stringify(marker));
}

function localDocuments(storage: GameStorage): RemoteLocalMigrationRequest['documents'] {
  return {
    schemaVersion: PERSISTED_PLAYER_SCHEMA_VERSION,
    checkpoint: storage.getItem(GAMEPLAY_STORAGE_KEYS.checkpoint),
    progression: storage.getItem(GAMEPLAY_STORAGE_KEYS.progression),
    inventory: storage.getItem(GAMEPLAY_STORAGE_KEYS.inventory),
    boats: storage.getItem(GAMEPLAY_STORAGE_KEYS.boats),
    loadout: storage.getItem(GAMEPLAY_STORAGE_KEYS.loadout),
    cargo: storage.getItem(GAMEPLAY_STORAGE_KEYS.cargo),
  };
}

function hasLocalSave(documents: RemoteLocalMigrationRequest['documents']): boolean {
  return Object.entries(documents).some(([key, value]) => key !== 'schemaVersion' && value !== null);
}

/**
 * Imports a legacy browser save exactly once. The independent backup and pending marker are
 * written before the request, so a retry reuses the same idempotency key. Gameplay keys are
 * deliberately retained until the confirmed remote state hydrates the repository mirror.
 */
export async function migrateLocalSaveIfNeeded(
  coordinator: RemoteSaveCoordinator,
  storage: GameStorage,
): Promise<void> {
  const remote = await coordinator.load();
  if (remote.migrated) {
    const marker = readMarker(storage);
    if (marker?.status === 'pending') {
      writeMarker(storage, {
        idempotencyKey: marker.idempotencyKey,
        status: 'confirmed',
        revision: remote.revision,
      });
    }
    return;
  }
  if (remote.revision > 0 || remote.state) return;

  const documents = localDocuments(storage);
  if (!hasLocalSave(documents)) return;

  let marker = readMarker(storage);
  if (marker?.status === 'confirmed') return;
  if (!marker) {
    marker = { idempotencyKey: idempotencyKey(), status: 'pending' };
    storage.setItem(REMOTE_SAVE_BACKUP_KEY, JSON.stringify({
      createdAt: new Date().toISOString(),
      documents,
    }));
    writeMarker(storage, marker);
  }

  const result = await coordinator.migrate(documents, marker.idempotencyKey);
  const confirmed = await coordinator.load(true);
  if (!confirmed.migrated || !confirmed.state || confirmed.revision !== result.revision) {
    throw new Error('Remote local-save migration could not be confirmed');
  }
  writeMarker(storage, {
    idempotencyKey: marker.idempotencyKey,
    status: 'confirmed',
    revision: confirmed.revision,
  });
}

export function markRemoteSaveDirty(storage: GameStorage, revision: number): void {
  storage.setItem(REMOTE_DIRTY_SAVE_KEY, JSON.stringify({ revision, markedAt: Date.now() }));
}

export function clearRemoteSaveDirty(storage: GameStorage): void {
  storage.removeItem(REMOTE_DIRTY_SAVE_KEY);
}

/** Uploads an offline fallback only when the server is still at the revision it forked from. */
export async function recoverDirtyLocalSave(
  coordinator: RemoteSaveCoordinator,
  storage: GameStorage,
): Promise<void> {
  const raw = storage.getItem(REMOTE_DIRTY_SAVE_KEY);
  if (!raw) return;
  let expectedRevision: number;
  try {
    const parsed = JSON.parse(raw) as { revision?: unknown };
    if (!Number.isSafeInteger(parsed.revision) || Number(parsed.revision) < 0) throw new Error();
    expectedRevision = Number(parsed.revision);
  } catch {
    throw new Error('Offline save recovery marker is invalid');
  }

  const remote = await coordinator.load();
  if (remote.revision !== expectedRevision) {
    throw new Error('Remote save changed while this browser was offline; keeping Local mode');
  }
  const documents = localDocuments(storage);
  await coordinator.savePlayer({
    schemaVersion: documents.schemaVersion,
    checkpoint: documents.checkpoint,
    progression: documents.progression,
    inventory: documents.inventory,
    boats: documents.boats,
    loadout: documents.loadout,
  });
  await coordinator.saveCargo({ schemaVersion: 1, cargo: documents.cargo });
  await coordinator.load(true);
  storage.removeItem(REMOTE_DIRTY_SAVE_KEY);
}
