import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_CHARACTER_SLOTS } from '@pirate-fruit/shared';
import {
  databaseMigrationDirectory,
  SESSION_ACTIVE_CHARACTER_MIGRATION_TAG,
} from '../persistence/migrations.js';
import { PostgresCharacterRepository } from './characterRepository.js';

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

/** โครงตารางขั้นต่ำที่ repo แตะ (users/characters/sessions + active_character_id ของ 0007) */
async function createPool(): Promise<Pool> {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  pools.push(pool);
  await pool.query(`
    create table users (id uuid primary key, status text not null default 'active');
    create table characters (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      name varchar(64) not null,
      level integer not null default 1,
      coins bigint not null default 0,
      current_island_id varchar(96) not null,
      spawn_id varchar(96) not null,
      created_at timestamptz not null default now()
    );
    create table sessions (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      revoked_at timestamptz,
      active_character_id uuid
    );
  `);
  return pool;
}

async function seedUserWithSession(pool: Pool): Promise<{ userId: string; sessionId: string }> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await pool.query(`insert into users (id) values ($1)`, [userId]);
  await pool.query(`insert into sessions (id, user_id) values ($1, $2)`, [sessionId, userId]);
  return { userId, sessionId };
}

describe('S18 character repository', () => {
  it('creates up to the slot cap, sets active, and rejects duplicate names', async () => {
    const pool = await createPool();
    const repo = new PostgresCharacterRepository(pool);
    const { userId, sessionId } = await seedUserWithSession(pool);

    for (let i = 0; i < MAX_CHARACTER_SLOTS; i++) {
      const result = await repo.create(userId, sessionId, `กัปตัน${i + 1}`, 'starter-island', 'starter-village');
      expect(result.outcome).toBe('created');
    }
    // ตัวล่าสุดถูกตั้งเป็น active ของ session
    const active = await repo.activeCharacterOf(sessionId);
    const rows = await repo.listByUser(userId);
    expect(rows).toHaveLength(MAX_CHARACTER_SLOTS);
    expect(active).toBe(rows[MAX_CHARACTER_SLOTS - 1]!.id);

    // เกินโควตา
    const overflow = await repo.create(userId, sessionId, 'เกินโควตา', 'starter-island', 'starter-village');
    expect(overflow.outcome).toBe('slots-full');

    // ลบหนึ่งแล้วชื่อซ้ำ (case-insensitive) ต้องโดนปฏิเสธ
    await repo.delete(userId, sessionId, rows[0]!.id, new Date());
    const duplicate = await repo.create(userId, sessionId, 'กัปตัน2'.toUpperCase(), 'starter-island', 'starter-village');
    expect(duplicate.outcome).toBe(rows.some((r) => r.name === 'กัปตัน2') ? 'name-taken' : 'created');
  });

  it('selects only owned characters', async () => {
    const pool = await createPool();
    const repo = new PostgresCharacterRepository(pool);
    const alice = await seedUserWithSession(pool);
    const bob = await seedUserWithSession(pool);
    const created = await repo.create(alice.userId, alice.sessionId, 'ของอลิซ', 'starter-island', 'starter-village');
    if (created.outcome !== 'created') throw new Error('setup failed');

    // ข้ามบัญชี = ไม่พบ (กัน id คนอื่น)
    expect(await repo.select(bob.userId, bob.sessionId, created.character.id)).toBe(false);
    expect(await repo.select(alice.userId, alice.sessionId, created.character.id)).toBe(true);
    expect(await repo.activeCharacterOf(alice.sessionId)).toBe(created.character.id);
  });

  it('deleting the last character clears pointers and revokes the session', async () => {
    const pool = await createPool();
    const repo = new PostgresCharacterRepository(pool);
    const { userId, sessionId } = await seedUserWithSession(pool);
    const first = await repo.create(userId, sessionId, 'ตัวเดียว', 'starter-island', 'starter-village');
    if (first.outcome !== 'created') throw new Error('setup failed');

    const removed = await repo.delete(userId, sessionId, first.character.id, new Date());
    expect(removed).toEqual({ outcome: 'deleted', remaining: 0 });
    expect(await repo.activeCharacterOf(sessionId)).toBeNull();
    const revoked = await pool.query<{ revoked_at: Date | null }>(
      `select revoked_at from sessions where id = $1`,
      [sessionId],
    );
    expect(revoked.rows[0]?.revoked_at).not.toBeNull();

    // ลบซ้ำ/ลบของที่ไม่มี = not-found
    const again = await repo.delete(userId, sessionId, first.character.id, new Date());
    expect(again.outcome).toBe('not-found');
  });

  it('keeps a forward and reverse manifest for migration 0007', async () => {
    const directory = databaseMigrationDirectory();
    const forward = await readFile(
      join(directory, `${SESSION_ACTIVE_CHARACTER_MIGRATION_TAG}.sql`),
      'utf8',
    );
    const reverse = await readFile(
      join(directory, 'rollback', `${SESSION_ACTIVE_CHARACTER_MIGRATION_TAG}.down.sql`),
      'utf8',
    );
    expect(forward).toContain('ADD COLUMN "active_character_id"');
    expect(reverse).toContain('DROP COLUMN IF EXISTS "active_character_id"');
  });
});
