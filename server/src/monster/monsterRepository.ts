import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  MONSTER_REWARD_TABLE,
  computeEnemyReward,
  type MonsterKillEntry,
  type MonsterKillRewardEntry,
  type MonsterRejectCode,
} from '@pirate-fruit/shared';

/** คำขอถูกปฏิเสธด้วยเหตุผลทางธุรกิจ — ไม่ใช่ความผิดพลาดระบบ */
export class MonsterRejectedError extends Error {
  constructor(
    readonly code: MonsterRejectCode,
    message: string,
  ) {
    super(message);
    this.name = 'MonsterRejectedError';
  }
}

export interface MonsterKillsOutcome {
  rewards: MonsterKillRewardEntry[];
  totals: { playerExp: number; coins: number; masteryExp: number };
  coinsTotal: number;
  idempotentReplay: boolean;
}

interface StoredBatch {
  rewards?: MonsterKillRewardEntry[];
  totals?: { playerExp: number; coins: number; masteryExp: number };
}

function numberFromBigint(value: string | number | bigint): number {
  return typeof value === 'number' ? value : Number(value);
}

/**
 * S11 Monster Reward Authority — Server คิดรางวัลการฆ่ามอนสเตอร์เอง
 * ธุรกรรมเดียว: lock แถวตัวละคร → idempotency → คิดรางวัลจาก databook shared
 * ด้วย characters.level (ตัวคูณส่วนต่างเลเวลสูตรเดียวกับเกม) → เหรียญเข้า
 * characters.coins → บันทึก audit ลง monster_kill_batches
 */
export class PostgresMonsterRepository {
  constructor(private readonly pool: Pool) {}

  async grantKills(input: {
    characterId: string;
    idempotencyKey: string;
    requestHash: string;
    kills: MonsterKillEntry[];
  }): Promise<MonsterKillsOutcome> {
    for (const kill of input.kills) {
      if (!MONSTER_REWARD_TABLE[kill.monsterId]) {
        throw new MonsterRejectedError('UNKNOWN_MONSTER', `Unknown monster '${kill.monsterId}'`);
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const character = await client.query<{ level: number; coins: string }>(
        'select level, coins::text as coins from characters where id = $1 for update',
        [input.characterId],
      );
      const characterRow = character.rows[0];
      if (!characterRow) {
        throw new MonsterRejectedError('SESSION_REQUIRED', 'Character identity was not found');
      }
      const coins = numberFromBigint(characterRow.coins);

      const existing = await client.query<{
        request_hash: string;
        kills_json: StoredBatch;
        coins_after: string;
      }>(
        `select request_hash, kills_json, coins_after::text as coins_after
           from monster_kill_batches
          where character_id = $1 and idempotency_key = $2`,
        [input.characterId, input.idempotencyKey],
      );
      const replay = existing.rows[0];
      if (replay) {
        if (replay.request_hash !== input.requestHash) {
          throw new MonsterRejectedError(
            'IDEMPOTENCY_KEY_REUSED',
            'Idempotency key was reused with a different kill report',
          );
        }
        await client.query('commit');
        return {
          rewards: replay.kills_json.rewards ?? [],
          totals: replay.kills_json.totals ?? { playerExp: 0, coins: 0, masteryExp: 0 },
          coinsTotal: numberFromBigint(replay.coins_after),
          idempotentReplay: true,
        };
      }

      const rewards: MonsterKillRewardEntry[] = input.kills.map((kill) => {
        const entry = MONSTER_REWARD_TABLE[kill.monsterId]!;
        const perKill = computeEnemyReward(characterRow.level, entry);
        return {
          monsterId: kill.monsterId,
          count: kill.count,
          playerExp: perKill.playerExp * kill.count,
          coins: perKill.coins * kill.count,
          masteryExp: perKill.masteryExp * kill.count,
        };
      });
      const totals = rewards.reduce(
        (sum, reward) => ({
          playerExp: sum.playerExp + reward.playerExp,
          coins: sum.coins + reward.coins,
          masteryExp: sum.masteryExp + reward.masteryExp,
        }),
        { playerExp: 0, coins: 0, masteryExp: 0 },
      );
      const coinsTotal = coins + totals.coins;

      await client.query(
        'update characters set coins = $2, updated_at = now() where id = $1',
        [input.characterId, String(coinsTotal)],
      );
      await client.query(
        `insert into monster_kill_batches
           (id, character_id, idempotency_key, request_hash, kills_json,
            player_exp, mastery_exp, coins, coins_after)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          input.characterId,
          input.idempotencyKey,
          input.requestHash,
          JSON.stringify({ rewards, totals } satisfies StoredBatch),
          totals.playerExp,
          totals.masteryExp,
          totals.coins,
          String(coinsTotal),
        ],
      );
      await client.query('commit');
      return { rewards, totals, coinsTotal, idempotentReplay: false };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
