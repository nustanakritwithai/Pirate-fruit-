export const PERSISTED_PLAYER_SCHEMA_VERSION = 1;
export const PERSISTED_CARGO_SCHEMA_VERSION = 1;
export const PERSISTED_ECONOMY_SCHEMA_VERSION = 1;

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
}

export interface CargoRepository {
  loadCargo(playerId: string): Promise<PersistedCargoState>;
  saveCargo(playerId: string, cargo: PersistedCargoState): Promise<void>;
}

export interface EconomyRepository {
  loadWorld(worldId: string): Promise<PersistedEconomyState | null>;
  saveWorld(worldId: string, state: PersistedEconomyState): Promise<void>;
}
