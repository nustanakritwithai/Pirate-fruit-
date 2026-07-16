import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresPool } from './database.js';
import { applyDatabaseMigrations, rollbackS4Database } from './migrations.js';
import { seedDatabase } from './seed.js';
import {
  LocalMigrationAlreadyAppliedError,
  PostgresPlayerSaveRepository,
  SaveRevisionConflictError,
} from '../player/playerSaveRepository.js';
import { defaultPlayerState } from '../player/playerState.js';
import { PostgresEconomyWorldRepository } from '../economy/economyWorldRepository.js';

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
    expect(migration.version).toBe(2);
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

  it('persists isolated revisioned saves, prevents duplicate migration, and rolls back', async () => {
    const database = pool!;
    const repository = new PostgresPlayerSaveRepository(database);
    const userIds = [
      '11000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000002',
      '11000000-0000-4000-8000-000000000003',
    ];
    const characterIds = [
      '21000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000003',
    ];
    for (let index = 0; index < userIds.length; index++) {
      await database.query('insert into users (id) values ($1)', [userIds[index]]);
      await database.query(
        `insert into characters (id, user_id, name, current_island_id, spawn_id)
         values ($1, $2, $3, 'starter-island', 'starter-dock')`,
        [characterIds[index], userIds[index], `Save Tester ${index + 1}`],
      );
    }

    const state = defaultPlayerState();
    state.progression.coins = 321;
    state.inventory.ownedSwords = ['training-sword'];
    state.boats = [{
      definitionId: 'training-dinghy',
      name: 'Training Dinghy',
      maxHp: 130,
      cargoCapacity: 8,
      upgrades: { hull: 0, cannon: 0, sail: 0 },
      active: true,
    }];
    state.cargo.slots = [{ commodityId: 'fresh-fish', quantity: 4 }];
    const migration = {
      characterId: characterIds[0]!,
      operation: 'migration' as const,
      idempotencyKey: 'migration:postgres-test-0001',
      requestHash: 'a'.repeat(64),
    };
    expect(await repository.migrate(migration, state)).toMatchObject({
      revision: 1,
      idempotentReplay: false,
      migrated: true,
    });
    expect(await repository.migrate(migration, state)).toMatchObject({
      revision: 1,
      idempotentReplay: true,
    });
    await expect(repository.migrate({
      ...migration,
      idempotencyKey: 'migration:postgres-test-0002',
      requestHash: 'b'.repeat(64),
    }, state)).rejects.toBeInstanceOf(LocalMigrationAlreadyAppliedError);

    const loaded = await repository.load(characterIds[0]!);
    expect(loaded.state?.progression.coins).toBe(321);
    expect(loaded.state?.inventory.ownedSwords).toEqual(['training-sword']);
    expect(loaded.state?.boats).toHaveLength(1);
    expect(loaded.state?.cargo.slots).toEqual([{ commodityId: 'fresh-fish', quantity: 4 }]);
    expect((await repository.load(characterIds[1]!)).state).toBeNull();
    await expect(repository.save({
      characterId: characterIds[0]!,
      operation: 'save',
      expectedRevision: 0,
      idempotencyKey: 'save:stale-postgres-test',
      requestHash: 'c'.repeat(64),
    }, state)).rejects.toBeInstanceOf(SaveRevisionConflictError);

    const invalid = defaultPlayerState();
    invalid.progression.coins = 999;
    invalid.cargo.slots = [{ commodityId: 'fresh-fish', quantity: -1 }];
    await expect(repository.migrate({
      characterId: characterIds[2]!,
      operation: 'migration',
      idempotencyKey: 'migration:rollback-test',
      requestHash: 'd'.repeat(64),
    }, invalid)).rejects.toThrow();
    expect((await repository.load(characterIds[2]!)).state).toBeNull();
    const rolledBack = await database.query<{ save_revision: string; coins: string }>(
      'select save_revision, coins from characters where id = $1',
      [characterIds[2]],
    );
    expect(Number(rolledBack.rows[0]?.save_revision)).toBe(0);
    expect(Number(rolledBack.rows[0]?.coins)).toBe(0);
  });

  it('elects one economy writer and commits world plus snapshot in one transaction', async () => {
    const database = pool!;
    const repository = new PostgresEconomyWorldRepository(database);
    const lease = await repository.tryAcquireLeadership();
    expect(lease).not.toBeNull();
    try {
      const tickedAt = new Date('2026-01-01T00:00:00.000Z');
      const document = {
        version: 8,
        world: { tick: 12, cells: [{ id: 'leaf-island', commodities: {} }] },
      };
      await lease!.save({
        worldId: 'main',
        schemaVersion: 1,
        tick: 12,
        document,
        tickedAt,
        createSnapshot: true,
        snapshotRetention: 120,
      });

      expect(await lease!.load('main')).toMatchObject({
        worldId: 'main',
        schemaVersion: 1,
        tick: 12,
        document,
      });
      await expect(lease!.save({
        worldId: 'main',
        schemaVersion: 1,
        tick: 11,
        document: { version: 8, world: { tick: 11, cells: [] } },
        tickedAt: new Date('2025-12-31T23:59:55.000Z'),
        createSnapshot: false,
        snapshotRetention: 120,
      })).rejects.toThrow('Refusing stale economy write');
      expect((await lease!.load('main'))?.tick).toBe(12);
    } finally {
      await lease?.release();
    }
    const snapshots = await database.query<{ count: number }>(
      'select count(*)::int as count from economy_snapshots where world_id = $1 and tick = 12',
      ['main'],
    );
    expect(snapshots.rows[0]?.count).toBe(1);
  });
});
