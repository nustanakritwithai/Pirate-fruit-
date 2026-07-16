import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';

export interface DatabaseProbe {
  readonly enabled: boolean;
  ping(): Promise<number>;
  close(): Promise<void>;
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

  return new PostgresDatabaseProbe(
    new Pool({
      connectionString: databaseUrl,
      application_name: 'pirate-fruit-server',
      max: 5,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 3_000,
      statement_timeout: 3_000,
    }),
  );
}
