import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { QUESTS_BY_ID } from '@pirate-fruit/shared';
import {
  CORE_MIGRATION_TAG,
  PLAYER_SAVE_MIGRATION_TAG,
  QUEST_CLAIMS_MIGRATION_TAG,
  databaseMigrationDirectory,
} from '../persistence/migrations.js';
import { PostgresQuestRepository, QuestRejectedError } from './questRepository.js';
import { QuestService } from './questService.js';

const CHARACTER = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

async function applySchema(pool: Pool): Promise<void> {
  // pg-mem ไม่มี pg_advisory_lock — apply ไฟล์ migration ตรง ๆ แบบเดียวกับ migrations.test
  const directory = databaseMigrationDirectory();
  for (const tag of [CORE_MIGRATION_TAG, PLAYER_SAVE_MIGRATION_TAG, QUEST_CLAIMS_MIGRATION_TAG]) {
    const sql = await readFile(join(directory, `${tag}.sql`), 'utf8');
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean)) {
      await pool.query(statement);
    }
  }
}

async function seededPool(level = 10, coins = 500): Promise<Pool> {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  pools.push(pool);
  await applySchema(pool);
  await pool.query('insert into users (id) values ($1)', [USER]);
  await pool.query(
    `insert into characters (id, user_id, name, level, coins, current_island_id, spawn_id)
     values ($1, $2, 'Quester', $3, $4, 'starter-island', 'village')`,
    [CHARACTER, USER, level, String(coins)],
  );
  return pool;
}

function service(pool: Pool): QuestService {
  return new QuestService(new PostgresQuestRepository(pool));
}

async function coinsOf(pool: Pool): Promise<number> {
  const row = await pool.query<{ coins: string }>(
    'select coins::text as coins from characters where id = $1',
    [CHARACTER],
  );
  return Number(row.rows[0]?.coins ?? 'NaN');
}

const V = 1;

