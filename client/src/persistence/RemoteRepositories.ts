import type {
  CargoRepository,
  EconomyRepository,
  PersistedCargoState,
  PersistedEconomyState,
  PersistedPlayerState,
  PlayerRepository,
} from '@pirate-fruit/shared';

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

class RemoteRepositoryClient {
  constructor(
    baseUrl: string,
    private readonly fetcher: FetchLike = globalThis.fetch.bind(globalThis),
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private readonly baseUrl: string;

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: {
          accept: 'application/json',
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
          ...init?.headers,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Remote persistence request failed (${response.status})`);
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

export class RemotePlayerRepository implements PlayerRepository {
  private readonly client: RemoteRepositoryClient;

  constructor(baseUrl: string, fetcher?: FetchLike) {
    this.client = new RemoteRepositoryClient(baseUrl, fetcher);
  }

  async loadPlayer(_playerId: string): Promise<PersistedPlayerState | null> {
    return this.client.request<PersistedPlayerState | null>('/api/player/state');
  }

  async savePlayer(_playerId: string, state: PersistedPlayerState): Promise<void> {
    await this.client.request<void>('/api/player/save', {
      method: 'POST',
      body: JSON.stringify({ state }),
    });
  }
}

export class RemoteCargoRepository implements CargoRepository {
  private readonly client: RemoteRepositoryClient;

  constructor(baseUrl: string, fetcher?: FetchLike) {
    this.client = new RemoteRepositoryClient(baseUrl, fetcher);
  }

  async loadCargo(_playerId: string): Promise<PersistedCargoState> {
    return this.client.request<PersistedCargoState>('/api/player/cargo');
  }

  async saveCargo(_playerId: string, state: PersistedCargoState): Promise<void> {
    await this.client.request<void>('/api/player/cargo', {
      method: 'PUT',
      body: JSON.stringify({ state }),
    });
  }
}

export class RemoteEconomyRepository implements EconomyRepository {
  private readonly client: RemoteRepositoryClient;

  constructor(baseUrl: string, fetcher?: FetchLike) {
    this.client = new RemoteRepositoryClient(baseUrl, fetcher);
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
