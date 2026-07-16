import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool, PoolClient } from 'pg';

export const DATABASE_SCHEMA_VERSION = 2;
export const CORE_MIGRATION_TAG = '0000_s4_core_schema';
export const PLAYER_SAVE_MIGRATION_TAG = '0001_s6_remote_player_save';
export const ROLLBACK_CONFIRMATION = 'rollback-s4-core';
const DATABASE_MIGRATION_LOCK_ID = 1_347_565_126;

const DATABASE_MIGRATIONS = [
  { version: 1, name: CORE_MIGRATION_TAG },
  { version: 2, name: PLAYER_SAVE_MIGRATION_TAG },
] as const;

export interface MigrationResult {
  version: number;
  name: string;
  checksum: string;
}

export function databaseMigrationDirectory(): string {
  return fileURLToPath(new URL('../../drizzle/', import.meta.url));
}

export async function calculateMigrationChecksum(
  migrationsFolder: string,
  migrationTag = CORE_MIGRATION_TAG,
): Promise<string> {
  const source = await readFile(join(migrationsFolder, `${migrationTag}.sql`));
  return createHash('sha256').update(source).digest('hex');
}

async function verifyAndRecordSchemaMigrationWithClient(
  client: PoolClient,
  checksum: string,
  version = 1,
  name = CORE_MIGRATION_TAG,
): Promise<void> {
  try {
    await client.query('begin');
    const existing = await client.query<{ checksum: string }>(
      'select checksum from schema_migrations where version = $1 for update',
      [version],
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0]?.checksum !== checksum) {
        throw new Error('Applied database migration checksum does not match repository');
      }
    } else {
      await client.query(
        `insert into schema_migrations (version, name, checksum)
         values ($1, $2, $3)`,
        [version, name, checksum],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

export async function verifyAndRecordSchemaMigration(
  pool: Pool,
  checksum: string,
  version = 1,
  name = CORE_MIGRATION_TAG,
): Promise<void> {
  const client = await pool.connect();
  try {
    await verifyAndRecordSchemaMigrationWithClient(client, checksum, version, name);
  } finally {
    client.release();
  }
}

export async function applyDatabaseMigrations(
  pool: Pool,
  migrationsFolder = databaseMigrationDirectory(),
): Promise<MigrationResult> {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('select pg_advisory_lock($1)', [DATABASE_MIGRATION_LOCK_ID]);
    locked = true;
    const database = drizzle(client);
    await migrate(database, { migrationsFolder });

    let latest: MigrationResult | null = null;
    for (const migration of DATABASE_MIGRATIONS) {
      const checksum = await calculateMigrationChecksum(migrationsFolder, migration.name);
      await verifyAndRecordSchemaMigrationWithClient(
        client,
        checksum,
        migration.version,
        migration.name,
      );
      latest = { ...migration, checksum };
    }
    return latest!;
  } finally {
    if (locked) {
      await client
        .query('select pg_advisory_unlock($1)', [DATABASE_MIGRATION_LOCK_ID])
        .catch(() => undefined);
    }
    client.release();
  }
}

export async function rollbackS4Database(
  pool: Pool,
  migrationsFolder = databaseMigrationDirectory(),
): Promise<void> {
  const rollbackSql = (
    await Promise.all([
      readFile(
        join(migrationsFolder, 'rollback', `${PLAYER_SAVE_MIGRATION_TAG}.down.sql`),
        'utf8',
      ),
      readFile(
        join(migrationsFolder, 'rollback', `${CORE_MIGRATION_TAG}.down.sql`),
        'utf8',
      ),
    ])
  ).join('\n');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(rollbackSql);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
