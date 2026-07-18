import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { worldMonsterState } from '../persistence/schema.js';
import type { PersistedMonster } from './monsterSimulation.js';
import type { WorldMonsterState } from '@pirate-fruit/shared';

/** แถวสำหรับบันทึก (มี island/monster เพื่อเติมคอลัมน์ notNull) */
export interface WorldMonsterRow extends PersistedMonster {
  islandId: string;
  monsterId: string;
}

/** S16 — persist สถานะมอนสเตอร์กลางเพื่อกู้คืนหลัง Server restart */
export class PostgresWorldMonsterRepository {
  private readonly db: NodePgDatabase;

  constructor(pool: Pool) {
    this.db = drizzle(pool);
  }

  async loadAll(): Promise<PersistedMonster[]> {
    const rows = await this.db.select().from(worldMonsterState);
    return rows.map((row) => ({
      spawnId: row.spawnId,
      hp: row.hp,
      state: row.state as WorldMonsterState,
      x: row.x,
      z: row.z,
      respawnAt: row.respawnAt ?? null,
    }));
  }

  /** upsert ทุกตัว (เรียกเป็นระยะ + ตอน shutdown) */
  async saveAll(rows: readonly WorldMonsterRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db
      .insert(worldMonsterState)
      .values(
        rows.map((row) => ({
          spawnId: row.spawnId,
          islandId: row.islandId,
          monsterId: row.monsterId,
          hp: Math.round(row.hp),
          state: row.state,
          x: row.x,
          z: row.z,
          respawnAt: row.respawnAt,
          updatedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: worldMonsterState.spawnId,
        set: {
          hp: sql`excluded.hp`,
          state: sql`excluded.state`,
          x: sql`excluded.x`,
          z: sql`excluded.z`,
          respawnAt: sql`excluded.respawn_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
}
