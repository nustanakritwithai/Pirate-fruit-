import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  CORE_MIGRATION_TAG,
  PLAYER_SAVE_MIGRATION_TAG,
  databaseMigrationDirectory,
} from '../persistence/migrations.js';
import { cleanupGuestData } from './sessionCleanup.js';

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

async function memoryPool(): Promise<Pool> {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  pools.push(pool);
  const directory = databaseMigrationDirectory();
  for (const tag of [CORE_MIGRATION_TAG, PLAYER_SAVE_MIGRATION_TAG]) {
    const sql = await readFile(join(directory, `${tag}.sql`), 'utf8');
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean)) {
      await pool.query(statement);
    }
  }
  return pool;
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
}

async function seedUser(
  pool: Pool,
  id: string,
  createdDaysAgo: number,
  now: Date,
  options: { saveRevision?: number; sessionExpiresAt?: Date } = {},
): Promise<void> {
  await pool.query('insert into users (id, created_at) values ($1, $2)', [
    id,
    daysAgo(now, createdDaysAgo),
  ]);
  await pool.query(
    `insert into characters (id, user_id, name, current_island_id, spawn_id, save_revision)
     values ($1, $2, 'Guest', 'starter-island', 'village', $3)`,
    [id.replace(/aa$/, 'bb'), id, String(options.saveRevision ?? 0)],
  );
  if (options.sessionExpiresAt) {
    await pool.query(
      `insert into sessions (id, user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [id.replace(/aa$/, 'cc'), id, `hash-${id}`, options.sessionExpiresAt],
    );
  }
}

describe('S8 guest cleanup', () => {
  it('removes stale sessions and orphan guests but never players with progress', async () => {
    const pool = await memoryPool();
    const now = new Date('2026-07-17T00:00:00Z');

    // ผู้เล่นจริง: มี save_revision > 0 และ session หมดอายุนานแล้ว — ห้ามลบ user
    await seedUser(pool, 'aaaaaaaa-0000-4000-8000-0000000000aa', 90, now, {
      saveRevision: 5,
      sessionExpiresAt: daysAgo(now, 30),
    });
    // guest กำพร้า: เก่า 60 วัน ไม่มี session ไม่มีความคืบหน้า — ลบ
    await seedUser(pool, 'bbbbbbbb-0000-4000-8000-0000000000aa', 60, now);
    // guest ใหม่: เพิ่ง 2 วัน — ยังไม่ลบ
    await seedUser(pool, 'cccccccc-0000-4000-8000-0000000000aa', 2, now);
    // guest มี session ที่ยังไม่หมดอายุ — ไม่ลบ
    await seedUser(pool, 'dddddddd-0000-4000-8000-0000000000aa', 60, now, {
      sessionExpiresAt: daysAgo(now, -10),
    });

    const result = await cleanupGuestData(pool, now);

    // session หมดอายุเกิน retention ของผู้เล่นจริงถูกลบ แต่ user/character อยู่ครบ
    expect(result.expiredSessions).toBe(1);
    expect(result.orphanUsers).toBe(1);
    const users = await pool.query<{ id: string }>('select id from users order by created_at');
    expect(users.rows.map((row) => row.id)).toEqual([
      'aaaaaaaa-0000-4000-8000-0000000000aa',
      'dddddddd-0000-4000-8000-0000000000aa',
      'cccccccc-0000-4000-8000-0000000000aa',
    ]);
    const characters = await pool.query('select id from characters');
    expect(characters.rows).toHaveLength(3);

    // รันซ้ำ = idempotent
    const again = await cleanupGuestData(pool, now);
    expect(again).toEqual({ expiredSessions: 0, orphanUsers: 0 });
  });
});
