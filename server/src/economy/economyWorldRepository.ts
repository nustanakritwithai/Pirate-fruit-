import type { Pool, PoolClient } from 'pg';

const ECONOMY_LEADER_LOCK_ID = 1_347_565_127;

export interface StoredEconomyWorld {
  worldId: string;
  schemaVersion: number;
  tick: number;
  document: Record<string, unknown>;
  lastTickAt: Date | null;
  updatedAt: Date;
}

export interface EconomyWorldWrite {
  worldId: string;
  schemaVersion: number;
  tick: number;
  document: Record<string, unknown>;
  tickedAt: Date;
  createSnapshot: boolean;
  snapshotRetention: number;
}

export interface EconomyLeaderLease {
  load(worldId: string): Promise<StoredEconomyWorld | null>;
  save(write: EconomyWorldWrite): Promise<void>;
  release(): Promise<void>;
}

export interface EconomyWorldRepository {
  load(worldId: string): Promise<StoredEconomyWorld | null>;
  tryAcquireLeadership(): Promise<EconomyLeaderLease | null>;
}

interface EconomyWorldRow {
  id: string;
  version: number;
  tick: string;
  state_json: Record<string, unknown>;
  last_tick_at: Date | null;
  updated_at: Date;
}

function safeTick(value: string): number {
  const tick = Number(value);
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error('Stored economy tick is outside the supported range');
  }
  return tick;
}

function mapRow(row: EconomyWorldRow): StoredEconomyWorld {
  return {
    worldId: row.id,
    schemaVersion: row.version,
    tick: safeTick(row.tick),
    document: row.state_json,
    lastTickAt: row.last_tick_at,
    updatedAt: row.updated_at,
  };
}

async function loadWithClient(
  client: Pick<PoolClient, 'query'>,
  worldId: string,
): Promise<StoredEconomyWorld | null> {
  const result = await client.query<EconomyWorldRow>(
    `select id, version, tick::text, state_json, last_tick_at, updated_at
       from economy_worlds
      where id = $1`,
    [worldId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

class PostgresEconomyLeaderLease implements EconomyLeaderLease {
  private released = false;

  constructor(private readonly client: PoolClient) {}

  load(worldId: string): Promise<StoredEconomyWorld | null> {
    return loadWithClient(this.client, worldId);
  }

  async save(write: EconomyWorldWrite): Promise<void> {
    if (this.released) throw new Error('Economy leadership lease has been released');
    try {
      await this.client.query('begin');
      const existing = await this.client.query<{ tick: string }>(
        'select tick::text from economy_worlds where id = $1 for update',
        [write.worldId],
      );
      const storedTick = existing.rows[0] ? safeTick(existing.rows[0].tick) : -1;
      if (storedTick > write.tick) {
        throw new Error(`Refusing stale economy write ${write.tick}; database is at ${storedTick}`);
      }

      await this.client.query(
        `insert into economy_worlds
           (id, version, tick, state_json, last_tick_at, updated_at)
         values ($1, $2, $3, $4::jsonb, $5, now())
         on conflict (id) do update set
           version = excluded.version,
           tick = excluded.tick,
           state_json = excluded.state_json,
           last_tick_at = excluded.last_tick_at,
           updated_at = now()`,
        [
          write.worldId,
          write.schemaVersion,
          write.tick,
          JSON.stringify(write.document),
          write.tickedAt,
        ],
      );

      if (write.createSnapshot) {
        await this.client.query(
          `insert into economy_snapshots (world_id, version, tick, state_json)
           values ($1, $2, $3, $4::jsonb)
           on conflict (world_id, tick) do nothing`,
          [write.worldId, write.schemaVersion, write.tick, JSON.stringify(write.document)],
        );
        await this.client.query(
          `delete from economy_snapshots
            where world_id = $1
              and id in (
                select id from economy_snapshots
                 where world_id = $1
                 order by tick desc
                 offset $2
              )`,
          [write.worldId, write.snapshotRetention],
        );
      }
      await this.client.query('commit');
    } catch (error) {
      await this.client.query('rollback').catch(() => undefined);
      throw error;
    }
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await this.client
      .query('select pg_advisory_unlock($1)', [ECONOMY_LEADER_LOCK_ID])
      .catch(() => undefined);
    this.client.release();
  }
}

export class PostgresEconomyWorldRepository implements EconomyWorldRepository {
  constructor(private readonly pool: Pool) {}

  async load(worldId: string): Promise<StoredEconomyWorld | null> {
    return loadWithClient(this.pool, worldId);
  }

  async tryAcquireLeadership(): Promise<EconomyLeaderLease | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ acquired: boolean }>(
        'select pg_try_advisory_lock($1) as acquired',
        [ECONOMY_LEADER_LOCK_ID],
      );
      if (!result.rows[0]?.acquired) {
        client.release();
        return null;
      }
      return new PostgresEconomyLeaderLease(client);
    } catch (error) {
      client.release();
      throw error;
    }
  }
}
