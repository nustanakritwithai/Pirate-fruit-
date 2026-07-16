import { browserGameStorage, configureGameStorage, type GameStorage } from './GameStorage';
import {
  LocalCargoRepository,
  LocalEconomyRepository,
  LocalPlayerRepository,
} from './LocalRepositories';
import {
  RemoteCargoRepository,
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
import type { CargoRepository, PlayerRepository } from '@pirate-fruit/shared';

export type PersistenceMode = 'local' | 'remote';

export interface GamePersistenceHandle {
  readonly requestedMode: PersistenceMode;
  readonly activeMode: PersistenceMode;
  readonly storage: RepositoryBackedStorage;
  flush(): Promise<void>;
}

export interface GamePersistenceOptions {
  useRemoteServer?: boolean;
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
    ?? enabled(import.meta.env.VITE_USE_REMOTE_SERVER);
  const requestedMode: PersistenceMode = requestedRemote ? 'remote' : 'local';
  const apiUrl = normalizeApiUrl(options.apiUrl ?? import.meta.env.VITE_API_URL);
  const warn = options.warn ?? ((message: string, error?: unknown) => console.warn(message, error));

  let activeMode: PersistenceMode = 'local';
  let storage: RepositoryBackedStorage;

  if (requestedRemote && apiUrl) {
    try {
      const session = getRemoteSession();
      if (session.mode !== 'online' || !session.csrfToken) {
        throw new Error('Remote Save requires an active Remote Session');
      }
      const coordinator = new RemoteSaveCoordinator(apiUrl, {
        fetcher: options.fetcher,
        csrfToken: session.csrfToken,
      });
      await recoverDirtyLocalSave(coordinator, localStorage);
      await migrateLocalSaveIfNeeded(coordinator, localStorage);

      const local = localRepositories(localStorage);
      const failover = { active: true };
      const useLocal = (error: unknown): void => {
        if (!failover.active) return;
        failover.active = false;
        activeMode = 'local';
        markRemoteSaveDirty(localStorage, coordinator.revision);
        warn('Remote save failed; changes remain in the Local fallback.', error);
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
        { player, cargo, economy: local.economy },
        { playerId: REMOTE_PLAYER_ID, worldId: WORLD_ID },
        localStorage,
        {
          onRemoteDirty: () => {
            if (failover.active) markRemoteSaveDirty(localStorage, coordinator.revision);
          },
          onRemotePersisted: () => {
            if (failover.active) clearRemoteSaveDirty(localStorage);
          },
        },
      );
      activeMode = 'remote';
    } catch (error) {
      warn('Remote save is unavailable; continuing with the local save adapter.', error);
      storage = await RepositoryBackedStorage.load(
        localRepositories(localStorage),
        { playerId: LOCAL_PLAYER_ID, worldId: WORLD_ID },
        localStorage,
      );
    }
  } else {
    if (requestedRemote) {
      warn('VITE_USE_REMOTE_SERVER is enabled but VITE_API_URL is missing or invalid.');
    }
    storage = await RepositoryBackedStorage.load(
      localRepositories(localStorage),
      { playerId: LOCAL_PLAYER_ID, worldId: WORLD_ID },
      localStorage,
    );
  }

  configureGameStorage(storage);

  return {
    requestedMode,
    get activeMode() { return activeMode; },
    storage,
    flush: () => storage.flush(),
  };
}
