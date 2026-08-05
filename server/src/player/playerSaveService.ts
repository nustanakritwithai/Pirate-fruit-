import { createHash } from 'node:crypto';
import {
  ISLAND_IDS,
  PERSISTED_CARGO_SCHEMA_VERSION,
  PERSISTED_PLAYER_SCHEMA_VERSION,
  REMOTE_PLAYER_SAVE_SCHEMA_VERSION,
  SPAWN_ID_BY_ISLAND,
  WORLD_SAFE_ZONES,
  type IslandId,
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
  type CanonicalCheckpoint,
  type CanonicalPlayerState,
} from './playerState.js';

export interface AuthoritativeCheckpointProvider {
  authoritativePositionOf(characterId: string): {
    islandId: string;
    x: number;
    y: number;
    z: number;
    heading: number;
  } | null;
}

const document = z.string().max(48 * 1024).nullable();
/** Per-request idempotency key — must be unique per character across all save operations (save/checkpoint/cargo/migration). */
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
  private checkpointAuthority?: AuthoritativeCheckpointProvider;

  constructor(
    private readonly repository: PlayerSaveRepository,
    checkpointAuthority?: AuthoritativeCheckpointProvider,
  ) {
    this.checkpointAuthority = checkpointAuthority;
  }

  attachCheckpointAuthority(authority: AuthoritativeCheckpointProvider): void {
    this.checkpointAuthority = authority;
  }

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
    const proposed = sanitizePlayerDocuments(body.documents);
    const state = await this.withAuthoritativeCheckpoint(characterId, proposed);
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
    const proposed = sanitizeCheckpoint(body.checkpoint, base.progression);
    const checkpoint = await this.authoritativeCheckpoint(
      characterId,
      proposed,
      current.state?.checkpoint,
    );
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
    const proposed = sanitizeLocalMigrationDocuments(
      body.documents,
      { schemaVersion: PERSISTED_CARGO_SCHEMA_VERSION, cargo: body.documents.cargo },
    );
    const state = await this.withAuthoritativeCheckpoint(characterId, proposed);
    const result = await this.repository.migrate(identity(characterId, 'migration', body), state);
    return { ok: true, ...result };
  }

  private async withAuthoritativeCheckpoint(
    characterId: string,
    state: CanonicalPlayerState,
  ): Promise<CanonicalPlayerState> {
    if (!this.checkpointAuthority) return state;
    const canonical = this.checkpointAuthority.authoritativePositionOf(characterId);
    const stored = canonical ? undefined : (await this.repository.load(characterId)).state?.checkpoint;
    return {
      ...state,
      checkpoint: this.authoritativeCheckpointFrom(state.checkpoint, canonical, stored),
    };
  }

  private async authoritativeCheckpoint(
    characterId: string,
    proposed: CanonicalCheckpoint,
    stored?: CanonicalCheckpoint,
  ): Promise<CanonicalCheckpoint> {
    if (!this.checkpointAuthority) return proposed;
    const canonical = this.checkpointAuthority.authoritativePositionOf(characterId);
    return this.authoritativeCheckpointFrom(proposed, canonical, stored);
  }

  private authoritativeCheckpointFrom(
    proposed: CanonicalCheckpoint,
    canonical: ReturnType<AuthoritativeCheckpointProvider['authoritativePositionOf']>,
    stored?: CanonicalCheckpoint,
  ): CanonicalCheckpoint {
    if (canonical && ISLAND_IDS.includes(canonical.islandId as IslandId)) {
      const islandId = canonical.islandId as IslandId;
      return {
        ...proposed,
        islandId,
        spawnId: SPAWN_ID_BY_ISLAND[islandId],
        position: { x: canonical.x, y: canonical.y, z: canonical.z },
        heading: canonical.heading,
      };
    }
    if (stored) {
      return {
        ...proposed,
        islandId: stored.islandId,
        spawnId: stored.spawnId,
        position: { ...stored.position },
        heading: stored.heading,
      };
    }
    const fallback = WORLD_SAFE_ZONES.find(
      (zone) => zone.islandId === 'starter-island' && zone.kind === 'spawn',
    )!;
    return {
      ...proposed,
      islandId: 'starter-island',
      spawnId: SPAWN_ID_BY_ISLAND['starter-island'],
      position: { x: fallback.x, y: 0, z: fallback.z },
      heading: 0,
    };
  }
}