describe('S10 quest authority', () => {
  it('accepts a quest, tracks clamped progress, and completes on the server', async () => {
    const pool = await seededPool();
    const quests = service(pool);

    const accepted = await quests.accept(CHARACTER, { schemaVersion: V, questId: 'starter-crabs' });
    expect(accepted.progress).toEqual([0]);

    // รายงานเวอร์ 99 ต่อ event ถูก clamp ที่ requiredAmount (5)
    const progressed = await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'kill', targetId: 'crab', amount: 99 }],
    });
    expect(progressed.questId).toBe('starter-crabs');
    expect(progressed.progress).toEqual([5]);
    expect(progressed.completed).toBe(true);

    const state = await quests.state(CHARACTER);
    expect(state.active).toEqual({ questId: 'starter-crabs', progress: [5], status: 'completed' });
  });

  it('rejects quests above the character level recorded on the server', async () => {
    const pool = await seededPool(1);
    await expect(
      service(pool).accept(CHARACTER, { schemaVersion: V, questId: 'east-hill-captain' }),
    ).rejects.toMatchObject({ code: 'LEVEL_TOO_LOW' });
  });

  it('enforces one active quest and supports replace', async () => {
    const pool = await seededPool();
    const quests = service(pool);
    await quests.accept(CHARACTER, { schemaVersion: V, questId: 'starter-crabs' });

    await expect(
      quests.accept(CHARACTER, { schemaVersion: V, questId: 'starter-pirates' }),
    ).rejects.toMatchObject({ code: 'ACTIVE_QUEST_CONFLICT' });
    await expect(
      quests.accept(CHARACTER, { schemaVersion: V, questId: 'starter-crabs' }),
    ).rejects.toMatchObject({ code: 'QUEST_ALREADY_ACTIVE' });

    const replaced = await quests.accept(CHARACTER, {
      schemaVersion: V,
      questId: 'starter-pirates',
      replaceActive: true,
    });
    expect(replaced.questId).toBe('starter-pirates');
    const state = await quests.state(CHARACTER);
    expect(state.active?.questId).toBe('starter-pirates');
  });

  it('ignores events that do not match the active objective (island/boss filters)', async () => {
    const pool = await seededPool();
    const quests = service(pool);
    await quests.accept(CHARACTER, { schemaVersion: V, questId: 'trade-fish-to-desert' });

    const wrongIsland = await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'deliver', targetId: 'fresh-fish', amount: 3, islandId: 'starter-island' }],
    });
    expect(wrongIsland.progress).toEqual([0]);

    const rightIsland = await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'deliver', targetId: 'fresh-fish', amount: 3, islandId: 'sunscar-desert' }],
    });
    expect(rightIsland.progress).toEqual([3]);
    expect(rightIsland.completed).toBe(false);
  });

  it('claims rewards exactly once into characters.coins with idempotent replay', async () => {
    const pool = await seededPool(10, 500);
    const quests = service(pool);
    const rewards = QUESTS_BY_ID.get('starter-crabs')!.rewards;

    await quests.accept(CHARACTER, { schemaVersion: V, questId: 'starter-crabs' });
    await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'kill', targetId: 'crab', amount: 5 }],
    });

    const claim = { schemaVersion: V, questId: 'starter-crabs', idempotencyKey: 'quest:claim-1' };
    const first = await quests.claim(CHARACTER, claim);
    expect(first).toMatchObject({
      playerExp: rewards.playerExp,
      coins: rewards.coins,
      masteryBonus: rewards.masteryBonus,
      coinsTotal: 500 + rewards.coins,
      idempotentReplay: false,
    });
    expect(await coinsOf(pool)).toBe(500 + rewards.coins);

    // replay คีย์เดิม → ผลเดิม ไม่บวกซ้ำ
    const replay = await quests.claim(CHARACTER, claim);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.coinsTotal).toBe(500 + rewards.coins);
    expect(await coinsOf(pool)).toBe(500 + rewards.coins);

    // คีย์เดิมกับเควสต์อื่น → ปฏิเสธ
    await expect(
      quests.claim(CHARACTER, { ...claim, questId: 'starter-pirates' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

    // คีย์ใหม่แต่รอบเควสต์นี้เคลมไปแล้ว → ปฏิเสธ ไม่แจกซ้ำ
    await expect(
      quests.claim(CHARACTER, { ...claim, idempotencyKey: 'quest:claim-2' }),
    ).rejects.toMatchObject({ code: 'QUEST_NOT_COMPLETE' });
    expect(await coinsOf(pool)).toBe(500 + rewards.coins);
  });

  it('refuses to claim before the server has seen the objectives complete', async () => {
    const pool = await seededPool();
    const quests = service(pool);
    await quests.accept(CHARACTER, { schemaVersion: V, questId: 'starter-crabs' });
    await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'kill', targetId: 'crab', amount: 2 }],
    });
    await expect(
      quests.claim(CHARACTER, {
        schemaVersion: V,
        questId: 'starter-crabs',
        idempotencyKey: 'quest:claim-early',
      }),
    ).rejects.toMatchObject({ code: 'QUEST_NOT_COMPLETE' });
    expect(await coinsOf(pool)).toBe(500);
  });

  it('supports repeatable quests across claim cycles', async () => {
    const pool = await seededPool(10, 0);
    const quests = service(pool);
    const rewards = QUESTS_BY_ID.get('starter-crabs')!.rewards;

    for (const round of [1, 2]) {
      await quests.accept(CHARACTER, { schemaVersion: V, questId: 'starter-crabs' });
      await quests.progress(CHARACTER, {
        schemaVersion: V,
        events: [{ kind: 'kill', targetId: 'crab', amount: 5 }],
      });
      const outcome = await quests.claim(CHARACTER, {
        schemaVersion: V,
        questId: 'starter-crabs',
        idempotencyKey: `quest:round-${round}`,
      });
      expect(outcome.coinsTotal).toBe(rewards.coins * round);
    }
    expect(await coinsOf(pool)).toBe(rewards.coins * 2);
  });

  it('drops progress events when no quest is active instead of failing', async () => {
    const pool = await seededPool();
    const outcome = await service(pool).progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'kill', targetId: 'crab', amount: 1 }],
    });
    expect(outcome).toMatchObject({ questId: null, progress: [], completed: false });
  });

  it('matches boss objectives only for boss kills', async () => {
    const pool = await seededPool();
    const quests = service(pool);
    await quests.accept(CHARACTER, { schemaVersion: V, questId: 'east-hill-captain' });

    const normalKill = await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'kill', targetId: 'boss', amount: 1 }],
    });
    expect(normalKill.progress).toEqual([0]);

    const bossKill = await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'kill', targetId: 'boss', amount: 1, isBoss: true }],
    });
    expect(bossKill.progress).toEqual([1]);
    expect(bossKill.completed).toBe(true);
  });

  it('keeps the 0002 quest_claims migration and rollback manifest', async () => {
    const directory = databaseMigrationDirectory();
    const forward = await readFile(join(directory, `${QUEST_CLAIMS_MIGRATION_TAG}.sql`), 'utf8');
    const reverse = await readFile(
      join(directory, 'rollback', `${QUEST_CLAIMS_MIGRATION_TAG}.down.sql`),
      'utf8',
    );
    expect(forward).toContain('CREATE TABLE "quest_claims"');
    expect(forward).toContain('quest_claims_character_idempotency_uq');
    expect(reverse).toContain('DROP TABLE IF EXISTS "quest_claims"');
  });

  it('exposes QuestRejectedError codes for the route layer', () => {
    const error = new QuestRejectedError('QUEST_NOT_FOUND', 'x');
    expect(error.code).toBe('QUEST_NOT_FOUND');
  });
});
