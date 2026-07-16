import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool, PoolClient } from 'pg';

export const DATABASE_SCHEMA_VERSION = 1;
export const CORE_MIGRATION_TAG = '0000_s4_core_schema';
export const ROLLBACK_CONFIRMATION = 'rollback-s4-core';
const DATABASE_MIGRATION_LOCK_ID = 1_347_565_126;

export interface MigrationResult {
  version: number;
  name: string;
  checksum: string;
}

export function databaseMigrationDirectory(): string {
  return fileURLToPath(new URL('../../drizzle/', import.meta.url));
}

export async function calculateMigrationChecksum(migrationsFolder: string): Promise<string> {
  const source = await readFile(join(migrationsFolder, `${CORE_MIGRATION_TAG}.sql`));
  return createHash('sha256').update(source).digest('hex');
}

async function verifyAndRecordSchemaMigrationWithClient(
  client: PoolClient,
  checksum: string,
): Promise<void> {
  try {
    await client.query('begin');
    const existing = await client.query<{ checksum: string }>(
      'select checksum from schema_migrations where version = $1 for update',
      [DATABASE_SCHEMA_VERSION],
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0]?.checksum !== checksum) {
        throw new Error('Applied database migration checksum does not match repository');
      }
    } else {
      await client.query(
        `insert into schema_migrations (version, name, checksum)
         values ($1, $2, $3)`,
        [DATABASE_SCHEMA_VERSION, CORE_MIGRATION_TAG, checksum],
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
): Promise<void> {
  const client = await pool.connect();
  try {
    await verifyAndRecordSchemaMigrationWithClient(client, checksum);
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

    const checksum = await calculateMigrationChecksum(migrationsFolder);
    await verifyAndRecordSchemaMigrationWithClient(client, checksum);
    return { version: DATABASE_SCHEMA_VERSION, name: CORE_MIGRATION_TAG, checksum };
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
  const rollbackSql = await readFile(
    join(migrationsFolder, 'rollback', `${CORE_MIGRATION_TAG}.down.sql`),
    'utf8',
  );
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
