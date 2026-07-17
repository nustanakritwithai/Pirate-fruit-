import type { Pool } from 'pg';
import {
  PROGRESSION_PROTOCOL_SCHEMA_VERSION,
  type ProgressionStateResponse,
} from '@pirate-fruit/shared';

/** S12 — อ่านสถานะ progression ทางการ (level/exp ที่ Server เดินเอง + เหรียญ canonical) */
export class ProgressionService {
  constructor(private readonly pool: Pool) {}

  async state(characterId: string): Promise<ProgressionStateResponse | null> {
    const character = await this.pool.query<{ level: number; coins: string }>(
      'select level, coins::text as coins from characters where id = $1',
      [characterId],
    );
    const characterRow = character.rows[0];
    if (!characterRow) return null;
    const progression = await this.pool.query<{ exp: string }>(
      'select exp::text as exp from player_progression where character_id = $1',
      [characterId],
    );
    return {
      ok: true,
      schemaVersion: PROGRESSION_PROTOCOL_SCHEMA_VERSION,
      level: characterRow.level,
      exp: Number(progression.rows[0]?.exp ?? '0'),
      coins: Number(characterRow.coins),
    };
  }
}
