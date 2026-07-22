import { createHash } from 'node:crypto';
import {
  PERSISTED_CARGO_SCHEMA_VERSION,
  PERSISTED_PLAYER_SCHEMA_VERSION,
  REMOTE_PLAYER_SAVE_SCHEMA_VERSION,
  type RemoteCargoSaveRequest,
  type RemoteCheckpointSaveRequest,
  type RemoteLocalMigrationRequest,
  type RemotePlayerSaveRequest,
  type RemotePlayerStateResponse,
  type RemoteSaveMutationResponse,
} from '@pirate-fruit/shared';
import { z } from 'zod';
import type {
  PlayerSaveMutationIdentity,
  PlayerSaveOperation,
  PlayerSaveRepository,
} from './playerSaveRepository.js';
import {
  defaultPlayerState,
  sanitizeLocalMigrationDocuments,
  sanitizeCheckpoint,
  sanitizePlayerDocuments,
  serializePlayerState,
} from './playerState.js';

const document = z.string().max(48 * 1024).nullable();
const idempotencyKey = z.string().min(16).max(128).regex(/^[A-Za-z0-9:_-]+$/);
const expectedRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const playerDocuments = z.object({
  schemaVersion: z.literal(PERSISTED_PLAYER_SCHEMA_VERSION),
  checkpoint: document,
  progression: document,
  inventory: document,
  boats: document,
  loadout: document,
}).strict();

const cargoDocuments = z.object({
  schemaVersion: z.literal(PERSISTED_CARGO_SCHEMA_VERSION),
  cargo: document,
}).strict();

const playerSaveRequest = z.object({
  schemaVersion: z.literal(REMOTE_PLAYER_SAVE_SCHEMA_VERSION),
  expectedRevision,
  idempotencyKey,
  documents: playerDocuments,
}).strict();

const cargoSaveRequest = z.object({
  schemaVersion: z.literal(REMOTE_PLAYER_SAVE_SCHEMA_VERSION),
  expectedRevision,
  idempotencyKey,
  documents: cargoDocuments,
}).strict();

const checkpointSaveRequest = z.object({
  schemaVersion: z.literal(REMOTE_PLAYER_SAVE_SCHEMA_VERSION),
  expectedRevision,
  idempotencyKey,
  checkpoint: document,
}).strict();

const migrationRequest = z.object({
  schemaVersion: z.literal(REMOTE_PLAYER_SAVE_SCHEMA_VERSION),
  idempotencyKey,
  documents: playerDocuments.extend({ cargo: document }).strict(),
}).strict();

function hashRequest(operation: PlayerSaveOperation, body: unknown): string {
  return createHash('sha256')
    .update(operation)
    .update('\0')
    .update(JSON.stringify(body))
    .digest('hex');
}

function identity(
  characterId: string,
  operation: PlayerSaveOperation,
  body: { idempotencyKey: string; expectedRevision?: number },
): PlayerSaveMutationIdentity {
  return {
    characterId,
    operation,
    idempotencyKey: body.idempotencyKey,
    expectedRevision: body.expectedRevision,
    requestHash: hashRequest(operation, body),
  };
}

export class PlayerSaveService {
  constructor(private readonly repository: PlayerSaveRepository) {}

  /**
   * Repair the one class of saves known to contain pre-online Local data. The repository
   * preserves Server-owned level/EXP/coins and resets only stats/mastery/inventory.
   */
  async resetLegacyProgress(characterId: string): Promise<RemoteSaveMutationResponse> {
    const result = await this.repository.resetLegacyProgress(characterId);
    return { ok: true, ...result };
  }

  async load(characterId: string): Promise<RemotePlayerStateResponse> {
    const stored = await this.repository.load(characterId);
    const documents = stored.state ? serializePlayerState(stored.state) : null;
    return {
      ok: true,
      schemaVersion: REMOTE_PLAYER_SAVE_SCHEMA_VERSION,
      revision: stored.revision,
      migrated: stored.migrated,
      state: documents?.player ?? null,
      cargo: documents?.cargo ?? {
        schemaVersion: PERSISTED_CARGO_SCHEMA_VERSION,
        cargo: null,
      },
    };
  }

  async savePlayer(characterId: string, input: unknown): Promise<RemoteSaveMutationResponse> {
    const body: RemotePlayerSaveRequest = playerSaveRequest.parse(input);
    const state = sanitizePlayerDocuments(body.documents);
    const result = await this.repository.save(identity(characterId, 'save', body), state);
    return { ok: true, ...result };
  }

  async saveCheckpoint(
    characterId: string,
    input: unknown,
  ): Promise<RemoteSaveMutationResponse> {
    const body: RemoteCheckpointSaveRequest = checkpointSaveRequest.parse(input);
    const current = await this.repository.load(characterId);
    const base = current.state ?? defaultPlayerState();
    const checkpoint = sanitizeCheckpoint(body.checkpoint, base.progression);
    const result = await this.repository.saveCheckpoint(
      identity(characterId, 'checkpoint', body),
      { ...base, checkpoint },
    );
    return { ok: true, ...result };
  }

  async saveCargo(characterId: string, input: unknown): Promise<RemoteSaveMutationResponse> {
    const body: RemoteCargoSaveRequest = cargoSaveRequest.parse(input);
    const current = await this.repository.load(characterId);
    const base = current.state ?? defaultPlayerState();
    const playerDocuments = serializePlayerState(base).player;
    const state = sanitizePlayerDocuments(playerDocuments, body.documents);
    const result = await this.repository.saveCargo(
      identity(characterId, 'cargo', body),
      state,
    );
    return { ok: true, ...result };
  }

  async migrateLocal(characterId: string, input: unknown): Promise<RemoteSaveMutationResponse> {
    const body: RemoteLocalMigrationRequest = migrationRequest.parse(input);
    const state = sanitizeLocalMigrationDocuments(
      body.documents,
      { schemaVersion: PERSISTED_CARGO_SCHEMA_VERSION, cargo: body.documents.cargo },
    );
    const result = await this.repository.migrate(identity(characterId, 'migration', body), state);
    return { ok: true, ...result };
  }
}
