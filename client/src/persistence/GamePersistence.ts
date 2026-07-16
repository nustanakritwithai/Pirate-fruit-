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
  type FetchLike,
} from './RemoteRepositories';
import {
  RepositoryBackedStorage,
  type GameRepositories,
} from './RepositoryBackedStorage';

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

function remoteRepositories(apiUrl: string, fetcher?: FetchLike): GameRepositories {
  return {
    player: new RemotePlayerRepository(apiUrl, fetcher),
    cargo: new RemoteCargoRepository(apiUrl, fetcher),
    economy: new RemoteEconomyRepository(apiUrl, fetcher),
  };
}

/**
 * Hydrates the repository mirror before gameplay construction. S3 deliberately falls back
 * to the legacy local repositories until the authenticated S5/S6 endpoints are available.
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
      storage = await RepositoryBackedStorage.load(
        remoteRepositories(apiUrl, options.fetcher),
        { playerId: REMOTE_PLAYER_ID, worldId: WORLD_ID },
        localStorage,
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
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      void storage.flush();
    });
  }

  return {
    requestedMode,
    activeMode,
    storage,
    flush: () => storage.flush(),
  };
}
