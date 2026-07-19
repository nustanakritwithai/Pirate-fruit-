import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { MAX_CHARACTER_SLOTS, type CharacterSummary } from '@pirate-fruit/shared';

/**
 * S18 — คลังตัวละครต่อบัญชี (ทุกคำสั่งตรวจ ownership ด้วย user_id เสมอ —
 * Client ส่งได้แค่ id ของตัวเอง ข้ามบัญชีคืน not-found)
 */

export type CreateCharacterResult =
  | { outcome: 'created'; character: CharacterRow }
  | { outcome: 'slots-full' }
  | { outcome: 'name-taken' };

export type DeleteCharacterResult =
  | { outcome: 'deleted'; remaining: number }
  | { outcome: 'not-found' };

export interface CharacterRow {
  id: string;
  name: string;
  level: number;
  coins: number;
  currentIslandId: string;
  createdAt: Date;
}

interface DbCharacterRow {
  id: string;
  name: string;
  level: number;
  coins: string;
  current_island_id: string;
  created_at: Date;
}

function mapRow(row: DbCharacterRow): CharacterRow {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    coins: Number(row.coins),
    currentIslandId: row.current_island_id,
    createdAt: row.created_at,
  };
}

export function toSummary(row: CharacterRow, activeCharacterId: string | null): CharacterSummary {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    coins: row.coins,
    currentIslandId: row.currentIslandId,
    createdAt: row.createdAt.toISOString(),
    active: activeCharacterId === row.id,
  };
}

const SELECT_COLUMNS =
  'id, name, level, coins, current_island_id, created_at';

export class PostgresCharacterRepository {
  constructor(private readonly pool: Pool) {}

  async listByUser(userId: string): Promise<CharacterRow[]> {
    const result = await this.pool.query<DbCharacterRow>(
      `select ${SELECT_COLUMNS}
         from characters
        where user_id = $1
        order by created_at asc, id asc`,
      [userId],
    );
    return result.rows.map(mapRow);
  }

  /** สร้างตัวละครใหม่ + ตั้งเป็น active ของ session ในทรานแซกชันเดียว (กันแข่งกันเกินโควตา) */
  async create(
    userId: string,
    sessionId: string,
    name: string,
    currentIslandId: string,
    spawnId: string,
  ): Promise<CreateCharacterResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // ล็อกแถวตัวละครของบัญชีนี้ก่อนนับ — สอง request พร้อมกันจะไม่หลุดเกิน MAX
      const existing = await client.query<{ id: string; name: string }>(
        `select id, name from characters where user_id = $1 for update`,
        [userId],
      );
      if (existing.rows.length >= MAX_CHARACTER_SLOTS) {
        await client.query('rollback');
        return { outcome: 'slots-full' };
      }
      if (existing.rows.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
        await client.query('rollback');
        return { outcome: 'name-taken' };
      }
      const id = randomUUID();
      const inserted = await client.query<DbCharacterRow>(
        `insert into characters (id, user_id, name, current_island_id, spawn_id)
         values ($1, $2, $3, $4, $5)
         returning ${SELECT_COLUMNS}`,
        [id, userId, name, currentIslandId, spawnId],
      );
      await client.query(
        `update sessions set active_character_id = $2 where id = $1`,
        [sessionId, id],
      );
      await client.query('commit');
      return { outcome: 'created', character: mapRow(inserted.rows[0]!) };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** เลือกตัวละครเข้าเล่น — คืน false เมื่อไม่ใช่ของบัญชีนี้ */
  async select(userId: string, sessionId: string, characterId: string): Promise<boolean> {
    const owned = await this.pool.query<{ id: string }>(
      `select id from characters where id = $1 and user_id = $2`,
      [characterId, userId],
    );
    if (owned.rows.length === 0) return false;
    await this.pool.query(
      `update sessions set active_character_id = $2 where id = $1`,
      [sessionId, characterId],
    );
    return true;
  }

  /**
   * ลบตัวละคร (FK cascade ล้าง progression/stats/inventory/save ให้เอง)
   * เคลียร์ pointer ทุก session ของบัญชี; ลบตัวสุดท้าย → เพิกถอน session นี้ด้วย
   * (Client กลับสู่หน้าสร้างตัวละครแรก)
   */
  async delete(
    userId: string,
    sessionId: string,
    characterId: string,
    now: Date,
  ): Promise<DeleteCharacterResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const deleted = await client.query<{ id: string }>(
        `delete from characters where id = $1 and user_id = $2 returning id`,
        [characterId, userId],
      );
      if (deleted.rows.length === 0) {
        await client.query('rollback');
        return { outcome: 'not-found' };
      }
      await client.query(
        `update sessions set active_character_id = null where active_character_id = $1`,
        [characterId],
      );
      const remaining = await client.query<{ count: number }>(
        `select count(*)::int as count from characters where user_id = $1`,
        [userId],
      );
      const left = remaining.rows[0]?.count ?? 0;
      if (left === 0) {
        await client.query(
          `update sessions set revoked_at = $2 where id = $1 and revoked_at is null`,
          [sessionId, now],
        );
      }
      await client.query('commit');
      return { outcome: 'deleted', remaining: left };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** active_character_id ของ session (ไว้ทำธง active ในลิสต์) */
  async activeCharacterOf(sessionId: string): Promise<string | null> {
    const result = await this.pool.query<{ active_character_id: string | null }>(
      `select active_character_id from sessions where id = $1`,
      [sessionId],
    );
    return result.rows[0]?.active_character_id ?? null;
  }
}
