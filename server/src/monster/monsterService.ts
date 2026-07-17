import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  MONSTER_KILLS_MAX_COUNT,
  MONSTER_KILLS_MAX_ENTRIES,
  MONSTER_PROTOCOL_SCHEMA_VERSION,
  type MonsterKillsResponse,
} from '@pirate-fruit/shared';
import type { PostgresMonsterRepository } from './monsterRepository.js';

const killsSchema = z.object({
  schemaVersion: z.literal(MONSTER_PROTOCOL_SCHEMA_VERSION),
  idempotencyKey: z.string().min(8).max(128),
  kills: z
    .array(
      z.object({
        monsterId: z.string().min(1).max(128),
        count: z.number().int().min(1).max(MONSTER_KILLS_MAX_COUNT),
      }),
    )
    .min(1)
    .max(MONSTER_KILLS_MAX_ENTRIES),
});

/**
 * S11 Monster Reward Authority — client รายงานการฆ่า (intent) เท่านั้น
 * เลขรางวัลคิดจาก shared databook + ตัวคูณเลเวลฝั่ง Server; เหรียญเข้า
 * characters.coins (canonical) พร้อม audit ใน monster_kill_batches
 */
export class MonsterService {
  constructor(private readonly repository: PostgresMonsterRepository) {}

  async grantKills(characterId: string, body: unknown): Promise<MonsterKillsResponse> {
    const request = killsSchema.parse(body);
    const requestHash = createHash('sha256')
      .update(
        request.kills.map((kill) => `${kill.monsterId}x${kill.count}`).join('|'),
        'utf8',
      )
      .digest('hex');
    const outcome = await this.repository.grantKills({
      characterId,
      idempotencyKey: request.idempotencyKey,
      requestHash,
      kills: request.kills,
    });
    return {
      ok: true,
      schemaVersion: MONSTER_PROTOCOL_SCHEMA_VERSION,
      rewards: outcome.rewards,
      totals: outcome.totals,
      coinsTotal: outcome.coinsTotal,
      idempotentReplay: outcome.idempotentReplay,
    };
  }
}
