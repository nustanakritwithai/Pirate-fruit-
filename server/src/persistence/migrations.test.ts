import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import {
  calculateMigrationChecksum,
  CORE_MIGRATION_TAG,
  databaseMigrationDirectory,
  verifyAndRecordSchemaMigration,
} from './migrations.js';
import { seedDatabase } from './seed.js';

const REQUIRED_TABLES = [
  'users',
  'sessions',
  'characters',
  'player_progression',
  'player_stats',
  'player_inventory',
  'player_equipment',
  'player_cargo',
  'player_quests',
  'player_boats',
  'player_checkpoints',
  'economy_worlds',
  'economy_snapshots',
  'trade_transactions',
  'schema_migrations',
] as const;

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

function createMemoryPool(): Pool {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  pools.push(pool);
  return pool;
}

async function publicTables(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
      order by table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

describe('S4 database migrations', () => {
  it('keeps a complete forward and reverse manifest', async () => {
    const directory = databaseMigrationDirectory();
    const forward = await readFile(join(directory, `${CORE_MIGRATION_TAG}.sql`), 'utf8');
    const reverse = await readFile(
      join(directory, 'rollback', `${CORE_MIGRATION_TAG}.down.sql`),
      'utf8',
    );

    for (const table of REQUIRED_TABLES) {
      expect(forward).toContain(`CREATE TABLE "${table}"`);
      expect(reverse).toContain(`DROP TABLE IF EXISTS "${table}"`);
    }
    expect(forward).toContain('trade_transactions_character_idempotency_uq');
    expect(forward).toContain('player_cargo_character_boat_commodity_uq');
  });

  it('migrates, records checksums, seeds idempotently, and rolls back in memory', async () => {
    const pool = createMemoryPool();

    const directory = databaseMigrationDirectory();
    const forward = await readFile(join(directory, `${CORE_MIGRATION_TAG}.sql`), 'utf8');
    for (const statement of forward
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean)) {
      await pool.query(statement);
    }

    const checksum = await calculateMigrationChecksum(directory);
    await verifyAndRecordSchemaMigration(pool, checksum);
    await verifyAndRecordSchemaMigration(pool, checksum);
    await expect(
      verifyAndRecordSchemaMigration(pool, '0'.repeat(64)),
    ).rejects.toThrow(/checksum does not match/);
    expect(await publicTables(pool)).toEqual(expect.arrayContaining([...REQUIRED_TABLES]));

    const migrationRows = await pool.query<{ version: number; checksum: string }>(
      'select version, checksum from schema_migrations',
    );
    expect(migrationRows.rows).toEqual([{ version: 1, checksum }]);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    expect(await seedDatabase(pool)).toEqual({ worldId: 'main', inserted: true });
    await seedDatabase(pool);
    const worlds = await pool.query<{ count: number }>(
      'select count(*)::int as count from economy_worlds where id = $1',
      ['main'],
    );
    expect(worlds.rows[0]?.count).toBe(1);

    const reverse = await readFile(
      join(directory, 'rollback', `${CORE_MIGRATION_TAG}.down.sql`),
      'utf8',
    );
    for (const statement of reverse
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('DROP SCHEMA'))) {
      await pool.query(statement);
    }
    expect(await publicTables(pool)).not.toEqual(expect.arrayContaining([...REQUIRED_TABLES]));
  });
});
