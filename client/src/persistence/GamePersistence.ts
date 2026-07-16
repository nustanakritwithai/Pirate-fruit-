import { browserGameStorage, configureGameStorage, type GameStorage } from './GameStorage';
import {
  LocalCargoRepository,
  LocalEconomyRepository,
  LocalPlayerRepository,
} from './LocalRepositories';
import {
  RemoteCargoRepository,
  RemoteEconomyRepository,
  RemotePlayerRepository,
  RemoteSaveCoordinator,
  type FetchLike,
} from './RemoteRepositories';
import {
  RepositoryBackedStorage,
  type GameRepositories,
} from './RepositoryBackedStorage';
import { getRemoteSession } from '../session/RemoteSession';
import {
  clearRemoteSaveDirty,
  markRemoteSaveDirty,
  migrateLocalSaveIfNeeded,
  recoverDirtyLocalSave,
} from './LocalSaveMigration';
import type {
  CargoRepository,
  EconomyRepository,
  PersistedEconomyState,
  PlayerRepository,
} from '@pirate-fruit/shared';
import {
  productionRemoteApiUrl,
  productionRemoteEnabled,
} from '../config/ProductionRemote';

export type PersistenceMode = 'local' | 'remote';

export interface PersistenceStatusEvent {
  scope: 'save' | 'economy';
  mode: PersistenceMode;
  message: string;
}

export interface GamePersistenceHandle {
  readonly requestedMode: PersistenceMode;
  readonly activeMode: PersistenceMode;
  readonly requestedEconomyMode: PersistenceMode;
  readonly activeEconomyMode: PersistenceMode;
  readonly storage: RepositoryBackedStorage;
  refreshEconomy(): Promise<PersistedEconomyState | null>;
  subscribeStatus(listener: (event: PersistenceStatusEvent) => void): () => void;
  flush(): Promise<void>;
}

export interface GamePersistenceOptions {
  useRemoteServer?: boolean;
  useRemoteEconomy?: boolean;
  apiUrl?: string;
  fetcher?: FetchLike;
  localStorage?: GameStorage;
  warn?: (message: string, error?: unknown) => void;
}

const LOCAL_PLAYER_ID = 'offline-local-player';
const REMOTE_PLAYER_ID = 'current-session';
const WORLD_ID = 'global';

function enabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function normalizeApiUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const base = typeof location === 'undefined' ? undefined : location.origin;
    const url = new URL(trimmed, base);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString().replace(/\/+$/, '')
      : null;
  } catch {
    return null;
  }
}

function localRepositories(storage: GameStorage): GameRepositories {
  return {
    player: new LocalPlayerRepository(storage),
    cargo: new LocalCargoRepository(storage),
    economy: new LocalEconomyRepository(storage),
  };
}

/**
 * Hydrates the repository mirror before gameplay construction. Remote Save is staged
 * independently and always retains the legacy Local repositories as its safe fallback.
 */
