import { performance } from 'node:perf_hooks';
import { Pool, type PoolConfig } from 'pg';

export interface DatabaseProbe {
  readonly enabled: boolean;
  ping(): Promise<number>;
  close(): Promise<void>;
}

export function createPostgresPool(
  databaseUrl: string,
  overrides: Partial<PoolConfig> = {},
): Pool {
  return new Pool({
    connectionString: databaseUrl,
    application_name: 'pirate-fruit-server',
    max: 10,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    ...overrides,
  });
}

class DisabledDatabaseProbe implements DatabaseProbe {
  readonly enabled = false;

  async ping(): Promise<number> {
    return 0;
  }

  async close(): Promise<void> {
    // No connection was opened.
  }
}

class PostgresDatabaseProbe implements DatabaseProbe {
  readonly enabled = true;

  constructor(private readonly pool: Pool) {}

  async ping(): Promise<number> {
    const startedAt = performance.now();
    await this.pool.query('select 1 as ready');
    return Math.max(0, performance.now() - startedAt);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createDatabaseProbe(databaseUrl?: string): DatabaseProbe {
  if (!databaseUrl) return new DisabledDatabaseProbe();

  return new PostgresDatabaseProbe(createPostgresPool(databaseUrl, { max: 5 }));
}
