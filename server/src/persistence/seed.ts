import type { Pool } from 'pg';
import { DATABASE_SCHEMA_VERSION } from './migrations.js';

export const DEFAULT_WORLD_ID = 'main';

export interface SeedResult {
  worldId: string;
  inserted: boolean;
}

export async function seedDatabase(pool: Pool): Promise<SeedResult> {
  const state = {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    tick: 0,
    islands: {},
    traders: [],
    contracts: [],
    generatedBy: 's4-seed',
  };
  const result = await pool.query<{ id: string }>(
    `insert into economy_worlds (id, version, tick, state_json)
     values ($1, $2, 0, $3::jsonb)
     on conflict (id) do nothing
     returning id`,
    [DEFAULT_WORLD_ID, DATABASE_SCHEMA_VERSION, JSON.stringify(state)],
  );

  return { worldId: DEFAULT_WORLD_ID, inserted: result.rows.length === 1 };
}
