import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresPool } from './database.js';
import { applyDatabaseMigrations, rollbackS4Database } from './migrations.js';
import { seedDatabase } from './seed.js';

const databaseTestUrl = process.env.DATABASE_TEST_URL;
const integration = describe.runIf(Boolean(databaseTestUrl));
let pool: Pool | undefined;

integration.sequential('PostgreSQL integration', () => {
  beforeAll(async () => {
    pool = createPostgresPool(databaseTestUrl!, {
      application_name: 'pirate-fruit-integration-tests',
      max: 1,
      statement_timeout: 30_000,
    });
    const database = await pool.query<{ name: string }>('select current_database() as name');
    if (!database.rows[0]?.name.endsWith('_test')) {
      await pool.end();
      pool = undefined;
      throw new Error('Refusing database integration reset outside a *_test database');
    }
    await rollbackS4Database(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    await rollbackS4Database(pool).catch(() => undefined);
    await pool.end();
    pool = undefined;
  });

  it('enforces schema constraints and idempotency on PostgreSQL', async () => {
    const database = pool!;
    const migration = await applyDatabaseMigrations(database);
    expect(migration.version).toBe(1);
    await applyDatabaseMigrations(database);

    const userId = '10000000-0000-4000-8000-000000000001';
    const secondUserId = '10000000-0000-4000-8000-000000000002';
    const characterId = '20000000-0000-4000-8000-000000000001';
    const secondCharacterId = '20000000-0000-4000-8000-000000000002';
    const boatId = '30000000-0000-4000-8000-000000000001';
    await database.query('insert into users (id) values ($1)', [userId]);
    await database.query('insert into users (id) values ($1)', [secondUserId]);
    await database.query(
      `insert into characters (id, user_id, name, current_island_id, spawn_id)
       values ($1, $2, 'Migration Tester', 'starter-island', 'starter-dock')`,
      [characterId, userId],
    );
    await database.query(
      `insert into characters (id, user_id, name, current_island_id, spawn_id)
       values ($1, $2, 'Second Tester', 'starter-island', 'starter-dock')`,
      [secondCharacterId, secondUserId],
    );
    await database.query(
      `insert into player_boats
         (id, character_id, boat_definition_id, name, hp, max_hp, cargo_capacity, is_active)
       values ($1, $2, 'sloop', 'Test Sloop', 100, 100, 20, true)`,
      [boatId, characterId],
    );

    await expect(
      database.query(
        `insert into player_cargo (character_id, boat_id, commodity_id, quantity)
         values ($1, $2, 'fresh-fish', 1)`,
        [secondCharacterId, boatId],
      ),
    ).rejects.toThrow();

    await expect(
      database.query('update characters set coins = -1 where id = $1', [characterId]),
    ).rejects.toThrow();

    await database.query(
      `insert into trade_transactions
         (id, character_id, action, island_id, commodity_id, quantity,
          unit_price, fee, total, idempotency_key)
       values ('40000000-0000-4000-8000-000000000001', $1, 'buy',
               'starter-island', 'fresh-fish', 2, 10, 0, 20, 'same-request')`,
      [characterId],
    );
    await expect(
      database.query(
        `insert into trade_transactions
           (id, character_id, action, island_id, commodity_id, quantity,
            unit_price, fee, total, idempotency_key)
         values ('40000000-0000-4000-8000-000000000002', $1, 'buy',
                 'starter-island', 'fresh-fish', 2, 10, 0, 20, 'same-request')`,
        [characterId],
      ),
    ).rejects.toThrow();

    expect(await seedDatabase(database)).toEqual({ worldId: 'main', inserted: true });
    expect(await seedDatabase(database)).toEqual({ worldId: 'main', inserted: false });
  });
});
