import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { MONSTER_REWARD_TABLE, computeEnemyReward } from '@pirate-fruit/shared';
import {
  CORE_MIGRATION_TAG,
  MONSTER_KILLS_MIGRATION_TAG,
  PLAYER_SAVE_MIGRATION_TAG,
  QUEST_CLAIMS_MIGRATION_TAG,
  databaseMigrationDirectory,
} from '../persistence/migrations.js';
import { PostgresMonsterRepository } from './monsterRepository.js';
import { MonsterService } from './monsterService.js';

const CHARACTER = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

async function applySchema(pool: Pool): Promise<void> {
  // pg-mem ไม่มี pg_advisory_lock — apply ไฟล์ migration ตรง ๆ แบบเดียวกับ migrations.test
  const directory = databaseMigrationDirectory();
  const tags = [
    CORE_MIGRATION_TAG,
    PLAYER_SAVE_MIGRATION_TAG,
    QUEST_CLAIMS_MIGRATION_TAG,
    MONSTER_KILLS_MIGRATION_TAG,
  ];
  for (const tag of tags) {
    const sql = await readFile(join(directory, `${tag}.sql`), 'utf8');
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean)) {
      await pool.query(statement);
    }
  }
}

async function seededPool(level = 3, coins = 100): Promise<Pool> {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  pools.push(pool);
  await applySchema(pool);
  await pool.query('insert into users (id) values ($1)', [USER]);
  await pool.query(
    `insert into characters (id, user_id, name, level, coins, current_island_id, spawn_id)
     values ($1, $2, 'Hunter', $3, $4, 'starter-island', 'village')`,
    [CHARACTER, USER, level, String(coins)],
  );
  return pool;
}

function service(pool: Pool): MonsterService {
  return new MonsterService(new PostgresMonsterRepository(pool));
}

async function coinsOf(pool: Pool): Promise<number> {
  const row = await pool.query<{ coins: string }>(
    'select coins::text as coins from characters where id = $1',
    [CHARACTER],
  );
  return Number(row.rows[0]?.coins ?? 'NaN');
}

const V = 1;

describe('S11 monster reward authority', () => {
  it('grants full rewards for same-level kills into characters.coins', async () => {
    const pool = await seededPool(3, 100);
    const crab = MONSTER_REWARD_TABLE.crab; // level 2 — ห่างไม่เกิน 5 → ตัวคูณเต็ม

    const outcome = await service(pool).grantKills(CHARACTER, {
      schemaVersion: V,
      idempotencyKey: 'kills:batch-1',
      kills: [{ monsterId: 'crab', count: 3 }],
    });
    expect(outcome.rewards).toEqual([
      {
        monsterId: 'crab',
        count: 3,
        playerExp: crab.playerExp * 3,
        coins: crab.coins * 3,
        masteryExp: crab.masteryExp * 3,
      },
    ]);
    expect(outcome.coinsTotal).toBe(100 + crab.coins * 3);
    expect(await coinsOf(pool)).toBe(100 + crab.coins * 3);
  });

  it('applies the shared level multiplier from the server-recorded level', async () => {
    // เลเวล 30 ตี crab เลเวล 2 (ห่าง 28 > 20) → ตัวคูณต่ำสุด 0.2 (เหรียญขั้นต่ำ 0.5)
    const pool = await seededPool(30, 0);
    const expected = computeEnemyReward(30, MONSTER_REWARD_TABLE.crab);
    expect(expected.multiplier).toBe(0.2);

    const outcome = await service(pool).grantKills(CHARACTER, {
      schemaVersion: V,
      idempotencyKey: 'kills:lowlevel',
      kills: [{ monsterId: 'crab', count: 1 }],
    });
    expect(outcome.rewards[0]).toMatchObject({
      playerExp: expected.playerExp,
      coins: expected.coins,
      masteryExp: expected.masteryExp,
    });
    expect(await coinsOf(pool)).toBe(expected.coins);
  });

  it('keeps the boss minimum multiplier', async () => {
    const pool = await seededPool(60, 0); // ตีบอสเลเวล 10 (ห่าง 50) → บอสขั้นต่ำ 0.5
    const expected = computeEnemyReward(60, MONSTER_REWARD_TABLE.boss);
    expect(expected.multiplier).toBe(0.5);
    const outcome = await service(pool).grantKills(CHARACTER, {
      schemaVersion: V,
      idempotencyKey: 'kills:boss',
      kills: [{ monsterId: 'boss', count: 1 }],
    });
    expect(outcome.totals.coins).toBe(expected.coins);
  });

  it('replays idempotently and rejects key reuse with a different payload', async () => {
    const pool = await seededPool(3, 0);
    const quests = service(pool);
    const request = {
      schemaVersion: V,
      idempotencyKey: 'kills:replay',
      kills: [{ monsterId: 'crab', count: 2 }],
    };
    const first = await quests.grantKills(CHARACTER, request);
    const replay = await quests.grantKills(CHARACTER, request);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.coinsTotal).toBe(first.coinsTotal);
    expect(replay.rewards).toEqual(first.rewards);
    expect(await coinsOf(pool)).toBe(first.coinsTotal);

    await expect(
      quests.grantKills(CHARACTER, { ...request, kills: [{ monsterId: 'crab', count: 3 }] }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(await coinsOf(pool)).toBe(first.coinsTotal);
  });

  it('rejects unknown monsters and over-cap reports', async () => {
    const pool = await seededPool();
    const monsters = service(pool);
    await expect(
      monsters.grantKills(CHARACTER, {
        schemaVersion: V,
        idempotencyKey: 'kills:unknown',
        kills: [{ monsterId: 'not-a-monster', count: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_MONSTER' });
    // count เกินเพดาน → zod
    await expect(
      monsters.grantKills(CHARACTER, {
        schemaVersion: V,
        idempotencyKey: 'kills:overcap',
        kills: [{ monsterId: 'crab', count: 999 }],
      }),
    ).rejects.toThrow();
    expect(await coinsOf(pool)).toBe(100);
  });

  it('keeps the 0003 migration and rollback manifest', async () => {
    const directory = databaseMigrationDirectory();
    const forward = await readFile(
      join(directory, `${MONSTER_KILLS_MIGRATION_TAG}.sql`),
      'utf8',
    );
    const reverse = await readFile(
      join(directory, 'rollback', `${MONSTER_KILLS_MIGRATION_TAG}.down.sql`),
      'utf8',
    );
    expect(forward).toContain('CREATE TABLE "monster_kill_batches"');
    expect(forward).toContain('monster_kill_batches_character_idempotency_uq');
    expect(reverse).toContain('DROP TABLE IF EXISTS "monster_kill_batches"');
  });
});
