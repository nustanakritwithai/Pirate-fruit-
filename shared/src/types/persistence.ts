export const PERSISTED_PLAYER_SCHEMA_VERSION = 1;
export const PERSISTED_CARGO_SCHEMA_VERSION = 1;
export const PERSISTED_ECONOMY_SCHEMA_VERSION = 1;
export const REMOTE_PLAYER_SAVE_SCHEMA_VERSION = 1;

/**
 * Transitional S3 envelope. Values remain the exact legacy JSON documents so
 * existing save migrations keep working while server-owned schemas are added.
 */
export interface PersistedPlayerState {
  schemaVersion: number;
  checkpoint: string | null;
  progression: string | null;
  inventory: string | null;
  boats: string | null;
  loadout: string | null;
}

export interface PersistedCargoState {
  schemaVersion: number;
  cargo: string | null;
}

export interface PersistedEconomyState {
  schemaVersion: number;
  world: string | null;
}

export interface PlayerRepository {
  loadPlayer(playerId: string): Promise<PersistedPlayerState | null>;
  savePlayer(playerId: string, state: PersistedPlayerState): Promise<void>;
  saveCheckpoint?(playerId: string, checkpoint: string | null): Promise<void>;
}

export interface CargoRepository {
  loadCargo(playerId: string): Promise<PersistedCargoState>;
  saveCargo(playerId: string, cargo: PersistedCargoState): Promise<void>;
}

export interface EconomyRepository {
  loadWorld(worldId: string): Promise<PersistedEconomyState | null>;
  saveWorld(worldId: string, state: PersistedEconomyState): Promise<void>;
}

/**
 * S6 HTTP contract. Identity is intentionally absent: the Server resolves the
 * character exclusively from the authenticated HttpOnly session cookie.
 */
export interface RemotePlayerStateResponse {
  ok: true;
  schemaVersion: typeof REMOTE_PLAYER_SAVE_SCHEMA_VERSION;
  revision: number;
  migrated: boolean;
  state: PersistedPlayerState | null;
  cargo: PersistedCargoState;
}

export interface RemoteSaveMutationBase {
  schemaVersion: typeof REMOTE_PLAYER_SAVE_SCHEMA_VERSION;
  expectedRevision: number;
  idempotencyKey: string;
}

export interface RemotePlayerSaveRequest extends RemoteSaveMutationBase {
  documents: PersistedPlayerState;
}

export interface RemoteCargoSaveRequest extends RemoteSaveMutationBase {
  documents: PersistedCargoState;
}

export interface RemoteCheckpointSaveRequest extends RemoteSaveMutationBase {
  checkpoint: string | null;
}

export interface RemoteLocalMigrationRequest {
  schemaVersion: typeof REMOTE_PLAYER_SAVE_SCHEMA_VERSION;
  idempotencyKey: string;
  documents: PersistedPlayerState & { cargo: string | null };
}

export interface RemoteSaveMutationResponse {
  ok: true;
  revision: number;
  idempotentReplay: boolean;
  migrated: boolean;
}
