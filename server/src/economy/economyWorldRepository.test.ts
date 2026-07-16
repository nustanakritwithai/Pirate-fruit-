import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { PostgresEconomyWorldRepository } from './economyWorldRepository.js';

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

describe('Postgres economy world transaction', () => {
  it('rolls back a partial tick write and retains the leadership connection', async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('pg_try_advisory_lock')) return result([{ acquired: true }]);
        if (sql.includes('for update')) return result([{ tick: '4' }]);
        if (sql.includes('insert into economy_worlds')) throw new Error('simulated write failure');
        return result([]);
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const repository = new PostgresEconomyWorldRepository(pool);
    const lease = await repository.tryAcquireLeadership();

    await expect(lease!.save({
      worldId: 'main',
      schemaVersion: 1,
      tick: 5,
      document: { version: 8, world: { tick: 5, cells: [] } },
      tickedAt: new Date(),
      createSnapshot: true,
      snapshotRetention: 120,
    })).rejects.toThrow('simulated write failure');
    expect(statements).toContain('begin');
    expect(statements).toContain('rollback');
    expect(statements).not.toContain('commit');
    expect(client.release).not.toHaveBeenCalled();
    await lease!.release();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects a stale in-memory tick before overwriting a newer database world', async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('pg_try_advisory_lock')) return result([{ acquired: true }]);
        if (sql.includes('for update')) return result([{ tick: '9' }]);
        return result([]);
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const repository = new PostgresEconomyWorldRepository({
      connect: vi.fn(async () => client),
    } as unknown as Pool);
    const lease = await repository.tryAcquireLeadership();

    await expect(lease!.save({
      worldId: 'main',
      schemaVersion: 1,
      tick: 8,
      document: { version: 8, world: { tick: 8, cells: [] } },
      tickedAt: new Date(),
      createSnapshot: false,
      snapshotRetention: 120,
    })).rejects.toThrow('Refusing stale economy write');
    expect(statements).toContain('rollback');
    expect(statements.some((sql) => sql.includes('insert into economy_worlds'))).toBe(false);
    await lease!.release();
  });
});
