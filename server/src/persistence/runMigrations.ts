import { createPostgresPool } from './database.js';
import { requireDatabaseUrl } from './databaseToolEnvironment.js';
import { applyDatabaseMigrations } from './migrations.js';

async function main(): Promise<void> {
  const pool = createPostgresPool(requireDatabaseUrl(), {
    application_name: 'pirate-fruit-migrations',
    max: 1,
    statement_timeout: 60_000,
  });
  try {
    const result = await applyDatabaseMigrations(pool);
    console.info(
      JSON.stringify({ ok: true, operation: 'database-migrate', ...result }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown migration failure';
  console.error(JSON.stringify({ ok: false, operation: 'database-migrate', message }));
  process.exitCode = 1;
});
