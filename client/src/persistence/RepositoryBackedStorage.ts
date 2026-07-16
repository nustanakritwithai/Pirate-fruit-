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
import {
  GAMEPLAY_STORAGE_KEYS,
  PLAYER_STORAGE_KEYS,
  type GameplayStorageKey,
} from './storageKeys';

export interface GameRepositories {
  player: PlayerRepository;
  cargo: CargoRepository;
  economy: EconomyRepository;
}

export interface RepositoryStorageIdentity {
  playerId: string;
  worldId: string;
}

export interface RepositoryBackedStorageOptions {
  debounceMilliseconds?: number;
  onRemoteDirty?: () => void;
  onRemotePersisted?: () => void;
}

const GAMEPLAY_KEY_SET = new Set<string>(Object.values(GAMEPLAY_STORAGE_KEYS));

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Synchronous storage view for the existing gameplay code, backed by async repositories.
 * The mirror is fully hydrated before gameplay objects are constructed. Writes update the
 * mirror/cache immediately and are serialized to prevent an older remote save winning a race.
 */
export class RepositoryBackedStorage implements GameStorage {
  private readonly values = new Map<GameplayStorageKey, string>();
  private writeQueue: Promise<void> = Promise.resolve();
  private lastWriteError: Error | null = null;
  private readonly pendingKeys = new Set<GameplayStorageKey>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly repositories: GameRepositories,
    private readonly identity: RepositoryStorageIdentity,
    private readonly cache?: GameStorage,
    private readonly debounceMilliseconds = 500,
    private readonly options: RepositoryBackedStorageOptions = {},
  ) {}

  static async load(
    repositories: GameRepositories,
    identity: RepositoryStorageIdentity,
    cache?: GameStorage,
    options: RepositoryBackedStorageOptions = {},
  ): Promise<RepositoryBackedStorage> {
    const [player, cargo, economy] = await Promise.all([
      repositories.player.loadPlayer(identity.playerId),
      repositories.cargo.loadCargo(identity.playerId),
      repositories.economy.loadWorld(identity.worldId),
    ]);
    const storage = new RepositoryBackedStorage(
      repositories,
      identity,
      cache,
      Math.max(0, options.debounceMilliseconds ?? 500),
      options,
    );
    storage.hydrate(player, cargo, economy);
    return storage;
  }

  get lastError(): Error | null {
    return this.lastWriteError;
  }

  getItem(key: string): string | null {
    if (!GAMEPLAY_KEY_SET.has(key)) return this.cache?.getItem(key) ?? null;
    return this.values.get(key as GameplayStorageKey) ?? null;
  }

  setItem(key: string, value: string): void {
    if (!GAMEPLAY_KEY_SET.has(key)) {
      this.cache?.setItem(key, value);
      return;
    }
    const gameplayKey = key as GameplayStorageKey;
    if (this.values.get(gameplayKey) === value) return;
    this.values.set(gameplayKey, value);
    this.cache?.setItem(key, value);
    this.persist(gameplayKey);
  }

  removeItem(key: string): void {
    if (!GAMEPLAY_KEY_SET.has(key)) {
      this.cache?.removeItem(key);
      return;
    }
    const gameplayKey = key as GameplayStorageKey;
    const existed = this.values.delete(gameplayKey);
    this.cache?.removeItem(key);
    if (existed) this.persist(gameplayKey);
  }

  async flush(): Promise<void> {
    this.drainPending();
    await this.writeQueue;
  }

  /** Apply a read-only S7 Server snapshot without enqueueing a browser write. */
  replaceEconomySnapshot(economy: PersistedEconomyState): void {
    this.hydrateValue(GAMEPLAY_STORAGE_KEYS.economy, economy.world);
  }

  private hydrate(
    player: PersistedPlayerState | null,
    cargo: PersistedCargoState,
    economy: PersistedEconomyState | null,
  ): void {
    this.hydrateValue(GAMEPLAY_STORAGE_KEYS.checkpoint, player?.checkpoint ?? null);
    this.hydrateValue(GAMEPLAY_STORAGE_KEYS.progression, player?.progression ?? null);
    this.hydrateValue(GAMEPLAY_STORAGE_KEYS.inventory, player?.inventory ?? null);
    this.hydrateValue(GAMEPLAY_STORAGE_KEYS.boats, player?.boats ?? null);
    this.hydrateValue(GAMEPLAY_STORAGE_KEYS.loadout, player?.loadout ?? null);
    this.hydrateValue(GAMEPLAY_STORAGE_KEYS.cargo, cargo.cargo);
    this.hydrateValue(GAMEPLAY_STORAGE_KEYS.economy, economy?.world ?? null);
  }

  private hydrateValue(key: GameplayStorageKey, value: string | null): void {
    if (value === null) {
      this.values.delete(key);
      this.cache?.removeItem(key);
      return;
    }
    this.values.set(key, value);
    this.cache?.setItem(key, value);
  }

  private persist(key: GameplayStorageKey): void {
    this.pendingKeys.add(key);
    if (key !== GAMEPLAY_STORAGE_KEYS.economy) this.options.onRemoteDirty?.();
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.drainPending(), this.debounceMilliseconds);
  }

  private drainPending(): void {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (this.pendingKeys.size === 0) return;
    const keys = new Set(this.pendingKeys);
    this.pendingKeys.clear();

    const operations: Array<() => Promise<void>> = [];
    const playerKeys = [...keys].filter((key) =>
      (PLAYER_STORAGE_KEYS as readonly string[]).includes(key));
    if (playerKeys.length > 0) {
      const snapshot = this.playerSnapshot();
      const checkpointOnly = playerKeys.length === 1
        && playerKeys[0] === GAMEPLAY_STORAGE_KEYS.checkpoint
        && this.repositories.player.saveCheckpoint;
      operations.push(checkpointOnly
        ? () => this.repositories.player.saveCheckpoint!(
          this.identity.playerId,
          snapshot.checkpoint,
        )
        : () => this.repositories.player.savePlayer(this.identity.playerId, snapshot));
    }
    if (keys.has(GAMEPLAY_STORAGE_KEYS.cargo)) {
      const snapshot: PersistedCargoState = {
        schemaVersion: PERSISTED_CARGO_SCHEMA_VERSION,
        cargo: this.getItem(GAMEPLAY_STORAGE_KEYS.cargo),
      };
      operations.push(() => this.repositories.cargo.saveCargo(this.identity.playerId, snapshot));
    }
    if (keys.has(GAMEPLAY_STORAGE_KEYS.economy)) {
      const snapshot: PersistedEconomyState = {
        schemaVersion: PERSISTED_ECONOMY_SCHEMA_VERSION,
        world: this.getItem(GAMEPLAY_STORAGE_KEYS.economy),
      };
      operations.push(() => this.repositories.economy.saveWorld(this.identity.worldId, snapshot));
    }

    this.writeQueue = this.writeQueue
      .then(async () => {
        for (const operation of operations) await operation();
        if ([...keys].some((key) => key !== GAMEPLAY_STORAGE_KEYS.economy)) {
          this.options.onRemotePersisted?.();
        }
      })
      .then(() => {
        this.lastWriteError = null;
      })
      .catch((error: unknown) => {
        this.lastWriteError = asError(error);
      });
  }

  private playerSnapshot(): PersistedPlayerState {
    return {
      schemaVersion: PERSISTED_PLAYER_SCHEMA_VERSION,
      checkpoint: this.getItem(GAMEPLAY_STORAGE_KEYS.checkpoint),
      progression: this.getItem(GAMEPLAY_STORAGE_KEYS.progression),
      inventory: this.getItem(GAMEPLAY_STORAGE_KEYS.inventory),
      boats: this.getItem(GAMEPLAY_STORAGE_KEYS.boats),
      loadout: this.getItem(GAMEPLAY_STORAGE_KEYS.loadout),
    };
  }
}
