import {
  PERSISTED_CARGO_SCHEMA_VERSION,
  REMOTE_PLAYER_SAVE_SCHEMA_VERSION,
  type CargoRepository,
  type EconomyRepository,
  type PersistedCargoState,
  type PersistedEconomyState,
  type PersistedPlayerState,
  type PlayerRepository,
  type RemoteCargoSaveRequest,
  type RemoteCheckpointSaveRequest,
  type RemoteLocalMigrationRequest,
  type RemotePlayerSaveRequest,
  type RemotePlayerStateResponse,
  type RemoteSaveMutationResponse,
} from '@pirate-fruit/shared';

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type SleepLike = (milliseconds: number) => Promise<void>;

export class RemotePersistenceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly currentRevision?: number,
  ) {
    super(message);
    this.name = 'RemotePersistenceError';
  }
}

interface RemoteRepositoryClientOptions {
  fetcher?: FetchLike;
  csrfToken?: string | null;
  sleep?: SleepLike;
  attempts?: number;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function retryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function isRemoteState(value: unknown): value is RemotePlayerStateResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RemotePlayerStateResponse>;
  return candidate.ok === true
    && candidate.schemaVersion === REMOTE_PLAYER_SAVE_SCHEMA_VERSION
    && typeof candidate.revision === 'number'
    && Number.isSafeInteger(candidate.revision)
    && candidate.revision >= 0
    && typeof candidate.migrated === 'boolean'
    && (candidate.state === null || typeof candidate.state === 'object')
    && typeof candidate.cargo === 'object';
}

function isMutationResponse(value: unknown): value is RemoteSaveMutationResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RemoteSaveMutationResponse>;
  return candidate.ok === true
    && typeof candidate.revision === 'number'
    && Number.isSafeInteger(candidate.revision)
    && candidate.revision >= 1
    && typeof candidate.idempotentReplay === 'boolean'
    && typeof candidate.migrated === 'boolean';
}

class RemoteRepositoryClient {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly sleep: SleepLike;
  private readonly attempts: number;

  constructor(baseUrl: string, private readonly options: RemoteRepositoryClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? delay;
    this.attempts = Math.max(1, options.attempts ?? 3);
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          ...init,
          credentials: 'include',
          headers: {
            accept: 'application/json',
            ...(init?.body ? { 'content-type': 'application/json' } : {}),
            ...(init?.method && init.method !== 'GET' && this.options.csrfToken
              ? { 'x-csrf-token': this.options.csrfToken }
              : {}),
            ...init?.headers,
          },
          signal: controller.signal,
        });
        if (response.ok) {
          if (response.status === 204) return undefined as T;
          return (await response.json()) as T;
        }
        const payload = await response.json().catch(() => null) as {
          error?: { code?: string; message?: string };
          currentRevision?: number;
        } | null;
        const error = new RemotePersistenceError(
          payload?.error?.message ?? `Remote persistence request failed (${response.status})`,
          response.status,
          payload?.error?.code,
          payload?.currentRevision,
        );
        if (!retryableStatus(response.status) || attempt === this.attempts - 1) throw error;
        lastError = error;
      } catch (error) {
        lastError = error;
        if (
          error instanceof RemotePersistenceError
          && (!error.status || !retryableStatus(error.status))
        ) {
          throw error;
        }
        if (attempt === this.attempts - 1) throw error;
      } finally {
        globalThis.clearTimeout(timeout);
      }
      await this.sleep(250 * 2 ** attempt);
    }
    throw lastError instanceof Error ? lastError : new Error('Remote persistence failed');
  }
}

export interface RemoteSaveCoordinatorOptions extends RemoteRepositoryClientOptions {}

export class RemoteSaveCoordinator {
  private readonly client: RemoteRepositoryClient;
  private statePromise: Promise<RemotePlayerStateResponse> | null = null;
  private snapshot: RemotePlayerStateResponse | null = null;

  constructor(baseUrl: string, options: RemoteSaveCoordinatorOptions = {}) {
    this.client = new RemoteRepositoryClient(baseUrl, options);
  }

  get revision(): number {
    return this.snapshot?.revision ?? 0;
  }

  get migrated(): boolean {
    return this.snapshot?.migrated ?? false;
  }

  get current(): RemotePlayerStateResponse | null {
    return this.snapshot;
  }

  async load(force = false): Promise<RemotePlayerStateResponse> {
    if (force) this.statePromise = null;
    this.statePromise ??= this.client
      .request<unknown>('/api/player/state')
      .then((payload) => {
        if (!isRemoteState(payload)) throw new Error('Remote player state response is invalid');
        this.snapshot = payload;
        return payload;
      })
      .catch((error) => {
        this.statePromise = null;
        throw error;
      });
    return this.statePromise;
  }

