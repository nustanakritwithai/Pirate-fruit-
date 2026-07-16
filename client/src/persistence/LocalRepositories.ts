import {
  PERSISTED_CARGO_SCHEMA_VERSION,
  PERSISTED_ECONOMY_SCHEMA_VERSION,
  PERSISTED_PLAYER_SCHEMA_VERSION,
  type CargoRepository,
  type EconomyRepository,
  type PersistedCargoState,
  type PersistedEconomyState,
  type PersistedPlayerState,
  type PlayerRepository,
} from '@pirate-fruit/shared';
import type { GameStorage } from './GameStorage';
import { GAMEPLAY_STORAGE_KEYS } from './storageKeys';

function write(storage: GameStorage, key: string, value: string | null): void {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

export class LocalPlayerRepository implements PlayerRepository {
  constructor(private readonly storage: GameStorage) {}

  async loadPlayer(_playerId: string): Promise<PersistedPlayerState | null> {
    const state: PersistedPlayerState = {
      schemaVersion: PERSISTED_PLAYER_SCHEMA_VERSION,
      checkpoint: this.storage.getItem(GAMEPLAY_STORAGE_KEYS.checkpoint),
      progression: this.storage.getItem(GAMEPLAY_STORAGE_KEYS.progression),
      inventory: this.storage.getItem(GAMEPLAY_STORAGE_KEYS.inventory),
      boats: this.storage.getItem(GAMEPLAY_STORAGE_KEYS.boats),
      loadout: this.storage.getItem(GAMEPLAY_STORAGE_KEYS.loadout),
    };
    return Object.values(state).some((value) => typeof value === 'string') ? state : null;
  }

  async savePlayer(_playerId: string, state: PersistedPlayerState): Promise<void> {
    write(this.storage, GAMEPLAY_STORAGE_KEYS.checkpoint, state.checkpoint);
    write(this.storage, GAMEPLAY_STORAGE_KEYS.progression, state.progression);
    write(this.storage, GAMEPLAY_STORAGE_KEYS.inventory, state.inventory);
    write(this.storage, GAMEPLAY_STORAGE_KEYS.boats, state.boats);
    write(this.storage, GAMEPLAY_STORAGE_KEYS.loadout, state.loadout);
  }

  async saveCheckpoint(_playerId: string, checkpoint: string | null): Promise<void> {
    write(this.storage, GAMEPLAY_STORAGE_KEYS.checkpoint, checkpoint);
  }
}

export class LocalCargoRepository implements CargoRepository {
  constructor(private readonly storage: GameStorage) {}

  async loadCargo(_playerId: string): Promise<PersistedCargoState> {
    return {
      schemaVersion: PERSISTED_CARGO_SCHEMA_VERSION,
      cargo: this.storage.getItem(GAMEPLAY_STORAGE_KEYS.cargo),
    };
  }

  async saveCargo(_playerId: string, state: PersistedCargoState): Promise<void> {
    write(this.storage, GAMEPLAY_STORAGE_KEYS.cargo, state.cargo);
  }
}

export class LocalEconomyRepository implements EconomyRepository {
  constructor(private readonly storage: GameStorage) {}

  async loadWorld(_worldId: string): Promise<PersistedEconomyState | null> {
    const world = this.storage.getItem(GAMEPLAY_STORAGE_KEYS.economy);
    return world === null
      ? null
      : { schemaVersion: PERSISTED_ECONOMY_SCHEMA_VERSION, world };
  }

  async saveWorld(_worldId: string, state: PersistedEconomyState): Promise<void> {
    write(this.storage, GAMEPLAY_STORAGE_KEYS.economy, state.world);
  }
}
