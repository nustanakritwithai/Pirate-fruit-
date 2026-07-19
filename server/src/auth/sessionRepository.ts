import type { Pool } from 'pg';

export interface NewGuestSessionRecord {
  userId: string;
  characterId: string;
  characterName: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  currentIslandId: string;
  spawnId: string;
}

export interface StoredSessionRecord {
  sessionId: string;
  userId: string;
  characterId: string;
  characterName: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SessionRepository {
  createGuest(input: NewGuestSessionRecord): Promise<StoredSessionRecord>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<StoredSessionRecord | null>;
  touch(sessionId: string, now: Date): Promise<void>;
  revoke(sessionId: string, now: Date): Promise<boolean>;
  countActive(now: Date): Promise<number>;
}

interface StoredSessionRow {
  session_id: string;
  user_id: string;
  character_id: string;
  character_name: string;
  token_hash: string;
  expires_at: Date;
}

function mapStoredSession(row: StoredSessionRow): StoredSessionRecord {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    characterId: row.character_id,
    characterName: row.character_name,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
  };
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  async createGuest(input: NewGuestSessionRecord): Promise<StoredSessionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into users (id, last_login_at)
         values ($1, now())`,
        [input.userId],
      );
      await client.query(
        `insert into characters
           (id, user_id, name, current_island_id, spawn_id)
         values ($1, $2, $3, $4, $5)`,
        [
          input.characterId,
          input.userId,
          input.characterName,
          input.currentIslandId,
          input.spawnId,
        ],
      );
      await client.query(
        `insert into sessions (id, user_id, token_hash, expires_at)
         values ($1, $2, $3, $4)`,
        [input.sessionId, input.userId, input.tokenHash, input.expiresAt],
      );
      await client.query('commit');
      return {
        sessionId: input.sessionId,
        userId: input.userId,
        characterId: input.characterId,
        characterName: input.characterName,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<StoredSessionRecord | null> {
    const result = await this.pool.query<StoredSessionRow>(
      `select
         s.id as session_id,
         s.user_id,
         c.id as character_id,
         c.name as character_name,
         s.token_hash,
         s.expires_at
       from sessions s
       join users u on u.id = s.user_id
       join characters c on c.user_id = u.id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > $2
        and u.status = 'active'
      -- S18: ตัวที่ session เลือก (active_character_id) มาก่อน — ไม่ได้เลือก/ถูกลบ → ตัวเก่าสุดตามเดิม
      order by (c.id = s.active_character_id) desc nulls last, c.created_at asc, c.id asc
      limit 1`,
      [tokenHash, now],
    );
    const row = result.rows[0];
    return row ? mapStoredSession(row) : null;
  }

  async touch(sessionId: string, now: Date): Promise<void> {
    await this.pool.query(
      `update sessions
          set last_seen_at = $2::timestamptz
        where id = $1
          and last_seen_at < ($2::timestamptz - interval '5 minutes')`,
      [sessionId, now],
    );
  }

  async revoke(sessionId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `update sessions
          set revoked_at = $2
        where id = $1
          and revoked_at is null
        returning id`,
      [sessionId, now],
    );
    return result.rows.length === 1;
  }

  async countActive(now: Date): Promise<number> {
    const result = await this.pool.query<{ count: number }>(
      `select count(*)::int as count
         from sessions s
         join users u on u.id = s.user_id
        where s.revoked_at is null
          and s.expires_at > $1
          and u.status = 'active'`,
      [now],
    );
    return result.rows[0]?.count ?? 0;
  }
}
