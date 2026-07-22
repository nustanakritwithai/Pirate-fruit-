import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  KILL_RATE_MAX_PER_WINDOW,
  applyExpToProgress,
  expRequiredForLevel,
} from '@pirate-fruit/shared';
import {
  CORE_MIGRATION_TAG,
  KILL_COUNT_MIGRATION_TAG,
  MONSTER_KILLS_MIGRATION_TAG,
  PLAYER_SAVE_MIGRATION_TAG,
  QUEST_CLAIMS_MIGRATION_TAG,
  databaseMigrationDirectory,
} from '../persistence/migrations.js';
import { PostgresMonsterRepository } from '../monster/monsterRepository.js';
import { MonsterService } from '../monster/monsterService.js';
import { PostgresQuestRepository } from '../quest/questRepository.js';
import { QuestService } from '../quest/questService.js';
import { PostgresPlayerSaveRepository } from '../player/playerSaveRepository.js';
import {
  PlayerDocumentValidationError,
  defaultPlayerState,
} from '../player/playerState.js';
import { ProgressionService } from './progressionService.js';

const CHARACTER = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

async function applySchema(pool: Pool): Promise<void> {
  const directory = databaseMigrationDirectory();
  const tags = [
    CORE_MIGRATION_TAG,
    PLAYER_SAVE_MIGRATION_TAG,
    QUEST_CLAIMS_MIGRATION_TAG,
    MONSTER_KILLS_MIGRATION_TAG,
    KILL_COUNT_MIGRATION_TAG,
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

async function seededPool(level = 1, coins = 0): Promise<Pool> {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  pools.push(pool);
  await applySchema(pool);
  await pool.query('insert into users (id) values ($1)', [USER]);
  await pool.query(
    `insert into characters (id, user_id, name, level, coins, current_island_id, spawn_id)
     values ($1, $2, 'Fighter', $3, $4, 'starter-island', 'village')`,
    [CHARACTER, USER, level, String(coins)],
  );
  return pool;
}

async function serverProgress(pool: Pool): Promise<{ level: number; exp: number; statPoints: number }> {
  const character = await pool.query<{ level: number }>(
    'select level from characters where id = $1',
    [CHARACTER],
  );
  const progression = await pool.query<{ exp: string; stat_points: number }>(
    'select exp::text as exp, stat_points from player_progression where character_id = $1',
    [CHARACTER],
  );
  return {
    level: character.rows[0]?.level ?? -1,
    exp: Number(progression.rows[0]?.exp ?? '0'),
    statPoints: progression.rows[0]?.stat_points ?? 0,
  };
}

const V = 1;

describe('S12 progression authority', () => {
  it('walks the shared level curve exactly like the game formula', () => {
    expect(expRequiredForLevel(1)).toBe(86);
    const walked = applyExpToProgress({ level: 1, exp: 0 }, 90);
    expect(walked).toEqual({ level: 2, exp: 4, levelsGained: 1 });
  });

  it('accrues exp and levels up from monster kill grants on the server', async () => {
    const pool = await seededPool(1);
    const monsters = new MonsterService(
      new PostgresMonsterRepository(pool, { progressionAuthority: true }),
    );
    // crab 30 exp × 3 = 90 → เลเวล 1 ต้องการ 86 → ขึ้นเลเวล 2 เหลือ 4
    await monsters.grantKills(CHARACTER, {
      schemaVersion: V,
      idempotencyKey: 'kills:level-walk',
      kills: [{ monsterId: 'crab', count: 3 }],
    });
    expect(await serverProgress(pool)).toEqual({ level: 2, exp: 4, statPoints: 3 });
  });

  it('accrues exp from quest claims on the server', async () => {
    const pool = await seededPool(1);
    const quests = new QuestService(
      new PostgresQuestRepository(pool, { progressionAuthority: true }),
    );
    await quests.accept(CHARACTER, { schemaVersion: V, questId: 'starter-crabs' });
    await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'kill', targetId: 'crab', amount: 5 }],
    });
    await quests.claim(CHARACTER, {
      schemaVersion: V,
      questId: 'starter-crabs',
      idempotencyKey: 'quest:level-walk',
    });
    // 120 exp: เลเวล 1 (86) → เลเวล 2 เหลือ 34
    expect(await serverProgress(pool)).toEqual({ level: 2, exp: 34, statPoints: 3 });
  });

  it('does not walk the level when progression authority is off (S11 behavior)', async () => {
    const pool = await seededPool(1);
    const monsters = new MonsterService(new PostgresMonsterRepository(pool));
    await monsters.grantKills(CHARACTER, {
      schemaVersion: V,
      idempotencyKey: 'kills:no-authority',
      kills: [{ monsterId: 'crab', count: 3 }],
    });
    const progress = await serverProgress(pool);
    expect(progress.level).toBe(1);
  });

  it('rejects kill reports that exceed the plausibility window', async () => {
    const pool = await seededPool(1);
    const monsters = new MonsterService(
      new PostgresMonsterRepository(pool, { progressionAuthority: true }),
    );
    // เต็มเพดานหน้าต่าง 60 วิ (40) ด้วยสอง batch แล้วรายงานเพิ่ม → ปฏิเสธ
    for (const round of [1, 2]) {
      await monsters.grantKills(CHARACTER, {
        schemaVersion: V,
        idempotencyKey: `kills:window-${round}`,
        kills: [{ monsterId: 'crab', count: 10 }, { monsterId: 'crab', count: 10 }],
      });
    }
    await expect(
      monsters.grantKills(CHARACTER, {
        schemaVersion: V,
        idempotencyKey: 'kills:over-window',
        kills: [{ monsterId: 'crab', count: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'KILL_RATE_LIMITED' });
    expect(KILL_RATE_MAX_PER_WINDOW).toBe(40);
  });

  it('keeps server level/exp when saves arrive with client-reported progression', async () => {
    const pool = await seededPool(7, 50);
    await pool.query(
      `insert into player_progression (character_id, exp) values ($1, 42)`,
      [CHARACTER],
    );
    const saves = new PostgresPlayerSaveRepository(pool, { preserveServerProgression: true });
    const state = defaultPlayerState();
    state.progression.level = 99;
    state.progression.exp = 9_999;
    state.progression.coins = 777;
    await saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:preserve-test',
        requestHash: 'x'.repeat(64),
        expectedRevision: 0,
      },
      state,
    );
    // level/exp/coins ของ Server อยู่ครบ แม้ client ส่งค่าปลอมมาใน full save
    expect(await serverProgress(pool)).toEqual({ level: 7, exp: 42, statPoints: 0 });
    const coins = await pool.query<{ coins: string }>(
      'select coins::text as coins from characters where id = $1',
      [CHARACTER],
    );
    expect(Number(coins.rows[0]?.coins)).toBe(50);
  });

  it('accepts only stat allocations backed by server-issued points', async () => {
    const pool = await seededPool(3, 50);
    await pool.query(
      `insert into player_progression (character_id, exp, stat_points)
       values ($1, 0, 6)`,
      [CHARACTER],
    );
    const saves = new PostgresPlayerSaveRepository(pool, { preserveServerProgression: true });
    const legitimate = defaultPlayerState();
    legitimate.progression.level = 999;
    legitimate.progression.coins = 999_999;
    legitimate.progression.stats.combat = 3;
    legitimate.progression.statPoints = 4;
    await saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:valid-stat-allocation',
        requestHash: 'v'.repeat(64),
        expectedRevision: 0,
      },
      legitimate,
    );
    const stored = await saves.load(CHARACTER);
    expect(stored.state?.progression).toMatchObject({
      level: 3,
      coins: 50,
      statPoints: 4,
      stats: { combat: 3 },
    });

    const forged = defaultPlayerState();
    forged.progression.stats.combat = 2_800;
    forged.progression.statPoints = 0;
    await expect(saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:forged-stat-allocation',
        requestHash: 'f'.repeat(64),
        expectedRevision: 1,
      },
      forged,
    )).rejects.toBeInstanceOf(PlayerDocumentValidationError);
  });

  it('accepts mastery only within rewards recorded by the Server', async () => {
    const pool = await seededPool(1, 0);
    const monsters = new MonsterService(
      new PostgresMonsterRepository(pool, { progressionAuthority: true }),
    );
    await monsters.grantKills(CHARACTER, {
      schemaVersion: V,
      idempotencyKey: 'kills:mastery-budget',
      kills: [{ monsterId: 'crab', count: 1 }],
    });
    const saves = new PostgresPlayerSaveRepository(pool, { preserveServerProgression: true });

    const forged = defaultPlayerState();
    forged.progression.mastery['basic-brawl'].exp = 19; // crab issued exactly 18
    await expect(saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:forged-mastery',
        requestHash: 'm'.repeat(64),
        expectedRevision: 0,
      },
      forged,
    )).rejects.toBeInstanceOf(PlayerDocumentValidationError);

    const legitimate = defaultPlayerState();
    legitimate.progression.mastery['basic-brawl'].exp = 18;
    await saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:valid-mastery',
        requestHash: 'n'.repeat(64),
        expectedRevision: 0,
      },
      legitimate,
    );
    expect((await saves.load(CHARACTER)).state?.progression.mastery['basic-brawl'].exp).toBe(18);
  });

  it('accepts equip/use but rejects forged ownership under Server inventory authority', async () => {
    const pool = await seededPool(1, 500);
    await pool.query('insert into player_progression (character_id) values ($1)', [CHARACTER]);
    await pool.query(
      `insert into player_inventory (character_id, item_id, quantity, metadata_json)
       values ($1, 'koko', 1, '{"kind":"sword"}'::jsonb),
              ($1, 'potion-hp', 2, '{"kind":"consumable"}'::jsonb)`,
      [CHARACTER],
    );
    const saves = new PostgresPlayerSaveRepository(pool, {
      preserveServerProgression: true,
      preserveServerInventory: true,
    });
    const valid = defaultPlayerState();
    valid.inventory.ownedSwords = ['koko'];
    valid.inventory.consumables = { 'potion-hp': 1 };
    valid.inventory.loadout.equippedSwordId = 'koko';
    valid.inventory.loadout.equippedWeaponKind = 'sword';
    await saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:valid-inventory-use',
        requestHash: 'i'.repeat(64),
        expectedRevision: 0,
      },
      valid,
    );
    const inventory = await pool.query<{ item_id: string; quantity: number }>(
      `select item_id, quantity from player_inventory
        where character_id = $1 and item_id <> '__inventory_meta__'
        order by item_id`,
      [CHARACTER],
    );
    expect(inventory.rows).toEqual([
      { item_id: 'combat', quantity: 1 },
      { item_id: 'koko', quantity: 1 },
      { item_id: 'potion-hp', quantity: 1 },
    ]);

    const forged = structuredClone(valid);
    forged.inventory.ownedFruits = ['dragon'];
    await expect(saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:forged-inventory',
        requestHash: 'j'.repeat(64),
        expectedRevision: 1,
      },
      forged,
    )).rejects.toBeInstanceOf(PlayerDocumentValidationError);
  });

  it('does not let a full save rewrite authoritative quest rows', async () => {
    const pool = await seededPool(1);
    const questRepository = new PostgresQuestRepository(pool, { progressionAuthority: true });
    const quests = new QuestService(questRepository);
    await quests.accept(CHARACTER, { schemaVersion: V, questId: 'starter-crabs' });
    await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'kill', targetId: 'crab', amount: 2 }],
    });

    const saves = new PostgresPlayerSaveRepository(pool, {
      preserveServerProgression: true,
      preserveServerQuests: true,
    });
    const state = defaultPlayerState();
    state.progression.completedQuestIds = ['starter-crabs'];
    state.progression.activeQuestId = null;
    await saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:quest-authority-preserved',
        requestHash: 'q'.repeat(64),
        expectedRevision: 0,
      },
      state,
    );

    expect(await quests.state(CHARACTER)).toEqual({
      ok: true,
      schemaVersion: V,
      active: { questId: 'starter-crabs', progress: [2], status: 'active' },
      completedQuestIds: [],
    });
    expect((await saves.load(CHARACTER)).state?.progression).toMatchObject({
      activeQuestId: 'starter-crabs',
      activeQuestProgress: [2],
      completedQuestIds: [],
    });

    await quests.progress(CHARACTER, {
      schemaVersion: V,
      events: [{ kind: 'kill', targetId: 'crab', amount: 3 }],
    });
    await saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:ready-quest-authority-preserved',
        requestHash: 'r'.repeat(64),
        expectedRevision: 1,
      },
      state,
    );
    expect(await quests.state(CHARACTER)).toEqual({
      ok: true,
      schemaVersion: V,
      active: { questId: 'starter-crabs', progress: [5], status: 'completed' },
      completedQuestIds: [],
    });
    expect((await saves.load(CHARACTER)).state?.progression).toMatchObject({
      activeQuestId: 'starter-crabs',
      activeQuestProgress: [5],
      completedQuestIds: [],
    });
  });

  it('overwrites progression from saves when the flag is off (legacy behavior)', async () => {
    const pool = await seededPool(7, 50);
    const saves = new PostgresPlayerSaveRepository(pool);
    const state = defaultPlayerState();
    state.progression.level = 12;
    state.progression.exp = 34;
    await saves.save(
      {
        characterId: CHARACTER,
        operation: 'save',
        idempotencyKey: 'save:legacy-test',
        requestHash: 'y'.repeat(64),
        expectedRevision: 0,
      },
      state,
    );
    expect(await serverProgress(pool)).toEqual({ level: 12, exp: 34, statPoints: 0 });
  });

  it('serves the authoritative progression state', async () => {
    const pool = await seededPool(4, 120);
    await pool.query(
      `insert into player_progression (character_id, exp) values ($1, 55)`,
      [CHARACTER],
    );
    const service = new ProgressionService(pool);
    expect(await service.state(CHARACTER)).toEqual({
      ok: true,
      schemaVersion: V,
      level: 4,
      exp: 55,
      coins: 120,
    });
    expect(await service.state('99999999-9999-4999-8999-999999999999')).toBeNull();
  });

  it('keeps the 0004 migration and rollback manifest', async () => {
    const directory = databaseMigrationDirectory();
    const forward = await readFile(join(directory, `${KILL_COUNT_MIGRATION_TAG}.sql`), 'utf8');
    const reverse = await readFile(
      join(directory, 'rollback', `${KILL_COUNT_MIGRATION_TAG}.down.sql`),
      'utf8',
    );
    expect(forward).toContain('ADD COLUMN "kill_count"');
    expect(reverse).toContain('DROP COLUMN IF EXISTS "kill_count"');
  });
});