export async function initializeGamePersistence(
  options: GamePersistenceOptions = {},
): Promise<GamePersistenceHandle> {
  const localStorage = options.localStorage ?? browserGameStorage();
  const requestedRemote = options.useRemoteServer
    ?? (enabled(import.meta.env.VITE_USE_REMOTE_SERVER) || productionRemoteEnabled());
  const requestedMode: PersistenceMode = requestedRemote ? 'remote' : 'local';
  const requestedRemoteEconomy = options.useRemoteEconomy
    ?? (enabled(import.meta.env.VITE_ENABLE_ECONOMY_SERVER) || productionRemoteEnabled());
  const requestedEconomyMode: PersistenceMode = requestedRemoteEconomy ? 'remote' : 'local';
  const apiUrl = normalizeApiUrl(
    options.apiUrl ?? (import.meta.env.VITE_API_URL || productionRemoteApiUrl()),
  );
  const warn = options.warn ?? ((message: string, error?: unknown) => console.warn(message, error));

  let activeMode: PersistenceMode = 'local';
  let activeEconomyMode: PersistenceMode = 'local';
  let storage: RepositoryBackedStorage;
  const local = localRepositories(localStorage);
  const statusEvents: PersistenceStatusEvent[] = [];
  const statusListeners = new Set<(event: PersistenceStatusEvent) => void>();
  const emitStatus = (event: PersistenceStatusEvent): void => {
    statusEvents.push(event);
    if (statusEvents.length > 8) statusEvents.shift();
    for (const listener of statusListeners) listener(event);
  };

  let economyAttempted = false;
  const changeEconomyMode = (
    mode: PersistenceMode,
    error?: unknown,
  ): void => {
    const previous = activeEconomyMode;
    activeEconomyMode = mode;
    if (mode === 'local' && (!economyAttempted || previous === 'remote')) {
      const message = 'Remote economy unavailable — switched to Local economy safely.';
      warn(message, error);
      emitStatus({ scope: 'economy', mode: 'local', message });
    } else if (mode === 'remote' && economyAttempted && previous === 'local') {
      emitStatus({
        scope: 'economy',
        mode: 'remote',
        message: 'Remote economy connection restored.',
      });
    }
    economyAttempted = true;
  };

  const remoteEconomy = requestedRemoteEconomy && apiUrl
    ? new RemoteEconomyRepository(apiUrl, options.fetcher)
    : null;
  const economy: EconomyRepository = remoteEconomy
    ? {
        loadWorld: async (worldId) => {
          try {
            const state = await remoteEconomy.loadWorld(worldId);
            changeEconomyMode('remote');
            return state;
          } catch (error) {
            changeEconomyMode('local', error);
            return local.economy.loadWorld(worldId);
          }
        },
        // S7 browser mutations remain a recoverable Local mirror. Only the Server writes the world.
        saveWorld: (worldId, state) => local.economy.saveWorld(worldId, state),
      }
    : local.economy;

  if (requestedRemoteEconomy && !apiUrl) {
    changeEconomyMode('local', new Error('VITE_API_URL is missing or invalid'));
  }

  const repositories = (
    player: PlayerRepository,
    cargo: CargoRepository,
  ): GameRepositories => ({ player, cargo, economy });

  if (requestedRemote && apiUrl) {
    try {
      const session = getRemoteSession();
      if (session.mode !== 'online' || !session.csrfToken) {
        throw new Error('Remote Save requires an active Remote Session');
      }
      const characterId = session.session?.characterId;
      if (!characterId) {
        throw new Error('Remote Save requires a Server character identity');
      }
      const coordinator = new RemoteSaveCoordinator(apiUrl, {
        fetcher: options.fetcher,
        csrfToken: session.csrfToken,
      });
      await recoverDirtyLocalSave(coordinator, localStorage, characterId);
      await migrateLocalSaveIfNeeded(coordinator, localStorage, characterId);

      const failover = { active: true };
      const useLocal = (error: unknown): void => {
        if (!failover.active) return;
        failover.active = false;
        activeMode = 'local';
        markRemoteSaveDirty(localStorage, coordinator.revision, characterId);
        const message = 'Remote save failed — changes remain in the Local fallback.';
        warn(message, error);
        emitStatus({ scope: 'save', mode: 'local', message });
      };
      const remotePlayer = new RemotePlayerRepository(apiUrl, options.fetcher, coordinator);
      const remoteCargo = new RemoteCargoRepository(apiUrl, options.fetcher, coordinator);
      const player: PlayerRepository = {
        loadPlayer: (id) => remotePlayer.loadPlayer(id),
        savePlayer: async (id, state) => {
          if (!failover.active) return local.player.savePlayer(id, state);
          try { await remotePlayer.savePlayer(id, state); } catch (error) {
            useLocal(error);
            await local.player.savePlayer(id, state);
            throw error;
          }
        },
        saveCheckpoint: async (id, checkpoint) => {
          if (!failover.active) return local.player.saveCheckpoint?.(id, checkpoint);
          try { await remotePlayer.saveCheckpoint(id, checkpoint); } catch (error) {
            useLocal(error);
            await local.player.saveCheckpoint?.(id, checkpoint);
            throw error;
          }
        },
      };
      const cargo: CargoRepository = {
        loadCargo: (id) => remoteCargo.loadCargo(id),
        saveCargo: async (id, state) => {
          if (!failover.active) return local.cargo.saveCargo(id, state);
          try { await remoteCargo.saveCargo(id, state); } catch (error) {
            useLocal(error);
            await local.cargo.saveCargo(id, state);
            throw error;
          }
        },
      };
      storage = await RepositoryBackedStorage.load(
        repositories(player, cargo),
        { playerId: REMOTE_PLAYER_ID, worldId: WORLD_ID },
        localStorage,
        {
          onRemoteDirty: () => {
            if (failover.active) {
              markRemoteSaveDirty(localStorage, coordinator.revision, characterId);
            }
          },
          onRemotePersisted: () => {
            if (failover.active) clearRemoteSaveDirty(localStorage);
          },
        },
      );
      activeMode = 'remote';
    } catch (error) {
      const message = 'Remote save unavailable — continuing in Local mode.';
      warn(message, error);
      emitStatus({ scope: 'save', mode: 'local', message });
      storage = await RepositoryBackedStorage.load(
        repositories(local.player, local.cargo),
        { playerId: LOCAL_PLAYER_ID, worldId: WORLD_ID },
        localStorage,
      );
    }
  } else {
    if (requestedRemote) {
      const message = 'Remote save enabled without a valid API URL — continuing in Local mode.';
      warn(message);
      emitStatus({ scope: 'save', mode: 'local', message });
    }
    storage = await RepositoryBackedStorage.load(
      repositories(local.player, local.cargo),
      { playerId: LOCAL_PLAYER_ID, worldId: WORLD_ID },
      localStorage,
    );
  }

  configureGameStorage(storage);

  const refreshEconomy = async (): Promise<PersistedEconomyState | null> => {
    if (!remoteEconomy) return null;
    try {
      const state = await remoteEconomy.loadWorld(WORLD_ID);
      if (state) storage.replaceEconomySnapshot(state);
      changeEconomyMode('remote');
      return state;
    } catch (error) {
      changeEconomyMode('local', error);
      return null;
    }
  };

  return {
    requestedMode,
    get activeMode() { return activeMode; },
    requestedEconomyMode,
    get activeEconomyMode() { return activeEconomyMode; },
    storage,
    refreshEconomy,
    subscribeStatus(listener) {
      statusListeners.add(listener);
      for (const event of statusEvents) listener(event);
      return () => statusListeners.delete(listener);
    },
    flush: () => storage.flush(),
  };
}
