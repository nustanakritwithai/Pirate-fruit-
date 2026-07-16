import { createPostgresPool } from './database.js';
import { requireDatabaseUrl } from './databaseToolEnvironment.js';
import { seedDatabase } from './seed.js';

async function main(): Promise<void> {
  const pool = createPostgresPool(requireDatabaseUrl(), {
    application_name: 'pirate-fruit-seed',
    max: 1,
  });
  try {
    const result = await seedDatabase(pool);
    console.info(JSON.stringify({ ok: true, operation: 'database-seed', ...result }));
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown seed failure';
  console.error(JSON.stringify({ ok: false, operation: 'database-seed', message }));
  process.exitCode = 1;
});
