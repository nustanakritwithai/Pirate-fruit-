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
export const REMOTE_STALE_DIRTY_SAVE_KEY = 'pirate-fruit:remote-dirty-save-stale-v1';

interface MigrationMarker {
  idempotencyKey: string;
  status: 'pending' | 'confirmed';
  characterId?: string;
  revision?: number;
}

interface DirtySaveMarker {
  revision: number;
  characterId?: string;
  markedAt?: number;
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

function archiveStaleDirtyMarker(
  storage: GameStorage,
  raw: string,
  reason: 'different-character' | 'empty-remote' | 'server-ahead' | 'invalid-marker',
): void {
  storage.setItem(REMOTE_STALE_DIRTY_SAVE_KEY, JSON.stringify({
    archivedAt: Date.now(),
    reason,
    marker: raw,
  }));
  storage.removeItem(REMOTE_DIRTY_SAVE_KEY);
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
  characterId: string,
): Promise<void> {
  const remote = await coordinator.load();
  if (remote.migrated) {
    const marker = readMarker(storage);
    if (
      !marker
      || marker.characterId !== characterId
      || marker.status === 'pending'
      || marker.revision !== remote.revision
    ) {
      writeMarker(storage, {
        idempotencyKey: marker?.characterId === characterId
          ? marker.idempotencyKey
          : idempotencyKey(),
        status: 'confirmed',
        characterId,
        revision: remote.revision,
      });
    }
    return;
  }
  if (remote.revision > 0 || remote.state) return;

  const documents = localDocuments(storage);
  if (!hasLocalSave(documents)) return;

  let marker = readMarker(storage);
  // A browser can receive a new Server character after a cookie reset or service
  // recreation. A confirmed marker from the previous identity must never block the
  // new empty character from importing the still-intact Local save.
  if (
    marker?.status === 'confirmed'
    || (marker?.characterId !== undefined && marker.characterId !== characterId)
  ) {
    marker = null;
  }
  if (!marker) {
    marker = { idempotencyKey: idempotencyKey(), status: 'pending', characterId };
    storage.setItem(REMOTE_SAVE_BACKUP_KEY, JSON.stringify({
      createdAt: new Date().toISOString(),
      characterId,
      documents,
    }));
    writeMarker(storage, marker);
  } else if (!marker.characterId) {
    marker = { ...marker, characterId };
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
    characterId,
    revision: confirmed.revision,
  });
}

export const REMOTE_FALLBACK_REASON_KEY = 'pirate-fruit:remote-fallback-reason-v1';

export interface RemoteFallbackReason {
  message: string;
  at: number;
}

/** บันทึกสาเหตุล่าสุดที่ Remote Save ตกลงโหมด Local — โชว์บนป้ายสถานะ/ใช้วินิจฉัยจากเครื่องผู้เล่น */
export function recordRemoteFallbackReason(storage: GameStorage, error: unknown): void {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 200);
  storage.setItem(REMOTE_FALLBACK_REASON_KEY, JSON.stringify({
    message,
    at: Date.now(),
  } satisfies RemoteFallbackReason));
}

export function clearRemoteFallbackReason(storage: GameStorage): void {
  storage.removeItem(REMOTE_FALLBACK_REASON_KEY);
}

export function readRemoteFallbackReason(storage: GameStorage): RemoteFallbackReason | null {
  try {
    const raw = storage.getItem(REMOTE_FALLBACK_REASON_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RemoteFallbackReason>;
    if (typeof parsed.message !== 'string') return null;
    return { message: parsed.message, at: Number(parsed.at) || 0 };
  } catch {
    return null;
  }
}

export function markRemoteSaveDirty(
  storage: GameStorage,
  revision: number,
  characterId: string,
): void {
  storage.setItem(REMOTE_DIRTY_SAVE_KEY, JSON.stringify({
    revision,
    characterId,
    markedAt: Date.now(),
  } satisfies DirtySaveMarker));
}

export function clearRemoteSaveDirty(storage: GameStorage): void {
  storage.removeItem(REMOTE_DIRTY_SAVE_KEY);
}

/** Uploads an offline fallback only when the server is still at the revision it forked from. */
export async function recoverDirtyLocalSave(
  coordinator: RemoteSaveCoordinator,
  storage: GameStorage,
  characterId: string,
): Promise<void> {
  const raw = storage.getItem(REMOTE_DIRTY_SAVE_KEY);
  if (!raw) return;
  let expectedRevision: number;
  let markerCharacterId: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { revision?: unknown; characterId?: unknown };
    if (!Number.isSafeInteger(parsed.revision) || Number(parsed.revision) < 0) throw new Error();
    if (parsed.characterId !== undefined && typeof parsed.characterId !== 'string') throw new Error();
    expectedRevision = Number(parsed.revision);
    markerCharacterId = parsed.characterId;
  } catch {
    // Marker ที่อ่านไม่ออกห้ามล็อกเครื่องไว้ในโหมด Local ตลอดไป — เก็บเข้าคลังแล้วไปต่อ
    archiveStaleDirtyMarker(storage, raw, 'invalid-marker');
    return;
  }

  if (markerCharacterId && markerCharacterId !== characterId) {
    archiveStaleDirtyMarker(storage, raw, 'different-character');
    return;
  }

  const remote = await coordinator.load();
  if (remote.revision !== expectedRevision) {
    if (remote.revision === 0 && !remote.migrated && remote.state === null) {
      archiveStaleDirtyMarker(storage, raw, 'empty-remote');
      return;
    }
    // ตัวละครนี้มี browser เดียวเป็นเจ้าของ (ผูก HttpOnly cookie) — server ที่ล้ำหน้า marker
    // คือ write ของเราเองที่ไปถึงแล้วแต่ ack กลับไม่ทันก่อนปิดแท็บ (mark ตอน enqueue)
    // ให้ server ชนะ: เก็บ marker เข้าคลังแล้วเล่นโหมด remote ต่อ (local mirror/backup ยังอยู่ครบ)
    // การ throw ที่นี่จะทำให้ทุกการเปิดเกมตกโหมด Local ถาวรแบบไม่มีทางออก
    archiveStaleDirtyMarker(storage, raw, 'server-ahead');
    return;
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
