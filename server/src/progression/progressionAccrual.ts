import type { PoolClient } from 'pg';
import {
  STAT_POINTS_PER_LEVEL,
  applyExpToProgress,
  type LevelWalkResult,
} from '@pirate-fruit/shared';

/**
 * S12 — สะสม EXP ที่ Server แจกเอง (quest claim / monster kills) แล้วเดินเลเวล
 * ด้วยสูตร shared ตัวเดียวกับเกม — เรียกภายในธุรกรรมที่ล็อกแถวตัวละครแล้วเท่านั้น
 * ผล: characters.level กลายเป็นค่าที่ Server พิสูจน์ได้ ไม่ใช่ค่าที่ client รายงาน
 */
export async function accrueServerExp(
  client: PoolClient,
  characterId: string,
  currentLevel: number,
  amount: number,
): Promise<LevelWalkResult> {
  await client.query(
    `insert into player_progression
       (character_id, combat, vitality, blade, ranged, fruit_power, mana)
     values ($1, 1, 1, 1, 1, 1, 1)
     on conflict (character_id) do nothing`,
    [characterId],
  );
  const row = await client.query<{ exp: string }>(
    'select exp::text as exp from player_progression where character_id = $1 for update',
    [characterId],
  );
  const exp = Number(row.rows[0]?.exp ?? '0');
  const walked = applyExpToProgress({ level: currentLevel, exp }, amount);
  await client.query(
    `update player_progression
        set exp = $2,
            stat_points = stat_points + $3,
            updated_at = now()
      where character_id = $1`,
    [characterId, String(walked.exp), walked.levelsGained * STAT_POINTS_PER_LEVEL],
  );
  if (walked.level !== currentLevel) {
    await client.query(
      'update characters set level = $2, updated_at = now() where id = $1',
      [characterId, walked.level],
    );
  }
  return walked;
}