  async savePlayer(state: PersistedPlayerState): Promise<void> {
    await this.ensureLoaded();
    const body: RemotePlayerSaveRequest = {
      schemaVersion: REMOTE_PLAYER_SAVE_SCHEMA_VERSION,
      expectedRevision: this.revision,
      idempotencyKey: newIdempotencyKey('save'),
      documents: state,
    };
    await this.mutate('/api/player/save', 'POST', body);
  }

  async saveCheckpoint(checkpoint: string | null): Promise<void> {
    await this.ensureLoaded();
    const body: RemoteCheckpointSaveRequest = {
      schemaVersion: REMOTE_PLAYER_SAVE_SCHEMA_VERSION,
      expectedRevision: this.revision,
      idempotencyKey: newIdempotencyKey('checkpoint'),
      checkpoint,
    };
    await this.mutate('/api/player/checkpoint', 'PUT', body);
  }

  async saveCargo(state: PersistedCargoState): Promise<void> {
    await this.ensureLoaded();
    const body: RemoteCargoSaveRequest = {
      schemaVersion: REMOTE_PLAYER_SAVE_SCHEMA_VERSION,
      expectedRevision: this.revision,
      idempotencyKey: newIdempotencyKey('cargo'),
      documents: state,
    };
    await this.mutate('/api/player/cargo', 'PUT', body);
  }

  async migrate(
    documents: RemoteLocalMigrationRequest['documents'],
    idempotency: string,
  ): Promise<RemoteSaveMutationResponse> {
    const body: RemoteLocalMigrationRequest = {
      schemaVersion: REMOTE_PLAYER_SAVE_SCHEMA_VERSION,
      idempotencyKey: idempotency,
      documents,
    };
    return this.mutate('/api/player/migrate-local', 'POST', body);
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.snapshot) await this.load();
  }

  private async mutate(
    path: string,
    method: 'POST' | 'PUT',
    body: unknown,
  ): Promise<RemoteSaveMutationResponse> {
    const payload = await this.client.request<unknown>(path, {
      method,
      body: JSON.stringify(body),
    });
    if (!isMutationResponse(payload)) {
      throw new Error('Remote save mutation response is invalid');
    }
    if (this.snapshot) {
      this.snapshot = {
        ...this.snapshot,
        revision: payload.revision,
        migrated: payload.migrated,
      };
      this.statePromise = Promise.resolve(this.snapshot);
    }
    return payload;
  }
}

function newIdempotencyKey(operation: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${operation}:${uuid}`;
}

export class RemotePlayerRepository implements PlayerRepository {
  private readonly coordinator: RemoteSaveCoordinator;

  constructor(
    baseUrl: string,
    fetcher?: FetchLike,
    coordinator?: RemoteSaveCoordinator,
  ) {
    this.coordinator = coordinator ?? new RemoteSaveCoordinator(baseUrl, { fetcher });
  }

  async loadPlayer(_playerId: string): Promise<PersistedPlayerState | null> {
    return (await this.coordinator.load()).state;
  }

  async savePlayer(_playerId: string, state: PersistedPlayerState): Promise<void> {
    await this.coordinator.savePlayer(state);
  }

  async saveCheckpoint(_playerId: string, checkpoint: string | null): Promise<void> {
    await this.coordinator.saveCheckpoint(checkpoint);
  }
}

export class RemoteCargoRepository implements CargoRepository {
  private readonly coordinator: RemoteSaveCoordinator;

  constructor(
    baseUrl: string,
    fetcher?: FetchLike,
    coordinator?: RemoteSaveCoordinator,
  ) {
    this.coordinator = coordinator ?? new RemoteSaveCoordinator(baseUrl, { fetcher });
  }

  async loadCargo(_playerId: string): Promise<PersistedCargoState> {
    return (await this.coordinator.load()).cargo ?? {
      schemaVersion: PERSISTED_CARGO_SCHEMA_VERSION,
      cargo: null,
    };
  }

  async saveCargo(_playerId: string, state: PersistedCargoState): Promise<void> {
    await this.coordinator.saveCargo(state);
  }
}

/** S7 owns these endpoints. S6 keeps the browser economy on LocalEconomyRepository. */
export class RemoteEconomyRepository implements EconomyRepository {
  private readonly client: RemoteRepositoryClient;

  constructor(baseUrl: string, fetcher?: FetchLike) {
    this.client = new RemoteRepositoryClient(baseUrl, { fetcher });
  }

  async loadWorld(_worldId: string): Promise<PersistedEconomyState | null> {
    return this.client.request<PersistedEconomyState | null>('/api/economy/world');
  }

  async saveWorld(_worldId: string, state: PersistedEconomyState): Promise<void> {
    await this.client.request<void>('/api/economy/world', {
      method: 'PUT',
      body: JSON.stringify({ state }),
    });
  }
}
