import { createPostgresPool } from './database.js';
import { requireDatabaseUrl } from './databaseToolEnvironment.js';
import { rollbackS4Database, ROLLBACK_CONFIRMATION } from './migrations.js';

async function main(): Promise<void> {
  if (process.env.DATABASE_ROLLBACK_CONFIRM !== ROLLBACK_CONFIRMATION) {
    throw new Error(
      `Refusing destructive rollback: set DATABASE_ROLLBACK_CONFIRM=${ROLLBACK_CONFIRMATION}`,
    );
  }

  const pool = createPostgresPool(requireDatabaseUrl(), {
    application_name: 'pirate-fruit-rollback',
    max: 1,
    statement_timeout: 60_000,
  });
  try {
    await rollbackS4Database(pool);
    console.info(JSON.stringify({ ok: true, operation: 'database-rollback', version: 1 }));
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown rollback failure';
  console.error(JSON.stringify({ ok: false, operation: 'database-rollback', message }));
  process.exitCode = 1;
});
